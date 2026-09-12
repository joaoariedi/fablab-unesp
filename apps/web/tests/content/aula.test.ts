import { describe, expect, it } from 'vitest'

import { Aula } from '../../collections/content/Aula'
import { stampApproval } from '../../lib/content/review'
import { canPublishField } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T040 / FR-001, FR-003 — `aula`, the fourth content collection off the `projeto` template.
 *
 * The fields trace to `aulas.md` § Modelo de conteúdo; the assertions that matter are the
 * guarantees a copied template silently loses, plus the three places where a later decision
 * overrules that page and a reader would otherwise "fix" the file back:
 *
 *  - **`autor` points at `perfilMaker`, not `usuario`** (CLR-002) — `data-model.md` lists
 *    `aula.autor` among the relationships needing `sameTenant`, which is only meaningful
 *    against a scoped target;
 *  - **`nivel_dificuldade` is `Básico · Intermediário · Avançado`** (round 5, 2026-08-24),
 *    *not* `modelo3d`'s provisional `iniciante` scale — `aulas.md` marks `Iniciante`
 *    superseded in writing, and `minha-conta.md` renders the decided vocabulary;
 *  - **`publicado_em` is `dataPublicacao`**, the one name the public reader sorts every
 *    content collection by.
 *
 * Config-shape only, against the exported collection: registration in `payload.config.ts`
 * and in `SCOPE_REGISTRY` is T044's single edit, and `registry.test.ts` fails the build
 * whenever the two disagree — so they cannot land separately, here or anywhere.
 */

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

const fieldNamed = (name: string) =>
  Aula.fields.find((f) => (f as { name?: string }).name === name) as
    | Record<string, unknown>
    | undefined

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = Aula.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`aula declares no ${operation} access; it would fall back to logged-in`)
  }
  return access({ req: { user } } as never)
}

