import { describe, expect, it } from 'vitest'

import { Artigo } from '../../collections/content/Artigo'
import { stampApproval } from '../../lib/content/review'
import { canPublishField } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T038 / FR-001, FR-002 — `artigo`, the second content collection off the `projeto` template.
 *
 * The point of copying a reviewed template is that the *guarantees* come with it, not just the
 * field list, so this file asserts the four that a copy silently loses:
 *
 *  - every relationship whose target is scoped carries **the shared** `sameTenant` (FR-007) —
 *    identity-compared, because a local reimplementation is how a guarantee stops being one;
 *  - `status` is guarded by `canPublishField` on **create as well as update** (FR-008, SC-005):
 *    Payload evaluates field access per operation, so a POST arriving with
 *    `status: 'publicado'` never meets the update guard at all;
 *  - the approval stamp is written by the hook alone — `aprovacaoRegistrada` and `aprovadoEm`
 *    refuse every request, master included (FR-009, CLR-001), because that pair *is* what
 *    feature 005 reads to credit XP, and `admin.readOnly` stops nothing coming through the API;
 *  - `lockDocuments: false`, so no row about an artigo lands in `payload-locked-documents`
 *    for another organization to enumerate (FR-018, CLR-004).
 *
 * See `categoria-artigo.test.ts` for why these assertions run against the exported collection
 * rather than the sanitized config: registration is one shared edit, and it is T044's.
 */

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

const fieldNamed = (name: string) =>
  Artigo.fields.find((f) => (f as { name?: string }).name === name) as
    | Record<string, unknown>
    | undefined

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = Artigo.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`artigo declares no ${operation} access; it would fall back to logged-in`)
  }
  return access({ req: { user } } as never)
}

