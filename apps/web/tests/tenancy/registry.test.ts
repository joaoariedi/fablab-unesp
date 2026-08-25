import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config.js'
import {
  isPayloadInternal,
  isScoped,
  PAYLOAD_INTERNAL_COLLECTIONS,
  registeredCollections,
  scopedCollections,
  SCOPE_REGISTRY,
} from '../../lib/tenancy/scope-registry.js'

/**
 * The scope-registry gate (FR-018, SC-004).
 *
 * This test is the reason the registry is worth having. It diffs the registry against the
 * Payload config in **both** directions, so neither "added a collection and forgot to
 * register it" nor "deleted a collection and left it registered" can merge. A one-direction
 * check would let the canary be deleted while the harness still believed it had a subject.
 *
 * No database required — it inspects the sanitized config only.
 */
describe('scope registry', () => {
  it('registers every collection in the Payload config', async () => {
    const config = await configPromise
    const configured = config.collections
      .map((c) => c.slug)
      .filter((slug) => !isPayloadInternal(slug))
      .sort()
    const registered: string[] = [...registeredCollections()].sort()

    const unregistered = configured.filter((slug) => !registered.includes(slug))
    expect(
      unregistered,
      `Collection(s) missing from SCOPE_REGISTRY: ${unregistered.join(', ')}. ` +
        `Declare each as 'scoped' or 'global' in lib/tenancy/scope-registry.ts with a reason.`,
    ).toEqual([])
  })

  it('has no registry entry without a matching collection', async () => {
    const config = await configPromise
    const configured = config.collections.map((c) => c.slug)
    const orphaned = registeredCollections().filter((slug) => !configured.includes(slug))

    expect(
      orphaned,
      `SCOPE_REGISTRY names collection(s) that no longer exist: ${orphaned.join(', ')}. ` +
        `Removing a collection must also remove its registry entry — that diff is the review signal.`,
    ).toEqual([])
  })

  it('gives every entry a non-empty justification', () => {
    for (const [slug, entry] of Object.entries(SCOPE_REGISTRY)) {
      expect(entry.why.trim().length, `${slug} has an empty 'why'`).toBeGreaterThan(0)
    }
  })

  it('declares at least one scoped collection', () => {
    // FR-028 / N11. Without a scoped collection the isolation harness iterates an empty set
    // and passes while testing nothing — the exact defect review round 1 caught.
    expect(
      scopedCollections().length,
      'No scoped collections: the isolation harness would pass vacuously.',
    ).toBeGreaterThan(0)
  })

  it('knows every Payload-internal collection this version creates', async () => {
    // A future Payload upgrade that adds an internal collection must be noticed, not
    // absorbed by a prefix wildcard: two of these reference our documents and are a real
    // isolation surface (see the note in scope-registry.ts).
    const config = await configPromise
    const internal = config.collections
      .map((c) => c.slug)
      .filter((slug) => slug.startsWith('payload-'))
      .sort()

    expect(
      internal,
      'Payload-internal collections changed. Review whether the new one exposes tenant data, ' +
        'then update PAYLOAD_INTERNAL_COLLECTIONS.',
    ).toEqual([...PAYLOAD_INTERNAL_COLLECTIONS].sort())
  })

  it('marks exactly the plugin-scoped collections as scoped', async () => {
    const config = await configPromise
    // The multi-tenant plugin injects a `tenant` field into every collection it scopes.
    // If the registry and the plugin disagree, one of them is lying about the threat model.
    for (const collection of config.collections.filter((c) => !isPayloadInternal(c.slug))) {
      const hasTenantField = collection.fields.some(
        (f) => 'name' in f && f.name === 'tenant',
      )
      expect(
        hasTenantField,
        `${collection.slug}: registry says scoped=${isScoped(collection.slug)} but ` +
          `plugin-injected tenant field present=${hasTenantField}`,
      ).toBe(isScoped(collection.slug))
    }
  })
})
