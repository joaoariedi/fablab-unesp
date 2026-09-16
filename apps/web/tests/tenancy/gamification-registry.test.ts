import type { CollectionConfig, Field } from 'payload'
import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config.js'
import { isScoped, registeredCollections, SCOPE_REGISTRY } from '../../lib/tenancy/scope-registry.js'
import { seedDataFor } from './fixtures.js'

/**
 * The 005 registry gate (T009 — FR-028).
 *
 * `RegrasXp.ts` and `XpLedger.ts` were authored by T005 and T006 and **neither could register
 * itself**: `payload.config.ts` and `SCOPE_REGISTRY` are single files that parallel agents
 * cannot all write, which is why both files end their docstring naming T009 as the task that
 * wires them. This is the same gate `avatar-registry.test.ts` is for 004 and
 * `content-registry.test.ts` is for 002b, and it exists because `registry.test.ts` diffs the
 * registry against the *config*: a collection that reached neither is invisible to it, so that
 * gate passes vacuously rather than failing.
 *
 * The four are written out **by name**, driven from tasks.md rather than derived from whatever
 * happens to be wired — a list derived from the config would agree with any config at all.
 *
 * T028 added `missao` and `missaoSubmissao` to the table, for the same reason the first two are
 * here: `Missao.ts` and `MissaoSubmissao.ts` were authored by T026 and T027 and neither could
 * register itself, so both end their docstring naming T028 as the task that wires them.
 *
 * No database: this inspects the sanitized config and the fixture table only.
 */
const GAMIFICATION_COLLECTIONS = {
  // FR-009: the economy is per-organization DATA, so a lab retunes it by editing its own row.
  // Global would hand every lab CITe's numbers and make retuning a deploy.
  regrasXp: 'scoped',
  // FR-020 (T028): a mission is a challenge ONE lab publishes for its own makers. Global would
  // put CITe's missions in every lab's Home and let a maker complete a challenge their lab
  // never set — and, through the skill the mission names, credit XP in a catalogue entry that
  // is itself per-organization.
  missao: 'scoped',
  // FR-021/FR-023/FR-036 (T028): a submission carries a maker's proof PHOTO and the review's
  // verdict. Global would expose one lab's uploads to every other lab's review queue, which is
  // the upload trust boundary CLR-006 names; and the `(missao, maker)` unique index of FR-023
  // only means "one per mission per maker" while both halves live inside one lab.
  missaoSubmissao: 'scoped',
  // FR-001/FR-002: the ledger is one lab's history, and its sum is that lab's ranking. Global
  // would let a maker of A read — and be ranked against — the credits of B.
  xpLedger: 'scoped',
} as const

const slugs = Object.keys(GAMIFICATION_COLLECTIONS) as (keyof typeof GAMIFICATION_COLLECTIONS)[]

/**
 * The last collection declared before this feature.
 *
 * "At the END" is asserted against this rather than against `registry.length - 1`, because
 * T028 declares `missao` and `missaoSubmissao` *between* these two (preamble item 5:
 * `regrasXp → missao → missaoSubmissao → xpLedger`). An assertion that these were the final
 * two entries would have to be weakened by that task, and a test another task must weaken is
 * a test nobody trusts.
 */
const LAST_PRE_005_COLLECTION = 'curtida'

/**
 * The declared order of the economy, which is load-bearing rather than tidy — see the order
 * test below. Written out by name for the same reason `GAMIFICATION_COLLECTIONS` is: an order
 * read off the registry would agree with any registry at all.
 */
const ORDEM_ECONOMIA = ['regrasXp', 'missao', 'missaoSubmissao', 'xpLedger'] as const

/** Relationship fields hide inside tabs, groups, arrays and rows — a flat scan misses most. */
const flattenFields = (fields: Field[]): Field[] =>
  fields.flatMap((field) => {
    const nested: Field[] = []
    if ('fields' in field && Array.isArray(field.fields)) nested.push(...flattenFields(field.fields))
    if ('tabs' in field && Array.isArray(field.tabs)) {
      nested.push(...flattenFields(field.tabs.flatMap((tab) => tab.fields)))
    }
    return [field, ...nested]
  })

