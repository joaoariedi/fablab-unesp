import { ValidationError } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  createWithHandle,
  MAX_HANDLE_ATTEMPTS,
  type HandleStore,
} from '../../lib/accounts/handle'
import type { CreateArgs } from '../../lib/tenancy'
import {
  PERFIL_MAKER_HANDLE_UNIQUE_INDEX,
  PERFIL_MAKER_HANDLE_UNIQUE_VIOLATION,
} from '../../lib/tenancy/handle-unique-index'

/**
 * T020 / FR-010, CLR-002 — **the insert that adjudicates a handle collision**.
 *
 * CLR-002: *"On collision, append the lowest free integer: `@mariasilva2`, `@mariasilva3`"*.
 * plan.md § *"The handle collision is resolved by the database, not by reading first"* fixes
 * how: an insert, a retry on the unique violation the index raises, and a bound — *"25
 * attempts, then raises with the base handle in the message"*.
 *
 * ── Why a named fake and not Postgres ──────────────────────────────────────────────────────
 *
 * The three properties this task owns are all about **what the retry loop does with an
 * error**, and a real database can only ever hand it one error at a time:
 *
 *   1. the sequence of handles attempted — which a successful insert hides;
 *   2. that a violation of *another* constraint is rethrown rather than retried — which needs
 *      an error no schema will produce on this insert;
 *   3. that the loop is bounded — which against Postgres means seeding 25 profiles to watch
 *      the 26th fail.
 *
 * The two halves that genuinely need a database already have their files:
 * `handle-unique-index.test.ts` proves the index exists and **measures the error it raises**,
 * and T021's race test proves two concurrent creates get two handles. This is the half that
 * can be table-tested, so it is — the same split `counter-strategy.test.ts` (fake) and
 * `counters.test.ts` (Postgres) make for the counters.
 *
 * The fake is anchored to the measured shape rather than to an invented one: every rejection
 * below is built from `PERFIL_MAKER_HANDLE_UNIQUE_VIOLATION`, the constant T019 exported after
 * observing what `@payloadcms/drizzle` actually rethrows through the Local API. If a Payload
 * upgrade changes that encoding, `handle-unique-index.test.ts` § 2 fails against the real
 * database and this file follows the constant — neither can drift alone.
 */

/** The profile step 2 writes, minus the handle — which is this module's to decide. */
const PERFIL = Object.freeze({ nome: 'Maria Silva', usuario: 7, escolaridade: 'superior' })

const BASE = 'mariasilva'

/**
 * The collision **as it reaches the caller** — a Payload `ValidationError`, not a pg `23505`.
 *
 * plan.md's sketch catches the code; `lib/tenancy/handle-unique-index.ts` records why it never
 * arrives (`handleUpsertError` intercepts and rethrows, dropping both the code and the index
 * name). Built here through Payload's real constructor so the `data.errors[0]` shape is the
 * library's own and not this file's idea of it.
 */
const colisaoDeHandle = (): Error =>
  new ValidationError({
    collection: 'perfilMaker',
    errors: [{ message: 'Value must be unique', ...PERFIL_MAKER_HANDLE_UNIQUE_VIOLATION }],
  })

/**
 * The same constraint refusing the write **before** Payload translates it — a direct drizzle
 * write, or a Payload version that stops intercepting. Retrying this is the behaviour the task
 * names in so many words (*"catch `23505` for that index only"*), and it costs three lines to
 * keep both doors open; not keeping them is a silent regression to an unretried collision.
 */
const violacaoBruta = (): Error =>
  Object.assign(
    new Error(
      `duplicate key value violates unique constraint "${PERFIL_MAKER_HANDLE_UNIQUE_INDEX}"`,
    ),
    { code: '23505', constraint: PERFIL_MAKER_HANDLE_UNIQUE_INDEX },
  )

/** A unique violation on a **different** constraint: same code, another table and column. */
const colisaoDeEmail = (): Error =>
  new ValidationError({
    collection: 'users',
    errors: [{ message: 'Value must be unique', path: 'email', tableName: 'users' }],
  })

