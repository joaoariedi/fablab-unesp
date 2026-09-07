import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CollectionConfig, Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { CategoriaProjeto } from '../collections/content/CategoriaProjeto'
import { Projeto } from '../collections/content/Projeto'

/**
 * The migration set must reproduce the schema the collections declare (T032, FR-001).
 *
 * This is the cheap half of feature 000's drift gate. `scripts/migration-drift.sh` is the
 * authoritative half — it applies the committed migrations to an empty database and asks
 * Payload whether anything is still missing — but it needs Postgres and a throwaway schema,
 * so it runs in CI rather than on every save. What runs here is the assertion that catches
 * the failure mode the gate exists for *before* CI does: a collection landed in the config,
 * dev-mode push applied it to somebody's local database, and no migration was committed.
 *
 * Expectations are **derived from the collection configs**, never listed, for the reason
 * `PUBLISHABLE` is derived in `public-payload.ts`: a hand-kept list rots the first time a
 * field is added, and it rots silently — passing while the migration it was supposed to
 * guard is missing the column.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

const migrationFiles = (): string[] =>
  readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts')

/** Every committed migration's source, concatenated — order is irrelevant to these checks. */
const committedSql = (): string =>
  migrationFiles()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n')

/** Payload's Postgres adapter snake_cases slugs and field names for table/column names. */
const snake = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

type NamedField = Extract<Field, { name: string }>

const namedFields = (collection: CollectionConfig): NamedField[] =>
  collection.fields.filter((f): f is NamedField => 'name' in f && typeof f.name === 'string')

/**
 * A `hasMany` field is not a column: Payload gives it its own table. Only the single-value
 * fields belong in the parent table, and a `relationship` among them becomes `<name>_id`.
 */
const expectedColumns = (collection: CollectionConfig): string[] =>
  namedFields(collection)
    .filter((f) => !('hasMany' in f && f.hasMany === true))
    // An `array` is not a column either: Payload gives it its own `<table>_<name>` table with
    // `_order` and `_parent_id`, exactly as it does for `hasMany`. `galeria` and `arquivos`
    // are the first two, and expecting them here would demand a column that must not exist.
    .filter((f) => f.type !== 'array')
    .map((f) => (f.type === 'relationship' ? `${snake(f.name)}_id` : snake(f.name)))

/** The body of a `CREATE TABLE "<table>" ( … );` statement, or null when it is not created. */
const createTableBody = (sql: string, table: string): string | null => {
  const match = new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\s*\\);`).exec(sql)
  return match?.[1] ?? null
}

/**
 * Every column the committed migrations give `table`, however they give it.
 *
 * A column arrives one of two ways and the first draft only looked for one: in the original
 * `CREATE TABLE`, or in a later `ALTER TABLE … ADD COLUMN`. Reading only the create body means
 * the check passes for as long as the schema never changes and then reports a *missing column*
 * the moment a second migration adds one — which is exactly backwards, since a field added
 * without a migration is the failure this file exists to catch. Measured when `imagemCapa`,
 * `descricaoCompleta` and `downloads` landed in a second migration.
 */
const migratedColumns = (sql: string, table: string): string => {
  const created = createTableBody(sql, table) ?? ''
  const altered = [...sql.matchAll(new RegExp(`ALTER TABLE "${table}" ADD COLUMN [^;]+;`, 'g'))]
    .map((m) => m[0])
    .join('\n')
  return `${created}\n${altered}`
}

describe('committed migrations', () => {
  it('registers every migration file in index.ts, or it never runs', () => {
    const index = readFileSync(join(MIGRATIONS_DIR, 'index.ts'), 'utf8')
    for (const file of migrationFiles()) {
      expect(index).toContain(file.replace(/\.ts$/, ''))
    }
  })

  for (const collection of [CategoriaProjeto, Projeto]) {
    const table = snake(collection.slug)

    describe(`table "${table}"`, () => {
      it('is created', () => {
        expect(createTableBody(committedSql(), table)).not.toBeNull()
      })

      it('carries a column for every single-value field the collection declares', () => {
        const body = migratedColumns(committedSql(), table)
        for (const column of expectedColumns(collection)) {
          expect(body, `missing column "${column}"`).toContain(`"${column}"`)
        }
      })

      it('carries the tenant column the multi-tenant plugin injects', () => {
        // Scoped collections are unusable without it: every access constraint filters on it.
        const body = createTableBody(committedSql(), table) ?? ''
        expect(body).toContain('"tenant_id"')
        expect(committedSql()).toContain(
          `"${table}_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id")`,
        )
      })
    })
  }

  it('gives the hasMany text field its own table', () => {
    // `materiais` is `text` + `hasMany`, which Payload stores in a per-collection `_texts`
    // table keyed by `path` — not as a column on `projeto`.
    const hasMany = namedFields(Projeto).filter((f) => 'hasMany' in f && f.hasMany === true)
    expect(hasMany.map((f) => f.name)).toContain('materiais')
    expect(createTableBody(committedSql(), 'projeto_texts')).not.toBeNull()
  })

  it('declares the review-queue enum with all three states', () => {
    const status = namedFields(Projeto).find((f) => f.name === 'status')
    const values = (status as { options?: { value: string }[] }).options?.map((o) => o.value) ?? []
    expect(values).toHaveLength(3)
    const enumDecl = /CREATE TYPE "public"\."enum_projeto_status" AS ENUM\(([^)]*)\)/.exec(
      committedSql(),
    )
    expect(enumDecl, 'enum_projeto_status is not created by any migration').not.toBeNull()
    for (const value of values) {
      expect(enumDecl?.[1]).toContain(`'${value}'`)
    }
  })

  it('adds no locked-documents relation for a collection with lockDocuments: false', () => {
    // FR-018 / CLR-004: `payload-locked-documents` is not scoped by the plugin and each row
    // names a document by collection and id. `Projeto` sets `lockDocuments: false`, so the
    // schema must have nowhere to record a projeto id at all — a `projeto_id` column here
    // would mean the switch was dropped and the enumeration surface reopened.
    expect(Projeto.lockDocuments).toBe(false)
    expect(committedSql()).not.toMatch(/"projeto_id"/)
    // The comparison case: `categoriaProjeto` keeps locking, so its relation column exists.
    expect(committedSql()).toContain('"categoria_projeto_id"')
  })
})

describe('foreign keys whose ON DELETE must not be Payload\'s default', () => {
  it('restricts deletion of a cover image a project still references', () => {
    // Payload generates `ON DELETE set null` for every relationship, and `required: true`
    // generates NOT NULL. Together they are unsatisfiable: deleting a referenced row runs a
    // SET NULL that violates the NOT NULL, the statement fails, and the transaction aborts
    // with 25P02 — surfacing several frames away, in whatever the next query happens to be.
    //
    // This assertion exists because the fix is a HAND EDIT to a generated file. Regenerating
    // the migration would quietly restore `set null`, and the failure it causes does not name
    // the constraint, the column or even the collection.
    const fk = /"projeto_imagem_capa_id_midia_imagem_id_fk"[^;]*ON DELETE (\w+)/.exec(committedSql())
    expect(fk, 'the cover-image foreign key is gone from the committed migrations').not.toBeNull()
    expect(
      fk?.[1],
      'the cover-image FK is back to Payload\'s generated `set null`, which cannot coexist ' +
        'with the NOT NULL that `required: true` produces. Deleting a referenced image will ' +
        'abort the transaction with 25P02, and the error will not name this constraint.',
    ).toBe('restrict')
  })
})
