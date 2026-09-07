import { describe, expect, it } from 'vitest'

import { Local } from '../../collections/content/Local'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T041 / FR-001, FR-003 — `local`, one of the two physical-resource collections `evento`
 * relates to, which is why they land before it.
 *
 * The fields trace to `calendario.md` § Coleções relacionadas: "`local` — `nome`
 * (`Fab Lab CITe — Sala 2`), `descricao`, `mapa` (`.png` `.svg`), `capacidade`".
 *
 * What is asserted here is what a copied template silently loses: the query constraint
 * instead of a boolean (FR-006), the shared `sameTenant` on the only scoped relationship it
 * carries (FR-007), the `/mine` surface the isolation harness needs a subject on, and
 * `lockDocuments: false` (FR-018). The writes are the team's, not every maker's: a room is a
 * fact about the lab, and `data-model.md` calls this collection "physical resources of one
 * lab" — the same reasoning `categoriaProjeto` records for its vocabulary.
 *
 * Config-shape only, against the exported collection: registration in `payload.config.ts`
 * and in `SCOPE_REGISTRY` is T044's single edit, and `registry.test.ts` fails the build when
 * the two disagree — so they cannot land separately.
 */

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

const fieldNamed = (name: string) =>
  Local.fields.find((f) => (f as { name?: string }).name === name) as
    | Record<string, unknown>
    | undefined

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = Local.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`local declares no ${operation} access; it would fall back to logged-in`)
  }
  return access({ req: { user } } as never)
}

describe('local is declared (T041, FR-003)', () => {
  it('carries the slug evento.local relates to', () => {
    expect(Local.slug).toBe('local')
  })

  it('is labelled in PT-BR, because the admin is the lab team\'s surface (US7)', () => {
    const labels = Local.labels as { singular?: unknown; plural?: unknown } | undefined

    expect(labels?.singular).toBe('Local')
    expect(labels?.plural).toBe('Locais')
  })

  it('names its rows by nome, which is also what evento\'s picker shows (FR-021)', () => {
    expect(
      (Local.admin as { useAsTitle?: unknown } | undefined)?.useAsTitle,
      'without useAsTitle the relationship picker on evento.local offers ids',
    ).toBe('nome')
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (Local.endpoints || []).some((e) => e.path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })

  it('writes no row to payload-locked-documents (FR-018, CLR-004)', () => {
    expect(Local.lockDocuments).toBe(false)
  })
})

describe('local carries the fields calendario.md defines (T041, FR-003)', () => {
  it('requires nome, the address the card renders (Fab Lab CITe — Sala 2)', () => {
    const field = fieldNamed('nome')

    expect(field, 'local declares no nome (calendario.md § Coleções relacionadas)').toBeDefined()
    expect(field?.required, 'a local with no name renders as an empty metadata line').toBe(true)
  })

  it('declares descricao, mapa and capacidade with their types', () => {
    for (const [name, type] of [
      ['descricao', 'textarea'],
      ['mapa', 'relationship'],
      ['capacidade', 'number'],
    ] as const) {
      const field = fieldNamed(name)
      expect(field, `local declares no ${name} (calendario.md)`).toBeDefined()
      expect(field?.type, `${name} has the wrong type`).toBe(type)
    }
  })

  it('points mapa at the image media collection, so it inherits the image rules', () => {
    // `.png` `.svg` per calendario.md — both are in the image group's allowlist, and pointing
    // at `midiaImagem` is what makes the cap and the allowlist apply without restating them.
    expect(fieldNamed('mapa')?.relationTo).toBe('midiaImagem')
  })

  it('leaves everything but nome optional, as the page marks them', () => {
    for (const name of ['descricao', 'mapa', 'capacidade']) {
      expect(
        fieldNamed(name)?.required,
        `${name} is required; calendario.md does not mark it obrigatório`,
      ).not.toBe(true)
    }
  })

  it('labels every field in PT-BR', () => {
    // Payload auto-labels an unlabelled field with `toWords(name)` — "Descricao",
    // "Capacidade" — so the accented strings can only come from the config.
    const expected: Record<string, string> = {
      nome: 'Nome',
      descricao: 'Descrição',
      mapa: 'Mapa',
      capacidade: 'Capacidade',
    }

    for (const [name, label] of Object.entries(expected)) {
      expect(fieldNamed(name)?.label, `${name} is not labelled in PT-BR`).toBe(label)
    }
  })
})

describe('local keeps the template\'s guarantees (T041, FR-006, FR-007)', () => {
  it('validates its scoped relationship with the shared sameTenant (FR-007)', () => {
    // Spike S4c measured the plugin ACCEPTING a cross-tenant write on its own. Identity, not
    // `toBeDefined()`: FR-007 holds only while there is exactly one implementation of it.
    expect(
      fieldNamed('mapa')?.validate,
      'mapa points at a scoped collection with no same-tenant validator',
    ).toBe(sameTenant)
  })

  it('answers a member with a query constraint, never a bare authorisation (FR-006)', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        "including another lab's rooms (FR-006)",
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    expect(await decide('read', undefined)).toBe(false)
  })

  it('lets only the lab team declare a room, not every maker (US7)', async () => {
    for (const operation of ['create', 'update', 'delete'] as const) {
      expect(
        await decide(operation, member(1, 'maker')),
        `a maker was allowed to ${operation} a local`,
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
