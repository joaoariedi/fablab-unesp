import type { CollectionBeforeValidateHook } from 'payload'
import { describe, expect, it } from 'vitest'

import { ProgressoAula } from '../../collections/content/ProgressoAula'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T040 / FR-003 — `progressoAula`: **a coleção só existe para usuário logado** (PO,
 * 2026-08-24, `aulas.md` § Coleções relacionadas). A visitor watches without generating a
 * row and without XP; the anonymous audience count is still **(proposta)** and is not this.
 *
 * What this file asserts is not that the collection exists — it is the three properties a
 * progress row has to have before feature 005 can credit XP off it:
 *
 *  - **no anonymous row**: `create` refuses a request with no `req.user`, and `usuario` is
 *    required, so no row can exist that names no account;
 *  - **the account is the requester's**, stamped server-side rather than taken from the
 *    payload — otherwise a signed-in maker manufactures progress (and, once 005 lands, XP)
 *    attributed to anybody they name;
 *  - **one row per person per aula**, a unique `(usuario, aula)` pair. "Crédito uma vez por
 *    aula (anti-farm)" is only enforceable while a second row cannot exist, and unlike
 *    `curtida.conteudo` — polymorphic, so stored in the relationships join table with no
 *    column pair to constrain — both sides here are single-target relationships and Payload
 *    can express the constraint (`CompoundIndex`, payload 3.88).
 *
 * Config-shape only, against the exported collection: registration in `payload.config.ts` and
 * in `SCOPE_REGISTRY` is T044's single edit, and `registry.test.ts` fails the build whenever
 * the two disagree — so they cannot land separately.
 */

const fieldNamed = (name: string) =>
  ProgressoAula.fields.find((f) => (f as { name?: string }).name === name) as
    | Record<string, unknown>
    | undefined

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = ProgressoAula.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(
      `progressoAula declares no ${operation} access; it would fall back to logged-in`,
    )
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

/**
 * The attribution hook, reached **through the collection** rather than imported directly: a
 * hook that is written but never registered would pass every direct-call assertion and do
 * nothing in production (the lesson `review.test.ts` records for `stampApproval`).
 */
const attributionHook = (): CollectionBeforeValidateHook => {
  const [hook] = ProgressoAula.hooks?.beforeValidate ?? []
  if (typeof hook !== 'function') {
    throw new Error(
      'progressoAula registers no beforeValidate hook: nothing binds the row to the requester, ' +
        'so a signed-in member can post progress attributed to any account they name',
    )
  }
  return hook as CollectionBeforeValidateHook
}

const runHook = async (args: Record<string, unknown>): Promise<Record<string, unknown>> =>
  (await attributionHook()(args as never)) as Record<string, unknown>

