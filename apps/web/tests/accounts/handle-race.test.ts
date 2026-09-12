import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createWithHandle, foldToHandle, MAX_HANDLE_ATTEMPTS } from '../../lib/accounts/handle'
import { getSystemScopedPayload } from '../../lib/tenancy/system-payload'
import type { TenantScopedPayload } from '../../lib/tenancy'
import config from '../../payload.config'

/**
 * T021 / SC-009 — **two concurrent creates of the same name get two handles**.
 *
 * SC-009: *"`@handle` is unique within an organization, and homonyms get distinct handles"*.
 * T020 proved the retry *loop* against a named fake, which can only ever hand it the errors
 * the fake was told to raise. This file proves the property the fake cannot: that when two
 * signups for the same name are **in flight at the same time** against a real Postgres, the
 * index adjudicates and both people end up with a handle of their own.
 *
 * ── Why this test exists at all ────────────────────────────────────────────────────────────
 *
 * plan.md § *"The handle collision is resolved by the database, not by reading first"*: the
 * obvious implementation — `SELECT` the taken handles, pick the lowest free one, `INSERT` —
 * passes every single-threaded test ever written for it and loses under load. Both requests
 * read *"`mariasilva` is taken, `mariasilva2` is free"* in the window before either commits,
 * and both write `@mariasilva2`. Without the unique index the second write is accepted and
 * two people share a handle; with it, one signup simply fails.
 *
 * That is the failure `tasks.md` calls *"a race that only happens under load is the one
 * nobody reproduces"*, and nothing in `handle-create.test.ts` can see it: a fake that refuses
 * a handle from a `Set` is, by construction, serialised. So every assertion here is made
 * against the live database, with the creates started **before any of them is awaited** —
 * that ordering is the test.
 *
 * ── What a failure here means ──────────────────────────────────────────────────────────────
 *
 * A rejection, or two profiles sharing a handle, or fewer rows than callers. Each one is a
 * different half of SC-009 breaking, so they are asserted separately rather than as one
 * "it worked" — an assertion that only counts rows would pass while both rows read
 * `@mariasilva`, and one that only compares handles would pass while a signup was lost.
 */

/** The two homonyms of the story. `Maria Silva` folds to `mariasilva` (CLR-002's example). */
const NOME = 'Maria Silva'
const BASE = foldToHandle(NOME)

const SLUG = 'handle-race-lab'
const EMAIL_PREFIX = 'handle-race-'

/** How many signups are raced in §2. Above two, so a retry must itself survive a collision. */
const MULTIDAO = 5

type Perfil = { id: string | number; handle?: string; nome?: string }

let payload: Payload
let db: TenantScopedPayload
/**
 * The lab every racer belongs to.
 *
 * `number`, not `string | number`. Payload types `create`'s `id` as the union because a
 * collection *could* use a text id; `organizations` does not, and the `orgs.organization`
 * relationship is generated as `number | Organization`. Narrowed once at the assignment with a
 * runtime check, rather than cast at each of the three use sites — a cast would also compile on
 * the day the id really did become a string, and this suite would then create every racer in a
 * lab that does not exist and prove nothing about a race.
 */
let orgId: number
let usuarios: (string | number)[] = []

