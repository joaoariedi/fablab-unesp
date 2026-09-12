import type { TenantScopedPayload } from '../tenancy'
import {
  PERFIL_MAKER_HANDLE_UNIQUE_INDEX,
  PERFIL_MAKER_HANDLE_UNIQUE_VIOLATION,
} from '../tenancy/handle-unique-index'

/**
 * The `@handle` fold (feature 004, FR-010 / spec § CLR-002).
 *
 * `Maria Silva` → `mariasilva`; `João D'Ávila` → `joaodavila`. ASCII, lowercase, letters only.
 *
 * Pure and total by design: the handle is derived **once, at profile creation** (CLR-002), and
 * everything that makes derivation hard — two makers colliding on the same base, the `2`-first
 * suffix, the unique index that adjudicates a race — lives in the insert (`createWithHandle`),
 * not here. This function is the half that can be table-tested without a database, so it is
 * kept that way: no I/O, no throwing, no knowledge of what is already taken.
 *
 * The three steps are ordered, and the order is the whole trick:
 *
 * 1. `normalize('NFD')` splits a precomposed `Á` (U+00C1) into `A` + a combining acute. Without
 *    it, step 3 sees one character that is not in `a-z` and deletes the letter along with its
 *    accent — `D'Ávila` would fold to `dvila`. Roughly a fifth of Brazilian given names carry a
 *    diacritic, so this is the common path, not the edge case.
 * 2. Strip U+0300–U+036F, the combining-marks block NFD just produced.
 * 3. Lowercase, then drop everything left that is not `a-z` — spaces, apostrophes, hyphens and
 *    digits included, because the handle lands in a URL and a mention.
 *
 * A character with no ASCII letter underneath it (`ß`, Cyrillic, CJK) is not decomposed by NFD
 * and therefore disappears, which means a name written entirely in such a script folds to `''`.
 * That is the rule's honest outcome rather than a bug to patch here: an empty base is a
 * collision like any other, and the insert is what resolves collisions.
 *
 * @example
 * foldToHandle("João D'Ávila") // → 'joaodavila'
 */
export const foldToHandle = (nome: string): string =>
  nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

/**
 * The slice of the choke-point client this needs (`lib/tenancy/client.ts`).
 *
 * Narrowed to `create` for the reason `CounterStore` is narrowed to three: the retry loop has
 * no business reading, updating or deleting, and a type that cannot express those operations
 * is the cheapest way of saying so. It also lets the unit test supply a named fake without
 * standing up a client.
 */
export type HandleStore = Pick<TenantScopedPayload, 'create'>

/**
 * How many handles are tried before the signup fails (plan.md § *"The handle collision is
 * resolved by the database"*): `@base`, then `@base2` … `@base25`.
 *
 * Bounded because the loop's exit condition is *another process not holding the next handle*,
 * and nothing guarantees that. 25 makers sharing one folded name in one lab is already beyond
 * anything `concept.md` describes, so reaching the bound means something is wrong that a 26th
 * insert would not fix — and an unbounded loop on a pathological input is worse than a failed
 * signup, which is a thing the person can retry and the team can see.
 */
export const MAX_HANDLE_ATTEMPTS = 25

/** The two error shapes below, as narrowly as they can be read without asserting a class. */
type PayloadValidationShape = {
  data?: { errors?: ({ path?: string; tableName?: string } | null)[] }
}
type PostgresErrorShape = { code?: unknown; constraint?: unknown }

/**
 * Is this the `(tenant, handle)` index refusing the insert — and **not** some other constraint?
 *
 * The distinction is the whole safety of the retry: a blanket catch on "unique violation"
 * would swallow, say, a duplicate e-mail and then retry 24 more times against an error no
 * suffix can fix, finally reporting a handle problem for something that was never one.
 *
 * Two shapes, because there are two doors and only one of them is the usual one:
 *
 *   1. **What the Local API actually raises**, measured 2026-09-12 and recorded in
 *      `lib/tenancy/handle-unique-index.ts`: `@payloadcms/drizzle`'s `handleUpsertError`
 *      intercepts Postgres's refusal and rethrows a `ValidationError` in which the code
 *      `23505` and the index name are both **gone**. What survives — and therefore what
 *      identifies the constraint — is the table plus the column pair.
 *   2. **The raw `23505` naming this index**, which is what plan.md's sketch expected and what
 *      a direct drizzle write, or a Payload version that stops intercepting, would produce.
 *      Kept deliberately: the failure mode of dropping it is silent, because the loop would
 *      simply rethrow a collision instead of resolving it, and no type would object.
 *
 * Duck-typed rather than `instanceof ValidationError`: two copies of `payload` in a pnpm tree
 * make that check false for an error that is one, and a wrong `false` here turns a routine
 * collision into a failed signup.
 */
const isHandleUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false

  const errors = (error as PayloadValidationShape).data?.errors ?? []
  const byPayload = errors.some(
    (e) =>
      e?.tableName === PERFIL_MAKER_HANDLE_UNIQUE_VIOLATION.tableName &&
      e?.path === PERFIL_MAKER_HANDLE_UNIQUE_VIOLATION.path,
  )
  if (byPayload) return true

  const { code, constraint } = error as PostgresErrorShape
  return code === '23505' && constraint === PERFIL_MAKER_HANDLE_UNIQUE_INDEX
}

/**
 * Create the profile, letting the **database** decide which handle is free (FR-010, CLR-002).
 *
 * ── Why there is no `SELECT` here ──────────────────────────────────────────────────────────
 *
 * plan.md § *"The handle collision is resolved by the database, not by reading first"*: two
 * simultaneous signups by homonyms both read *"`mariasilva` is taken, `mariasilva2` is free"*
 * and both write `mariasilva2`. The unique index on `(tenant, handle)` is the only arbiter
 * that cannot lose that race, so the shape is insert → catch its refusal → increment → insert.
 * The loser of the race retries; nobody reads. `tests/accounts/handle-race.test.ts` is the
 * proof against a real database.
 *
 * ── Why the first suffix is 2 ──────────────────────────────────────────────────────────────
 *
 * CLR-002 worked the example: `@mariasilva`, then `@mariasilva2`, `@mariasilva3`. A `1` would
 * put `@mariasilva` and `@mariasilva1` side by side, reading as a first of two people when one
 * of them carries no number at all. So attempt *n* is `${base}${n}` for every n but the first,
 * which is the bare base — and the lowest free integer is what the loop lands on, because it
 * tries them in order and stops at the first the index accepts.
 *
 * (plan.md's sketch wrote `suffix === 1 ? base : ${base}${suffix + 1}`, which skips `2`
 * entirely — the first collision would produce `@mariasilva3`. Corrected here against CLR-002,
 * which is the requirement; the sketch was illustrating the retry, not the arithmetic.)
 *
 * `base` is expected to be `foldToHandle(nome)` and is **not** re-folded: folding twice is a
 * no-op the fold's own test pins, and re-folding here would silently accept an unfolded name
 * from a future caller instead of letting it be caught.
 *
 * @throws the underlying error, untouched, for any failure that is not this index's — a
 * duplicate e-mail, a required field, a dropped connection.
 * @throws Error naming the base handle and the bound when all {@link MAX_HANDLE_ATTEMPTS}
 * candidates are taken.
 *
 * @example
 * const perfil = await createWithHandle(db, foldToHandle(input.nome), {
 *   nome: input.nome, usuario: user.id, avatarConfig: input.avatar,
 * })
 */
export async function createWithHandle<T = Record<string, unknown>>(
  db: HandleStore,
  base: string,
  data: Record<string, unknown>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_HANDLE_ATTEMPTS; attempt += 1) {
    const handle = attempt === 1 ? base : `${base}${attempt}`
    try {
      return await db.create<T>({ collection: 'perfilMaker', data: { ...data, handle } })
    } catch (error) {
      // Anything that is not THIS constraint is someone else's problem and is not retried.
      if (!isHandleUniqueViolation(error)) throw error
    }
  }

  throw new Error(
    `could not derive a free @handle from "${base}" in ${MAX_HANDLE_ATTEMPTS} attempts: ` +
      `@${base} through @${base}${MAX_HANDLE_ATTEMPTS} are all taken in this organization`,
  )
}
