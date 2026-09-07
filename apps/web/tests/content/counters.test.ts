import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'
import type { CounterField } from '../../lib/content/counters'

/**
 * T031 / FR-020, SC-012 — the **reconciliation gate**: every stored counter is recomputed
 * from its source rows and must equal what is stored.
 *
 * `lib/content/counters.ts` maintains each counter inside the transaction of the write that
 * caused it, which closes the failure where the like commits and the recount does not. It
 * cannot close the other one, and the module says so in its own docstring: a stored counter
 * goes stale the moment a source row appears or disappears through a path the hook never
 * sees — **an admin bulk delete, a migration, a manual SQL fix**. Nothing fails when that
 * happens. The card grid simply shows a wrong number, forever.
 *
 * The mitigation for that class of drift is not care. It is *detection*, and this file is it:
 * it recomputes from the truth and reports every disagreement, so drift surfaces in CI rather
 * than in a card grid. Feature 000's migration-drift gate has the same shape — recompute the
 * expected state, diff it against the stored state, fail on a difference — which is why this
 * one is written as a gate rather than as a unit test with a fake.
 *
 * **Against a real database, deliberately.** `counter-strategy.test.ts` is the unit half: it
 * pins *which request object* reaches the choke point using a named fake, because a database
 * can demonstrate nothing about transaction joining. This is the integration half, and it
 * would prove nothing against a fake — a fake that reports source rows is a fake that already
 * agrees with itself. The rows have to be real for the recount to be a recount.
 *
 * **`overrideAccess: true` throughout, for the same reason `fixtures.ts` uses it.** A
 * reconciliation is a cross-organization audit by construction: it asks "does any stored
 * counter anywhere disagree with its rows", and a tenant-scoped client cannot ask that. FR-024
 * governs *application* code; this is a gate that reads the whole database on purpose, and it
 * reads it through Payload's Local API rather than SQL so the query goes through the same
 * field definitions the counters are stored under.
 */

/**
 * FR-020's four derived values: the three counters of `CounterField` plus `formatos`, which is
 * derived on the document being saved rather than counted across rows — so it is not a counter
 * and never arrives through that type. Both halves are reconciled by this gate, because FR-020
 * makes no such distinction: it names four values and demands one maintenance strategy.
 */
type DerivedField = CounterField | 'formatos'

/**
 * How the truth is recomputed for each derived value of FR-020.
 *
 * `satisfies Record<DerivedField, ...>` is the anti-rot device, and it is the reason this map
 * is keyed by the field rather than written as a list: a fifth member added to `CounterField`
 * in `lib/content/counters.ts` fails **typecheck** here until someone states how it reconciles.
 * A hand-kept list would simply not mention it, and the gate would go on reporting "all
 * counters in sync" while ignoring one.
 */
type DerivedSource =
  /** Recount: the rows exist, so the stored value can be re-derived from them. */
  | { from: { collection: string; foreignKey: string } }
  /** No rows exist to count. Stated with its reason — see the inventory test below. */
  | { noSourceRows: string }
  /**
   * The collection this value lives on is not in the config yet, so there is nothing to
   * recount and any recount written now would be written against a field shape nobody has
   * committed to. **Armed, not skipped**: the guard reports it the moment its collection
   * appears, so the commit that gives it a subject is the commit that must reconcile it.
   */
  | { awaitingSubject: { collection: string; task: string; derivedFrom: string } }

const DERIVED_SOURCES = {
  curtidas: { from: { collection: 'curtida', foreignKey: 'alvo' } },
  // A download persists nothing — no row per download is the whole reason `downloads` is a
  // `delta` derivation rather than a `count` (plan § Sketch 7). There is therefore no truth
  // to recompute it from, and claiming to reconcile it would be the lie this gate exists to
  // prevent. FR-016's own test (T036) is what covers it: it asserts the increment happens.
  downloads: {
    noSourceRows:
      'nothing is persisted per download, so there are no source rows to recount from; ' +
      'the delta is covered by the download test (T036, FR-016) instead',
  },
  totalModelos: { from: { collection: 'modelo3d', foreignKey: 'categoria' } },
  // FR-020's fourth derived value, and the only one that is not a counter: `formatos` is the
  // set of extensions of the document's own `arquivosModelo` (data-model.md § Derived values),
  // computed on save. It lives on `modelo3d`, which T039 adds in phase **002b** — so 002a has
  // no row to reconcile and no committed field shape to recount from. Declaring it anyway is
  // the point: round 4 found this gate covering three of the four, with the rot guard unable
  // to catch the fourth later because it filtered on `type === 'number'` and `formatos` is a
  // list of extensions. Both halves are closed here — the value is declared, and the guard
  // below refuses this placeholder the moment `modelo3d` enters the config.
  formatos: {
    awaitingSubject: {
      collection: 'modelo3d',
      task: 'T039 (phase 002b)',
      derivedFrom: 'the extensions of arquivosModelo, computed on save (plan § Sketch 7)',
    },
  },
} as const satisfies Record<DerivedField, DerivedSource>

