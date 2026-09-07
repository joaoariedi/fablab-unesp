import { describe, expect, it } from 'vitest'

import { deriveFormatos } from '../../collections/content/formatos'
import { Modelo3d } from '../../collections/content/Modelo3d'
import { stampApproval } from '../../lib/content/review'
import { canPublishField } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { ALLOWED_EXTENSIONS } from '../../lib/uploads/limits'

/**
 * T039 / FR-001, FR-002, FR-020 — `modelo3d`, the 3D library of **one** lab.
 *
 * Every field traces to `biblioteca-3d.md` § Modelo de conteúdo. Two carry the template's
 * names rather than the page's, and both times the spec overrules the page: `autor` points at
 * `perfilMaker` (CLR-002 split identity from profile) and the approval record is
 * `aprovacaoRegistrada` + `aprovadoEm` rather than a per-collection `xp_concedido` (CLR-001).
 *
 * What this file asserts beyond the field list is the set of guarantees a copied template
 * silently loses — the shared `sameTenant`, `canPublishField` on create as well as update, an
 * approval stamp no request can write, `lockDocuments: false` — plus the one thing that is
 * this collection's alone: `formatos` is registered as a `beforeChange` hook, because a
 * derivation that is written and never registered derives nothing (`formatos.test.ts` pins
 * what it computes; this pins that it runs).
 *
 * Registration in `payload.config.ts` is T044's single edit — see `categoria-modelo.test.ts`.
 */

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

const fieldNamed = (name: string) =>
  Modelo3d.fields.find((f) => (f as { name?: string }).name === name) as
    | Record<string, unknown>
    | undefined

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = Modelo3d.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`modelo3d declares no ${operation} access; it would fall back to logged-in`)
  }
  return access({ req: { user } } as never)
}

