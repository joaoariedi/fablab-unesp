import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CollectionConfig, Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { AvatarItem } from '../collections/avatar/AvatarItem'
import { TomDeCabelo } from '../collections/avatar/TomDeCabelo'
import { TomDePele } from '../collections/avatar/TomDePele'
import { Artigo } from '../collections/content/Artigo'
import { Aula } from '../collections/content/Aula'
import { CategoriaArtigo } from '../collections/content/CategoriaArtigo'
import { CategoriaModelo } from '../collections/content/CategoriaModelo'
import { CategoriaProjeto } from '../collections/content/CategoriaProjeto'
import { Curtida } from '../collections/content/Curtida'
import { Evento } from '../collections/content/Evento'
import { Local } from '../collections/content/Local'
import { Maquina } from '../collections/content/Maquina'
import { Modelo3d } from '../collections/content/Modelo3d'
import { PerfilMaker } from '../collections/content/PerfilMaker'
import { ProgressoAula } from '../collections/content/ProgressoAula'
import { Projeto } from '../collections/content/Projeto'
import { Skill } from '../collections/content/Skill'
import { SCOPE_REGISTRY } from '../lib/tenancy/scope-registry'

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
  // Sorted, and it is load-bearing rather than tidy: names are timestamp-prefixed, so sorting
  // them is ordering them in time, and `lockedRelsColumns` below replays ADD/DROP COLUMN in
  // sequence. `readdirSync` promises no order at all — unsorted, a column dropped by a later
  // migration can be re-added by an earlier one and the replay reports the opposite of the truth.
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .sort()

/** Every committed migration's source, concatenated — order is irrelevant to these checks. */
const committedSql = (): string =>
  migrationFiles()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n')

/**
 * The same source with every `down()` body cut away.
 *
 * `down()` says the OPPOSITE of what the schema is: T047's migration drops
 * `categoria_projeto_id` from the lock table in `up()` and adds it straight back in `down()`.
 * Any check that reads a statement as evidence of the live schema — the ADD/DROP replay and
 * the `ON DELETE` scan below — must read `up()` alone, or a rollback path silently answers a
 * question about the current one. Measured: the replay reported the dropped column present.
 */
const committedUpSql = (): string =>
  migrationFiles()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8').split('export async function down')[0])
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
    // Nor is a POLYMORPHIC relationship, single-valued or not: a `relationTo` array has no one
    // table to point at, so Payload stores it in `<table>_rels` with one `<target>_id` column
    // per target. `curtida.conteudo` is the first — `required: true`, and still no
    // `conteudo_id` anywhere. Expecting one would demand a column that must not exist, which
    // is the same defect the `array` filter above was added for.
    .filter((f) => !(f.type === 'relationship' && Array.isArray(f.relationTo)))
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

/**
 * Every collection whose table the committed migrations must create (T047, FR-001).
 *
 * Written out by name rather than derived from the resolved Payload config, for the reason
 * `tests/tenancy/content-registry.test.ts` gives: deriving the list from whatever happens to
 * be wired makes the check pass vacuously for a collection that never got wired, and the
 * failure this file exists to catch — a collection the code declares and no migration
 * creates — is exactly that shape. The *fields* stay derived; only the roster is listed.
 */
const MIGRATED_COLLECTIONS: CollectionConfig[] = [
  CategoriaProjeto,
  Projeto,
  // The 002b eleven. They reached `payload.config.ts` at T044 and dev-mode `push` will have
  // put them in a developer's local database without producing a single migration file —
  // which is drift risk number one in `docs/tech-stack.md`, arriving eleven tables at a time.
  PerfilMaker,
  CategoriaArtigo,
  Artigo,
  CategoriaModelo,
  Modelo3d,
  Aula,
  ProgressoAula,
  Local,
  Maquina,
  Evento,
  Curtida,
]