/** Derived from the map, never written twice — the two cannot disagree. */
const DERIVED_FIELDS = Object.keys(DERIVED_SOURCES) as DerivedField[]

/**
 * System-maintained fields of **any type** that are not FR-020 derived values. Explicit, so the
 * rot guard below can demand that every other derived-looking field is either reconciled here
 * or listed here with a reason — a new one can be added, but not silently.
 */
const NOT_AN_FR020_DERIVED: Record<string, string> = {
  'organizations.storageUsedMb':
    'not one of FR-020\'s four derived values; its stated strategy is a periodic job ' +
    '(Organizations.ts:178), not the same-transaction one this gate reconciles',
  'projeto.aprovacaoRegistrada':
    'a record of a transition, not a derivation: stampApproval writes it once at the first ' +
    'publication and nothing recomputes it (T008, FR-009). Its gate is stamp-approval.test.ts',
  'projeto.aprovadoEm':
    'the date half of the same approval record — written once by stampApproval, never ' +
    'derived from other rows, and a republication does not rewrite it (FR-009)',
}

/**
 * Written by Payload itself on an upload collection, from the bytes it stored. A rule rather
 * than twenty-one inventory lines: these arrive with the `upload` option, so listing them one
 * by one would mean editing this file every time a media collection is added — the kind of
 * chore that ends with the guard being deleted. Scoped to upload collections and to the names
 * Payload generates, so a genuinely derived field on a media collection is still caught.
 */
const PAYLOAD_UPLOAD_METADATA = new Set([
  'url',
  'thumbnailURL',
  'filename',
  'mimeType',
  'filesize',
  'width',
  'height',
  'focalX',
  'focalY',
])

type DerivedColumn = { collection: string; field: DerivedField }

type Drift = {
  where: string
  id: string | number
  stored: number
  recomputed: number
}

let payload: Payload
let seeded: { org: number; categoria: number; midia: number; projeto: number }

const collectionsInConfig = async () => (await configPromise).collections

/** Every (collection, field) pair in the live config that stores an FR-020 derived value. */
const derivedColumns = async (): Promise<DerivedColumn[]> => {
  const columns: DerivedColumn[] = []
  for (const collection of await collectionsInConfig()) {
    for (const field of collection.flattenedFields) {
      const name = (field as { name?: string }).name
      if (name && (DERIVED_FIELDS as string[]).includes(name)) {
        columns.push({ collection: collection.slug, field: name as DerivedField })
      }
    }
  }
  return columns
}