const relationshipTargets = (field: Field): string[] => {
  if (field.type !== 'relationship' && field.type !== 'upload') return []
  const { relationTo } = field as { relationTo: string | string[] }
  return Array.isArray(relationTo) ? relationTo : [relationTo]
}

const collectionsBySlug = async (): Promise<Map<string, CollectionConfig>> => {
  const config = await configPromise
  return new Map(config.collections.map((c) => [c.slug, c as unknown as CollectionConfig]))
}

describe('005 economy collections are declared and registered (T009/T028, FR-028)', () => {
  it('declares each in SCOPE_REGISTRY with a non-empty reason', () => {
    const missing = slugs.filter((slug) => !(slug in SCOPE_REGISTRY))
    expect(
      missing,
      `Missing from SCOPE_REGISTRY: ${missing.join(', ')}. Every collection is declared ` +
        `'scoped' or 'global' with a one-line justification (FR-028).`,
    ).toEqual([])

    for (const slug of slugs.filter((s) => s in SCOPE_REGISTRY)) {
      const entry = SCOPE_REGISTRY[slug as keyof typeof SCOPE_REGISTRY] as { why: string }
      expect(entry.why.trim().length, `${slug} has an empty 'why'`).toBeGreaterThan(0)
    }
  })

  it('gives each the scope FR-028 fixed, not merely some scope', () => {
    // The direction with a cost attached. A global `xpLedger` is one lab reading another's
    // whole history; a global `regrasXp` is one economy imposed on every lab, which is exactly
    // what CLR-010 decided against. "Is it declared at all" sees neither.
    const wrong = slugs
      .filter((slug) => slug in SCOPE_REGISTRY)
      .filter((slug) => isScoped(slug) !== (GAMIFICATION_COLLECTIONS[slug] === 'scoped'))
    expect(
      wrong,
      `Declared with the wrong scope: ${wrong
        .map((slug) => `${slug} (expected ${GAMIFICATION_COLLECTIONS[slug]})`)
        .join(', ')}.`,
    ).toEqual([])
  })

  it('declares each at the END, after every collection that pre-dates this feature', () => {
    const order = [...registeredCollections()] as string[]
    const last = order.indexOf(LAST_PRE_005_COLLECTION)
    expect(last, `${LAST_PRE_005_COLLECTION} is not in the registry at all`).toBeGreaterThan(-1)

    for (const slug of slugs) {
      const at = order.indexOf(slug)
      expect(at, `${slug} is not in the registry at all`).toBeGreaterThan(-1)
      expect(
        at,
        `${slug} is declared at ${at}, ahead of ${LAST_PRE_005_COLLECTION} at ${last}. The ` +
          `four new collections go at the END (preamble item 5): seeding walks the registry ` +
          `forward, so a collection inserted early is seeded before the rows it points at exist.`,
      ).toBeGreaterThan(last)
    }
  })

  it('declares the four in the order `regrasXp → missao → missaoSubmissao → xpLedger`', () => {
    // `fixtures.ts` seeds in registry order and `resetWorld` deletes in REVERSE, so a
    // collection may only be related to by one declared later. Feature 002 paid for this once:
    // a media collection declared after `projeto` broke `resetWorld`, which threw in
    // `beforeAll` and reported 160 tests as *skipped* rather than one as failed (item 4).
    //
    // Asserted as the whole sequence rather than as one pair, because T028 inserts two
    // collections INTO it: `missaoSubmissao.missao` points at `missao`, so a submission
    // declared first is a submission `resetWorld` deletes after the mission it names — the
    // foreign key refuses, inside `beforeAll`, and the directory reports as skipped.
    const order = [...registeredCollections()] as string[]
    const positions = ORDEM_ECONOMIA.map((slug) => ({ slug, at: order.indexOf(slug) }))
    const shown = positions.map(({ slug, at }) => `${slug}@${at}`).join(', ')

    // Without this the walk below would report a clean order over an empty list — the vacuous
    // pass this whole file exists to prevent.
    expect(positions.length, 'the declared economy order is empty').toBe(ORDEM_ECONOMIA.length)

    let anterior: { slug: string; at: number } | undefined
    for (const atual of positions) {
      expect(atual.at, `${atual.slug} is not in the registry at all (${shown})`).toBeGreaterThan(-1)
      if (anterior) {
        expect(
          atual.at,
          `${atual.slug} is declared before ${anterior.slug} (${shown}). The economy is ` +
            `declared ${ORDEM_ECONOMIA.join(' → ')}: everything else reads the rules row, a ` +
            `submission names a mission, and a ledger entry names the profile and skill above.`,
        ).toBeGreaterThan(anterior.at)
      }
      anterior = atual
    }
  })

  it('walks backwards: every collection they point at is declared EARLIER', async () => {
    // Asked of the CONFIG, not of a hand-kept list of which collection depends on which
    // (preamble item 2). `xpLedger.perfil` → `perfilMaker`, `xpLedger.skill` → `skill` and
    // `missaoSubmissao.missao` → `missao` are the pairs today; a field added tomorrow is
    // covered without editing this test.
    const bySlug = await collectionsBySlug()
    const order = [...registeredCollections()] as string[]
    const backwards: string[] = []
    let examined = 0

    for (const slug of slugs) {
      const collection = bySlug.get(slug)
      if (!collection) continue
      for (const field of flattenFields(collection.fields)) {
        const name = 'name' in field ? String(field.name) : '(unnamed)'
        for (const target of relationshipTargets(field)) {
          if (!order.includes(target)) continue
          examined += 1
          if (order.indexOf(target) > order.indexOf(slug)) {
            backwards.push(`${slug}.${name} -> ${target}`)
          }
        }
      }
    }

    // Without this the loop would report a clean walk of nothing the day the collections stop
    // reaching the config — the vacuous pass this whole file exists to prevent.
    expect(
      examined,
      'no relationship to a registered collection was examined at all — the walk ran over an ' +
        'empty set, so its verdict means nothing.',
    ).toBeGreaterThan(0)

    expect(
      backwards,
      `Declared before the row it points at: ${backwards.join(', ')}. resetWorld deletes in ` +
        `reverse registry order, so it would delete the referenced row while the referrer ` +
        `still names it and Postgres refuses on the foreign key — inside beforeAll, which ` +
        `reports the whole directory as skipped.`,
    ).toEqual([])
  })

  it('registers each in payload.config.ts, tenant field injected (FR-028)', async () => {
    const bySlug = await collectionsBySlug()

    const absent = slugs.filter((slug) => !bySlug.has(slug))
    expect(
      absent,
      `Collection file exists but is not in payload.config.ts: ${absent.join(', ')}. ` +
        `An unregistered collection makes registry.test.ts pass vacuously.`,
    ).toEqual([])

    const untenanted = slugs
      .filter((slug) => bySlug.has(slug))
      .filter((slug) => !bySlug.get(slug)?.fields.some((f) => 'name' in f && f.name === 'tenant'))
    expect(
      untenanted,
      `No plugin-injected 'tenant' field: ${untenanted.join(', ')}. Add each to the ` +
        `multiTenantPlugin 'collections' map — without it the collection has no tenant column ` +
        `and scopedAccess() constrains on a field that does not exist.`,
    ).toEqual([])
  })

  it('gives the fixture seed data for each, so beforeAll cannot swallow the gap', () => {
    // `buildWorld` seeds a row of EVERY scoped collection, and `seedDataFor` throws for one it
    // has no entry for. That throw inside `beforeAll` aborts the file and reports its tests as
    // *skipped* rather than failed — 160 tests went quiet that way in 002 (preamble item 4).
    // Called here, with no database, it fails one assertion loudly instead.
    for (const slug of slugs.filter((s) => GAMIFICATION_COLLECTIONS[s] === 'scoped')) {
      expect(
        () => seedDataFor(slug, 'A', 1, { perfilMaker: 1, skill: 1, projeto: 1, midiaImagem: 1, missao: 1 }),
        `fixtures.ts has no seed data for ${slug}`,
      ).not.toThrow()
    }
  })
})