describe('modelo3d is declared (T039, FR-001)', () => {
  it('carries the slug the counters and the public reader address it by', () => {
    // `counters.test.ts` recounts `categoriaModelo.totalModelos` from this exact slug.
    expect(Modelo3d.slug).toBe('modelo3d')
  })

  it('is labelled in PT-BR, because the admin is the lab team\'s surface (US7)', () => {
    const labels = Modelo3d.labels as { singular?: unknown; plural?: unknown } | undefined

    expect(labels?.singular).toBe('Modelo 3D')
    expect(labels?.plural).toBe('Modelos 3D')
  })

  it('names its rows by the title, which is also what a relationship picker shows', () => {
    expect(
      (Modelo3d.admin as { useAsTitle?: unknown } | undefined)?.useAsTitle,
      'without useAsTitle the admin lists rows as "Modelo 3D 17" and pickers offer ids',
    ).toBe('titulo')
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (Modelo3d.endpoints || []).some((e) => e.path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })

  it('declares the anonymous download route the library is built on (FR-015, FR-016)', () => {
    // "Baixar modelos 3D não exige conta, e os downloads anônimos são contados" (PO,
    // 2026-08-24). The policy is `serveDownload`'s; this is the registration, reusing
    // `projeto`'s factory rather than a second copy that could forget the host-resolved tenant.
    expect(
      (Modelo3d.endpoints || []).some((e) => e.path === '/:id/download/:midiaId'),
      'the download button has no route, so FR-015 holds only inside the test harness',
    ).toBe(true)
  })

  it('writes no row to payload-locked-documents (FR-018, CLR-004)', () => {
    expect(Modelo3d.lockDocuments).toBe(false)
  })

  it('registers the approval stamp and the formatos derivation as beforeChange hooks', () => {
    const hooks = Modelo3d.hooks?.beforeChange ?? []

    expect(hooks, 'a hook that is never registered stamps nothing (FR-009)').toContain(
      stampApproval,
    )
    expect(hooks, 'formatos would stay whatever the request sent (FR-020)').toContain(
      deriveFormatos,
    )
  })
})

describe('modelo3d carries the fields biblioteca-3d.md defines (T039, FR-001)', () => {
  it('requires titulo, slug, descricaoCurta, thumbnail, arquivosModelo, categoria and autor', () => {
    for (const name of [
      'titulo',
      'slug',
      'descricaoCurta',
      'thumbnail',
      'arquivosModelo',
      'categoria',
      'autor',
    ]) {
      const field = fieldNamed(name)
      expect(field, `modelo3d declares no ${name} (biblioteca-3d.md)`).toBeDefined()
      expect(field?.required, `${name} is optional; biblioteca-3d.md marks it obrigatório`).toBe(
        true,
      )
    }
  })

  it('caps descricaoCurta at the two card lines it has to fit in', () => {
    expect(fieldNamed('descricaoCurta')?.maxLength).toBe(120)
  })

  it('stores descricaoCompleta as rich text, which spec.md settled as Lexical', () => {
    expect(fieldNamed('descricaoCompleta')?.type).toBe('richText')
  })

  it('points thumbnail and galeria at the image collection', () => {
    // The card's render sits on a navy field inside a white card; it is an image upload, so
    // it inherits `midiaImagem`'s allowlist and cap by construction (D3 as revised).
    expect(fieldNamed('thumbnail')?.relationTo).toBe('midiaImagem')
    expect(fieldNamed('galeria')?.relationTo).toBe('midiaImagem')
    expect(fieldNamed('galeria')?.hasMany, 'galeria is mídia múltipla').toBe(true)
  })

  it('lets arquivosModelo carry meshes and the .zip package alike', () => {
    // biblioteca-3d.md lists `.stl .3mf .obj .gltf .glb .zip`, and `.zip` is on the document
    // group's allowlist rather than the 3D group's (`lib/uploads/limits.ts`) because the two
    // groups carry different caps. One field over both collections keeps that split without
    // asking the maker to know about it — the same call `projeto.arquivos` records.
    const field = fieldNamed('arquivosModelo')

    expect(field?.relationTo).toEqual(['midiaModelo3d', 'midiaDocumento'])
    expect(field?.hasMany, 'a model ships several files').toBe(true)
  })

  it('declares arquivoPreview3d and documentacao against their own groups', () => {
    expect(fieldNamed('arquivoPreview3d')?.relationTo).toBe('midiaModelo3d')
    expect(fieldNamed('documentacao')?.relationTo).toBe('midiaDocumento')
  })

  it('points categoria at categoriaModelo, the vocabulary this task lands beside it', () => {
    expect(fieldNamed('categoria')?.relationTo).toBe('categoriaModelo')
  })

  it('points autor at perfilMaker, not at the global usuario (CLR-002)', () => {
    // biblioteca-3d.md says "relação → usuario", written before CLR-002 split identity from
    // profile: level, XP and skills are per-organization, so one person making at two labs
    // has one login and two profiles. The authorship badge on the card renders the profile.
    expect(fieldNamed('autor')?.relationTo).toBe('perfilMaker')
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
      expect(field?.defaultValue, `a model with no ${name} must read 0, never null`).toBe(0)
      expect(field?.min, 'a negative count is drift that must never be storable').toBe(0)
    }
  })

  it('declares dataPublicacao, which orders the Mais recentes listing', () => {
    // `publicado_em` in the page table; `dataPublicacao` here, as on `projeto` and `artigo` —
    // one shape for one guarantee, since the public reader sorts every collection by it.
    expect(fieldNamed('dataPublicacao')?.type).toBe('date')
  })

  it('labels every field in PT-BR', () => {
    // Payload auto-labels an unlabelled field with `toWords(name)` — "Arquivos Modelo",
    // "Nivel Dificuldade" — so these exact strings can only come from the config.
    const expected: Record<string, string> = {
      titulo: 'Título',
      slug: 'Slug',
      descricaoCurta: 'Descrição curta',
      descricaoCompleta: 'Descrição completa',
      thumbnail: 'Thumbnail',
      galeria: 'Galeria',
      arquivosModelo: 'Arquivos do modelo',
      arquivoPreview3d: 'Arquivo de pré-visualização 3D',
      documentacao: 'Documentação',
      formatos: 'Formatos',
      categoria: 'Categoria',
      autor: 'Autor',
      curtidas: 'Curtidas',
      downloads: 'Downloads',
      status: 'Status',
      dataPublicacao: 'Data de publicação',
    }

    for (const [name, label] of Object.entries(expected)) {
      expect(fieldNamed(name)?.label, `${name} is not labelled in PT-BR`).toBe(label)
    }
  })
})

