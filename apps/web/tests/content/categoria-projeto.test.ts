import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'
import { isScoped, SCOPE_REGISTRY } from '../../lib/tenancy/scope-registry'

/**
 * T023 / FR-002, FR-004 — `categoriaProjeto`, the first content collection.
 *
 * It lands before `projeto` because `projeto.categoria` relates to it, and a relation whose
 * target does not exist is not a template anyone can copy twelve times.
 *
 * Two things are asserted, and the second is the one that actually costs something:
 *
 *  - the collection exists and is **declared** `scoped` in the registry (FR-004), and
 *  - it is **really** per-organization (FR-002): the plugin injected its `tenant` field, and
 *    its access answers with a query constraint rather than a boolean.
 *
 * A registry entry alone proves nothing — the registry is a claim about the threat model,
 * and this file is where the claim meets the config. `registry.test.ts` checks the two
 * agree in aggregate; this one names the collection, so a failure says which one broke.
 *
 * Config-shape only: no database, like `registry.test.ts` and `publishable.test.ts`.
 */

const SLUG = 'categoriaProjeto'

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

const collectionConfig = async () => {
  const config = await configPromise
  return config.collections.find((c) => c.slug === SLUG)
}

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const collection = await collectionConfig()
  const access = collection?.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`${SLUG} declares no ${operation} access; it would fall back to logged-in`)
  }
  return access({ req: { user } } as never)
}

describe('categoriaProjeto is registered (T023, FR-004)', () => {
  it('exists in the Payload config', async () => {
    expect(
      await collectionConfig(),
      'projeto.categoria has no target: the template collection cannot be written',
    ).toBeDefined()
  })

  it('is declared scoped in the registry, with a justification', () => {
    const entry = (SCOPE_REGISTRY as Record<string, { scope: string; why: string } | undefined>)[SLUG]

    expect(entry, `${SLUG} is missing from SCOPE_REGISTRY (FR-004)`).toBeDefined()
    expect(
      entry?.scope,
      'a global category collection would impose CITe\'s vocabulary on every other lab (FR-002)',
    ).toBe('scoped')
    expect(entry?.why.trim().length, `${SLUG} has an empty 'why'`).toBeGreaterThan(0)
    expect(isScoped(SLUG)).toBe(true)
  })

  it('carries the plugin-injected tenant field, so the declaration is backed by a column', async () => {
    const collection = await collectionConfig()

    expect(
      collection?.flattenedFields.some((f) => f.name === 'tenant'),
      `${SLUG} is declared scoped but the multi-tenant plugin never scoped it — add it to the ` +
        'plugin\'s `collections` map in payload.config.ts. Rows would carry no tenant at all.',
    ).toBe(true)
  })

  it('declares the /mine endpoint the isolation harness asserts against', async () => {
    const collection = await collectionConfig()

    expect(
      (collection?.endpoints || []).some((e) => e.path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })
})

describe('categoriaProjeto is per-organization (T023, FR-002, FR-006)', () => {
  it('answers a member with a query constraint, never a bare authorisation', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        'including another lab\'s categories (FR-006)',
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    expect(await decide('read', undefined)).toBe(false)
  })

  it('lets only the lab team name the vocabulary, not every maker', async () => {
    // US7: the team runs the site. A maker submits projects into the categories the team
    // defines; letting them mint categories would make the filter tabs user-generated.
    for (const operation of ['create', 'update', 'delete'] as const) {
      expect(
        await decide(operation, member(1, 'maker')),
        `a maker was allowed to ${operation} a category`,
      ).toBe(false)
    }
  })

  it('admits staff and admins, still scoped to their own organizations', async () => {
    for (const role of ['staff', 'admin']) {
      const result = await decide('create', member(7, role))
      expect(result, `a ${role} was refused`).not.toBe(false)
      expect(JSON.stringify(result), `a ${role} was not scoped to their own lab`).toContain('7')
    }
  })
})

describe('categoriaProjeto carries the fields projetos.md defines (T023, FR-002)', () => {
  it('requires nome and slug', async () => {
    const collection = await collectionConfig()

    for (const name of ['nome', 'slug']) {
      const field = collection?.flattenedFields.find((f) => f.name === name)
      expect(field, `${SLUG} declares no ${name} (projetos.md § Coleção categoria_projeto)`).toBeDefined()
      expect((field as { required?: boolean } | undefined)?.required, `${name} is optional`).toBe(true)
    }
  })

  it('is labelled in PT-BR, because the admin is the lab team\'s surface', async () => {
    const collection = await collectionConfig()
    const labels = collection?.labels as { singular?: unknown; plural?: unknown } | undefined

    expect(labels?.singular).toBe('Categoria de projeto')
    expect(labels?.plural).toBe('Categorias de projeto')
  })
})
