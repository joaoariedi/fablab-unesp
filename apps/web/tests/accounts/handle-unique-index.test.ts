import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'

/**
 * T019 / FR-010, SC-009 — **the unique index on `(tenant, handle)`, in the database**.
 *
 * SC-009: *"`@handle` is unique within an organization, and homonyms get distinct handles"*.
 * CLR-002 fixes both halves of that sentence: uniqueness is **per organization**, because the
 * handle is derived from a name and *"the same person joining a second lab keeps the same
 * handle there"* — a global unique index would refuse that second profile and break the "one
 * login, two profiles" shape feature 000 was built for.
 *
 * ── Why this is a database constraint and not a check in the code ──────────────────────────
 *
 * plan.md § *"The handle collision is resolved by the database, not by reading first"*: a
 * `SELECT` then `INSERT` is a race — two simultaneous signups both read *"`mariasilva` is
 * taken, `mariasilva2` is free"* and both write it. The index is the only arbiter that cannot
 * lose that race, and T020's retry is built on its `23505`. So what has to be true is not that
 * some module intends uniqueness; it is that **the live schema refuses the second row**.
 * Every assertion here is therefore made against a real Postgres, except § 3.
 *
 * ── Why § 1 asks the database and § 3 asks the migration, and both are needed ───────────────
 *
 * They are two different schemas and only one of them is under test in any given environment:
 *
 *   - `push: true` everywhere but production (`payload.config.ts`), so **dev and the test
 *     database get their schema from the declared drizzle schema** — never from the committed
 *     migrations. An index that exists only in a migration file does not exist here, and
 *     worse, push would *drop* one it finds and does not recognise.
 *   - production runs the committed migrations and never pushes. An index declared only in the
 *     schema would never reach it.
 *
 * A constraint that lives in one and not the other is the drift `docs/tech-stack.md` names as
 * risk number one, and it would surface as the race T021 exists to prove cannot happen.
 *
 * ── The negative half is not symmetry ──────────────────────────────────────────────────────
 *
 * § 2's second case — the same handle in a *different* organization — is the assertion that
 * dies if someone "fixes" this by putting `unique: true` on the `handle` field. Payload's
 * `unique` is a constraint over the whole table and the multi-tenant plugin does not narrow it
 * to the tenant (it composes access, not indexes), so that fix passes every test about
 * collisions and silently makes a second lab uninhabitable for anyone already on the platform.
 * `PerfilMaker.ts` carries the same warning in prose; this is the half that fails.
 */

/**
 * The index's name, written out here rather than imported.
 *
 * Pinned because a rename is a schema change that has to be noticed: the name is what `psql`,
 * `pg_indexes` and the committed migration all agree on, and § 3 matches the migration against
 * it. It is **not** what T020 will catch on — see the next constant for the reason.
 */
const INDEX = 'perfil_maker_tenant_handle_unique_idx'

/**
 * How the violation actually reaches a caller, **measured rather than assumed** (2026-09-12).
 *
 * plan.md's sketch for T020 catches *"`23505` on THIS index only"*, and through the Local API
 * that is not what arrives. `@payloadcms/drizzle`'s `handleUpsertError` intercepts the pg error
 * and rethrows a `ValidationError`:
 *
 *   `The following field is invalid: tenant_id, handle`
 *   `data.errors[0] === { message: 'Value must be unique', path: 'tenant_id, handle',`
 *   `                     tableName: 'perfil_maker' }`
 *
 * The code `23505` and the index name are both **gone** by then. So the discriminator T020 has
 * — the thing that separates *this* constraint from any other failed insert, which it must, or
 * a blanket catch retries forever against an error no suffix can fix — is the table plus the
 * column pair. It is asserted below, so a Payload upgrade that changes this encoding fails
 * here, naming the constraint, rather than inside the retry loop.
 */
const VIOLACAO = { tableName: 'perfil_maker', path: 'tenant_id, handle' }

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations')

/** Every committed migration's `up()` body — `down()` says the opposite of the live schema. */
const committedUpSql = (): string =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8').split('export async function down')[0])
    .join('\n')

type IndexRow = { indexname: string; indexdef: string }

let payload: Payload
let indexes: IndexRow[]
let orgA: string | number
let orgB: string | number
let usuario: string | number

/** The handle both profiles want. Folded from `Maria Silva`, exactly as CLR-002 worked it. */
const HANDLE = 'mariasilva'

const SLUG_A = 'handle-idx-a'
const SLUG_B = 'handle-idx-b'
const EMAIL = 'handle-idx@example.com'

