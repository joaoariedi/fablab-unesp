import type { CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config.js'
import { scopedCollections } from '../../lib/tenancy/scope-registry.js'

/**
 * T045 / FR-018, SC-003, CLR-004 — no scoped collection may put a row in
 * `payload-locked-documents`.
 *
 * The leak feature 000 escalated in writing and deferred here: `payload-locked-documents` is a
 * Payload-internal collection that the multi-tenant plugin does not scope, and every row in it
 * names a document by collection **and id**. One lab's editor opening a document therefore
 * publishes that document's id to every other lab's session — enumeration of another
 * organization's content, straight through an internal collection nobody authored.
 *
 * Round 1 of the plan tried to compose access onto that collection through `onInit`; that API
 * does not exist (`onInit` is `(payload) => void`, a seeding hook). The closure the plan
 * settled on is `lockDocuments: false` **per scoped collection**: it removes the rows rather
 * than filtering them, because `checkDocumentLockStatus` reads
 * `const isLockingEnabled = lockDocumentsProp !== false` and returns before it touches the
 * database at all (`payload/dist/utilities/checkDocumentLockStatus.js:11-39`, measured).
 *
 * `projeto-lock-documents.test.ts` and `content-registry.test.ts` already pin the flag on
 * `projeto` and on the eleven 002b content collections. Neither covers the collection that
 * *forgets* it, which is the whole risk: locking is ON by default, so the leak reopens by
 * omission, not by edit. This gate is therefore driven from `scopedCollections()` rather than
 * from a hand-written list — a scoped collection added in 2027 is covered the moment it enters
 * the registry, with no second place to remember.
 *
 * Config-shape, like the tests it generalises: `checkDocumentLockStatus` is not reachable from
 * any of `payload`'s export entry points, and no server-side operation writes lock rows on its
 * own (the admin client POSTs them), so the predicate is reproduced here against the sanitized
 * config rather than driven through a request.
 *
 * The cost is recorded rather than discovered (CLR-004, CHK062): no "someone else is editing
 * this" warning on any scoped collection, so two team members on the shared admin of US7 can
 * overwrite each other silently.
 */

const LOCKED_DOCUMENTS = 'payload-locked-documents'

const collectionsBySlug = async (): Promise<Map<string, CollectionConfig>> => {
  const config = await configPromise
  return new Map(config.collections.map((c) => [c.slug, c as unknown as CollectionConfig]))
}

describe('no scoped collection can be named in payload-locked-documents (T045, FR-018, SC-003)', () => {
  it('still runs against a Payload that HAS the leaky collection', async () => {
    // Without this, every assertion below would also pass on a Payload that simply dropped
    // `payload-locked-documents` — a different world, in which they assert nothing.
    const bySlug = await collectionsBySlug()
    expect(
      bySlug.get(LOCKED_DOCUMENTS),
      `${LOCKED_DOCUMENTS} is not in the sanitized config; this gate has no subject left`,
    ).toBeDefined()
  })

  it('has no tenant field on that collection — nothing filters its rows (CLR-004)', async () => {
    const bySlug = await collectionsBySlug()
    const locked = bySlug.get(LOCKED_DOCUMENTS)
    const tenantField = locked?.fields.find((f) => 'name' in f && f.name === 'tenant')

    // The premise of the whole task. If Payload or the plugin ever DOES scope this collection,
    // this fails — and that failure is the signal to revisit CLR-004's trade-off and get the
    // admin's edit-lock warning back, rather than to delete the line.
    expect(
      tenantField,
      `${LOCKED_DOCUMENTS} now carries a tenant field: the plugin may be scoping it after all, ` +
        `so CLR-004's cost (no "someone else is editing this" warning) may no longer be necessary`,
    ).toBeUndefined()
  })

  it('registers every scoped collection, so the check below is not vacuous', async () => {
    const bySlug = await collectionsBySlug()
    const unregistered = scopedCollections().filter((slug) => !bySlug.has(slug))

    // A registry entry with no collection in the config would read as `lockDocuments:
    // undefined` below and be reported as a leak with a misleading message. Fail it here,
    // where the message names the real problem.
    expect(
      unregistered,
      `Declared 'scoped' in SCOPE_REGISTRY but absent from payload.config.ts: ` +
        `${unregistered.join(', ')}`,
    ).toEqual([])
  })

  it('turns document locking off on EVERY scoped collection, not just the content ones', async () => {
    const bySlug = await collectionsBySlug()
    const locking = scopedCollections().filter(
      // Payload's exact predicate (`checkDocumentLockStatus.js:12`). `!== false` is the
      // assertion, not `toBeFalsy()`: an omitted flag is `undefined` here, and
      // `undefined !== false` is true — locking on, rows written, leak open. Strictness is
      // what distinguishes the fix from the omission.
      (slug) => bySlug.get(slug)?.lockDocuments !== false,
    )

    expect(
      locking,
      `lockDocuments is not false on scoped collection(s): ${locking.join(', ')}. Every editor ` +
        `who opens one writes a row to ${LOCKED_DOCUMENTS}, which the multi-tenant plugin does ` +
        `not scope, so another organization can enumerate this lab's document ids ` +
        `(FR-018, SC-003, CLR-004).`,
    ).toEqual([])
  })
})