/** Removes only this file's rows, in foreign-key order: profiles, then users, then the lab. */
async function limpar(): Promise<void> {
  await payload.delete({
    collection: 'perfilMaker',
    where: { nome: { equals: NOME } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'users',
    where: { email: { like: EMAIL_PREFIX } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'organizations',
    where: { slug: { equals: SLUG } },
    overrideAccess: true,
  })
}

/** One account per racer: they are different people who happen to share a name. */
async function criarUsuario(n: number): Promise<string | number> {
  const user = await payload.create({
    collection: 'users',
    data: {
      email: `${EMAIL_PREFIX}${n}@example.com`,
      password: 'handle-race-password-123',
      role: 'user',
      orgs: [{ organization: orgId, role: 'maker' }],
    },
    overrideAccess: true,
  })
  return user.id
}

/**
 * Every profile of this lab that carries the raced name, read back from the database rather
 * than from what the creates returned — a handle that was decided and not committed is
 * exactly the bug this file is about.
 */
async function perfisPersistidos(): Promise<Perfil[]> {
  const found = await payload.find({
    collection: 'perfilMaker',
    where: { and: [{ nome: { equals: NOME } }, { tenant: { equals: orgId } }] },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs as unknown as Perfil[]
}

/**
 * Starts every create **first**, then awaits them — `Promise.all` over an already-started
 * array. Mapping with `await` inside would serialise the calls and the file would assert
 * nothing at all, which is the one way this test can lie.
 */
function correrJuntos(quantos: number): Promise<Perfil[]> {
  const emVoo = usuarios
    .slice(0, quantos)
    .map((usuario) => createWithHandle<Perfil>(db, BASE, { nome: NOME, usuario }))
  return Promise.all(emVoo)
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await limpar()

  const org = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab da corrida', slug: SLUG, status: 'active' },
    overrideAccess: true,
  })
  if (typeof org.id !== 'number') {
    throw new TypeError(
      `organizations.id came back as ${typeof org.id} (${String(org.id)}); this suite writes it ` +
        'into `orgs.organization`, which the generated types declare as a numeric relationship.',
    )
  }
  orgId = org.id

  usuarios = []
  for (let n = 1; n <= MULTIDAO; n += 1) usuarios.push(await criarUsuario(n))

  db = await getSystemScopedPayload(String(orgId))
}, 120_000)

afterAll(async () => {
  if (payload) await limpar()
})

describe('§1 — two signups at once, two handles (SC-009)', () => {
  it('gives the second maker @mariasilva2 instead of failing or duplicating', async () => {
    const perfis = await correrJuntos(2).catch((error: unknown) => {
      // A rejection is a *result*, not an infrastructure problem: it is what a signup that
      // lost the race and did not retry looks like from the outside.
      throw new Error(
        'a concurrent signup was rejected instead of taking the next free handle. The loser ' +
          'of the race must retry, not fail — SC-009. Got: ' +
          String((error as { message?: string })?.message ?? error),
      )
    })

    const handles = perfis.map((p) => p.handle).sort()
    expect(
      handles,
      'both creates returned, but not with the two handles CLR-002 fixes. Two identical ' +
        'handles mean the index did not arbitrate; anything else means the suffix walk is ' +
        'not starting at the base and climbing by one.',
    ).toEqual([BASE, `${BASE}2`])

    const persistidos = await perfisPersistidos()
    expect(
      persistidos.map((p) => p.handle).sort(),
      'the handles came back from the calls but the database does not hold both rows — a ' +
        'signup was lost, or a retry returned a document it never committed.',
    ).toEqual([BASE, `${BASE}2`])
    expect(new Set(persistidos.map((p) => p.id)).size, 'two distinct profiles').toBe(2)
  })
})

describe('§2 — under load, not just in pairs (SC-009)', () => {
  it(`gives ${MULTIDAO} simultaneous homonyms ${MULTIDAO} distinct handles`, async () => {
    await payload.delete({
      collection: 'perfilMaker',
      where: { nome: { equals: NOME } },
      overrideAccess: true,
    })

    const perfis = await correrJuntos(MULTIDAO).catch((error: unknown) => {
      throw new Error(
        `${MULTIDAO} concurrent signups for the same name did not all succeed. A retry that ` +
          'collides again must keep climbing, so the depth of the pile-up is not a limit ' +
          `until ${MAX_HANDLE_ATTEMPTS} handles are taken. Got: ` +
          String((error as { message?: string })?.message ?? error),
      )
    })

    const esperados = [BASE, ...Array.from({ length: MULTIDAO - 1 }, (_, i) => `${BASE}${i + 2}`)]
    expect(
      perfis.map((p) => p.handle).sort(),
      'the lowest free integer is what each racer must land on, in order and without gaps: ' +
        'a gap means a free handle was skipped, a repeat means two makers share one.',
    ).toEqual([...esperados].sort())

    const persistidos = await perfisPersistidos()
    expect(persistidos, `${MULTIDAO} rows, one per racer`).toHaveLength(MULTIDAO)
    expect(
      new Set(persistidos.map((p) => p.handle)).size,
      'the database holds a duplicate handle inside one organization, which is the exact ' +
        'thing the unique index on (tenant, handle) exists to make impossible (SC-009).',
    ).toBe(MULTIDAO)
  })
})
