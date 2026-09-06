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
 * How the truth is recomputed for each counter of FR-020.
 *
 * `satisfies Record<CounterField, ...>` is the anti-rot device, and it is the reason this map
 * is keyed by the counter field rather than written as a list: a fifth member added to
 * `CounterField` in `lib/content/counters.ts` fails **typecheck** here until someone states
 * how it reconciles. A hand-kept list would simply not mention it, and the gate would go on
 * reporting "all counters in sync" while ignoring one.
 */
type CounterSource =
  /** Recount: the rows exist, so the stored value can be re-derived from them. */
  | { from: { collection: string; foreignKey: string } }
  /** No rows exist to count. Stated with its reason — see the inventory test below. */
  | { noSourceRows: string }

const COUNTER_SOURCES = {
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
} as const satisfies Record<CounterField, CounterSource>

/** Derived from the map, never written twice — the two cannot disagree. */
const COUNTER_FIELDS = Object.keys(COUNTER_SOURCES) as CounterField[]

/**
 * Read-only numbers that are **not** FR-020 counters. Explicit, so the rot guard below can
 * demand that every other derived-looking field is either reconciled here or listed here with
 * a reason — a new one can be added, but not silently.
 */
const NOT_AN_FR020_COUNTER: Record<string, string> = {
  'organizations.storageUsedMb':
    'not one of FR-020\'s four derived values; its stated strategy is a periodic job ' +
    '(Organizations.ts:178), not the same-transaction one this gate reconciles',
}

type CounterColumn = { collection: string; field: CounterField }

type Drift = {
  where: string
  id: string | number
  stored: number
  recomputed: number
}

let payload: Payload
let seeded: { org: number; categoria: number; projeto: number }

const collectionsInConfig = async () => (await configPromise).collections

/** Every (collection, field) pair in the live config that stores an FR-020 counter. */
const counterColumns = async (): Promise<CounterColumn[]> => {
  const columns: CounterColumn[] = []
  for (const collection of await collectionsInConfig()) {
    for (const field of collection.flattenedFields) {
      const name = (field as { name?: string }).name
      if (name && (COUNTER_FIELDS as string[]).includes(name)) {
        columns.push({ collection: collection.slug, field: name as CounterField })
      }
    }
  }
  return columns
}

/** Rows whose stored counter disagrees with a recount of its source rows. */
const driftIn = async (column: CounterColumn, known: Set<string>): Promise<Drift[]> => {
  const declared = COUNTER_SOURCES[column.field]
  if ('noSourceRows' in declared) return []
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

/** The gate itself: every counter column, every row, recomputed. */
const reconcileEveryCounter = async (): Promise<Drift[]> => {
  const known = new Set((await collectionsInConfig()).map((c) => c.slug))
  const columns = await counterColumns()
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
  const projeto = await payload.create({
    collection: 'projeto',
    data: {
      titulo: 'Banco de marcenaria',
      slug: 'banco-de-marcenaria',
      descricaoCurta: 'Um banco feito no lab.',
      // Required (obrigatório in projetos.md): a storage key, generated, never a filename.
      imagemCapa: 'media/image/00000000-0000-4000-8000-000000000001.png',
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

  seeded = { org: org.id, categoria: categoria.id, projeto: projeto.id }
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
    const columns = await counterColumns()
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
    // `satisfies Record<CounterField, CounterSource>` already fails the typecheck for a
    // missing member. This asserts the runtime half: every declaration carries a usable
    // recount or a stated reason, so none can be left as an empty placeholder.
    for (const field of COUNTER_FIELDS) {
      const declared = COUNTER_SOURCES[field] as CounterSource
      if ('noSourceRows' in declared) {
        expect(declared.noSourceRows.length, `${field} skips reconciliation with no reason`)
          .toBeGreaterThan(20)
      } else {
        expect(declared.from.collection, `${field} names no source collection`).toBeTruthy()
        expect(declared.from.foreignKey, `${field} names no foreign key`).toBeTruthy()
      }
    }
  })

  it('reconciles every counter except the one inventory of unrecountable ones', async () => {
    // The escape hatch is an inventory, not a per-case judgement: adding to it is a visible
    // diff someone has to defend, which is the same discipline SCOPE_REGISTRY gets.
    const unrecountable = COUNTER_FIELDS.filter((f) => 'noSourceRows' in COUNTER_SOURCES[f])
    expect(unrecountable).toEqual(['downloads'])
  })

  it('refuses a new derived field that nothing reconciles', async () => {
    // The rot this gate is most exposed to: a later collection adds a derived, admin-readOnly
    // number — `totalModelos` on a category, or something nobody has thought of — and this
    // file goes on reporting "all counters in sync" while never looking at it. Every such
    // field must be either an FR-020 counter reconciled above or listed in
    // NOT_AN_FR020_COUNTER with a reason.
    const unaccounted: string[] = []
    for (const collection of await collectionsInConfig()) {
      for (const field of collection.flattenedFields) {
        const f = field as { name?: string; type?: string; admin?: { readOnly?: boolean } }
        if (f.type !== 'number' || !f.admin?.readOnly || !f.name) continue
        const key = `${collection.slug}.${f.name}`
        const accounted =
          (COUNTER_FIELDS as string[]).includes(f.name) || key in NOT_AN_FR020_COUNTER
        if (!accounted) unaccounted.push(key)
      }
    }

    expect(
      unaccounted,
      'a system-maintained number was added with no way to recompute it. Either declare its ' +
        'source in COUNTER_SOURCES (and its field name in CounterField) or list it in ' +
        'NOT_AN_FR020_COUNTER with the reason it is out of FR-020\'s scope',
    ).toEqual([])
  })

  it('watches a real column, so the rot guard is not scanning an empty config', async () => {
    const columns = await counterColumns()
    expect(columns).toContainEqual({ collection: 'projeto', field: 'curtidas' })
  })
})
