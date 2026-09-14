import { getPayload, type Payload, type Where } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { levelFor, type XpRules } from '@fablab/game'

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
 *
 * Feature 005 widened `CounterField` itself (T020): `perfilMaker.xpTotal` and `perfilMaker.nivel`
 * are FR-010's projections of `xpLedger`, and plan § D2 puts them in this vocabulary so FR-011's
 * reconciliation is **this sweep** rather than a second gate. They arrive here automatically,
 * which is the mechanism working: the map below could not typecheck until each was declared.
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
  /**
   * Derived from the document's OWN field rather than from rows elsewhere. `formatos` is the
   * only one: it is the set of extensions of the media documents `arquivosModelo` links to,
   * computed on save. There is no foreign key to count, so the recount reads the row itself.
   */
  | { fromOwnRelationship: { field: string; how: string } }
  /** No rows exist to count. Stated with its reason — see the inventory test below. */
  | { noSourceRows: string }
  /**
   * The collection this value lives on is not in the config yet, so there is nothing to
   * recount and any recount written now would be written against a field shape nobody has
   * committed to. **Armed, not skipped**: the guard reports it the moment its collection
   * appears, so the commit that gives it a subject is the commit that must reconcile it.
   */
  | { awaitingSubject: { collection: string; task: string; derivedFrom: string } }
  /**
   * **Summed, never counted.** The stored value is the total of `amount` across the rows that
   * point back through `foreignKey` — `xpLedger.quantidade` for `perfilMaker.xpTotal` (FR-010).
   * A row count would agree with it only while `regrasXp.xpPorAcao` is 1, and that rule is
   * per-organization data a team can retune (FR-009): the free oracle of plan § D2, which
   * `xp-vs-count.test.ts` asserts as an oracle and which this recount must not lean on.
   */
  | { fromLedger: { collection: string; foreignKey: string; amount: string } }
  /**
   * A projection of another declared value through a rule rather than of rows: `nivel` is
   * `levelFor(xpTotal, rules)` and nothing else (FR-007), with the numbers living in `regrasXp`.
   *
   * Recomputed from the **recounted** total rather than the stored one. A level derived from a
   * wrong total agrees with that total perfectly, so a recount that read the stored column
   * would call the pair "in sync" at the exact moment both are wrong.
   */
  | { fromCurve: { of: DerivedField; rules: string; how: string } }

