import { describe, expect, it } from 'vitest'

import { Evento } from '../../collections/content/Evento'
import { stampApproval } from '../../lib/content/review'
import { canPublishField } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T041 / FR-001, FR-003 — `evento`, the fifth content collection, landing after `local` and
 * `maquina` because it relates to both.
 *
 * The fields trace to `calendario.md` § Modelo de conteúdo. Four places where this file
 * departs from that table are asserted here, because each is a decision a later reader would
 * otherwise "correct" back:
 *
 *   - **`status` is `rascunho · publicado · cancelado · concluido`**, not the three-state
 *     review queue of `projeto` and `aula`. `data-model.md` § Review queue says so in writing:
 *     "`evento` uses its own set per `calendario.md`". `em_revisao` does not exist here, and
 *     the derived labels (`INSCRIÇÕES ABERTAS` · `LOTADO` · `ENCERRADO`) come from
 *     `prazoInscricao`, `vagasTotal` and `fimEm` — only `CANCELADO` comes from this field.
 *   - **`responsavel` points at `perfilMaker`, not the global `usuario`** (CLR-002).
 *     `data-model.md` lists `evento.responsavel` among the relationships needing `sameTenant`,
 *     which is only meaningful against a scoped target.
 *   - **`xpPresenca` exists and is unused** (FR-023, PO 2026-08-24): the calendar grants no XP
 *     in v1, and the field stays in the model so its return is not a migration.
 *   - **`skill` and `missao_relacionada` are absent** — their targets belong to feature 005
 *     (FR-022 as amended by D2), and a `relationTo` naming an absent collection throws
 *     `InvalidFieldRelationship` at config load.
 *
 * Config-shape only, against the exported collection: registration in `payload.config.ts` and
 * in `SCOPE_REGISTRY` is T044's single edit.
 */

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

const fieldNamed = (name: string) =>
  Evento.fields.find((f) => (f as { name?: string }).name === name) as
    | Record<string, unknown>
    | undefined

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = Evento.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`evento declares no ${operation} access; it would fall back to logged-in`)
  }
  return access({ req: { user } } as never)
}