/** `handle: ''` — what an all-Cyrillic name folds to. Refused by the field, not by the index. */
const handleObrigatorio = (): Error =>
  new ValidationError({
    collection: 'perfilMaker',
    errors: [{ message: 'This field is required.', path: 'handle', tableName: 'perfil_maker' }],
  })

/**
 * A named fake for the choke-point client (`.claude/rules/code-quality.md` — mocks are named
 * classes, not inline stubs). It records every attempt, so the assertions can be about *which
 * handles were tried and in what order* rather than only about what came back.
 */
class FakePerfilMakerStore implements HandleStore {
  readonly attempts: CreateArgs[] = []

  constructor(
    private readonly behaviour: {
      /** Handles already held by another profile of this organization. */
      ocupados?: ReadonlySet<string>
      /** How a taken handle is refused. Defaults to the measured `ValidationError`. */
      recusa?: () => Error
      /** When set, the FIRST attempt rejects with this instead — the rethrow paths. */
      falhaInicial?: () => Error
    } = {},
  ) {}

  /** The handle of every attempt, in order — the sequence CLR-002 is a claim about. */
  get tentados(): string[] {
    return this.attempts.map((a) => String(a.data.handle))
  }

  create = async <T>(args: CreateArgs): Promise<T> => {
    this.attempts.push(args)
    if (this.behaviour.falhaInicial && this.attempts.length === 1) {
      throw this.behaviour.falhaInicial()
    }
    if (this.behaviour.ocupados?.has(String(args.data.handle))) {
      throw (this.behaviour.recusa ?? colisaoDeHandle)()
    }
    return { id: 42, ...args.data } as T
  }
}

/** Every handle from the base up to and including `${base}${ate}` — a fully-collided lab. */
const ocupadosAte = (ate: number): ReadonlySet<string> =>
  new Set([BASE, ...Array.from({ length: ate - 1 }, (_, i) => `${BASE}${i + 2}`)])

describe('§1 — the free handle is written as-is (FR-010)', () => {
  it('inserts the folded base and issues exactly one create', async () => {
    const db = new FakePerfilMakerStore()

    const perfil = await createWithHandle(db, BASE, { ...PERFIL })

    expect(db.tentados, 'a free handle must cost one insert, not a read then an insert').toEqual([
      BASE,
    ])
    expect((perfil as { handle?: string }).handle).toBe(BASE)
  })

  it('forwards the profile data verbatim and adds only the handle', async () => {
    const db = new FakePerfilMakerStore()

    await createWithHandle(db, BASE, { ...PERFIL })

    expect(db.attempts[0]?.collection).toBe('perfilMaker')
    expect(db.attempts[0]?.data).toEqual({ ...PERFIL, handle: BASE })
  })
})

describe('§2 — the suffix starts at 2 and climbs by one (CLR-002)', () => {
  it('answers the first collision with @mariasilva2, never @mariasilva1', async () => {
    const db = new FakePerfilMakerStore({ ocupados: new Set([BASE]) })

    const perfil = await createWithHandle(db, BASE, { ...PERFIL })

    expect(
      db.tentados,
      'CLR-002 worked the example: `@mariasilva2`. A `1` suffix reads as a first of two ' +
        'people when the other has no number at all, and skipping to `3` leaves a free ' +
        'handle unused — neither is "the lowest free integer".',
    ).toEqual([BASE, `${BASE}2`])
    expect((perfil as { handle?: string }).handle).toBe(`${BASE}2`)
  })

  it('walks 2, 3, 4 for a lab that already holds three homonyms', async () => {
    const db = new FakePerfilMakerStore({ ocupados: ocupadosAte(3) })

    const perfil = await createWithHandle(db, BASE, { ...PERFIL })

    expect(db.tentados).toEqual([BASE, `${BASE}2`, `${BASE}3`, `${BASE}4`])
    expect((perfil as { handle?: string }).handle).toBe(`${BASE}4`)
  })

  it('retries the same way when the violation arrives raw, as a pg 23505 on this index', async () => {
    const db = new FakePerfilMakerStore({ ocupados: new Set([BASE]), recusa: violacaoBruta })

    const perfil = await createWithHandle(db, BASE, { ...PERFIL })

    expect((perfil as { handle?: string }).handle).toBe(`${BASE}2`)
  })
})

