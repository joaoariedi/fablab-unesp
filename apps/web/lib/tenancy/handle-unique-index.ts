/**
 * **Why this module is under `lib/tenancy/` and not `lib/accounts/`.** `eslint.config.mjs`'s
 * tenancy fence forbids `@payloadcms/db-*` and `drizzle-orm*` everywhere in `apps/web` except
 * this directory, the seed, the tests and `payload.config.ts` — the adapter and Drizzle bypass
 * access control entirely (FR-014's raw-SQL clause). This file needs the adapter's drizzle
 * proxy to declare an index, and the constraint it declares *is* a tenancy invariant: a handle
 * is unique within one organization and deliberately not beyond it. Putting it here satisfies
 * the fence by belonging to it rather than by being excused from it.
 */
import type { PostgresAdapterArgs } from '@payloadcms/db-postgres'
// Through Payload's own proxy rather than `drizzle-orm/pg-core` directly, and that is not
// cosmetic: `extendTable` mutates a table built by the drizzle instance *Payload* loaded, using
// internal symbols (`Table.Symbol.ExtraConfigBuilder`). A second copy of drizzle — which is what
// adding `drizzle-orm` to this package's dependencies would risk — has different symbols, so the
// index would be built and then silently ignored. The proxy re-exports the resolved one.
import { uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

/**
 * The name of the unique index on `perfil_maker (tenant_id, handle)` (T019, FR-010, SC-009).
 *
 * One name shared by the schema below, the committed migration and `pg_indexes`, rather than a
 * string each of them spells for itself.
 */
export const PERFIL_MAKER_HANDLE_UNIQUE_INDEX = 'perfil_maker_tenant_handle_unique_idx'

/**
 * What a collision looks like **to the caller** — measured through the Local API, 2026-09-12.
 *
 * **Exported for T020, and it is not the `23505` plan.md's sketch expects.** Postgres does
 * raise `23505` naming the index, and `@payloadcms/drizzle`'s `handleUpsertError` catches it
 * first and rethrows a `ValidationError` carrying neither: the code and the index name are
 * gone, and what survives is
 *
 *   `error.data.errors[0] === { message: 'Value must be unique',`
 *   `                           path: 'tenant_id, handle', tableName: 'perfil_maker' }`
 *
 * `createWithHandle` must retry on **this** shape and rethrow everything else — a blanket
 * catch would swallow some other constraint's violation and loop against an error no suffix
 * can fix. `tests/accounts/handle-unique-index.test.ts` § 2 asserts the shape, so a Payload
 * upgrade that changes the encoding fails there rather than inside the retry.
 */
export const PERFIL_MAKER_HANDLE_UNIQUE_VIOLATION = Object.freeze({
  tableName: 'perfil_maker',
  path: 'tenant_id, handle',
})

/** The shape `postgresAdapter({ afterSchemaInit })` takes, named without a deep import. */
type SchemaHook = NonNullable<PostgresAdapterArgs['afterSchemaInit']>[number]

/**
 * Makes `@handle` unique **within one organization** — in the schema, where push and
 * `migrate:create` can both see it (FR-010, SC-009, CLR-002).
 *
 * ── Why the constraint is here and not on the field ────────────────────────────────────────
 *
 * `PerfilMaker.handle` is deliberately **not** `unique: true`: Payload's `unique` is a
 * constraint over the whole table and the multi-tenant plugin does not narrow it to the tenant
 * — it composes access, not indexes. A global unique handle would refuse the second profile of
 * anyone who joins a second lab, which is exactly the "one login, two profiles" case CLR-002
 * exists to permit. Payload has no way to declare a *composite* unique index on a collection,
 * so the pair is added to the drizzle table directly, which is what `afterSchemaInit` is for.
 *
 * ── Why it is not simply written into a migration ──────────────────────────────────────────
 *
 * Because dev and the test suite never run the migrations. `payload.config.ts` sets
 * `push: env.NODE_ENV !== 'production'`, so everywhere but production the schema comes from
 * *this* declaration — and push would drop an index it found in the database and did not
 * recognise. Declared here, the index reaches three places at once: push, the migration
 * `migrate:create` generates from the same schema, and the drift gate that compares them.
 *
 * ── Why uniqueness must be the database's and not a read-then-write ────────────────────────
 *
 * plan.md § *"The handle collision is resolved by the database, not by reading first"*: two
 * simultaneous signups by homonyms both read "`mariasilva` is taken, `mariasilva2` is free"
 * and both write it. The index is the only arbiter that cannot lose that race.
 *
 * Tenant column first, so the same index also answers "every handle of this lab" — the only
 * way the pair is ever read. The key is the drizzle *field* name (`tenant`, `handle`), not the
 * Postgres column name; Payload keys its built tables by field.
 */
export const perfilMakerHandleUnique: SchemaHook = ({ extendTable, schema }) => {
  const table = schema.tables.perfil_maker
  if (!table) {
    // Loud rather than absent: `extendTable` on `undefined` throws about a missing Symbol, and
    // nothing in that message says which table or why anyone wanted it.
    throw new Error(
      'afterSchemaInit: no "perfil_maker" table in the drizzle schema, so the unique index on ' +
        '(tenant_id, handle) cannot be declared. Was the perfilMaker collection renamed or ' +
        'dropped from payload.config.ts? Tables present: ' +
        Object.keys(schema.tables).join(', '),
    )
  }
  extendTable({
    table,
    extraConfig: (t) => ({
      [PERFIL_MAKER_HANDLE_UNIQUE_INDEX]: uniqueIndex(PERFIL_MAKER_HANDLE_UNIQUE_INDEX).on(
        t.tenant,
        t.handle,
      ),
    }),
  })
  return schema
}
