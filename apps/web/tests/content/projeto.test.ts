import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'

/**
 * T024 / FR-001, FR-021 — `projeto`, the collection the other twelve are copied from.
 *
 * Three things are asserted, and only the second and third cost anything:
 *
 *  - the collection exists in the Payload config (a file nobody registers is dead code);
 *  - it carries the fields `projetos.md` § Modelo de conteúdo defines, **labelled in PT-BR**
 *    (FR-001, US7) — and the labels asserted here are accented, which Payload's auto-labeller
 *    cannot produce from a field name, so the assertion cannot pass vacuously;
 *  - its admin surface is confined to one organization (FR-021): the plugin-injected `tenant`
 *    field is present and `read` answers with a query constraint, never a boolean.
 *
 * `read: scopedAccess()` is the ADMIN and REST surface only. A public visitor never reaches
 * this access function — they go through `getPublicScopedPayload`, which is why an anonymous
 * read here must be a flat refusal rather than a published-only filter (plan § Sketch 1).
 *
 * Config-shape only: no database, like `registry.test.ts` and `publishable.test.ts`.
 */

const SLUG = 'projeto'

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

const fieldNamed = async (name: string) => {
  const collection = await collectionConfig()
  return collection?.flattenedFields.find((f) => f.name === name) as
    | Record<string, unknown>
    | undefined
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

describe('projeto is registered (T024, FR-001)', () => {
  it('exists in the Payload config', async () => {
    expect(
      await collectionConfig(),
      'the template collection every other content collection copies does not exist',
    ).toBeDefined()
  })

  it('is labelled in PT-BR, because the admin is the lab team\'s surface (US7)', async () => {
    const labels = (await collectionConfig())?.labels as
      | { singular?: unknown; plural?: unknown }
      | undefined

    expect(labels?.singular).toBe('Projeto')
    expect(labels?.plural).toBe('Projetos')
  })

  it('names its rows by the title, which is also what a relationship picker shows', async () => {
    const admin = (await collectionConfig())?.admin as { useAsTitle?: unknown } | undefined

    expect(
      admin?.useAsTitle,
      'without useAsTitle the admin lists rows as "Projeto 17" and the picker in feature 005 ' +
        'would offer ids instead of titles',
    ).toBe('titulo')
  })

  it('declares the /mine endpoint the isolation harness asserts against', async () => {
    const collection = await collectionConfig()

    expect(
      (collection?.endpoints || []).some((e) => e.path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })
})

describe('projeto carries the fields projetos.md defines (T024, FR-001)', () => {
  it('requires titulo, slug, descricaoCurta and categoria', async () => {
    for (const name of ['titulo', 'slug', 'descricaoCurta', 'categoria']) {
      const field = await fieldNamed(name)
      expect(field, `${SLUG} declares no ${name} (projetos.md § Modelo de conteúdo)`).toBeDefined()
      expect(field?.required, `${name} is optional; projetos.md marks it obrigatório`).toBe(true)
    }
  })

  it('caps descricaoCurta at the two card lines it has to fit in', async () => {
    const field = await fieldNamed('descricaoCurta')

    // "texto (máx. ~120 caracteres) — 2 linhas no card". Unbounded, the card grid breaks on
    // the first maker who pastes a paragraph, and the failure appears in feature 003.
    expect(field?.maxLength).toBe(120)
  })

  it('points categoria at categoriaProjeto, the vocabulary T023 landed for it', async () => {
    const field = await fieldNamed('categoria')

    expect(
      field?.relationTo,
      'the chip and the ?categoria= tabs read this relation',
    ).toBe('categoriaProjeto')
  })

  it('declares the review states as an enum, not free text', async () => {
    const field = await fieldNamed('status')

    expect(field?.type, 'status must be a select: the queue is three named states').toBe('select')

    const values = ((field?.options ?? []) as { value?: string }[]).map((o) => o.value)
    expect(
      [...values].sort(),
      'the review queue is rascunho → em_revisao → publicado (FR-008)',
    ).toEqual(['em_revisao', 'publicado', 'rascunho'])
    expect(field?.defaultValue, 'a new submission must start as a draft (US1)').toBe('rascunho')
  })

  it('stores curtidas as a counter that starts at zero', async () => {
    const field = await fieldNamed('curtidas')

    expect(field?.type, 'the card renders a count, not a join').toBe('number')
    expect(field?.defaultValue, 'a project with no likes must read 0, never null').toBe(0)
  })

  it('declares dataPublicacao, destaque and materiais', async () => {
    for (const [name, type] of [
      ['dataPublicacao', 'date'],
      ['destaque', 'checkbox'],
      ['materiais', 'text'],
    ] as const) {
      const field = await fieldNamed(name)
      expect(field, `${SLUG} declares no ${name} (projetos.md § Modelo de conteúdo)`).toBeDefined()
      expect(field?.type, `${name} has the wrong type`).toBe(type)
    }

    expect((await fieldNamed('materiais'))?.hasMany, 'materiais is a list (MDF 6mm, PLA)').toBe(true)
  })

  it('labels every field in PT-BR', async () => {
    // Accented, lowercase-after-the-first-word labels. Payload auto-labels an unlabelled
    // field with `toWords(name)` — "Descricao Curta", "Data Publicacao" — so a field that
    // merely *has* a label proves nothing; these exact strings can only come from the config.
    const expected: Record<string, string> = {
      titulo: 'Título',
      slug: 'Slug',
      descricaoCurta: 'Descrição curta',
      categoria: 'Categoria',
      curtidas: 'Curtidas',
      status: 'Status',
      dataPublicacao: 'Data de publicação',
      destaque: 'Destaque',
      materiais: 'Materiais',
    }

    for (const [name, label] of Object.entries(expected)) {
      expect((await fieldNamed(name))?.label, `${name} is not labelled in PT-BR`).toBe(label)
    }
  })
})

describe('projeto confines the admin surface to one organization (T024, FR-021)', () => {
  it('carries the plugin-injected tenant field, so the declaration is backed by a column', async () => {
    const collection = await collectionConfig()

    expect(
      collection?.flattenedFields.some((f) => f.name === 'tenant'),
      `${SLUG} is not scoped by the multi-tenant plugin — add it to the plugin's ` +
        '`collections` map in payload.config.ts. Rows would carry no tenant at all.',
    ).toBe(true)
  })

  it('answers a member with a query constraint, never a bare authorisation', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        "including another lab's projects (FR-006)",
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    // Sketch 1: the plugin AND-s its own tenant constraint onto whatever this returns, so a
    // public branch here would be nullified. Anonymous reads never reach this function.
    expect(await decide('read', undefined)).toBe(false)
  })

  it('lets a maker submit, scoped to their own lab (US1)', async () => {
    const result = await decide('create', member(7, 'maker'))

    expect(result, 'a maker was refused: any signed-in maker submits (FR-008)').not.toBe(false)
    expect(JSON.stringify(result), 'the submission was not scoped to their own lab').toContain('7')
  })

  it('does not let a maker delete, which is the team\'s (US7)', async () => {
    expect(await decide('delete', member(1, 'maker'))).toBe(false)
  })
})