describe('artigo is declared (T038, FR-001)', () => {
  it('carries the slug the review queue and the public reader address it by', () => {
    expect(Artigo.slug).toBe('artigo')
  })

  it('is labelled in PT-BR, because the admin is the lab team\'s surface (US7)', () => {
    const labels = Artigo.labels as { singular?: unknown; plural?: unknown } | undefined

    expect(labels?.singular).toBe('Artigo')
    expect(labels?.plural).toBe('Artigos')
  })

  it('names its rows by the title, which is also what a relationship picker shows', () => {
    expect(
      (Artigo.admin as { useAsTitle?: unknown } | undefined)?.useAsTitle,
      'without useAsTitle the admin lists rows as "Artigo 17" and pickers offer ids',
    ).toBe('titulo')
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (Artigo.endpoints || []).some((e) => e.path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })

  it('declares the anonymous download route its anexos need (FR-015, FR-016)', () => {
    // artigos.md: "download **aberto**, sem conta; downloads anônimos são contados". The
    // policy is `serveDownload`'s; this is the registration, reusing `projeto`'s factory
    // rather than a second copy — the day a copy forgets the host-resolved tenant is the day
    // FR-016 stops holding for that collection.
    expect(
      (Artigo.endpoints || []).some((e) => e.path === '/:id/download/:midiaId'),
      'anexos are downloadable with no account, and that is true only if a route serves them',
    ).toBe(true)
  })

  it('writes no row to payload-locked-documents (FR-018, CLR-004)', () => {
    expect(Artigo.lockDocuments).toBe(false)
  })

  it('registers the approval stamp as a beforeChange hook (FR-009, SC-004)', () => {
    // A hook that is written but never registered passes its unit test and stamps nothing.
    expect(Artigo.hooks?.beforeChange ?? []).toContain(stampApproval)
  })
})

describe('artigo carries the fields artigos.md defines (T038, FR-001)', () => {
  it('requires titulo, slug, resumo, corpo, capa, categoria and autor', () => {
    for (const name of ['titulo', 'slug', 'resumo', 'corpo', 'capa', 'categoria', 'autor']) {
      const field = fieldNamed(name)
      expect(field, `artigo declares no ${name} (artigos.md § Modelo de conteúdo)`).toBeDefined()
      expect(field?.required, `${name} is optional; artigos.md marks it obrigatório`).toBe(true)
    }
  })

  it('caps resumo at the two card lines it has to fit in', () => {
    // "texto longo (máx. ~160 caracteres) — duas linhas no card". Unbounded, the grid breaks
    // on the first author who pastes a paragraph, and it breaks in feature 003 rather than here.
    expect(fieldNamed('resumo')?.maxLength).toBe(160)
  })

  it('stores corpo as rich text, which spec.md settled as Lexical', () => {
    expect(fieldNamed('corpo')?.type).toBe('richText')
  })

  it('points categoria at categoriaArtigo, the vocabulary this task lands beside it', () => {
    expect(fieldNamed('categoria')?.relationTo).toBe('categoriaArtigo')
  })

  it('points capa at the image media collection, so the cover inherits the image rules', () => {
    // A relationship, not a text key (D3 as revised 2026-09-07): the database then knows the
    // file has an owner, and the download route reads the media document *through* the artigo.
    expect(fieldNamed('capa')?.relationTo).toBe('midiaImagem')
  })

  it('points autor at perfilMaker, not at the global usuario (CLR-002)', () => {
    // artigos.md says "relação → usuario", written before CLR-002 split identity from profile.
    // Level, XP and skills are per-organization, so one person making at two labs has one
    // login and two profiles; the author block on the card renders the profile.
    expect(fieldNamed('autor')?.relationTo).toBe('perfilMaker')
  })

  it('lets anexos carry meshes and documents alike, each from its own media collection', () => {
    // ".pdf, .zip, .stl, .3mf, .obj, .gltf, .glb" spans two groups, and the groups are
    // separate collections because each carries its own cap and allowlist.
    const field = fieldNamed('anexos')

    expect(field?.relationTo).toEqual(['midiaModelo3d', 'midiaDocumento'])
    expect(field?.hasMany, 'artigos.md marks anexos as mídia múltipla').toBe(true)
  })

  it('declares the review states as an enum, not free text', () => {
    const field = fieldNamed('status')

    expect(field?.type, 'status must be a select: the queue is three named states').toBe('select')

    const values = ((field?.options ?? []) as { value?: string }[]).map((o) => o.value)
    expect(
      [...values].sort(),
      'the review queue is rascunho → em_revisao → publicado (FR-008)',
    ).toEqual(['em_revisao', 'publicado', 'rascunho'])
    expect(field?.defaultValue, 'a new submission must start as a draft (US1)').toBe('rascunho')
  })

  it('stores curtidas and downloads as counters that start at zero', () => {
    for (const name of ['curtidas', 'downloads']) {
      const field = fieldNamed(name)
      expect(field?.type, `${name} renders a count on the card, not a join`).toBe('number')
      expect(field?.defaultValue, `an artigo with no ${name} must read 0, never null`).toBe(0)
    }
  })

  it('declares dataPublicacao, linkExterno, tags and tempoLeitura', () => {
    for (const [name, type] of [
      ['dataPublicacao', 'date'],
      ['linkExterno', 'text'],
      ['tags', 'text'],
      ['tempoLeitura', 'number'],
    ] as const) {
      const field = fieldNamed(name)
      expect(field, `artigo declares no ${name} (artigos.md § Modelo de conteúdo)`).toBeDefined()
      expect(field?.type, `${name} has the wrong type`).toBe(type)
    }

    expect(fieldNamed('tags')?.hasMany, 'tags is a list').toBe(true)
  })

  it('labels every field in PT-BR', () => {
    // Accented, lowercase-after-the-first-word labels. Payload auto-labels an unlabelled field
    // with `toWords(name)` — "Data Publicacao", "Link Externo", "Tempo Leitura" — so these
    // exact strings can only come from the config.
    const expected: Record<string, string> = {
      titulo: 'Título',
      slug: 'Slug',
      resumo: 'Resumo',
      corpo: 'Corpo',
      capa: 'Capa',
      categoria: 'Categoria',
      autor: 'Autor',
      anexos: 'Anexos',
      linkExterno: 'Link externo',
      curtidas: 'Curtidas',
      downloads: 'Downloads',
      tags: 'Tags',
      status: 'Status',
      tempoLeitura: 'Tempo de leitura',
      dataPublicacao: 'Data de publicação',
    }

    for (const [name, label] of Object.entries(expected)) {
      expect(fieldNamed(name)?.label, `${name} is not labelled in PT-BR`).toBe(label)
    }
  })
})

describe('artigo keeps the template\'s guarantees (T038, FR-007, FR-008, FR-009)', () => {
  it('validates every scoped relationship with the shared sameTenant (FR-007)', () => {
    // Spike S4c measured the plugin ACCEPTING a cross-tenant write on its own: a row in A
    // updated to reference a row in B succeeded. Identity, not `toBeDefined()` — FR-007 is a
    // guarantee only while there is exactly one implementation of it.
    for (const name of ['categoria', 'capa', 'autor', 'anexos']) {
      expect(
        fieldNamed(name)?.validate,
        `${name} points at a scoped collection with no same-tenant validator`,
      ).toBe(sameTenant)
    }
  })

  it('guards status with canPublishField on create as well as update (SC-005)', () => {
    const access = fieldNamed('status')?.access as Record<string, unknown> | undefined

    expect(access?.update, 'a maker could move an artigo to publicado').toBe(canPublishField)
    expect(
      access?.create,
      'a POST with status: publicado on a brand new artigo never meets the update guard',
    ).toBe(canPublishField)
  })

  it('lets nothing but the hook write the approval stamp (FR-009, CLR-001)', async () => {
    for (const name of ['aprovacaoRegistrada', 'aprovadoEm']) {
      const field = fieldNamed(name)
      expect(field, `artigo declares no ${name}: republishing would credit XP twice`).toBeDefined()

      const access = field?.access as
        | Record<string, ((args: never) => unknown) | undefined>
        | undefined
      for (const operation of ['create', 'update'] as const) {
        const guard = access?.[operation]
        expect(typeof guard, `${name} has no field access on ${operation}`).toBe('function')
        expect(
          await guard?.({ req: { user: { role: 'master' } } } as never),
          `${name} is writable by a request, so an author can forge their own approval`,
        ).toBe(false)
      }
    }
  })
})

describe('artigo confines the admin surface to one organization (T038, FR-021)', () => {
  it('answers a member with a query constraint, never a bare authorisation', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        "including another lab's articles (FR-006)",
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    // Sketch 1: the plugin AND-s its own tenant constraint onto whatever this returns, so a
    // public branch here would be nullified. Anonymous reads never reach this function.
    expect(await decide('read', undefined)).toBe(false)
  })

  it('lets a maker submit, scoped to their own lab (US1, FR-008)', async () => {
    const result = await decide('create', member(7, 'maker'))

    expect(result, 'a maker was refused: any signed-in maker submits (FR-008)').not.toBe(false)
    expect(JSON.stringify(result), 'the submission was not scoped to their own lab').toContain('7')
  })

  it('does not let a maker delete, which is the team\'s (US7)', async () => {
    // A maker who could delete could erase the review trail the approval stamp makes permanent.
    expect(await decide('delete', member(1, 'maker'))).toBe(false)
  })
})