describe('§3 — that constraint only; everything else is rethrown (plan.md)', () => {
  it('rethrows a unique violation on another table and column after one attempt', async () => {
    const erro = colisaoDeEmail()
    const db = new FakePerfilMakerStore({ falhaInicial: () => erro })

    // Identity, not a message match: what must reach the caller is *that* error, with its
    // `data.errors` intact, so the signup form can put "já cadastrado" on the e-mail field.
    await expect(createWithHandle(db, BASE, { ...PERFIL })).rejects.toBe(erro)
    expect(
      db.tentados,
      'a blanket catch on "unique violation" retries against a constraint no suffix can ' +
        'fix — 25 inserts, then a misleading "could not derive a free handle" for what was ' +
        'really a duplicate e-mail.',
    ).toEqual([BASE])
  })

  it('rethrows a required-field refusal — the empty handle a non-Latin name folds to', async () => {
    const erro = handleObrigatorio()
    const db = new FakePerfilMakerStore({ falhaInicial: () => erro })

    await expect(createWithHandle(db, '', { ...PERFIL })).rejects.toBe(erro)
    expect(
      db.tentados,
      'an empty base is not a collision: `2` would be written as the whole handle, which is ' +
        'not a handle. The field refuses it and the refusal must reach the caller.',
    ).toEqual([''])
  })

  it('rethrows an unrelated failure — a dropped connection is not a taken handle', async () => {
    const boom = new Error('connection terminated unexpectedly')
    const db = new FakePerfilMakerStore({ falhaInicial: () => boom })

    await expect(createWithHandle(db, BASE, { ...PERFIL })).rejects.toBe(boom)
    expect(db.tentados).toEqual([BASE])
  })
})

describe('§4 — bounded at 25, and it says which handle it gave up on (plan.md)', () => {
  it('is bounded at 25 attempts', () => {
    expect(
      MAX_HANDLE_ATTEMPTS,
      'plan.md fixes the bound at 25: "an unbounded loop on a pathological input is worse ' +
        'than a failed signup".',
    ).toBe(25)
  })

  it('succeeds on the 25th attempt, @mariasilva25, when the first 24 are taken', async () => {
    const db = new FakePerfilMakerStore({ ocupados: ocupadosAte(24) })

    const perfil = await createWithHandle(db, BASE, { ...PERFIL })

    expect(db.attempts).toHaveLength(MAX_HANDLE_ATTEMPTS)
    expect(
      (perfil as { handle?: string }).handle,
      'the bound counts attempts, and the 25th is `${base}25` — off by one either way and ' +
        'the last free handle is never tried, or a 26th insert is.',
    ).toBe(`${BASE}25`)
  })

  it('gives up after 25 and names the base handle and the bound in the message', async () => {
    const db = new FakePerfilMakerStore({ ocupados: ocupadosAte(MAX_HANDLE_ATTEMPTS) })

    const erro = await createWithHandle(db, BASE, { ...PERFIL }).then(
      () => null,
      (caught: unknown) => caught,
    )

    expect(
      erro,
      'with every candidate taken the loop must end. Returning a profile here would mean a ' +
        'handle was written over someone else\'s.',
    ).toBeInstanceOf(Error)
    expect(db.attempts, 'the bound is a bound: no 26th insert').toHaveLength(MAX_HANDLE_ATTEMPTS)
    // The message is the only evidence anyone gets when this fires in production, so it
    // carries both the input that defeated it and how hard it tried.
    expect((erro as Error).message).toContain(BASE)
    expect((erro as Error).message).toContain(String(MAX_HANDLE_ATTEMPTS))
  })
})
