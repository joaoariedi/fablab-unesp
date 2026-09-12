import type { CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config.js'
import { isScoped, registeredCollections, SCOPE_REGISTRY } from '../../lib/tenancy/scope-registry.js'
import { seedDataFor } from './fixtures.js'

/**
 * The 004 integration gate (T008 — FR-027, SC-006).
 *
 * T005, T006 and T007 authored four collection files in parallel and **none of them could
 * register itself**: `payload.config.ts` and `SCOPE_REGISTRY` are single files that parallel
 * agents cannot all write, which is why every one of those files ends its docstring by naming
 * T008 as the task that wires it.
 *
 * The list below is written out **by name**, driven from the plan's Data Model table rather
 * than derived from whatever happens to be wired. That is the whole point: `registry.test.ts`
 * diffs the registry against the *config*, so a collection that reached neither is invisible
 * to it — the gate passes vacuously, exactly as 002 measured when eleven collections landed
 * at once (`content-registry.test.ts` is the same guard for that batch).
 *
 * No database: this inspects the sanitized config and the fixture table only.
 */
const FEATURE_004_COLLECTIONS = {
  // CLR-001: one designer's art, identical for every lab. Scoping them would mean seeding
  // ~100 rows per organization for a catalogue nobody varies.
  tomDePele: 'global',
  tomDeCabelo: 'global',
  avatarItem: 'global',
  // The exception the PO decided on 2026-08-24: the catalogue is administrable per
  // organization, so CITe's five are a seed rather than the platform's vocabulary.
  skill: 'scoped',
} as const

const slugs = Object.keys(FEATURE_004_COLLECTIONS) as (keyof typeof FEATURE_004_COLLECTIONS)[]

const collectionsBySlug = async (): Promise<Map<string, CollectionConfig>> => {
  const config = await configPromise
  return new Map(config.collections.map((c) => [c.slug, c as unknown as CollectionConfig]))
}

describe('004 collections are declared and registered (T008)', () => {
  it('declares each in SCOPE_REGISTRY with a non-empty reason (FR-027, SC-006)', () => {
    const missing = slugs.filter((slug) => !(slug in SCOPE_REGISTRY))
    expect(
      missing,
      `Missing from SCOPE_REGISTRY: ${missing.join(', ')}. Every collection is declared ` +
        `'scoped' or 'global' with a one-line justification (FR-027).`,
    ).toEqual([])

    for (const slug of slugs.filter((s) => s in SCOPE_REGISTRY)) {
      const entry = SCOPE_REGISTRY[slug as keyof typeof SCOPE_REGISTRY]
      expect((entry as { why: string }).why.trim().length, `${slug} has an empty 'why'`).
        toBeGreaterThan(0)
    }
  })

  it('gives each the scope the plan fixed, not merely some scope (CLR-001)', () => {
    // The direction with a cost attached. Declaring `skill` global would impose CITe's
    // catalogue on the second lab; declaring a palette scoped would mean 30 rows per
    // organization of art nobody varies. A "is it declared at all" check sees neither.
    const wrong = slugs
      .filter((slug) => slug in SCOPE_REGISTRY)
      .filter((slug) => isScoped(slug) !== (FEATURE_004_COLLECTIONS[slug] === 'scoped'))
    expect(
      wrong,
      `Declared with the wrong scope: ${wrong
        .map((slug) => `${slug} (expected ${FEATURE_004_COLLECTIONS[slug]})`)
        .join(', ')}.`,
    ).toEqual([])
  })

  it('declares `skill` BEFORE `perfilMaker`, because the order is load-bearing', () => {
    // `fixtures.ts` seeds in registry order and `resetWorld` deletes in REVERSE, so a
    // collection may only be related to by one declared later. T009 gives `perfilMaker` a
    // `skills` array pointing here. Feature 002 paid for this once: a media collection
    // declared after `projeto` broke `resetWorld`, which threw in `beforeAll` and reported
    // 160 tests as *skipped* rather than one as failed (preamble item 1).
    const order = registeredCollections()
    const skill = order.indexOf('skill' as never)
    const perfil = order.indexOf('perfilMaker' as never)
    expect(skill, '`skill` is not in the registry at all').toBeGreaterThan(-1)
    expect(
      skill,
      `skill is declared at ${skill} and perfilMaker at ${perfil}: the referrer must come ` +
        `AFTER the row it points at, or resetWorld deletes the skill while a profile still ` +
        `names it and Postgres refuses on the foreign key.`,
    ).toBeLessThan(perfil)
  })

  it('registers each in payload.config.ts (FR-027)', async () => {
    const bySlug = await collectionsBySlug()
    const absent = slugs.filter((slug) => !bySlug.has(slug))
    expect(
      absent,
      `Collection file exists but is not in payload.config.ts: ${absent.join(', ')}. ` +
        `An unregistered collection makes registry.test.ts pass vacuously.`,
    ).toEqual([])
  })

  it('tenant-injects exactly the scoped one — and leaves the three global ones alone', async () => {
    // Both directions. A global collection listed in the multiTenantPlugin map would grow a
    // tenant column it has no business carrying and would then be invisible to a lab that is
    // not the one that seeded it; a scoped collection left OUT of that map carries no tenant
    // column at all, and `scopedAccess()` would constrain on a field that does not exist.
    const bySlug = await collectionsBySlug()
    for (const slug of slugs.filter((s) => bySlug.has(s))) {
      const hasTenant = Boolean(
        bySlug.get(slug)?.fields.some((f) => 'name' in f && f.name === 'tenant'),
      )
      expect(
        hasTenant,
        `${slug}: declared ${FEATURE_004_COLLECTIONS[slug]} but plugin-injected tenant ` +
          `field present=${hasTenant}. Add a scoped collection to the multiTenantPlugin ` +
          `'collections' map; never add a global one.`,
      ).toBe(FEATURE_004_COLLECTIONS[slug] === 'scoped')
    }
  })

  it('turns edit locking off on the scoped one (CLR-004)', async () => {
    // `payload-locked-documents` is not scoped by the plugin and each row names a document by
    // collection and id, so a lockable scoped collection hands another organization an
    // enumerable reference to our document ids. Locking is ON by default — the predicate is
    // `lockDocuments !== false` — so this reopens by omission, not by edit.
    const bySlug = await collectionsBySlug()
    expect(bySlug.get('skill')?.lockDocuments, 'skill: lockDocuments is not false').toBe(false)
  })
})

describe('the fixture seed covers the new scoped collection (T008, preamble item 1)', () => {
  it('has seed data for `skill`', () => {
    // Without this the harness does not merely skip `skill`: `seedDataFor` THROWS, the throw
    // happens inside `buildWorld` under `beforeAll`, and a `beforeAll` throw aborts the file
    // and reports its tests as **skipped** rather than failed. That is how 160 tests went
    // quiet in 002 — the failure mode this task's row exists to warn about.
    expect(() =>
      seedDataFor('skill', 'A', 1, { midiaImagem: 1, categoriaProjeto: 1, perfilMaker: 1 }),
    ).not.toThrow()
  })

  it('seeds a row that satisfies the collection\'s own required fields', () => {
    // A seed that returns `{}` would not throw above and would still abort the harness — this
    // time inside `payload.create`, with the same beforeAll/skipped signature.
    const row = seedDataFor('skill', 'A', 1, {}) as Record<string, unknown>
    expect(Object.keys(row).sort(), 'skill seed is missing a required column').toEqual(
      ['ativa', 'nome', 'slug'].sort(),
    )
    expect(typeof row.nome).toBe('string')
    expect(typeof row.slug).toBe('string')
    expect(typeof row.ativa).toBe('boolean')
  })

  it('gives the two organizations distinguishable rows', () => {
    // The marker is what makes a failure message name WHICH organization's row leaked. Two
    // identical rows would pass every isolation assertion that compares tenants and tell the
    // reader nothing when one of them shows up on the wrong side.
    const a = seedDataFor('skill', 'A', 1, {}) as { nome: string; slug: string }
    const b = seedDataFor('skill', 'B', 2, {}) as { nome: string; slug: string }
    expect(a.nome).not.toBe(b.nome)
    expect(a.slug).not.toBe(b.slug)
  })
})