/**
 * The four collections feature 004 declares, whose tables T010's migration must create.
 *
 * Listed rather than derived, for the reason the roster above is listed: a list taken from the
 * resolved config passes vacuously for a collection nobody wired, and "declared in code,
 * created by no migration" is precisely the drift this file exists to catch.
 *
 * In `SCOPE_REGISTRY` order, which is `payload.config.ts` order, which is the order
 * `fixtures.ts` seeds in — `skill` last of the four because `perfilMaker.skills` points at it.
 */
const COLLECTIONS_004: CollectionConfig[] = [TomDePele, TomDeCabelo, AvatarItem, Skill]

/** Every collection whose table must exist, old and new — the per-table checks iterate this. */
const ALL_MIGRATED_COLLECTIONS: CollectionConfig[] = [...MIGRATED_COLLECTIONS, ...COLLECTIONS_004]

/** `scoped` collections carry the plugin's tenant column; `global` ones must not (FR-027). */
const isScoped = (collection: CollectionConfig): boolean =>
  (SCOPE_REGISTRY as Record<string, { scope: string } | undefined>)[collection.slug]?.scope ===
  'scoped'

/**
 * The columns `table` still carries once every committed migration has run, in order.
 *
 * Presence cannot be answered by grepping the concatenated SQL: a column added by one
 * migration and dropped by a later one appears in both, and `ADD COLUMN` is the only half a
 * substring search sees. T047 regenerates exactly that shape — `categoria_projeto_id` was
 * added to `payload_locked_documents_rels` before `lockDocuments: false` reached that
 * collection, so the migration that follows drops it.
 */
const lockedRelsColumns = (table: string): Set<string> => {
  const sql = committedUpSql()
  const columns = new Set<string>()
  for (const [, column] of (createTableBody(sql, table) ?? '').matchAll(/"([a-z0-9_]+)"/g)) {
    if (column) columns.add(column)
  }
  const changes = new RegExp(`ALTER TABLE "${table}" (ADD|DROP) COLUMN "([a-z0-9_]+)"`, 'g')
  for (const [, verb, column] of sql.matchAll(changes)) {
    if (!column) continue
    if (verb === 'ADD') columns.add(column)
    else columns.delete(column)
  }
  return columns
}

describe('committed migrations', () => {
  it('registers every migration file in index.ts, or it never runs', () => {
    const index = readFileSync(join(MIGRATIONS_DIR, 'index.ts'), 'utf8')
    for (const file of migrationFiles()) {
      expect(index).toContain(file.replace(/\.ts$/, ''))
    }
  })

  for (const collection of ALL_MIGRATED_COLLECTIONS) {
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

      it(
        isScoped(collection)
          ? 'carries the tenant column the multi-tenant plugin injects'
          : 'carries NO tenant column, because the registry declares it global',
        () => {
          const created = createTableBody(committedSql(), table)
          // Asserted before either branch, because `?? ''` would otherwise let the `global`
          // case pass on a table no migration creates — an absent column is not evidence of
          // a correctly global table, it is evidence of no table at all.
          expect(created, `"${table}" is created by no migration`).not.toBeNull()
          const body = created ?? ''
          if (isScoped(collection)) {
            // Scoped collections are unusable without it: every access constraint filters on it.
            expect(body).toContain('"tenant_id"')
            expect(committedSql()).toContain(
              `"${table}_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id")`,
            )
            return
          }
          // The other direction, and it is not symmetry for its own sake (FR-027, CLR-001).
          // `tomDePele`, `tomDeCabelo` and `avatarItem` are global because the art is the
          // platform's; a tenant column here means the collection was listed in the plugin's
          // map after all, and every row then belongs to whichever lab happened to seed it —
          // so the second organization's signup would find the catalogue empty. A migration
          // generated while the map was wrong bakes that in, and nothing else reads this file.
          expect(
            body,
            `"${table}" is declared global in SCOPE_REGISTRY but its table carries a tenant ` +
              'column, so the catalogue is per-lab in the database whatever the registry says',
          ).not.toContain('"tenant_id"')
        },
      )
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
    // names a document by collection and id. Every content collection sets
    // `lockDocuments: false`, so the schema must have nowhere to record any of their ids — a
    // `<table>_id` column in the lock table's rels means the switch was dropped and the
    // enumeration surface reopened.
    //
    // This used to read `expect(committedSql()).not.toMatch(/"projeto_id"/)` over ALL the SQL,
    // and that phrasing cannot survive T047: `evento.projetosGerados` and `curtida.conteudo`
    // both point AT `projeto`, so `evento_rels` and `curtida_rels` legitimately carry a
    // `projeto_id` — a relationship the spec requires, not a lock row. Narrowed to the one
    // table the requirement is about, and widened from one collection to all thirteen.
    const lockedRels = lockedRelsColumns('payload_locked_documents_rels')
    for (const collection of MIGRATED_COLLECTIONS) {
      expect(collection.lockDocuments, `${collection.slug} still locks documents`).toBe(false)
      expect(
        [...lockedRels],
        `payload_locked_documents_rels can name a ${collection.slug} document, so organization ` +
          'B can enumerate A\'s document ids through the lock table (FR-018, SC-003)',
      ).not.toContain(`${snake(collection.slug)}_id`)
    }
    // The comparison case has to be a collection that still locks, or the absence above proves
    // nothing. `organizations` is global — it names no tenant's private document — so it keeps
    // locking and its relation column survives the migration T047 regenerates.
    expect([...lockedRels]).toContain('organizations_id')
  })

  it('gives the polymorphic relationship its own rels table', () => {
    // `curtida.conteudo` is `relationTo: ['projeto']` — polymorphic, so Payload stores it in
    // `curtida_rels` with one `<target>_id` column per target and no `conteudo_id` anywhere.
    // It is `required: true`, so without that table not one like can be written.
    const conteudo = namedFields(Curtida).find((f) => f.name === 'conteudo')
    expect(Array.isArray((conteudo as { relationTo?: unknown }).relationTo)).toBe(true)
    const body = createTableBody(committedSql(), 'curtida_rels')
    expect(body, 'curtida_rels is created by no migration — a like has nowhere to point').not.toBeNull()
    expect(body).toContain('"projeto_id"')
  })
})