describe('aula is declared (T040, FR-001)', () => {
  it('carries the slug the review queue and the public reader address it by', () => {
    expect(Aula.slug).toBe('aula')
  })

  it('is labelled in PT-BR, because the admin is the lab team\'s surface (US7)', () => {
    const labels = Aula.labels as { singular?: unknown; plural?: unknown } | undefined

    expect(labels?.singular).toBe('Aula')
    expect(labels?.plural).toBe('Aulas')
  })

  it('names its rows by the title, which is also what a relationship picker shows', () => {
    expect(
      (Aula.admin as { useAsTitle?: unknown } | undefined)?.useAsTitle,
      'without useAsTitle the admin lists rows as "Aula 17" and pickers offer ids',
    ).toBe('titulo')
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (Aula.endpoints || []).some((e) => e.path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })

  it('declares the anonymous download route its materiais need (FR-015, FR-016)', () => {
    // aulas.md § materiais: "download **aberto, sem conta** (acesso aberto), como os anexos de
    // Projetos e Artigos" (PO, 2026-08-24). The policy is `serveDownload`'s; this is the
    // registration, reusing `projeto`'s factory rather than a third copy — a copy that forgets
    // the host-resolved tenant is FR-016 quietly ceasing to hold for this collection.
    expect(
      (Aula.endpoints || []).some((e) => e.path === '/:id/download/:midiaId'),
      'materiais are downloadable with no account, and that is true only if a route serves them',
    ).toBe(true)
  })

  it('writes no row to payload-locked-documents (FR-018, CLR-004)', () => {
    expect(Aula.lockDocuments).toBe(false)
  })

  it('registers the approval stamp as a beforeChange hook (FR-009, SC-004)', () => {
    // A hook that is written but never registered passes its unit test and stamps nothing.
    expect(Aula.hooks?.beforeChange ?? []).toContain(stampApproval)
  })
})

describe('aula carries the fields aulas.md defines (T040, FR-001)', () => {
  it('requires titulo, slug, descricao, thumbnail, videoUrl, duracaoMin, ordem', () => {
    for (const name of [
      'titulo',
      'slug',
      'descricao',
      'thumbnail',
      'videoUrl',
      'duracaoMin',
      'ordem',
    ]) {
      const field = fieldNamed(name)
      expect(field, `aula declares no ${name} (aulas.md § Modelo de conteúdo)`).toBeDefined()
      expect(field?.required, `${name} is optional; aulas.md marks it obrigatório`).toBe(true)
    }
  })

  /**
   * `autor` is deliberately NOT in the list above — CLR-003, and it is a change of state the
   * schema must be able to hold, not a relaxation of editorial policy.
   *
   * FR-031 keeps a deleted person's published work and takes their name off it, so `autor` has
   * to be able to hold nothing. `required: true` blocked that in two places at once: `push`
   * rebuilds every non-production database from the field config, so it silently restored the
   * NOT NULL the migration had dropped; and `sameTenant` — which REPLACES Payload's default
   * validator — re-implements the `required` floor itself, so `{ autor: null }` was refused by
   * the application even where the column allowed it.
   *
   * The editorial rule still holds where it belongs: the admin and the review queue want an
   * author before anything is published. This asserts only that the *column* can express the
   * one state that has no author by design.
   */
  it('leaves autor optional, because an erased author is a state the row must hold (CLR-003)', () => {
    const autor = fieldNamed('autor')
    expect(autor, 'the collection declares no autor at all').toBeDefined()
    expect(
      autor?.required,
      'autor is required again. `push` will restore the NOT NULL from this flag and ' +
        '`sameTenant` will refuse the null, so `deleteAccount` fails mid-transaction and the ' +
        'whole erasure rolls back — a person who asked to be forgotten stays.',
    ).toBeFalsy()
  })

  it('caps descricao at the two card lines it has to fit in', () => {
    // "texto (máx. ~140 car.) — 2 linhas no card". Unbounded, the catalogue grid breaks on the
    // first author who pastes a paragraph, and it breaks in feature 003 rather than here.
    expect(fieldNamed('descricao')?.maxLength).toBe(140)
  })

  it('points thumbnail at the image media collection, so it inherits the image rules', () => {
    // A relationship, not a text key (D3 as revised 2026-09-07): the database then knows the
    // file has an owner, and the download route reads the media document *through* the aula.
    expect(fieldNamed('thumbnail')?.relationTo).toBe('midiaImagem')
  })

  it('points autor at perfilMaker, not at the global usuario (CLR-002)', () => {
    // aulas.md says "relação → usuario", written before CLR-002 split identity from profile:
    // level, XP and skills are per-organization, so one person teaching at two labs has one
    // login and two profiles, and the author block on the card renders the profile.
    expect(fieldNamed('autor')?.relationTo).toBe('perfilMaker')
  })

  it('lets materiais carry meshes and documents alike, each from its own media collection', () => {
    // ".pdf .zip .stl .3mf .obj .gltf .glb .svg .dxf" spans two groups, and the groups are
    // separate collections because each carries its own cap and allowlist.
    const field = fieldNamed('materiais')

    expect(field?.relationTo).toEqual(['midiaModelo3d', 'midiaDocumento'])
    expect(field?.hasMany, 'aulas.md marks materiais as a list of files').toBe(true)
  })

  it('offers the difficulty vocabulary round 5 decided, not the superseded Iniciante', () => {
    // `Básico · Intermediário · Avançado` (aulas.md round 5, 2026-08-24; rendered by
    // minha-conta.md as `25:30 | Básico`). `modelo3d` carries `iniciante` because
    // biblioteca-3d.md still marks its scale **(proposta)** — two collections, two states of
    // the same question, and this one is decided.
    const field = fieldNamed('nivelDificuldade')

    expect(field?.type, 'the scale is a decided vocabulary, not free text').toBe('select')
    const values = ((field?.options ?? []) as { value?: string }[]).map((o) => o.value)
    expect([...values].sort()).toEqual(['avancado', 'basico', 'intermediario'])
  })

  it('defaults xpRecompensa to the single XP an aula credits', () => {
    // "valor fixo 1 XP por aula assistida; campo mantido só para exceções futuras"
    // (2026-08-23). Feature 005 credits; this is the amount it reads.
    expect(fieldNamed('xpRecompensa')?.defaultValue).toBe(1)
  })

  it('declares the review states as an enum, not free text', () => {
    const field = fieldNamed('status')

    expect(field?.type, 'status must be a select: the queue is three named states').toBe('select')

    const values = ((field?.options ?? []) as { value?: string }[]).map((o) => o.value)
    expect(
      [...values].sort(),
      'the review queue is rascunho → em_revisao → publicado (FR-008)',
    ).toEqual(['em_revisao', 'publicado', 'rascunho'])
    expect(field?.defaultValue, 'a new aula must start as a draft (US1)').toBe('rascunho')
  })

  it('stores curtidas and downloads as counters that start at zero', () => {
    for (const name of ['curtidas', 'downloads']) {
      const field = fieldNamed(name)
      expect(field?.type, `${name} renders a count on the card, not a join`).toBe('number')
      expect(field?.defaultValue, `an aula with no ${name} must read 0, never null`).toBe(0)
    }
  })

  it('declares duracaoMin, ordem, transcricao and dataPublicacao with their types', () => {
    for (const [name, type] of [
      ['duracaoMin', 'number'],
      ['ordem', 'number'],
      ['transcricao', 'textarea'],
      ['dataPublicacao', 'date'],
    ] as const) {
      const field = fieldNamed(name)
      expect(field, `aula declares no ${name} (aulas.md § Modelo de conteúdo)`).toBeDefined()
      expect(field?.type, `${name} has the wrong type`).toBe(type)
    }
  })

  it('labels every field in PT-BR', () => {
    // Accented, lowercase-after-the-first-word labels. Payload auto-labels an unlabelled field
    // with `toWords(name)` — "Video Url", "Duracao Min", "Xp Recompensa" — so these exact
    // strings can only come from the config.
    const expected: Record<string, string> = {
      titulo: 'Título',
      slug: 'Slug',
      descricao: 'Descrição',
      thumbnail: 'Thumbnail',
      videoUrl: 'URL do vídeo',
      duracaoMin: 'Duração',
      ordem: 'Ordem',
      autor: 'Autor',
      nivelDificuldade: 'Nível de dificuldade',
      xpRecompensa: 'XP de recompensa',
      materiais: 'Materiais',
      transcricao: 'Transcrição',
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

describe('aula keeps the template\'s guarantees (T040, FR-007, FR-008, FR-009)', () => {
  it('validates every scoped relationship with the shared sameTenant (FR-007)', () => {
    // Spike S4c measured the plugin ACCEPTING a cross-tenant write on its own: a row in A
    // updated to reference a row in B succeeded. Identity, not `toBeDefined()` — FR-007 is a
    // guarantee only while there is exactly one implementation of it.
    for (const name of ['thumbnail', 'autor', 'materiais']) {
      expect(
        fieldNamed(name)?.validate,
        `${name} points at a scoped collection with no same-tenant validator`,
      ).toBe(sameTenant)
    }
  })

  it('guards status with canPublishField on create as well as update (SC-005)', () => {
    const access = fieldNamed('status')?.access as Record<string, unknown> | undefined

    expect(access?.update, 'a maker could move an aula to publicado').toBe(canPublishField)
    expect(
      access?.create,
      'a POST with status: publicado on a brand new aula never meets the update guard',
    ).toBe(canPublishField)
  })

  it('lets nothing but the hook write the approval stamp (FR-009, CLR-001)', async () => {
    for (const name of ['aprovacaoRegistrada', 'aprovadoEm']) {
      const field = fieldNamed(name)
      expect(field, `aula declares no ${name}: republishing would credit XP twice`).toBeDefined()

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

describe('aula confines the admin surface to one organization (T040, FR-021)', () => {
  it('answers a member with a query constraint, never a bare authorisation', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        "including another lab's classes (FR-006)",
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
