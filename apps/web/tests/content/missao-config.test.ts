import type { Field, RelationshipField, SelectField, TextField, TextareaField } from 'payload'
import { describe, expect, it } from 'vitest'

import { Missao } from '../../collections/content/Missao'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T026 / FR-020 — `missao`, the catalogue of challenges **one** lab publishes.
 *
 * FR-020 names five things and nothing else: a title, a description, an icon, **the skill it
 * credits**, and a published state. The assertions below defend the three of those that cost
 * something if they are shaped by habit rather than by the requirement:
 *
 *  - **`skill` is REQUIRED here, unlike on the four publishables.** CLR-009 made
 *    `projeto.skill` and its siblings nullable because content published before this feature
 *    names no skill and still credits the maker's total. A mission has no such history and no
 *    such fallback: FR-022 credits *"the skill the mission names"* on approval, so a mission
 *    with no skill is an approval with nowhere to put the XP — a row the credit path would
 *    have to either refuse or silently downgrade, in front of a maker who did the work.
 *  - **The published state is a `status` field carrying `publicado`, not a `publicada`
 *    checkbox.** FR-024 shows a mission to a **signed-out** visitor, and the anonymous path is
 *    `getPublicScopedPayload`, which admits a scoped collection only through
 *    `derivePublishable` — literally `flattenAllFields(...).some(f => f.name === 'status')` —
 *    and then filters `{ status: { equals: 'publicado' } }`. A boolean would fail **closed**:
 *    `assertPubliclyReadable` throws `PublicReadDeniedError` for a scoped collection with no
 *    `status`, so the mission page would serve a refusal to exactly the visitor FR-024 is
 *    written about.
 *  - **The icon is a `midiaImagem` relationship, never an icon key.** Decision D3 as revised
 *    (2026-09-07) and the `categoriaModelo.icone` / `maquina.icone` precedent: a text key names
 *    an icon set that exists nowhere in this codebase, while `midiaImagem` already carries the
 *    `.svg` allowlist and Payload's `validateSvg` script check.
 *
 * Writing is `teamOnly()` because `gamification.md` (PO, 2026-08-24) makes missions **curated
 * by the team**. That is also why no `canPublishField` guard is declared on `status`: that
 * function exists for collections a maker may write — `artigo`, `projeto` — where the
 * collection-level rule cannot tell "submit for review" from "publish". Here the collection
 * rule already answers it, and the only writers are the team of this lab.
 *
 * Config-shape only, against the exported collection, exactly as `skill.test.ts` and
 * `regras-xp.test.ts` assert. Registration in `payload.config.ts` and the `SCOPE_REGISTRY`
 * entry land together in **T028** — `registry.test.ts` diffs the two in both directions, so
 * they cannot be added separately.
 */

const fieldNamed = (name: string): Field | undefined =>
  Missao.fields.find((f) => (f as { name?: string }).name === name)

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = Missao.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`missao declares no ${operation} access; it would fall back to logged-in`)
  }
  return access({ req: { user } } as never)
}

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

describe('missao is one lab\'s catalogue of challenges (T026, FR-020)', () => {
  it('is slugged missao and labelled in PT-BR, because the admin is the lab team\'s surface', () => {
    expect(Missao.slug).toBe('missao')
    expect(Missao.labels?.singular).toBe('Missão')
    expect(Missao.labels?.plural).toBe('Missões')
  })

  it('writes nothing to payload-locked-documents, which no plugin scopes', () => {
    // Each row of that internal collection names a document by collection and id and it is not
    // tenant-filtered (FR-018, CLR-004). Locking is ON by default — the predicate is
    // `lockDocuments !== false` — so the leak reopens by omission, never by an edit.
    expect(Missao.lockDocuments).toBe(false)
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (Missao.endpoints || []).some((e) => (e as { path?: string }).path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection; ' +
        'isolation.test.ts throws for a scoped collection that declares none',
    ).toBe(true)
  })

  it('declares no tenant field of its own — the multi-tenant plugin injects it', () => {
    expect(
      fieldNamed('tenant'),
      'a hand-declared tenant collides with the one the plugin injects, and the two disagree ' +
        'about which one access control filters on',
    ).toBeUndefined()
  })

  it('carries exactly what FR-020 names: titulo, descricao, icone, skill, status', () => {
    expect(
      Missao.fields.map((f) => (f as { name?: string }).name).sort(),
      'the columns have drifted from FR-020. A missing one is a mission the card cannot render ' +
        'or a credit with no skill to land on; an extra one is scope this task did not carry.',
    ).toEqual(['descricao', 'icone', 'skill', 'status', 'titulo'])
  })
})