describe('modelo3d declares formatos as a derived value (T039, FR-020)', () => {
  it('stores it as a multi-select, which is what the Todos os formatos filter reads', () => {
    const field = fieldNamed('formatos')

    expect(field?.type, 'biblioteca-3d.md: multi-seleção derivada').toBe('select')
    expect(field?.hasMany, 'a model with a mesh and a .zip has two formats').toBe(true)
  })

  it('marks it readOnly, which is how the FR-020 rot guard finds it', () => {
    // `counters.test.ts` scans for `admin.readOnly` fields of ANY type and demands each be
    // reconciled or declared — a filter on `type === 'number'` was what let this one through
    // in round 4. The value is also overwritten by the hook, so readOnly is the admin's half
    // of a guarantee the derivation enforces.
    expect((fieldNamed('formatos')?.admin as { readOnly?: unknown } | undefined)?.readOnly).toBe(
      true,
    )
  })

  it('offers every extension an attached file can actually have', () => {
    // A `select` refuses a value that is not an option, so an options list narrower than the
    // upload allowlists would fail the save of a model whose files the upload policy accepted
    // — the CMS refusing a file the storage layer took. Derived from `lib/uploads/limits.ts`
    // rather than retyped, so widening an allowlist cannot leave this list behind.
    const options = ((fieldNamed('formatos')?.options ?? []) as { value?: string }[]).map(
      (o) => o.value,
    )
    const attachable = [
      ...new Set([...ALLOWED_EXTENSIONS.model3d, ...ALLOWED_EXTENSIONS.document]),
    ].sort()

    expect([...options].sort()).toEqual(attachable)
  })
})

describe('modelo3d keeps the template\'s guarantees (T039, FR-007, FR-008, FR-009)', () => {
  it('validates every scoped relationship with the shared sameTenant (FR-007)', () => {
    // Spike S4c measured the plugin ACCEPTING a cross-tenant write on its own. Identity, not
    // `toBeDefined()` — FR-007 is a guarantee only while there is one implementation of it.
    for (const name of [
      'thumbnail',
      'galeria',
      'arquivosModelo',
      'arquivoPreview3d',
      'documentacao',
      'categoria',
      'autor',
    ]) {
      expect(
        fieldNamed(name)?.validate,
        `${name} points at a scoped collection with no same-tenant validator`,
      ).toBe(sameTenant)
    }
  })

  it('guards status with canPublishField on create as well as update (SC-005)', () => {
    const access = fieldNamed('status')?.access as Record<string, unknown> | undefined

    expect(access?.update, 'a maker could move a model to publicado').toBe(canPublishField)
    expect(
      access?.create,
      'a POST with status: publicado on a brand new model never meets the update guard',
    ).toBe(canPublishField)
  })

  it('lets nothing but the hook write the approval stamp (FR-009, CLR-001)', async () => {
    for (const name of ['aprovacaoRegistrada', 'aprovadoEm']) {
      const field = fieldNamed(name)
      expect(field, `modelo3d declares no ${name}: republishing would credit XP twice`).toBeDefined()

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

describe('modelo3d confines the admin surface to one organization (T039, FR-021)', () => {
  it('answers a member with a query constraint, never a bare authorisation', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        "including another lab's models (FR-006)",
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    // Sketch 1: the plugin AND-s its own tenant constraint onto whatever this returns, so a
    // public branch here would be nullified. Anonymous reads never reach this function, and
    // the open download of FR-015 is served by the endpoint above rather than by access.
    expect(await decide('read', undefined)).toBe(false)
  })

  it('lets a maker publish into the queue, scoped to their own lab (US1, FR-008)', async () => {
    const result = await decide('create', member(7, 'maker'))

    expect(result, 'a maker was refused: publishing a model is what the account is for').not.toBe(
      false,
    )
    expect(JSON.stringify(result), 'the submission was not scoped to their own lab').toContain('7')
  })

  it('does not let a maker delete, which is the team\'s (US7)', async () => {
    expect(await decide('delete', member(1, 'maker'))).toBe(false)
  })
})
