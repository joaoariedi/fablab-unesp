import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'

/**
 * T029 / FR-031, CLR-003 — `autor` can hold nothing, **after the app has booted**.
 *
 * ## Why this reads the database instead of the migration
 *
 * The migration was written, was correct, and was undone on every developer machine and in every
 * test run. `payload.config.ts` sets `push: env.NODE_ENV !== 'production'`, and
 * `@payloadcms/db-postgres` runs `pushDevSchema` on connect, which makes the live database match
 * the **config-derived** schema; `@payloadcms/drizzle` sets a column's `notNull` from the field's
 * `required`. So with `required: true` still on the three `autor` fields, one `pnpm dev`, one
 * admin visit or one integration test silently put the NOT NULL back.
 *
 * Measured, not reasoned: the migration's own `up()` was applied, all three columns went
 * `is_nullable = YES`, a single existing test was run, and all three were `NO` again.
 *
 * The suite that shipped with the migration could not see any of that — it matched the migration
 * file's **text** with a regex and never opened a connection, so it was green while the schema it
 * claimed to hold in place was gone. That is the failure this file exists to replace: **a gate
 * that asserts the artefact instead of the state.** Asking `information_schema` after a real boot
 * is asking the authority.
 *
 * `projeto` is deliberately absent: it carries no `autor` at all until feature 005.
 */

const COM_AUTOR = ['artigo', 'aula', 'modelo3d'] as const

let payload: Payload
let nulabilidade: Map<string, string>

beforeAll(async () => {
  // Booting IS the test setup. Whatever `push` does to the schema, it has done by the time this
  // resolves — which is precisely the window the old gate never entered.
  payload = await getPayload({ config })

  const resultado = await payload.db.drizzle.execute(
    `select table_name, is_nullable from information_schema.columns
     where column_name = 'autor_id' and table_name in ('artigo', 'aula', 'modelo3d')`,
  )
  const linhas = ((resultado as { rows?: unknown[] }).rows ?? resultado) as {
    table_name: string
    is_nullable: string
  }[]
  nulabilidade = new Map(linhas.map((l) => [l.table_name, l.is_nullable]))
}, 180_000)

describe('the tombstone column survives a boot (FR-031, CLR-003)', () => {
  it('found all three columns — an empty read would make every case below vacuous', () => {
    expect(
      [...nulabilidade.keys()].sort(),
      'the query matched no `autor_id` columns at all, so the assertions below are scanning ' +
        'an empty map and would pass against any schema whatsoever',
    ).toEqual([...COM_AUTOR].sort())
  })

  it.each(COM_AUTOR)('leaves %s.autor_id nullable after the app has started', (tabela) => {
    expect(
      nulabilidade.get(tabela),
      `${tabela}.autor_id is NOT NULL on a booted database. The migration drops it and \`push\` ` +
        'puts it back from the field config, so this means `required: true` has returned to ' +
        `${tabela}'s \`autor\`. \`deleteAccount\` will then fail mid-transaction and the whole ` +
        'erasure will roll back — a person who asked to be forgotten stays.',
    ).toBe('YES')
  })
})
