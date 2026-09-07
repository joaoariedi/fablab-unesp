import { describe, expect, it } from 'vitest'

import { CategoriaArtigo } from '../../collections/content/CategoriaArtigo'

/**
 * T038 / FR-001, FR-002 — `categoriaArtigo`, the editorial vocabulary of **one** lab.
 *
 * It lands before `artigo` in the same task for the reason `categoriaProjeto` landed before
 * `projeto`: `artigo.categoria` relates here, and a relationship whose target does not exist
 * throws `InvalidFieldRelationship` at config load (spec § D2).
 *
 * **Why this file asserts the exported config rather than the sanitized one.** Registering a
 * collection touches two shared files — `payload.config.ts`'s collection list and the
 * multi-tenant plugin's `collections` map — and `registry.test.ts` diffs those against
 * `SCOPE_REGISTRY` in **both** directions, so config and registry can only move together.
 * That single move is T044, which is blocked on this task and on the five running beside it;
 * five agents editing the same two files in parallel is how one of the twelve silently loses
 * its entry. So what T038 owns is the collection itself, and this file pins every property
 * that lives in it: the plugin-injected `tenant` field and the isolation matrix are asserted
 * by `registry.test.ts` and `isolation.test.ts` once T044 wires it in.
 */

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

const fieldNamed = (name: string) =>
  CategoriaArtigo.fields.find((f) => (f as { name?: string }).name === name) as
    | Record<string, unknown>
    | undefined

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = CategoriaArtigo.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`categoriaArtigo declares no ${operation} access; it falls back to logged-in`)
  }
  return access({ req: { user } } as never)
}

describe('categoriaArtigo is declared (T038, FR-002)', () => {
  it('carries the slug artigo.categoria will relate to', () => {
    expect(CategoriaArtigo.slug).toBe('categoriaArtigo')
  })

  it('is labelled in PT-BR, because the admin is the lab team\'s surface (US7)', () => {
    const labels = CategoriaArtigo.labels as { singular?: unknown; plural?: unknown } | undefined

    expect(labels?.singular).toBe('Categoria de artigo')
    expect(labels?.plural).toBe('Categorias de artigo')
  })

  it('names its rows by nome, which is also what a relationship picker shows (FR-021)', () => {
    expect(
      (CategoriaArtigo.admin as { useAsTitle?: unknown } | undefined)?.useAsTitle,
      'without useAsTitle the picker on artigo.categoria offers ids instead of names',
    ).toBe('nome')
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (CategoriaArtigo.endpoints || []).some((e) => e.path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })

  it('writes no row to payload-locked-documents (FR-018, CLR-004)', () => {
    // That internal collection is not scoped by the plugin and each row names a document by
    // collection and id, so an editor opening a categoria would publish that id platform-wide.
    expect(CategoriaArtigo.lockDocuments).toBe(false)
  })
})

describe('categoriaArtigo carries the fields artigos.md defines (T038, FR-002)', () => {
  it('requires nome, slug and ordem', () => {
    for (const name of ['nome', 'slug', 'ordem']) {
      const field = fieldNamed(name)
      expect(field, `categoriaArtigo declares no ${name} (artigos.md § Coleção categoria_artigo)`)
        .toBeDefined()
      expect(field?.required, `${name} is optional; artigos.md marks it obrigatório`).toBe(true)
    }
  })

  it('stores ordem as a number, because it orders the tabs', () => {
    // "Ordem das tabs; TODOS é estado virtual, não é registro" — a text field would sort
    // `10` before `2` and reorder the filter bar the first time a lab declares ten categories.
    expect(fieldNamed('ordem')?.type).toBe('number')
  })

  it('labels every field in PT-BR', () => {
    // Payload auto-labels an unlabelled field with `toWords(name)` — "Nome", "Ordem" — so a
    // field that merely *has* a label proves little; `nome` and `ordem` are pinned here for
    // completeness and the accented cases below can only come from the config.
    const expected: Record<string, string> = {
      nome: 'Nome',
      slug: 'Slug',
      ordem: 'Ordem',
    }

    for (const [name, label] of Object.entries(expected)) {
      expect(fieldNamed(name)?.label, `${name} is not labelled in PT-BR`).toBe(label)
    }
  })
})

describe('categoriaArtigo is per-organization (T038, FR-002, FR-006)', () => {
  it('answers a member with a query constraint, never a bare authorisation', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        "including another lab's editorial vocabulary (FR-006)",
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    expect(await decide('read', undefined)).toBe(false)
  })

  it('lets only the lab team name the vocabulary, not every maker (US7)', async () => {
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