describe('progressoAula exists only for a signed-in user (T040, FR-003)', () => {
  it('refuses an anonymous create — a visitor watches without generating a row', async () => {
    expect(
      await decide('create', undefined),
      'an anonymous visitor can write a progress row: aulas.md says watching is open but the ' +
        'record (and the XP) is not',
    ).toBe(false)
  })

  it('refuses an anonymous read — who watched what is not public', async () => {
    expect(await decide('read', undefined)).toBe(false)
  })

  it('answers a member with a query constraint, never a bare authorisation (FR-006)', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        'including who watched what in the other lab (FR-006)',
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('lets a maker record and advance their own progress, scoped to their lab', async () => {
    for (const operation of ['create', 'update'] as const) {
      const result = await decide(operation, member(7, 'maker'))
      expect(result, `a maker was refused ${operation}: watching is not a team privilege`).not.toBe(
        false,
      )
      expect(
        JSON.stringify(result),
        `${operation} is not scoped to the maker's own lab`,
      ).toContain('7')
    }
  })

  it('does not let a maker delete their own progress (anti-farm)', async () => {
    // The row IS the "watched once" record feature 005 reads. A maker who could delete it
    // could re-watch and be credited again, which is exactly the farm the 1-XP-per-aula rule
    // (2026-08-23) exists to prevent.
    expect(await decide('delete', member(1, 'maker'))).toBe(false)
  })
})

describe('progressoAula names the account that watched (T040, FR-003)', () => {
  it('requires usuario and aula, so no row can exist naming neither', () => {
    for (const name of ['usuario', 'aula']) {
      const field = fieldNamed(name)
      expect(field, `progressoAula declares no ${name}`).toBeDefined()
      expect(field?.required, `${name} is optional: a progress row without it records nothing`).toBe(
        true,
      )
    }
  })

  it('points usuario at the global users and aula at the class it tracks', () => {
    expect(fieldNamed('usuario')?.relationTo).toBe('users')
    expect(fieldNamed('aula')?.relationTo).toBe('aula')
  })

  it('validates aula with the shared sameTenant, and usuario with nothing (FR-007)', () => {
    // `aula` is scoped on both sides, and spike S4c measured the plugin ACCEPTING a row in A
    // updated to reference a row in B. `users` is global — it has no `tenant` column to
    // compare against — and data-model.md names that as the one exception.
    expect(
      fieldNamed('aula')?.validate,
      'aula points at a scoped collection with no same-tenant validator',
    ).toBe(sameTenant)
    expect(
      fieldNamed('usuario')?.validate,
      'usuario carries a validator against a global collection, which has no tenant to compare',
    ).toBeUndefined()
  })

  it('stamps the requester onto a create, never the account the payload names', async () => {
    const data = await runHook({
      data: { usuario: 4242, aula: 9, percentualAssistido: 10 },
      operation: 'create',
      req: { user: { id: 7 } },
    })

    expect(
      data.usuario,
      'the payload chose the account: a signed-in maker can record progress — and, once ' +
        'feature 005 lands, XP — for somebody else',
    ).toBe(7)
    expect(data.percentualAssistido, 'the hook rewrote fields it has no claim on').toBe(10)
  })

  it('leaves attribution alone when there is no session — seeds write that way', async () => {
    // Fixtures, seeds and migrations write through the Local API with `overrideAccess: true`
    // and no session; a hook that threw here would make progressoAula unseedable and take the
    // isolation harness down with it. The anonymous *request* is refused one layer up.
    const data = await runHook({
      data: { usuario: 4242, aula: 9 },
      operation: 'create',
      req: {},
    })

    expect(data.usuario).toBe(4242)
  })

  it('does not re-stamp an update — that would rewrite history, not record it', async () => {
    const data = await runHook({
      data: { percentualAssistido: 100 },
      operation: 'update',
      req: { user: { id: 7 } },
    })

    expect(data.usuario, 'an update re-attributed the row to whoever was signed in').toBeUndefined()
  })

  it('allows only one row per person per aula (anti-farm)', () => {
    // "Crédito uma vez por aula" (2026-08-23) is only enforceable while a second row cannot
    // exist. Both sides are single-target relationships, so unlike `curtida` there IS a column
    // pair for Postgres to constrain.
    const indexes = (ProgressoAula.indexes ?? []) as { fields?: string[]; unique?: boolean }[]
    const pair = indexes.find(
      (index) =>
        index.unique === true &&
        [...(index.fields ?? [])].sort().join(',') === 'aula,usuario',
    )

    expect(
      pair,
      'nothing stops a second progress row for the same person and class, so the "watched ' +
        'once" record feature 005 credits from is not unique',
    ).toBeDefined()
  })
})

describe('progressoAula carries what the player resumes from (T040, FR-003)', () => {
  it('tracks percentualAssistido as a 0-100 number that starts at zero', () => {
    const field = fieldNamed('percentualAssistido')

    expect(field?.type).toBe('number')
    expect(field?.defaultValue, 'a row with no progress must read 0, never null').toBe(0)
    expect(field?.min).toBe(0)
    expect(field?.max, 'a percentage above 100 would render a broken progress bar').toBe(100)
  })

  it('declares concluidaEm as the date filled at 100%', () => {
    // Round 5, 2026-08-24: `concluida_em` is filled on watching the whole video, superseding
    // the ≥90% / CONCLUIR AULA proposal. Optional — an in-progress row has no completion date.
    const field = fieldNamed('concluidaEm')

    expect(field?.type).toBe('date')
    expect(field?.required, 'an in-progress row has no completion date to carry').not.toBe(true)
  })

  it('declares posicaoReproducao, the resume point the mockup added', () => {
    // minha-conta.md (2026-08-24) shows `12:45` on the thumb. Stored in seconds — a number the
    // player seeks to — rather than the rendered `mm:ss`, which is a formatting of it.
    const field = fieldNamed('posicaoReproducao')

    expect(field, 'progressoAula declares no posicaoReproducao: the player cannot resume').toBeDefined()
    expect(field?.type).toBe('number')
    expect(field?.min).toBe(0)
  })

  it('writes no row to payload-locked-documents (FR-018, CLR-004)', () => {
    expect(ProgressoAula.lockDocuments).toBe(false)
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (ProgressoAula.endpoints || []).some((e) => e.path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })

  it('is labelled in PT-BR, fields included (US7)', () => {
    const labels = ProgressoAula.labels as { singular?: unknown; plural?: unknown } | undefined
    expect(labels?.singular).toBe('Progresso de aula')
    expect(labels?.plural).toBe('Progressos de aula')

    const expected: Record<string, string> = {
      usuario: 'Usuário',
      aula: 'Aula',
      percentualAssistido: 'Percentual assistido',
      concluidaEm: 'Concluída em',
      posicaoReproducao: 'Posição de reprodução',
    }
    for (const [name, label] of Object.entries(expected)) {
      expect(fieldNamed(name)?.label, `${name} is not labelled in PT-BR`).toBe(label)
    }
  })
})