/**
 * The values a committed `CREATE TYPE … AS ENUM(…)` declares, or null when none creates it.
 *
 * `db-postgres` materialises a `select` field as a Postgres enum named `enum_<table>_<column>`,
 * which is why `PerfilMaker.ts` records that changing `VINCULOS_UNESP` is a config edit **and**
 * a migration: a value the type does not carry is refused by the database, several frames from
 * the form that offered it.
 */
const enumValues = (typeName: string): string | null =>
  new RegExp(`CREATE TYPE "public"\\."${typeName}" AS ENUM\\(([^)]*)\\)`).exec(
    committedSql(),
  )?.[1] ?? null

type SelectField = NamedField & { options?: ({ value: string } | string)[] }
type ArrayField = NamedField & { fields?: Field[] }

const optionValues = (field: SelectField): string[] =>
  (field.options ?? []).map((o) => (typeof o === 'string' ? o : o.value))

const fieldsOfType = (collection: CollectionConfig, type: string): NamedField[] =>
  namedFields(collection).filter((f) => f.type === type)

/**
 * Feature 004's schema, over the same derived-not-listed rule the file opens with (T010, FR-027).
 *
 * Every assertion here is a shape the generated migration gets wrong *silently*: an enum type
 * whose values lag the config refuses a write with a database error naming no field, and an
 * array field with no table loses the whole `SUAS SKILLS` panel while every column the profile
 * declares is present and correct.
 */
