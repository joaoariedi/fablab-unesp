import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'

/**
 * T029 / FR-018, CLR-004 — `projeto` writes no rows to `payload-locked-documents`.
 *
 * The leak this closes: `payload-locked-documents` is a Payload-internal collection that our
 * multi-tenant plugin does not scope, and every row in it names a document by collection and
 * id. One lab's editor opening a document therefore publishes that id to every other lab's
 * session. Round 1 of the plan tried to compose access onto it through `onInit`; that API does
 * not exist (`onInit` is `(payload) => void`, a seeding hook).
 *
 * `lockDocuments: false` is the supported per-collection switch, and it deletes the rows
 * rather than filtering them: `checkDocumentLockStatus` reads
 * `const isLockingEnabled = lockDocumentsProp !== false` and returns before it touches the
 * database at all (`payload/dist/utilities/checkDocumentLockStatus.js:11-39`, measured).
 *
 * The strictness matters and is the whole assertion: `lockDocuments` **absent** means locking
 * is ON — Payload's own predicate is `!== false`, so any falsy-but-not-false value (`undefined`
 * from a forgotten flag) leaves the leak wide open. `toBe(false)` is what distinguishes the fix
 * from the omission; `toBeFalsy()` would pass on the bug.
 *
 * The cost, recorded rather than discovered (CLR-004, CHK062): no "someone else is editing
 * this" warning on this collection, so two team members on the shared admin of US7 can
 * overwrite each other silently.
 *
 * Config-shape only, like `projeto.test.ts` — no database. `checkDocumentLockStatus` is not
 * reachable from any of `payload`'s export entry points, so the predicate is reproduced here
 * against the sanitized config rather than driven.
 */

const SLUG = 'projeto'
const LOCKED_DOCUMENTS = 'payload-locked-documents'

const collectionConfig = async (slug: string) => {
  const config = await configPromise
  return config.collections.find((c) => c.slug === slug)
}

describe('projeto opts out of document locking (T029, FR-018, CLR-004)', () => {
  it('still runs against a Payload that HAS the leaky collection', async () => {
    // Without this, the test below would also pass on a Payload that simply dropped
    // `payload-locked-documents` — a different world, in which it asserts nothing.
    expect(
      await collectionConfig(LOCKED_DOCUMENTS),
      `${LOCKED_DOCUMENTS} is not in the sanitized config; this test no longer has a subject`,
    ).toBeDefined()
  })

  it('declares lockDocuments: false, so no row names a projeto id', async () => {
    const collection = await collectionConfig(SLUG)

    expect(
      collection?.lockDocuments,
      `${SLUG} does not disable document locking: every editor who opens one writes a row to ` +
        `${LOCKED_DOCUMENTS}, which the multi-tenant plugin does not scope, so another ` +
        "organization can enumerate this lab's document ids (FR-018, SC-003)",
    ).toBe(false)
  })

  it('fails Payload\'s own isLockingEnabled predicate, which is `!== false`', async () => {
    const collection = await collectionConfig(SLUG)

    // The exact expression from checkDocumentLockStatus.js:12. An omitted flag is `undefined`
    // here, and `undefined !== false` is true — locking on, rows written, leak open.
    const isLockingEnabled = collection?.lockDocuments !== false

    expect(
      isLockingEnabled,
      'Payload would still lock, query and write locked-document rows for this collection',
    ).toBe(false)
  })
})