/** Removes only what this file creates, in foreign-key order: profiles, user, organizations. */
async function limpar(): Promise<void> {
  await payload.delete({
    collection: 'perfilMaker',
    where: { handle: { equals: HANDLE } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'users',
    where: { email: { equals: EMAIL } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'organizations',
    where: { slug: { in: [SLUG_A, SLUG_B] } },
    overrideAccess: true,
  })
}

/** One profile create, with the tenant named explicitly — there is no request to infer it from. */
const criarPerfil = (tenant: string | number) =>
  payload.create({
    collection: 'perfilMaker',
    data: { nome: 'Maria Silva', handle: HANDLE, usuario, tenant } as never,
    overrideAccess: true,
  })

beforeAll(async () => {
  payload = await getPayload({ config })
  await limpar()

  const org = async (slug: string, name: string) =>
    payload.create({
      collection: 'organizations',
      data: { name, slug, status: 'active' },
      overrideAccess: true,
    })

  orgA = (await org(SLUG_A, 'Lab A')).id
  orgB = (await org(SLUG_B, 'Lab B')).id
  // ONE person, a member of both labs — which is the whole point of CLR-002's second case.
  usuario = (
    await payload.create({
      collection: 'users',
      data: {
        email: EMAIL,
        password: 'handle-idx-password-123',
        role: 'user',
        orgs: [
          { organization: orgA, role: 'admin' },
          { organization: orgB, role: 'admin' },
        ],
      },
      overrideAccess: true,
    })
  ).id

  const result = (await payload.db.drizzle.execute(
    `select indexname, indexdef from pg_indexes where tablename = 'perfil_maker'`,
  )) as unknown as { rows: IndexRow[] }
  indexes = result.rows
}, 120_000)

afterAll(async () => {
  if (payload) await limpar()
})

describe('§1 — the schema the running system actually has (SC-009)', () => {
  it(`declares "${INDEX}" as a UNIQUE index`, () => {
    const found = indexes.find((i) => i.indexname === INDEX)
    expect(
      found,
      `no index named "${INDEX}" on perfil_maker. The handle is unique only while the ` +
        'database says so: without it two simultaneous signups by homonyms both write ' +
        `@${HANDLE}, and T020's retry has no refusal to catch. Indexes present: ` +
        indexes.map((i) => i.indexname).join(', '),
    ).toBeDefined()
    expect(found?.indexdef).toContain('CREATE UNIQUE INDEX')
  })

  it('covers the tenant and the handle, and nothing else', () => {
    const columns = /\(([^)]*)\)\s*$/
      .exec(indexes.find((i) => i.indexname === INDEX)?.indexdef ?? '')?.[1]
      ?.split(',')
      .map((c) => c.trim())
    expect(
      columns,
      'the index exists but its column list could not be read from pg_indexes',
    ).toBeDefined()
    // Tenant first: the same index then also serves "every handle of this lab", which is the
    // only way the constraint is ever read. A handle-first index would be no cheaper to write
    // and useless to that query.
    expect(columns).toEqual(['tenant_id', 'handle'])
  })

  it('leaves no UNIQUE index on the handle alone, which would forbid a second lab (CLR-002)', () => {
    const global = indexes.filter(
      (i) =>
        i.indexdef.includes('CREATE UNIQUE INDEX') &&
        /\(\s*handle\s*\)/.test(i.indexdef),
    )
    expect(
      global.map((i) => i.indexname),
      'a UNIQUE index over `handle` alone makes the handle unique across the whole platform. ' +
        'It is what `unique: true` on the field generates, and it refuses the second profile ' +
        'of anyone who joins a second lab — the exact case CLR-002 exists to permit.',
    ).toEqual([])
  })
})

describe('§2 — what the index makes true, and what it must not (FR-010, SC-009)', () => {
  it('accepts the first profile, and refuses a second with the same handle in the same lab', async () => {
    await criarPerfil(orgA)

    let erro: unknown
    try {
      await criarPerfil(orgA)
    } catch (caught) {
      erro = caught
    }

    expect(
      erro,
      `a second perfilMaker with @${HANDLE} was accepted into the same organization. Two ` +
        'homonyms now share one handle, every mention and profile link between them is ' +
        'ambiguous, and nothing in the signup path can notice (SC-009).',
    ).toBeDefined()
    // The *evidence* matters as much as the refusal: T020 retries on a unique violation and
    // rethrows everything else, so the error has to say which constraint refused it. See
    // VIOLACAO above for why that is the table and the column pair, and not `23505`.
    const detalhe = (
      erro as { data?: { errors?: { message?: string; path?: string; tableName?: string }[] } }
    )?.data?.errors?.[0]
    expect(
      { tableName: detalhe?.tableName, path: detalhe?.path },
      'the write was refused, but the error does not identify the constraint that refused it. ' +
        'T020 cannot tell this apart from any other failed insert, so it would either retry ' +
        'forever or give up on a free handle. Got: ' +
        String((erro as { message?: string })?.message ?? erro),
    ).toEqual(VIOLACAO)
    expect(detalhe?.message).toMatch(/unique/i)
  })

  it('accepts the same handle in a different lab — one login, two profiles (CLR-002)', async () => {
    const segundo = await criarPerfil(orgB)
    expect(
      (segundo as { handle?: string }).handle,
      'the same person joining a second lab was refused their own handle, so the uniqueness ' +
        'is global rather than per-organization (CLR-002).',
    ).toBe(HANDLE)
  })
})

describe('§3 — the production path, where push never runs (FR-027)', () => {
  it('is created by a committed migration', () => {
    expect(
      committedUpSql(),
      `no committed migration creates "${INDEX}". Production runs the migrations and never ` +
        'pushes, so the constraint that holds in dev and in this suite would simply be absent ' +
        'from the only database it protects.',
    ).toMatch(new RegExp(`CREATE UNIQUE INDEX "${INDEX}"[^;]*"perfil_maker"[^;]*tenant_id`))
  })

  it('is dropped by that migration\'s down(), so the rollback is a rollback', () => {
    const sources = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
      .filter((s) => s.includes(INDEX))
    expect(sources.length, `no migration file mentions "${INDEX}"`).toBeGreaterThan(0)
    const down = sources.map((s) => s.split('export async function down')[1] ?? '').join('\n')
    expect(down, `down() does not drop "${INDEX}"`).toContain(`DROP INDEX "${INDEX}"`)
  })

  it('is registered in index.ts, or it never runs', () => {
    const index = readFileSync(join(MIGRATIONS_DIR, 'index.ts'), 'utf8')
    const carrier = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .find((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8').includes(INDEX))
    expect(carrier, `no migration file mentions "${INDEX}"`).toBeDefined()
    expect(index).toContain((carrier ?? '').replace(/\.ts$/, ''))
  })
})