describe('missao access: every maker reads the catalogue, the team curates it (FR-020)', () => {
  it('answers a member with a query constraint, never a bare authorisation (FR-006)', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        'including the other lab\'s missions (FR-006)',
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    // FR-024's signed-out visitor is served by the public client, which goes *around*
    // collection access. An anonymous branch declared here would be nullified anyway: the
    // plugin AND-s `{ tenant: { in: userTenantIDs } }` onto whatever we return.
    expect(await decide('read', undefined)).toBe(false)
  })

  for (const operation of ['create', 'update', 'delete'] as const) {
    it(`lets the lab team ${operation} its own missions, scoped to their lab`, async () => {
      const result = await decide(operation, member(7, 'admin'))

      expect(
        result,
        `an org admin was refused ${operation}: missions are curated by the team ` +
          '(gamification.md, PO 2026-08-24), so there would be nobody left to write one',
      ).not.toBe(false)
      expect(
        JSON.stringify(result),
        `${operation} is not scoped to the writer's own lab: one team writes another lab's ` +
          'catalogue',
      ).toContain('7')
    })

    it(`refuses a maker ${operation}: a mission is not user-generated`, async () => {
      expect(
        await decide(operation, member(1, 'maker')),
        `a maker was allowed to ${operation} a mission; anyone could mint a mission naming a ` +
          'skill and then submit their own completion for it (FR-022)',
      ).toBe(false)
    })
  }
})

describe('missao fields carry what the card renders and what the credit needs (FR-020)', () => {
  it('declares titulo as a required text — it is the mission on the card and in the picker', () => {
    const titulo = fieldNamed('titulo') as TextField | undefined

    expect(titulo?.type).toBe('text')
    expect(
      titulo?.required,
      'titulo is optional, so a mission can exist with nothing to call it — on the card, in ' +
        'the admin list and in every relationship picker that points here',
    ).toBe(true)
    expect(
      Missao.admin?.useAsTitle,
      'without useAsTitle the admin and every relationship picker offer database ids',
    ).toBe('titulo')
  })

  it('declares descricao as a required textarea — the card line the mockup shows', () => {
    const descricao = fieldNamed('descricao') as TextareaField | undefined

    expect(
      descricao?.type,
      'descricao is not a textarea: `Crie um chaveiro personalizado com corte a laser` is one ' +
        'line of prose, not rich text and not a single-line input',
    ).toBe('textarea')
    expect(
      descricao?.required,
      'descricao is optional, so the mission card renders a title and an empty line',
    ).toBe(true)
  })

  it('declares icone as a midiaImagem relationship, never an icon key (D3)', () => {
    const icone = fieldNamed('icone') as RelationshipField | undefined

    expect(
      icone?.type,
      'icone is a text key: it names an icon set that lives nowhere in this codebase, and it ' +
        'skips the .svg allowlist and the script check midiaImagem already applies',
    ).toBe('relationship')
    expect(icone?.relationTo).toBe('midiaImagem')
    expect(
      icone?.validate,
      'icone has no same-tenant validator: spike S4c measured the plugin ACCEPTING a write ' +
        'that points at another lab\'s row, so a mission would render a neighbour\'s image',
    ).toBe(sameTenant)
  })

  it('declares skill as a REQUIRED relationship — a mission names what it credits (FR-022)', () => {
    const skill = fieldNamed('skill') as RelationshipField | undefined

    expect(skill?.type).toBe('relationship')
    expect(skill?.relationTo).toBe('skill')
    expect(
      skill?.required,
      'skill is nullable here. CLR-009 made it nullable on the four publishables because ' +
        'content published before this feature names none; a mission has no such history, and ' +
        'FR-022 credits "the skill the mission names" — with none, an approved submission is a ' +
        'credit with nowhere to land, in front of a maker who already did the work',
    ).toBe(true)
    expect(
      skill?.validate,
      'skill has no same-tenant validator: a mission could credit another lab\'s skill row, ' +
        'and the ledger entry would name it (FR-007, spike S4c)',
    ).toBe(sameTenant)
  })
})

describe('missao\'s published state is what the anonymous path can filter on (FR-024)', () => {
  const status = () => fieldNamed('status') as SelectField | undefined

  it('is a select named status, because derivePublishable asks for exactly that name', () => {
    // `derivePublishable` is `flattenAllFields(...).some(f => f.name === 'status')`, and
    // `assertPubliclyReadable` THROWS PublicReadDeniedError for a scoped collection that has
    // no such field. A `publicada` checkbox fails closed: the mission page would answer a
    // signed-out visitor with a refusal, which is the visitor FR-024 is written about.
    expect(
      status()?.type,
      'the published state is not a `status` select, so no published-only filter can be built ' +
        'for missao and the anonymous read is refused outright (FR-024)',
    ).toBe('select')
  })

  it('offers publicado — the one value the public client filters on', () => {
    const values = (status()?.options ?? []).map((o) =>
      typeof o === 'string' ? o : (o as { value: string }).value,
    )

    expect(
      values,
      'no `publicado` option: `publishedOnly()` filters `{ status: { equals: \'publicado\' } }`, ' +
        'so every mission of every lab would match zero rows and /missoes would be empty',
    ).toContain('publicado')
  })

  it('defaults to rascunho, so a half-written mission is never published by omission', () => {
    expect(
      status()?.defaultValue,
      'a mission created with no status defaults to something other than `rascunho`: the ' +
        'default decides what an unfinished row is, and the safe answer is "not public yet"',
    ).toBe('rascunho')
  })

  it('is required, so no row answers undefined to the published-only filter', () => {
    expect(
      status()?.required,
      'status is optional, so a row can carry null — invisible to `status = publicado` and ' +
        'invisible to a `not equals` audit alike, which is how a mission goes missing with ' +
        'nothing to point at',
    ).toBe(true)
  })
})