describe('the schema feature 004 adds', () => {
  for (const collection of [PerfilMaker, ...COLLECTIONS_004]) {
    const table = snake(collection.slug)

    for (const field of fieldsOfType(collection, 'select')) {
      const typeName = `enum_${table}_${snake(field.name)}`

      it(`declares "${typeName}" with every option "${collection.slug}.${field.name}" offers`, () => {
        const declared = enumValues(typeName)
        expect(
          declared,
          `no migration creates "${typeName}", so every write of ` +
            `${collection.slug}.${field.name} is refused by the database`,
        ).not.toBeNull()
        for (const value of optionValues(field as SelectField)) {
          expect(declared, `"${typeName}" is missing the option "${value}"`).toContain(`'${value}'`)
        }
      })
    }

    for (const field of fieldsOfType(collection, 'array')) {
      const arrayTable = `${table}_${snake(field.name)}`

      it(`gives "${collection.slug}.${field.name}" its own "${arrayTable}" table`, () => {
        const body = createTableBody(committedSql(), arrayTable)
        expect(
          body,
          `"${arrayTable}" is created by no migration — every row of ` +
            `${collection.slug}.${field.name} has nowhere to live`,
        ).not.toBeNull()
        // `_order` and `_parent_id` are Payload's, not the field's: without them the rows
        // belong to no document and come back in whatever order the planner chose.
        expect(body).toContain('"_order"')
        expect(body).toContain('"_parent_id"')
        for (const column of expectedColumns({
          ...collection,
          fields: (field as ArrayField).fields ?? [],
        })) {
          expect(body, `"${arrayTable}" is missing column "${column}"`).toContain(`"${column}"`)
        }
      })
    }
  }
})

/**
 * The relationships that make Payload's generated `ON DELETE set null` unsatisfiable:
 * single-valued (so they are a column, not a `_rels` row), non-polymorphic (same reason) and
 * `required` (so the column is NOT NULL).
 */
const requiredRelationships = (collection: CollectionConfig): NamedField[] =>
  namedFields(collection).filter(
    (f) =>
      f.type === 'relationship' &&
      f.required === true &&
      !('hasMany' in f && f.hasMany === true) &&
      !Array.isArray((f as { relationTo?: unknown }).relationTo),
  )

/**
 * The `ON DELETE` action the committed `up()` statements give one table's foreign key.
 *
 * The **last** declaration wins, and reading the first instead is how this check lies: a
 * constraint corrected by a later migration — which is the only way to correct one that has
 * already run — still has its original, wrong `ON DELETE` sitting in the earlier file.
 * `projeto.categoria_id` is exactly that case.
 */
const onDeleteFor = (table: string, column: string): string | null => {
  const declarations = [
    ...committedUpSql().matchAll(
      new RegExp(
        `ALTER TABLE "${table}" ADD CONSTRAINT "[^"]+" FOREIGN KEY \\("${column}"\\)[^;]*ON DELETE (\\w+)`,
        'g',
      ),
    ),
  ]
  return declarations.at(-1)?.[1] ?? null
}

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

  // The same trap, asserted over every collection instead of the one instance that was found
  // by hand. `required: true` on a single relationship generates NOT NULL, and Payload
  // generates `ON DELETE set null` for the matching foreign key: deleting a referenced row
  // then runs a SET NULL that violates the NOT NULL, the statement fails, and the transaction
  // aborts with 25P02 several frames away. T047 generated fifteen more of them in one file.
  //
  // Derived from the collections rather than listed, so a relationship that becomes required
  // in 2027 brings its own assertion with it — a hand-kept list would stay green while the
  // migration it guards regenerates back to `set null`.
  // The same trap reaches an ARRAY's sub-table, where nothing was looking for it. An array
  // gets its own `<table>_<name>`, and a `required` relationship inside it is NOT NULL there
  // exactly as it would be on the parent — `perfil_maker_skills.skill_id` is the first, and
  // Payload generated `ON DELETE set null` for it. Deactivating a skill is the documented
  // product behaviour (`Skill.ts`), but `delete` is still the admin's escape hatch, and taking
  // it would abort the transaction with 25P02 naming neither the skill nor the profile.
  const migratedTables: [string, CollectionConfig][] = ALL_MIGRATED_COLLECTIONS.flatMap(
    (collection) => [
      [snake(collection.slug), collection] as [string, CollectionConfig],
      ...fieldsOfType(collection, 'array').map(
        (field) =>
          [
            `${snake(collection.slug)}_${snake(field.name)}`,
            { ...collection, fields: (field as ArrayField).fields ?? [] },
          ] as [string, CollectionConfig],
      ),
    ],
  )

  for (const [table, collection] of migratedTables) {
    for (const field of requiredRelationships(collection)) {
      const column = `${snake(field.name)}_id`

      it(`restricts deletion of the "${table}"."${column}" a row requires`, () => {
        const onDelete = onDeleteFor(table, column)
        expect(
          onDelete,
          `no foreign key on "${table}"."${column}" in any committed migration's up()`,
        ).not.toBeNull()
        expect(
          onDelete,
          `"${table}"."${column}" is NOT NULL (the field is required) and its FK is ` +
            `ON DELETE ${onDelete}. Deleting the row it points at aborts the transaction with ` +
            '25P02, and the error names neither this constraint nor this collection. ' +
            'Payload generates `set null` for every relationship, so this is a hand edit to a ' +
            'generated file and regenerating the migration silently undoes it.',
        ).toBe('restrict')
      })
    }
  }
})