/** Rows whose stored counter disagrees with a recount of its source rows. */
const driftIn = async (column: DerivedColumn, known: Set<string>): Promise<Drift[]> => {
  const declared: DerivedSource = DERIVED_SOURCES[column.field]
  // Nothing to recompute from: no rows are persisted (`downloads`), or the collection that
  // would hold them is not in this config yet (`formatos`). Neither is silent — the matrix
  // tests below demand a stated reason, and the rot guard refuses a placeholder whose
  // collection has since arrived.
  if ('noSourceRows' in declared || 'awaitingSubject' in declared) return []
  const { from } = declared

  const { docs } = await payload.find({
    collection: column.collection as never,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })

  const drifts: Drift[] = []
  for (const doc of docs as unknown as Record<string, unknown>[]) {
    const stored = typeof doc[column.field] === 'number' ? (doc[column.field] as number) : 0
    // A source collection that does not exist yet cannot hold a row, so the truth is zero.
    // This is arithmetic, not a skip: a document claiming three likes while nothing in the
    // schema can record a like is drift, and it is reported as such.
    const recomputed = known.has(from.collection)
      ? (
          await payload.find({
            collection: from.collection as never,
            where: { [from.foreignKey]: { equals: doc.id as never } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
        ).totalDocs
      : 0
    if (stored !== recomputed) {
      drifts.push({
        where: `${column.collection}.${column.field}`,
        id: doc.id as string | number,
        stored,
        recomputed,
      })
    }
  }
  return drifts
}

/**
 * The shape the rot guard reads. Deliberately structural rather than Payload's own types: the
 * guard has to be callable with a collection the app does not have yet, which is the only way
 * to prove it is armed for `formatos` before `modelo3d` exists (T039, 002b).
 */
type ScannedField = { name?: string; type?: string; admin?: { readOnly?: boolean } }
type ScannedCollection = {
  slug: string
  /** Payload sanitizes this to `false` on a collection that declares no `upload` option. */
  upload?: unknown
  flattenedFields: readonly ScannedField[]
}

/**
 * A declaration accounts for a field only when it states how the value is recomputed, or
 * states why nothing can recompute it. A placeholder states neither — it says "not yet" — so
 * it deliberately does **not** account for a field that exists.
 */
const isReconciledHere = (name: string): boolean => {
  const declared: DerivedSource | undefined = (DERIVED_SOURCES as Record<string, DerivedSource>)[
    name
  ]
  return declared !== undefined && !('awaitingSubject' in declared)
}

/**
 * Placeholders whose collection is now in the config — the tripwire for a value declared in a
 * phase that had no subject for it. Reported independently of the field scan on purpose: a
 * collection could arrive with the field not marked `admin.readOnly`, and the scan would then
 * never look at it while the map went on claiming coverage.
 */
const placeholdersWithASubject = (slugs: ReadonlySet<string>): string[] =>
  DERIVED_FIELDS.flatMap((field) => {
    const declared: DerivedSource = DERIVED_SOURCES[field]
    if (!('awaitingSubject' in declared)) return []
    const { collection } = declared.awaitingSubject
    return slugs.has(collection) ? [`${collection}.${field}`] : []
  })

/**
 * Every system-maintained field in a config that nothing in this file accounts for.
 *
 * **No filter on field type.** It used to skip anything that was not a `number`, which round 4
 * found meant the guard could never fire for `formatos` — a list of extensions. `admin.readOnly`
 * is the marker of a value the system writes and a request does not, whatever its type, and
 * that is the population FR-020 draws from.
 *
 * Extracted from the assertion that it is empty so the guard can be *probed* — an assertion
 * over the live config alone can only ever show that the guard found nothing, never that it
 * would have found something.
 */
const unaccountedDerivedFields = (collections: readonly ScannedCollection[]): string[] => {
  const slugs = new Set(collections.map((collection) => collection.slug))
  // A Set, because a placeholder whose collection has arrived is normally also picked up by
  // the field scan below, and reporting it twice would make the failure read like two problems.
  const unaccounted = new Set(placeholdersWithASubject(slugs))

  for (const collection of collections) {
    const isUploadCollection = Boolean(collection.upload)
    for (const field of collection.flattenedFields) {
      if (!field.admin?.readOnly || !field.name) continue
      if (isUploadCollection && PAYLOAD_UPLOAD_METADATA.has(field.name)) continue
      const key = `${collection.slug}.${field.name}`
      if (isReconciledHere(field.name) || key in NOT_AN_FR020_DERIVED) continue
      unaccounted.add(key)
    }
  }
  return [...unaccounted]
}

/** The gate itself: every counter column, every row, recomputed. */
const reconcileEveryCounter = async (): Promise<Drift[]> => {
  const known = new Set((await collectionsInConfig()).map((c) => c.slug))
  const columns = await derivedColumns()
  const drifts: Drift[] = []
  for (const column of columns) drifts.push(...(await driftIn(column, known)))
  return drifts
}

beforeAll(async () => {
  payload = await getPayload({ config: configPromise })

  // Re-runnable: a previous run interrupted between create and cleanup must not fail this
  // one on the unique organization slug.
  await payload.delete({
    collection: 'organizations',
    where: { slug: { equals: 'reconciliacao' } },
    overrideAccess: true,
  })

  const org = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab da Reconciliação', slug: 'reconciliacao', status: 'active' },
    overrideAccess: true,
  })
  const categoria = await payload.create({
    collection: 'categoriaProjeto',
    data: { nome: 'Marcenaria', slug: 'marcenaria-reconciliacao', tenant: org.id },
    overrideAccess: true,
  })
  // Fileless media row: `filesRequiredOnCreate` is false on the media collections, and the
  // subject here is the counter, not the bytes.
  const midia = await payload.create({
    collection: 'midiaImagem',
    data: { tenant: org.id },
    overrideAccess: true,
  })
  const projeto = await payload.create({
    collection: 'projeto',
    data: {
      titulo: 'Banco de marcenaria',
      slug: 'banco-de-marcenaria',
      descricaoCurta: 'Um banco feito no lab.',
      // Required (obrigatório in projetos.md): a storage key, generated, never a filename.
      imagemCapa: midia.id as number,
      downloads: 0,
      categoria: categoria.id,
      tenant: org.id,
      // Stated rather than left to the field default: this is the seed the gate is about to
      // recount, so the value it starts from belongs in the test, not in a config elsewhere.
      // Zero is the truth here — no `curtida` row exists, and none can until T043.
      curtidas: 0,
      status: 'rascunho',
    },
    overrideAccess: true,
  })

  seeded = { org: org.id, categoria: categoria.id, midia: midia.id as number, projeto: projeto.id }
}, 120_000)

afterAll(async () => {
  if (!payload || !seeded) return
  await payload.delete({ collection: 'projeto', id: seeded.projeto, overrideAccess: true })
  await payload.delete({ collection: 'categoriaProjeto', id: seeded.categoria, overrideAccess: true })
  await payload.delete({ collection: 'organizations', id: seeded.org, overrideAccess: true })
})

describe('every stored counter equals a recount of its source rows (T031, FR-020)', () => {
  it('finds at least one counter column to reconcile', async () => {
    // Without this, the gate below would report "no drift" on an empty matrix and the whole
    // file would be a green light for nothing — the exact failure mode a reconciliation test
    // is most likely to ship with.
    const columns = await derivedColumns()
    expect(
      columns,
      'no collection in the config stores an FR-020 counter, so the reconciliation gate ' +
        'reconciles nothing and passes vacuously',
    ).not.toHaveLength(0)
  })

  it('reconciles the whole database with no discrepancy', async () => {
    const drifts = await reconcileEveryCounter()
    expect(
      drifts,
      'a stored counter disagrees with a recount of its source rows. Nothing failed when ' +
        'that happened — a bulk delete, a migration, or a manual SQL fix went around the ' +
        'maintenance strategy — so the card grid shows this number and nobody is told',
    ).toEqual([])
  })
})

describe('the gate catches drift rather than merely running (T031, FR-020)', () => {
  it('reports a counter desynced behind the maintenance strategy, then clears once repaired', async () => {
    // The write below is what an admin bulk delete or a hand-run UPDATE looks like from the
    // counter's point of view: the stored value moves without a source row moving with it.
    // `overrideAccess: true` is the point — it bypasses exactly the paths that keep the two
    // in step, which is the drift `counters.ts` names and cannot prevent.
    await payload.update({
      collection: 'projeto',
      id: seeded.projeto,
      data: { curtidas: 7 },
      overrideAccess: true,
    })

    try {
      const drifts = await reconcileEveryCounter()
      expect(
        drifts,
        'a counter was desynced by hand and the reconciliation reported nothing — the gate ' +
          'is inert, and every green run above means only that it compared nothing',
      ).toEqual([
        { where: 'projeto.curtidas', id: seeded.projeto, stored: 7, recomputed: 0 },
      ])
    } finally {
      await payload.update({
        collection: 'projeto',
        id: seeded.projeto,
        data: { curtidas: 0 },
        overrideAccess: true,
      })
    }

    expect(await reconcileEveryCounter()).toEqual([])
  })
})

describe('the reconciliation matrix cannot rot (T031, SC-012)', () => {
  it('states how every counter of FR-020 is recomputed', async () => {
    // `satisfies Record<CounterField, DerivedSource>` already fails the typecheck for a
    // missing member. This asserts the runtime half: every declaration carries a usable
    // recount or a stated reason, so none can be left as an empty placeholder.
    for (const field of DERIVED_FIELDS) {
      const declared = DERIVED_SOURCES[field] as DerivedSource
      if ('noSourceRows' in declared) {
        expect(declared.noSourceRows.length, `${field} skips reconciliation with no reason`)
          .toBeGreaterThan(20)
      } else if ('awaitingSubject' in declared) {
        // A placeholder has to say what it is waiting for, who brings it, and what the recount
        // will be — otherwise the tripwire fires in 002b onto a note nobody can act on.
        const { collection, task, derivedFrom } = declared.awaitingSubject
        expect(collection, `${field} awaits a collection it does not name`).toBeTruthy()
        expect(task, `${field} names no task that will give it a subject`).toBeTruthy()
        expect(derivedFrom.length, `${field} does not say what it will be derived from`)
          .toBeGreaterThan(20)
      } else {
        expect(declared.from.collection, `${field} names no source collection`).toBeTruthy()
        expect(declared.from.foreignKey, `${field} names no foreign key`).toBeTruthy()
      }
    }
  })

  it('reconciles every derived value except the two inventories of exceptions', async () => {
    // The escape hatches are inventories, not per-case judgements: adding to either is a
    // visible diff someone has to defend, which is the same discipline SCOPE_REGISTRY gets.
    const unrecountable = DERIVED_FIELDS.filter((f) => 'noSourceRows' in DERIVED_SOURCES[f])
    expect(unrecountable, 'a second value claims to have no source rows').toEqual(['downloads'])

    // The second hatch is *temporary by construction* — every entry is a value whose subject
    // is still unwritten, and the guard turns each into a failure the moment it arrives.
    const awaiting = DERIVED_FIELDS.filter((f) => 'awaitingSubject' in DERIVED_SOURCES[f])
    expect(awaiting, 'a value is deferred to a phase that has not been argued for').toEqual([
      'formatos',
    ])
  })

  it('refuses a new derived field that nothing reconciles', async () => {
    // The rot this gate is most exposed to: a later collection adds a derived, admin-readOnly
    // field — `totalModelos` on a category, or something nobody has thought of — and this
    // file goes on reporting "all counters in sync" while never looking at it. Every such
    // field must be either an FR-020 derived value reconciled above or listed in
    // NOT_AN_FR020_DERIVED with a reason.
    const unaccounted = unaccountedDerivedFields(await collectionsInConfig())

    expect(
      unaccounted,
      'a system-maintained field was added with no way to recompute it — a number, a list, ' +
        'or anything else the system writes and a request does not. Either declare its source ' +
        'in DERIVED_SOURCES (and its name in DerivedField) or list it in NOT_AN_FR020_DERIVED ' +
        'with the reason it is out of FR-020\'s scope',
    ).toEqual([])
  })

  it('watches a real column, so the rot guard is not scanning an empty config', async () => {
    const columns = await derivedColumns()
    expect(columns).toContainEqual({ collection: 'projeto', field: 'curtidas' })
  })
})

/**
 * A stand-in for the collection T039 adds in phase 002b. `modelo3d` does not exist in 002a, so
 * `formatos` has no subject here — and a guard that is only ever run against a config without
 * the field is a guard nobody has seen fire. This is the shape it will have: a derived **list
 * of extensions**, not a number, which is exactly the shape the round-4 review found the guard
 * could not see.
 */
const FAKE_MODELO3D: ScannedCollection = {
  slug: 'modelo3d',
  flattenedFields: [
    { name: 'titulo', type: 'text' },
    { name: 'formatos', type: 'select', admin: { readOnly: true } },
  ],
}

/**
 * A derived list nobody declared — the rot this guard exists to refuse, in the non-number form
 * the guard used to wave through.
 */
const FAKE_ACERVO: ScannedCollection = {
  slug: 'acervo',
  flattenedFields: [{ name: 'etiquetasDerivadas', type: 'text', admin: { readOnly: true } }],
}

describe('the guard sees derived values that are not numbers (T031, FR-020)', () => {
  it('covers all four derived values of FR-020, not only the three counters', () => {
    // FR-020 names four: `curtidas`, `downloads`, `total_modelos` and `formatos`. Three of
    // them are counters and live in `CounterField`; `formatos` is a derived list on the
    // document being saved, so it is not a counter and would never arrive through that type.
    // It still has to be reconciled, and the map is where that is stated.
    expect(Object.keys(DERIVED_SOURCES).sort()).toEqual([
      'curtidas',
      'downloads',
      'formatos',
      'totalModelos',
    ])
  })

  it('flags a derived field that is not a number', () => {
    expect(
      unaccountedDerivedFields([FAKE_ACERVO]),
      'a system-maintained list was added and the guard walked past it — every green run of ' +
        'the live-config guard above proves only that no derived *number* is unaccounted for',
    ).toEqual(['acervo.etiquetasDerivadas'])
  })

  it('demands a real recount for formatos the moment modelo3d exists', () => {
    // The tripwire for 002b. `formatos` cannot be reconciled in 002a — there is no collection
    // to reconcile — so its declaration is a placeholder, and a placeholder that stayed quiet
    // once its subject arrived would be worse than no declaration at all: the map would claim
    // coverage the gate never delivers. It must go red on the commit that adds `modelo3d`.
    expect(
      unaccountedDerivedFields([FAKE_MODELO3D]),
      'modelo3d now exists, so formatos has source rows and a placeholder no longer accounts ' +
        'for it — replace it in DERIVED_SOURCES with the recount from arquivosModelo',
    ).toContain('modelo3d.formatos')
  })

  it('stays silent about formatos while 002a has no modelo3d to reconcile', async () => {
    // The other half of the tripwire: armed, not merely noisy. A guard that reports a field
    // the config does not have would be turned off by the first person it inconvenienced.
    expect(unaccountedDerivedFields(await collectionsInConfig())).not.toContain(
      'modelo3d.formatos',
    )
  })
})
