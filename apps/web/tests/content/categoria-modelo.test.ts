import { describe, expect, it } from 'vitest'

import { CategoriaModelo } from '../../collections/content/CategoriaModelo'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T039 / FR-001, FR-002 — `categoriaModelo`, the 3D-library vocabulary of **one** lab.
 *
 * It lands before `modelo3d` in the same task for the reason `categoriaProjeto` landed before
 * `projeto`: `modelo3d.categoria` relates here, and a `relationTo` naming a collection that
 * does not exist throws `InvalidFieldRelationship` at config load (spec § D2).
 *
 * **Why this file asserts the exported config rather than the sanitized one.** Registration
 * touches two shared files — the collection list in `payload.config.ts` and the multi-tenant
 * plugin's `collections` map — and `registry.test.ts` diffs both against `SCOPE_REGISTRY` in
 * either direction, so they can only move together. That single move is T044, blocked on this
 * task and on the five running beside it.
 */

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

const fieldNamed = (name: string) =>
  CategoriaModelo.fields.find((f) => (f as { name?: string }).name === name) as
    | Record<string, unknown>
    | undefined

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = CategoriaModelo.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`categoriaModelo declares no ${operation} access; it falls back to logged-in`)
  }
  return access({ req: { user } } as never)
}

describe('categoriaModelo is declared (T039, FR-002)', () => {
  it('carries the slug modelo3d.categoria will relate to', () => {
    expect(CategoriaModelo.slug).toBe('categoriaModelo')
  })

  it('is labelled in PT-BR, because the admin is the lab team\'s surface (US7)', () => {
    const labels = CategoriaModelo.labels as { singular?: unknown; plural?: unknown } | undefined

    expect(labels?.singular).toBe('Categoria de modelo')
    expect(labels?.plural).toBe('Categorias de modelo')
  })

  it('names its rows by nome, which is also what a relationship picker shows (FR-021)', () => {
    expect(
      (CategoriaModelo.admin as { useAsTitle?: unknown } | undefined)?.useAsTitle,
      'without useAsTitle the picker on modelo3d.categoria offers ids instead of names',
    ).toBe('nome')
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (CategoriaModelo.endpoints || []).some((e) => e.path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })

  it('writes no row to payload-locked-documents (FR-018, CLR-004)', () => {
    expect(CategoriaModelo.lockDocuments).toBe(false)
  })
})

describe('categoriaModelo carries what the sidebar renders (T039, FR-001)', () => {
  it('requires nome, slug and icone', () => {
    // biblioteca-3d.md § Modelo de conteúdo marks all three obrigatório: the sidebar lists
    // the categories with an outline icon, and a category with none renders a hole.
    for (const name of ['nome', 'slug', 'icone']) {
      const field = fieldNamed(name)
      expect(field, `categoriaModelo declares no ${name}`).toBeDefined()
      expect(field?.required, `${name} is optional; biblioteca-3d.md marks it obrigatório`).toBe(
        true,
      )
    }
  })

  it('points icone at the image collection, which is what accepts an SVG', () => {
    // "mídia (SVG) ou chave de ícone": a relationship, not a key, for D3-as-revised's reason —
    // the database then knows the file has an owner, and `midiaImagem` already carries the
    // SVG rules (`ALLOWED_EXTENSIONS.image` includes `.svg`, sniffed through `validateSvg`).
    expect(fieldNamed('icone')?.relationTo).toBe('midiaImagem')
    expect(
      fieldNamed('icone')?.validate,
      'icone points at a scoped collection with no same-tenant validator (FR-007)',
    ).toBe(sameTenant)
  })

  it('stores totalModelos as the counter lib/content/counters.ts maintains', () => {
    // FR-020's third derived value: `CounterField` names it `totalModelos`, and
    // `counters.test.ts` recounts it from `modelo3d.categoria`. A different name here — or a
    // nullable column — and the reconciliation gate has nothing to reconcile.
    const field = fieldNamed('totalModelos')

    expect(field?.type).toBe('number')
    expect(field?.defaultValue, 'an empty category must read 0, never null').toBe(0)
    expect(field?.min, 'a negative count is drift that must never be storable').toBe(0)
    expect(
      (field?.admin as { readOnly?: unknown } | undefined)?.readOnly,
      'a derived value the system maintains is not an input',
    ).toBe(true)
  })

  it('orders the sidebar with a number, not a text sort', () => {
    // A text sort puts `10` before `2` the first time a lab declares ten categories.
    expect(fieldNamed('ordem')?.type).toBe('number')
  })

  it('labels every field in PT-BR', () => {
    // Payload auto-labels an unlabelled field with `toWords(name)` — "Total Modelos" — so
    // these exact strings can only come from the config.
    const expected: Record<string, string> = {
      nome: 'Nome',
      slug: 'Slug',
      icone: 'Ícone',
      totalModelos: 'Total de modelos',
      ordem: 'Ordem',
    }

    for (const [name, label] of Object.entries(expected)) {
      expect(fieldNamed(name)?.label, `${name} is not labelled in PT-BR`).toBe(label)
    }
  })
})

describe('categoriaModelo confines the vocabulary to one lab (T039, FR-006, US7)', () => {
  it('answers a member with a query constraint, never a bare authorisation', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      "read access returned a boolean: every row leaks, including the other lab's vocabulary",
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('lets only the team write the vocabulary, not every maker', async () => {
    // A maker who could mint a category makes the sidebar user-generated. The team roles are
    // `staff` and `admin` (`TEAM_ROLES` in lib/tenancy/access.ts); `maker` is neither.
    for (const operation of ['create', 'update', 'delete'] as const) {
      expect(await decide(operation, member(1, 'maker')), `a maker may ${operation}`).toBe(false)
      for (const role of ['staff', 'admin']) {
        expect(
          await decide(operation, member(7, role)),
          `${role} may not ${operation}`,
        ).not.toBe(false)
      }
    }
  })
})