/**
 * The same source with the `up()` bodies cut away — every `down()`, and nothing else.
 *
 * The mirror of `committedUpSql`, and it exists for the reverse reason: a reversibility claim
 * cannot be checked against text that also contains the forward statement. `DROP NOT NULL` and
 * `SET NOT NULL` differ by one word, and grepping the whole file for the second finds the first
 * migration that ever added the constraint.
 */
const committedDownSql = (): string =>
  migrationFiles()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8').split('export async function down')[1] ?? '')
    .join('\n')

/** Matches `ALTER TABLE "<table>" ALTER COLUMN "<column>" <verb> NOT NULL`, however it is wrapped. */
const altersNotNull = (sql: string, table: string, column: string, verb: 'DROP' | 'SET'): boolean =>
  new RegExp(
    `ALTER TABLE\\s+"${table}"\\s+ALTER COLUMN\\s+"${column}"\\s+${verb} NOT NULL`,
    'i',
  ).test(sql)

/**
 * The tombstone's database half (T029, FR-031, CLR-003).
 *
 * Deletion erases the person and KEEPS what they published, so `autor` has to be able to hold
 * nothing. Only the **database** constraint goes: `required: true` stays on all three
 * collections, because an author is still mandatory when someone writes an article — the null
 * is a state deletion produces, never a state a form may submit.
 *
 * That split is exactly why this is asserted here. A constraint the config no longer describes
 * is a constraint nothing else in the repo would notice disappearing: the drift gate compares
 * the collections against the last snapshot and would report both states as clean, and the
 * first symptom of a regenerated migration putting NOT NULL back is a deletion that aborts
 * mid-transaction, in a statement naming neither the person nor the article.
 */
describe('the tombstone migration: autor survives its author', () => {
  const TOMBSTONE_TABLES = ['artigo', 'aula', 'modelo3d'] as const

  for (const table of TOMBSTONE_TABLES) {
    it(`created "${table}"."autor_id" NOT NULL, so dropping it is a real change`, () => {
      // Without this the two assertions below could both pass against a column that was never
      // constrained, proving nothing about the schema deletion actually runs against.
      expect(
        createTableBody(committedUpSql(), table),
        `"${table}" is created by no migration`,
      ).toContain('"autor_id" integer NOT NULL')
    })

    it(`releases "${table}"."autor_id" from NOT NULL, so deletion can null it`, () => {
      expect(
        altersNotNull(committedUpSql(), table, 'autor_id', 'DROP'),
        `no committed migration drops NOT NULL on "${table}"."autor_id", so nulling the author ` +
          'of a deleted maker is refused by the database and deleteAccount aborts its whole ' +
          'transaction — erasing nothing (FR-031, CLR-003)',
      ).toBe(true)
    })

    it(`restores "${table}"."autor_id" NOT NULL on rollback`, () => {
      expect(
        altersNotNull(committedDownSql(), table, 'autor_id', 'SET'),
        `the migration that drops NOT NULL on "${table}"."autor_id" does not put it back in ` +
          'down(), so rolling it back leaves the database permanently looser than the schema ' +
          'the collections declare',
      ).toBe(true)
    })
  }
})