const DERIVED_SOURCES = {
  // `conteudo.value`, not `conteudo`: T043 declares the target as a POLYMORPHIC relationship
  // (`relationTo: ['projeto']`), and Payload stores those as `{ relationTo, value }` — querying
  // the bare field name raises `QueryError: The following path cannot be queried`. The name is
  // `conteudo` rather than the `alvo` this map assumed in 002a, which is what surfaced it.
  curtidas: { from: { collection: 'curtida', foreignKey: 'conteudo.value' } },
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
    fromOwnRelationship: {
      field: 'arquivosModelo',
      how: 'the distinct lowercased extensions of the linked media documents\' filenames',
    },
  },
  // Feature 005, FR-010 — the two projections `creditXp` maintains inside the transaction that
  // writes the ledger entry. Declared here, and not in a gate of their own, because a second
  // reconciliation would be a second discipline for one guarantee (plan § D2): drift in a total
  // and drift in a like are the same failure, and this file is where it is reported.
  xpTotal: { fromLedger: { collection: 'xpLedger', foreignKey: 'perfil', amount: 'quantidade' } },
  nivel: {
    fromCurve: {
      of: 'xpTotal',
      rules: 'regrasXp',
      how:
        'levelFor(the RECOUNTED xpTotal, this organization\'s regrasXp) — FR-007\'s curve, ' +
        'evaluated in @fablab/game and expressed nowhere else, cap included (CLR-013)',
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
/** The reason the approval pair is not an FR-020 derivation, written once. */
const APPROVAL_STAMP =
  'a record of a transition, not a derivation: stampApproval writes it once at the first ' +
  'publication and nothing recomputes it (FR-009). Its gate is the review-queue test'

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
  // The same pair on every other collection that runs the review queue. Listed one by one
  // rather than matched by name: a rule like "any field called aprovadoEm" would also absolve a
  // future field that happens to share the name and is genuinely derived.
  'artigo.aprovacaoRegistrada': APPROVAL_STAMP,
  'artigo.aprovadoEm': APPROVAL_STAMP,
  'modelo3d.aprovacaoRegistrada': APPROVAL_STAMP,
  'modelo3d.aprovadoEm': APPROVAL_STAMP,
  'aula.aprovacaoRegistrada': APPROVAL_STAMP,
  'aula.aprovadoEm': APPROVAL_STAMP,
  'evento.aprovacaoRegistrada': APPROVAL_STAMP,
  'evento.aprovadoEm': APPROVAL_STAMP,
  // Feature 005. An **idempotency key**, not a derived value: `beforeValidate` composes it once
  // from the entry's own `(tenant, perfil, acao, refTipo, refId)` and nothing ever recomputes
  // it, because the ledger is append-only (FR-001) — there is no later state for it to drift
  // from. Its gate is the UNIQUE INDEX itself, driven by `xp-ledger.test.ts` inserting the same
  // tuple twice and asserting `23505`, which is a stronger check than a recount could be.
  //
  // This entry is here because registering `XpLedger` in `payload.config.ts` is what made the
  // field visible to the scan below — so the rot guard fired at registration time, exactly as
  // designed, on a field no task in the list had claimed. That is the guard working.
  'xpLedger.chaveIdempotencia':
    'an idempotency key composed once by beforeValidate and never recomputed; the ledger is ' +
    'append-only (FR-001), so there is no source to reconcile against. Its gate is the unique ' +
    'index, proven in xp-ledger.test.ts',
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
let seeded: {
  org: number
  categoria: number
  midia: number
  projeto: number
  perfil: number
  usuario: number
}

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

/** The extension of a filename, lowercased and dot-led, or null when it has none. */
const extensionOf = (filename: unknown): string | null => {
  const name = typeof filename === 'string' ? filename : ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : null
}

/**
 * Rows whose stored value disagrees with a recomputation from the document's own relationship.
 *
 * Read at `depth: 1` so the linked media documents arrive populated — the extensions live in
 * their filenames, which is the only place the truth exists. Compared as sorted sets, because
 * `formatos` is a set: order is not part of the value and two orderings are not drift.
 */
const driftInOwnRelationship = async (
  column: DerivedColumn,
  declared: { fromOwnRelationship: { field: string; how: string } },
): Promise<Drift[]> => {
  const { docs } = await payload.find({
    collection: column.collection as never,
    depth: 1,
    pagination: false,
    overrideAccess: true,
  })

  const drifts: Drift[] = []
  for (const doc of docs as unknown as Record<string, unknown>[]) {
    const linked = doc[declared.fromOwnRelationship.field]
    const entries = Array.isArray(linked) ? linked : linked === undefined ? [] : [linked]
    const recomputed = [
      ...new Set(
        entries
          .map((entry) => {
            const value = (entry as { value?: unknown })?.value ?? entry
            return extensionOf((value as { filename?: unknown })?.filename)
          })
          .filter((ext): ext is string => ext !== null),
      ),
    ].sort()

    const storedRaw = doc[column.field]
    const stored = (Array.isArray(storedRaw) ? storedRaw.map(String) : []).sort()

    if (JSON.stringify(stored) !== JSON.stringify(recomputed)) {
      drifts.push({
        where: `${column.collection}.${column.field}`,
        id: doc.id as string | number,
        stored: stored.length,
        recomputed: recomputed.length,
      })
    }
  }
  return drifts
}

/**
 * Every row a query matches, at `depth: 0` — ids, not populated relationships.
 *
 * `pagination: false` on purpose, and it is load-bearing for the sums below: a page limit would
 * make a total stop short of its own ledger and report no error at all, the defect `counters.ts`
 * declares `SUM_PAGE_SIZE` against. The runtime path pages because it runs inside a user's
 * transaction; a CI gate reading the whole database does not have to.
 */
const rowsOf = async (collection: string, where?: Where): Promise<Record<string, unknown>[]> => {
  const { docs } = await payload.find({
    collection: collection as never,
    where: where as never,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs as unknown as Record<string, unknown>[]
}

/** The total of `amount` across every source row pointing at `id`. */
const sumOfSourceRows = async (
  from: { collection: string; foreignKey: string; amount: string },
  id: unknown,
): Promise<number> => {
  const rows = await rowsOf(from.collection, { [from.foreignKey]: { equals: id } } as Where)
  return rows.reduce((total, row) => {
    const amount = row[from.amount]
    return total + (typeof amount === 'number' ? amount : 0)
  }, 0)
}

/**
 * The economy of one organization, or `null` when it has none.
 *
 * **Read per row rather than cached.** A cache keyed by tenant would hand back a `null` recorded
 * before a test seeded its `regrasXp`, and the gate would then report every level in that
 * organization as drift — a failure in the gate reported as a failure in the code it watches.
 * The cost is one small query per profile, paid in CI.
 */
const rulesOf = async (tenant: unknown): Promise<XpRules | null> => {
  const [row] = await rowsOf('regrasXp', { tenant: { equals: tenant } } as Where)
  const { xpPorAcao, xpPorNivel, nivelMaximo } = (row ?? {}) as Partial<XpRules>
  return typeof xpPorAcao === 'number' &&
    typeof xpPorNivel === 'number' &&
    typeof nivelMaximo === 'number'
    ? { xpPorAcao, xpPorNivel, nivelMaximo }
    : null
}

/**
 * The ledger declaration a curve projects, resolved **through the map** rather than restated.
 *
 * Restating `{ collection: 'xpLedger', foreignKey: 'perfil' }` beside the level's recount is how
 * the two would drift apart from each other without either being wrong on its own — two
 * statements of one fact, and the map is the one the typecheck protects.
 */
const ledgerBehind = (
  of: DerivedField,
): { collection: string; foreignKey: string; amount: string } => {
  const declared: DerivedSource = DERIVED_SOURCES[of]
  if (!('fromLedger' in declared)) {
    throw new Error(
      `${of} is named as the value a curve projects, but its declaration is ` +
        `${JSON.stringify(declared)} — nothing recounts it, so the level cannot be recomputed`,
    )
  }
  return declared.fromLedger
}

/**
 * Rows whose stored projection disagrees with `recompute` (T020, FR-011).
 *
 * One walk for both projections, because the difference between them is only *what the truth
 * is* — a sum of the ledger, or the curve applied to that sum. Writing the walk twice would let
 * the two report drift in two shapes, and the drift report is what a person reads at 2am.
 */
const driftInProjection = async (
  column: DerivedColumn,
  recompute: (doc: Record<string, unknown>) => Promise<number>,
): Promise<Drift[]> => {
  const drifts: Drift[] = []
  for (const doc of await rowsOf(column.collection)) {
    const stored = typeof doc[column.field] === 'number' ? (doc[column.field] as number) : 0
    const recomputed = await recompute(doc)
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

/** Rows whose stored counter disagrees with a recount of its source rows. */
const driftIn = async (column: DerivedColumn, known: Set<string>): Promise<Drift[]> => {
  const declared: DerivedSource = DERIVED_SOURCES[column.field]
  // Nothing to recompute from: no rows are persisted (`downloads`), or the collection that
  // would hold them is not in this config yet (`formatos`). Neither is silent — the matrix
  // tests below demand a stated reason, and the rot guard refuses a placeholder whose
  // collection has since arrived.
  if ('noSourceRows' in declared || 'awaitingSubject' in declared) return []

  if ('fromOwnRelationship' in declared) return driftInOwnRelationship(column, declared)

  // FR-010's projections: a sum of the ledger, and the curve applied to that sum (T020).
  if ('fromLedger' in declared) {
    const { fromLedger } = declared
    // A ledger that is not in this config cannot hold an entry, so the truth is zero — the same
    // arithmetic applied below to a counter whose source collection has not landed yet.
    return driftInProjection(column, async (doc) =>
      known.has(fromLedger.collection) ? sumOfSourceRows(fromLedger, doc.id) : 0,
    )
  }
  if ('fromCurve' in declared) {
    const from = ledgerBehind(declared.fromCurve.of)
    // An organization with no `regrasXp` row can grant no XP at all — `creditXp` refuses without
    // an economy — so every level there must read 0. That is arithmetic, not a skip: a profile
    // claiming level 3 in a lab whose economy does not exist is drift, and is reported as such.
    return driftInProjection(column, async (doc) => {
      const rules = await rulesOf(doc.tenant)
      return rules ? levelFor(await sumOfSourceRows(from, doc.id), rules) : 0
    })
  }

  const { from } = declared

  const drifts: Drift[] = []
  for (const doc of await rowsOf(column.collection)) {
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
    // Currently unreachable, and deliberately kept. `formatos` was the only value ever declared
    // ahead of its collection, and it got its subject when `modelo3d` landed in 002b — so no
    // member of DERIVED_SOURCES carries `awaitingSubject` today and TypeScript narrows this
    // branch to `never`. The mechanism is the point, not its current occupancy: the next value
    // declared before its collection exists must be reported the moment that collection
    // appears, and deleting the branch is how that guarantee would be lost quietly.
    const { awaitingSubject } = declared as unknown as {
      awaitingSubject: { collection: string }
    }
    return slugs.has(awaitingSubject.collection)
      ? [`${awaitingSubject.collection}.${field}`]
      : []
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


/**
 * T021 / FR-011, SC-004 — the XP half of this gate needs **real ledger rows**, and this is them.
 *
 * T020 declared how `xpTotal` and `nivel` are recomputed and wrote the recount. A declaration
 * reconciles nothing on its own: with no profile and no entries in the database, the sweep walks
 * zero rows for both projections and reports "no drift" about nothing at all — the vacuous green
 * this whole file is written against. The fixture below is what gives the recount a subject.
 */

/**
 * The fixture's economy, and **not one of its numbers is the CITe seed's** (`{1, 5, 10}`).
 *
 * `xpPorNivel: 4` makes the right level for 9 XP **2**, where the seeded curve would read 1. So a
 * recount that evaluated FR-007's curve against a constant — instead of against *this*
 * organization's own `regrasXp` row, which FR-009 lets a lab retune — reports drift on a profile
 * that is in perfect sync, and this fixture is what turns that into a red run.
 */
const CURVA_DO_LAB = { xpPorAcao: 3, xpPorNivel: 4, nivelMaximo: 5 }

/** One entry per content id. Three of them, each worth three — see `XP_ESPERADO`. */
const ENTRADAS_XP = [1, 2, 3]

/**
 * **Three, never one.** With `xpPorAcao` at 1 a sum and a row count agree, which is plan § D2's
 * free oracle and is exactly why a recount that counts rows instead of adding `quantidade` would
 * pass unnoticed everywhere else. Here the two answers are 9 and 3, and only one of them is the
 * total this profile stores.
 */
const XP_POR_ENTRADA = CURVA_DO_LAB.xpPorAcao
const XP_ESPERADO = ENTRADAS_XP.length * XP_POR_ENTRADA

/** `floor(9 / 4)`, below the cap of 5. Stated as a literal so the curve is asserted, not echoed. */
const NIVEL_ESPERADO = 2

const HANDLE_XP = '@reconciliacao-xp'
const EMAIL_XP = 'reconciliacao-xp@example.test'

/**
 * The XP fixture a previous run left behind, removed before this one seeds again.
 *
 * Not tidiness. This gate reads the **whole database**, so a profile with ledger entries and no
 * cleanup is drift reported against code that is working correctly — `erasure-door.test.ts` and
 * `signed-in.test.ts` both carry an `afterAll` for precisely this, and both cite measuring it.
 * A run interrupted between create and cleanup would otherwise make every later run red, and the
 * organization delete does not reach these rows: the profile is found by its own handle.
 */
const removeStaleXpFixture = async (): Promise<void> => {
  const { docs } = await payload.find({
    collection: 'perfilMaker',
    where: { handle: { equals: HANDLE_XP } },
    pagination: false,
    overrideAccess: true,
  })
  // Entries first: `xpLedger.perfil` is nullable (CLR-011's tombstone), so deleting the profile
  // would leave them behind pointing at nobody instead of failing loudly.
  for (const perfil of docs) {
    await payload.delete({
      collection: 'xpLedger',
      where: { perfil: { equals: perfil.id } },
      overrideAccess: true,
    })
  }
  await payload.delete({
    collection: 'perfilMaker',
    where: { handle: { equals: HANDLE_XP } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'users',
    where: { email: { equals: EMAIL_XP } },
    overrideAccess: true,
  })
}

/**
 * A maker whose two projections are in sync with a ledger of three entries — the subject of the
 * reconciliation below.
 *
 * `overrideAccess: true` throughout, as everywhere else in this file: `xpLedger.create` is scoped
 * and `regrasXp.update` is the team's, and a gate is neither. Writing the rows directly is also
 * the point rather than a shortcut — the credit path is pinned by its own tests, and a fixture
 * built by calling `creditXp` would only prove the recount agrees with the code that wrote it.
 */
const seedXpFixture = async (org: number): Promise<{ perfil: number; usuario: number }> => {
  // The organization was created with the CITe economy by `seed-on-create.ts`. Retuning it is
  // what FR-009 makes possible, and what makes the level recount's source observable.
  await payload.update({
    collection: 'regrasXp',
    where: { tenant: { equals: org } },
    data: CURVA_DO_LAB,
    overrideAccess: true,
  })

  const usuario = await payload.create({
    collection: 'users',
    data: { email: EMAIL_XP, password: 'fixture-password-123', role: 'user' },
    overrideAccess: true,
  })
  const perfil = await payload.create({
    collection: 'perfilMaker',
    data: {
      nome: 'Maker da Reconciliação',
      handle: HANDLE_XP,
      usuario: usuario.id,
      tenant: org,
      // Stated rather than left to the field defaults, for the reason the project row above
      // states its `curtidas`: these are the values the gate is about to recount, so what they
      // start from belongs in the test. Both agree with the entries created next.
      xpTotal: XP_ESPERADO,
      nivel: NIVEL_ESPERADO,
    },
    overrideAccess: true,
  })

  for (const refId of ENTRADAS_XP) {
    await payload.create({
      collection: 'xpLedger',
      data: {
        perfil: perfil.id,
        acao: 'publicar_projeto',
        refTipo: 'projeto',
        // Distinct per entry: `chaveIdempotencia` is composed from the tuple and carries a
        // unique index, so three entries with one `refId` would be one entry and a 23505.
        refId,
        quantidade: XP_POR_ENTRADA,
        tenant: org,
        // `as never` for the reason `xp-credit-idempotencia.test.ts` writes it the same way:
        // `chaveIdempotencia` is `required: true` in the generated types and is composed by the
        // collection's own `beforeValidate`, so a caller that satisfied the type would be
        // writing the key by hand — the one thing T007 built the hook to make impossible.
      } as never,
      overrideAccess: true,
    })
  }

  return { perfil: perfil.id as number, usuario: usuario.id as number }
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
  await removeStaleXpFixture()

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

  // The XP half (T021): a maker, an economy of this lab's own, and three ledger entries whose
  // sum is the total the profile stores. Seeded after the organization because its `regrasXp`
  // row arrives with it (`seed-on-create.ts`) and this retunes that row rather than adding one.
  const xp = await seedXpFixture(org.id as number)

  // Ids are `string | number` without the generated `payload-types.ts`, which is gitignored —
  // so this narrows here rather than typechecking locally and failing in CI.
  seeded = {
    org: org.id as number,
    categoria: categoria.id as number,
    midia: midia.id as number,
    projeto: projeto.id as number,
    perfil: xp.perfil,
    usuario: xp.usuario,
  }
}, 120_000)

afterAll(async () => {
  if (!payload || !seeded) return
  // The XP rows first, and they are removed rather than left for the next run to overwrite: this
  // gate reads the whole database, so a profile left behind with its entries is drift reported
  // against whichever file runs next.
  await removeStaleXpFixture()
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
      } else if ('fromLedger' in declared) {
        // A sum has to name the column it adds up. Without `amount` the only recount available
        // is a row count, which is the thing plan § D2 forbids leaning on.
        const { collection, foreignKey, amount } = declared.fromLedger
        expect(collection, `${field} names no ledger to sum`).toBeTruthy()
        expect(foreignKey, `${field} names no foreign key back to the row it projects`).toBeTruthy()
        expect(amount, `${field} names no amount column — a row count is not a sum`).toBeTruthy()
      } else if ('fromCurve' in declared) {
        const { of, rules, how } = declared.fromCurve
        expect(of, `${field} does not say which value it is a projection of`).toBeTruthy()
        expect(rules, `${field} does not say where the numbers of its curve live`).toBeTruthy()
        expect(how.length, `${field} does not say how the curve derives it`).toBeGreaterThan(20)
        // The value it projects must itself be recountable, or the level is derived from a
        // number this gate never checks.
        expect(() => ledgerBehind(of), `${field} projects a value nothing recounts`).not.toThrow()
      } else if ('fromOwnRelationship' in declared) {
        // A self-derivation names the field it reads and how, so the recount below can be
        // checked against a sentence rather than inferred from the code that performs it.
        const { field: source, how } = declared.fromOwnRelationship
        expect(source, `${field} names no field to derive itself from`).toBeTruthy()
        expect(how.length, `${field} does not say how it is derived`).toBeGreaterThan(20)
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
    // is still unwritten, and the guard turns each into a failure the moment it arrives. It is
    // EMPTY now: `formatos` was the only occupant, `modelo3d` landed in 002b, and the guard did
    // exactly what it was built to do — it refused the placeholder and forced the recount that
    // `driftInOwnRelationship` now performs. An entry reappearing here is a value deferred to a
    // phase somebody still has to argue for.
    const awaiting = DERIVED_FIELDS.filter((f) => 'awaitingSubject' in DERIVED_SOURCES[f])
    expect(awaiting, 'a value is deferred to a phase that has not been argued for').toEqual([])
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
  it('covers all four derived values of FR-020 and both XP projections of FR-010', () => {
    // FR-020 names four: `curtidas`, `downloads`, `total_modelos` and `formatos`. Three of
    // them are counters and live in `CounterField`; `formatos` is a derived list on the
    // document being saved, so it is not a counter and would never arrive through that type.
    // It still has to be reconciled, and the map is where that is stated.
    //
    // Feature 005 added the last two (T020): `xpTotal` and `nivel` are FR-010's projections of
    // `xpLedger`, reconciled in this same sweep rather than in a gate of their own (plan § D2).
    // The list is spelled out rather than derived so that *removing* a value is as visible as
    // adding one — a deletion here is a coverage loss no typecheck would report.
    expect(Object.keys(DERIVED_SOURCES).sort()).toEqual([
      'curtidas',
      'downloads',
      'formatos',
      'nivel',
      'totalModelos',
      'xpTotal',
    ])
  })

  it('flags a derived field that is not a number', () => {
    expect(
      unaccountedDerivedFields([FAKE_ACERVO]),
      'a system-maintained list was added and the guard walked past it — every green run of ' +
        'the live-config guard above proves only that no derived *number* is unaccounted for',
    ).toEqual(['acervo.etiquetasDerivadas'])
  })

  it('reconciles formatos rather than deferring it, now that modelo3d exists', () => {
    // This pair used to be the 002b TRIPWIRE: `formatos` could not be reconciled in 002a — no
    // collection to reconcile — so it was declared as a placeholder that had to go red on the
    // commit adding `modelo3d`. It did, which is why `driftInOwnRelationship` exists.
    //
    // The assertion is inverted rather than deleted: what the tripwire protected is that the
    // map never claims coverage the gate does not deliver, and that property is now checked in
    // the other direction — `formatos` must be ACCOUNTED FOR, on a config that really has
    // `modelo3d`, or the recount has been removed and nobody noticed.
    expect(
      unaccountedDerivedFields([FAKE_MODELO3D]),
      'formatos is unaccounted for again — its recount from arquivosModelo has been removed ' +
        'or renamed, and the map is claiming a coverage the gate no longer delivers',
    ).not.toContain('modelo3d.formatos')
  })

  it('still reports a derived field nothing accounts for, so the guard is armed', async () => {
    // The other half: armed, not merely quiet. A guard that reports nothing on the real config
    // proves nothing unless it still fires on something it genuinely cannot account for.
    const invented = {
      ...FAKE_MODELO3D,
      slug: 'modelo3d',
      flattenedFields: [
        ...FAKE_MODELO3D.flattenedFields,
        { name: 'inventadoPeloSistema', admin: { readOnly: true } },
      ],
    }
    expect(unaccountedDerivedFields([invented])).toContain('modelo3d.inventadoPeloSistema')
    expect(unaccountedDerivedFields(await collectionsInConfig())).toEqual([])
  })
})

/**
 * T020 / FR-011, SC-004 — the XP projections enter the SAME matrix as the counters.
 *
 * `perfilMaker.xpTotal` and `perfilMaker.nivel` are not stored facts either: they are
 * `xpLedger`, recomputed inside the crediting transaction (FR-010), exactly as `curtidas` is
 * `curtida` recomputed inside the like's. Plan § D2 makes that sameness structural rather than
 * rhetorical — the projections are named in `CounterField`, so this map's
 * `satisfies Record<DerivedField, DerivedSource>` forces a statement of how each one is
 * recomputed, and FR-011's reconciliation sweeps them in the same pass as the counters instead
 * of in a second gate that would be a second thing to get wrong.
 *
 * The per-skill `skills[].xp` and `skills[].nivel` are deliberately absent: Payload does not
 * hoist an array's subfields into `flattenedFields` (`FlattenedArrayField` keeps its own), so
 * `derivedColumns` cannot see them and declaring them here would claim a coverage this gate
 * never delivers — the one failure the whole file is written against.
 */
describe('the XP projections are reconciled by this gate too (T020, FR-011, SC-004)', () => {
  const declaredFor = (field: string): DerivedSource | undefined =>
    (DERIVED_SOURCES as Record<string, DerivedSource>)[field]

  it('recounts xpTotal from the ledger rows, summed rather than counted', () => {
    // Summed, never counted: `regrasXp.xpPorAcao` makes an entry's amount tunable, so a row
    // count agrees with the total only while that rule is 1 — the free oracle of plan § D2,
    // which T021b asserts as an oracle and which this gate must not lean on.
    expect(
      declaredFor('xpTotal'),
      'perfilMaker.xpTotal is a projection of xpLedger (FR-010) and this map says nothing ' +
        'about it, so the reconciliation of FR-011 walks past it and a total that disagrees ' +
        'with its own ledger is reported by nothing',
    ).toEqual({
      fromLedger: { collection: 'xpLedger', foreignKey: 'perfil', amount: 'quantidade' },
    })
  })

  it('recounts nivel from the recounted total, on the organization\'s own curve', () => {
    const declared = declaredFor('nivel')
    expect(
      declared,
      'perfilMaker.nivel is levelFor(xpTotal) and nothing else (FR-007); undeclared, a level ' +
        'that no longer matches its total drifts with nothing to report it',
    ).toHaveProperty('fromCurve')

    const { fromCurve } = declared as { fromCurve: { of: string; rules: string; how: string } }
    // `of: 'xpTotal'` is what makes the level recount read the RECOUNTED total rather than the
    // stored one: a level derived from a wrong total agrees with it perfectly, and a recount
    // that read the stored column would call that pair "in sync" while both are wrong.
    expect(fromCurve.of, 'the curve does not say which value it is a projection of').toBe('xpTotal')
    expect(fromCurve.rules, 'the curve does not say where its numbers live').toBe('regrasXp')
    expect(fromCurve.how.length, 'the curve does not say how the level is derived').toBeGreaterThan(
      20,
    )
  })

  it('watches both projection columns, so the declarations are not claims about nothing', async () => {
    const columns = await derivedColumns()
    expect(
      columns,
      'the map declares a recount for xpTotal and the column scan never finds the column, so ' +
        'every green run of the reconciliation proves nothing about it',
    ).toContainEqual({ collection: 'perfilMaker', field: 'xpTotal' })
    expect(columns).toContainEqual({ collection: 'perfilMaker', field: 'nivel' })
  })
})

/**
 * T021 / FR-011, SC-004, CLR-014 — **the reconciliation itself**, run against real ledger rows.
 *
 * The block above (T020) asserts the *declarations*: that the map says how each projection is
 * recomputed. This one asserts the recount, and the difference is the whole point of a gate —
 * a matrix that states a recount nobody ever performed is a claim, and this file exists because
 * claims about stored numbers are how a maker's XP ends up disagreeing with its own history.
 *
 * **A CI gate, not a runtime repair** (CLR-014). Nothing here fixes a drifted projection and
 * nothing in the product does either: the answer 002 gave for the like and download counters is
 * the answer FR-011 gives for XP, because a runtime repair here and none there would be two
 * disciplines for one guarantee. The repair is re-running the maintenance, which CI requires
 * before merge — so the only thing this has to do is **fail**.
 *
 * **These two cases passed the moment they were written**, because T020 landed the recount in
 * this same file along with the declarations — so they were probed rather than trusted, by
 * breaking the recount three ways and watching what each case said. Measured, not assumed:
 *
 *   - the sum made a row count (`+ 1` instead of `+ quantidade`) — both cases red; the total
 *     recomputes to 3 where the ledger holds 9;
 *   - the level recomputed from the **stored** total instead of the recounted one — the first
 *     case still green, the second red with the `nivel` drift missing from the report: the
 *     desynced pair agrees with itself, which is the failure that branch is written against;
 *   - the curve read as the CITe seed `{1, 5, 10}` instead of this organization's `regrasXp`
 *     row — both red, on a profile that is in perfect sync with its ledger.
 */
describe('every XP projection equals a recount of the ledger (T021, FR-011, SC-004)', () => {
  /**
   * The sweep's report about the fixture's profile alone.
   *
   * The reconciliation reads the whole database by design, and the two cases at the top of this
   * file already assert that whole report is empty. Narrowing here is not a weakening of that:
   * a row a neighbouring test file left behind is drift this file can neither cause nor repair,
   * and blaming T021 for it would make the wrong test red. What is asserted below is the part
   * T021 owns — what the recount says about a profile whose ledger this file wrote.
   */
  const driftsForPerfil = async (): Promise<Drift[]> =>
    (await reconcileEveryCounter())
      .filter((drift) => drift.where.startsWith('perfilMaker.') && drift.id === seeded.perfil)
      // Sorted, so the assertion pins WHICH projections drifted rather than the order the sweep
      // happens to walk one collection's columns in.
      .sort((a, b) => a.where.localeCompare(b.where))

  it('sums the ledger — never counts it — and reads this organization\'s own curve', async () => {
    const entradas = await rowsOf('xpLedger', { perfil: { equals: seeded.perfil } } as Where)
    expect(
      entradas,
      'the fixture wrote no ledger entries, so the recount below reconciles this profile ' +
        'against nothing and every green run of it means only that it compared nothing',
    ).toHaveLength(ENTRADAS_XP.length)
    expect(
      XP_ESPERADO,
      'the fixture made a sum and a row count agree, so a recount that counted rows instead of ' +
        'adding quantidade would pass — the free oracle of plan § D2 must not be leaned on here',
    ).not.toBe(entradas.length)

    expect(
      await driftsForPerfil(),
      'a profile whose stored total IS the sum of its ledger was reported as drift: either the ' +
        'recount counts rows instead of adding quantidade, or the level was evaluated against ' +
        'the CITe seed instead of this lab\'s own regrasXp (FR-009)',
    ).toEqual([])
  })

  it('reports a hand-desynced xpTotal, and the level that still agrees with it', async () => {
    // What a migration, an admin bulk edit or a hand-run UPDATE looks like from the projections'
    // point of view — and the hard half deliberately: the two columns move TOGETHER and stay
    // perfectly consistent with each other. `levelFor(20, CURVA_DO_LAB)` is 5, so a level
    // recomputed from the STORED total would call this pair in sync at the exact moment both are
    // wrong. The ledger is what is right (CLR-001), and both must be reported against it.
    const DESSINCRONIZADO = { xpTotal: 20, nivel: 5 }
    await payload.update({
      collection: 'perfilMaker',
      id: seeded.perfil,
      data: DESSINCRONIZADO,
      overrideAccess: true,
    })

    try {
      expect(
        await driftsForPerfil(),
        'a total was desynced by hand and the reconciliation reported nothing. FR-011 fails CI ' +
          'on drift and CLR-014 leaves no runtime repair behind it, so with this gate inert a ' +
          'maker\'s XP can disagree with its own ledger forever and nothing says so',
      ).toEqual([
        {
          where: 'perfilMaker.nivel',
          id: seeded.perfil,
          stored: DESSINCRONIZADO.nivel,
          recomputed: NIVEL_ESPERADO,
        },
        {
          where: 'perfilMaker.xpTotal',
          id: seeded.perfil,
          stored: DESSINCRONIZADO.xpTotal,
          recomputed: XP_ESPERADO,
        },
      ])
    } finally {
      await payload.update({
        collection: 'perfilMaker',
        id: seeded.perfil,
        data: { xpTotal: XP_ESPERADO, nivel: NIVEL_ESPERADO },
        overrideAccess: true,
      })
    }

    // Re-running the maintenance is the only repair CLR-014 allows, so the gate has to go quiet
    // once it has been run: one that stays red after the fix teaches people to ignore it.
    expect(await driftsForPerfil()).toEqual([])
  })
})