describe('evento is declared (T041, FR-001)', () => {
  it('carries the slug the agenda and the public reader address it by', () => {
    expect(Evento.slug).toBe('evento')
  })

  it('is labelled in PT-BR, because the admin is the lab team\'s surface (US7)', () => {
    const labels = Evento.labels as { singular?: unknown; plural?: unknown } | undefined

    expect(labels?.singular).toBe('Evento')
    expect(labels?.plural).toBe('Eventos')
  })

  it('names its rows by the title, which is also what a relationship picker shows', () => {
    expect(
      (Evento.admin as { useAsTitle?: unknown } | undefined)?.useAsTitle,
      'without useAsTitle the admin lists rows as "Evento 17" and pickers offer ids',
    ).toBe('titulo')
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (Evento.endpoints || []).some((e) => e.path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })

  it('writes no row to payload-locked-documents (FR-018, CLR-004)', () => {
    expect(Evento.lockDocuments).toBe(false)
  })

  it('registers the approval stamp as a beforeChange hook (FR-009, SC-004)', () => {
    // A hook that is written but never registered passes its unit test and stamps nothing.
    expect(Evento.hooks?.beforeChange ?? []).toContain(stampApproval)
  })
})

describe('evento carries the fields calendario.md defines (T041, FR-001)', () => {
  it('requires titulo, slug, tipo, descricaoCurta, inicioEm, fimEm, local and responsavel', () => {
    for (const name of [
      'titulo',
      'slug',
      'tipo',
      'descricaoCurta',
      'inicioEm',
      'fimEm',
      'local',
      'responsavel',
    ]) {
      const field = fieldNamed(name)
      expect(field, `evento declares no ${name} (calendario.md § Modelo de conteúdo)`).toBeDefined()
      expect(field?.required, `${name} is optional; calendario.md marks it obrigatório`).toBe(true)
    }
  })

  it('caps descricaoCurta at the two card lines it has to fit in', () => {
    // "texto (≤140 car.) — 2 linhas no card". Unbounded, the agenda list breaks on the first
    // author who pastes a paragraph, and it breaks in feature 003 rather than here.
    expect(fieldNamed('descricaoCurta')?.maxLength).toBe(140)
  })

  it('offers the six event types as an enum, not free text', () => {
    const field = fieldNamed('tipo')

    expect(field?.type, 'the type drives the coloured filter chips, so it is a vocabulary').toBe(
      'select',
    )
    const values = ((field?.options ?? []) as { value?: string }[]).map((o) => o.value)
    expect([...values].sort()).toEqual([
      'aula_presencial',
      'evento_aberto',
      'manutencao',
      'mutirao',
      'oficina',
      'prazo_missao',
    ])
  })

  it('declares evento\'s own four states, which are NOT the three-state review queue', () => {
    // `data-model.md` § Review queue: "evento uses its own set (rascunho · publicado ·
    // cancelado · concluido) per calendario.md". `em_revisao` does not exist here — an agenda
    // entry is cancelled or finished, never "awaiting review".
    const field = fieldNamed('status')

    expect(field?.type, 'status is four named states, not free text').toBe('select')
    const values = ((field?.options ?? []) as { value?: string }[]).map((o) => o.value)
    expect([...values].sort()).toEqual(['cancelado', 'concluido', 'publicado', 'rascunho'])
    expect(field?.defaultValue, 'a new evento must start as a draft (US1)').toBe('rascunho')
  })

  it('points local and maquinas at the two collections that landed first', () => {
    expect(fieldNamed('local')?.relationTo).toBe('local')

    const maquinas = fieldNamed('maquinas')
    expect(maquinas?.relationTo).toBe('maquina')
    expect(maquinas?.hasMany, 'an event uses more than one machine').toBe(true)
  })

  it('points responsavel at perfilMaker, not at the global usuario (CLR-002)', () => {
    // calendario.md says "relação → usuario", written before CLR-002 split identity from
    // profile: level and XP are per-organization, so the card's `NÍVEL n` is a profile fact.
    expect(fieldNamed('responsavel')?.relationTo).toBe('perfilMaker')
  })

  it('relates aulasPrerequisito to aula and projetosGerados to projeto, both as lists', () => {
    for (const [name, target] of [
      ['aulasPrerequisito', 'aula'],
      ['projetosGerados', 'projeto'],
    ] as const) {
      const field = fieldNamed(name)
      expect(field?.relationTo, `${name} points somewhere else`).toBe(target)
      expect(field?.hasMany, `${name} is a list in calendario.md`).toBe(true)
    }
  })

  it('lets materiais carry meshes and documents alike, each from its own media collection', () => {
    // ".pdf .zip .stl .3mf .obj .gltf .glb .svg .dxf" spans two groups, and the groups are
    // separate collections because each carries its own cap and allowlist.
    const field = fieldNamed('materiais')

    expect(field?.relationTo).toEqual(['midiaModelo3d', 'midiaDocumento'])
    expect(field?.hasMany, 'calendario.md marks materiais a list of files').toBe(true)
  })

  it('points capa and galeriaPosEvento at the image collection', () => {
    expect(fieldNamed('capa')?.relationTo).toBe('midiaImagem')

    const galeria = fieldNamed('galeriaPosEvento')
    expect(galeria?.relationTo).toBe('midiaImagem')
    expect(galeria?.hasMany, 'the post-event record is a gallery, not one photo').toBe(true)
  })

  it('keeps xpPresenca in the model and unused (FR-023, PO 2026-08-24)', () => {
    // "o calendário não concede XP; campo fica no modelo, sem uso na UI do v1". Keeping the
    // field means the check-in's return is a decision, not a migration.
    const field = fieldNamed('xpPresenca')

    expect(field, 'xpPresenca is reserved by FR-023; dropping it makes its return a migration')
      .toBeDefined()
    expect(field?.required, 'a reserved field cannot be required — nothing writes it in v1')
      .not.toBe(true)
  })

  it('declares neither skill nor missaoRelacionada, whose targets are feature 005\'s (D2)', () => {
    for (const name of ['skill', 'missaoRelacionada']) {
      expect(
        fieldNamed(name),
        `evento declares ${name}: Payload throws InvalidFieldRelationship for its target`,
      ).toBeUndefined()
    }
  })

  it('declares the scheduling and enrolment fields with their types', () => {
    for (const [name, type] of [
      ['descricaoLonga', 'richText'],
      ['oQueVaiFazer', 'richText'],
      ['oQueLevar', 'richText'],
      ['diaInteiro', 'checkbox'],
      ['recorrencia', 'text'],
      ['vagasTotal', 'number'],
      ['inscricaoObrigatoria', 'checkbox'],
      ['prazoInscricao', 'date'],
      ['publicoAlvo', 'select'],
    ] as const) {
      const field = fieldNamed(name)
      expect(field, `evento declares no ${name} (calendario.md § Modelo de conteúdo)`).toBeDefined()
      expect(field?.type, `${name} has the wrong type`).toBe(type)
    }
  })

  it('stores curtidas as a counter that starts at zero', () => {
    // The ♥ is "tenho interesse" on the agenda card, counted from `curtida` rows in the same
    // transaction (data-model.md § Derived values). Zero, never null — a card rendering
    // `null ♥` is the bug a nullable counter always eventually produces.
    const field = fieldNamed('curtidas')

    expect(field?.type, 'curtidas renders a count on the card, not a join').toBe('number')
    expect(field?.defaultValue, 'an evento with no curtidas must read 0, never null').toBe(0)
  })

  it('labels every field in PT-BR', () => {
    // Payload auto-labels an unlabelled field with `toWords(name)` — "Descricao Curta",
    // "Inicio Em", "Xp Presenca" — so these exact strings can only come from the config.
    const expected: Record<string, string> = {
      titulo: 'Título',
      slug: 'Slug',
      tipo: 'Tipo',
      descricaoCurta: 'Descrição curta',
      descricaoLonga: 'Descrição longa',
      oQueVaiFazer: 'O que você vai fazer',
      oQueLevar: 'O que levar',
      capa: 'Capa',
      inicioEm: 'Início',
      fimEm: 'Fim',
      diaInteiro: 'Dia inteiro',
      recorrencia: 'Recorrência',
      local: 'Local',
      maquinas: 'Máquinas',
      responsavel: 'Responsável',
      aulasPrerequisito: 'Aulas pré-requisito',
      vagasTotal: 'Vagas',
      inscricaoObrigatoria: 'Inscrição obrigatória',
      prazoInscricao: 'Prazo de inscrição',
      xpPresenca: 'XP de presença',
      materiais: 'Materiais',
      galeriaPosEvento: 'Galeria pós-evento',
      projetosGerados: 'Projetos gerados',
      status: 'Status',
      publicoAlvo: 'Público-alvo',
      curtidas: 'Curtidas',
    }

    for (const [name, label] of Object.entries(expected)) {
      expect(fieldNamed(name)?.label, `${name} is not labelled in PT-BR`).toBe(label)
    }
  })
})

describe('evento keeps the template\'s guarantees (T041, FR-007, FR-008, FR-009)', () => {
  it('validates every scoped relationship with the shared sameTenant (FR-007)', () => {
    // `data-model.md` § Relationships that need sameTenant names five of these by hand:
    // evento.local · evento.maquinas · evento.responsavel · evento.aulasPrerequisito ·
    // evento.projetosGerados. Identity, not `toBeDefined()` — FR-007 is a guarantee only
    // while there is exactly one implementation of it.
    for (const name of [
      'capa',
      'local',
      'maquinas',
      'responsavel',
      'aulasPrerequisito',
      'materiais',
      'galeriaPosEvento',
      'projetosGerados',
    ]) {
      expect(
        fieldNamed(name)?.validate,
        `${name} points at a scoped collection with no same-tenant validator`,
      ).toBe(sameTenant)
    }
  })

  it('guards status with canPublishField on create as well as update (SC-005)', () => {
    // A maker who could set `publicado` would put an unreviewed activity on the public agenda;
    // one who could set `cancelado` would strike another team's event off it.
    const access = fieldNamed('status')?.access as Record<string, unknown> | undefined

    expect(access?.update, 'a maker could move an evento to publicado').toBe(canPublishField)
    expect(
      access?.create,
      'a POST with status: publicado on a brand new evento never meets the update guard',
    ).toBe(canPublishField)
  })

  it('lets nothing but the hook write the approval stamp (FR-009, CLR-001)', async () => {
    for (const name of ['aprovacaoRegistrada', 'aprovadoEm']) {
      const field = fieldNamed(name)
      expect(field, `evento declares no ${name}: republishing would credit XP twice`).toBeDefined()

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

describe('evento confines the admin surface to one organization (T041, FR-021)', () => {
  it('answers a member with a query constraint, never a bare authorisation', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        "including another lab's agenda (FR-006)",
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    // The agenda is public (PO, 2026-08-24), and it is served by `getPublicScopedPayload`,
    // which goes around collection access: the plugin AND-s its own tenant constraint onto
    // whatever this returns and would nullify a public branch (plan § Sketch 2).
    expect(await decide('read', undefined)).toBe(false)
  })

  it('lets a maker propose an activity, scoped to their own lab (US1, FR-008)', async () => {
    // calendario.md's open question 6 ("quem cria eventos") is not closed, so creation follows
    // the template: any signed-in member writes a draft, and only the team may publish it —
    // the guard that actually decides what reaches the public agenda is on `status`.
    const result = await decide('create', member(7, 'maker'))

    expect(result, 'a maker was refused: the review queue is the gate, not create (FR-008)')
      .not.toBe(false)
    expect(JSON.stringify(result), 'the submission was not scoped to their own lab').toContain('7')
  })

  it('does not let a maker delete, which is the team\'s (US7)', async () => {
    // A maker who could delete could erase an event the lab announced, and with it the review
    // trail the approval stamp makes permanent.
    expect(await decide('delete', member(1, 'maker'))).toBe(false)
  })
})
