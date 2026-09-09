import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config.js'
import {
  isPayloadInternal,
  isScoped,
  PAYLOAD_INTERNAL_COLLECTIONS,
  publicListCollections,
  publicListReason,
  registeredCollections,
  type ScopeEntry,
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

/**
 * The public-list declaration (FR-002, T001).
 *
 * `publicList` is the reason an anonymous visitor may **enumerate** a collection — the filter
 * vocabularies a listing page reads directly. It is a sentence rather than a boolean for the
 * same reason `why` is: a declaration nobody had to justify is one nobody has to defend.
 *
 * The registry seam is injected here for the reason `public-payload.ts` injects `publishable`:
 * no shipped collection declares `publicList` yet (T004 is the task that declares the first
 * four), so a hand-built registry is the only vantage point from which the accessor's answer
 * can be observed at all. The last case pins the accessors to the **real** registry, so the
 * fake can never drift into testing a private universe.
 */
describe('public-list declarations', () => {
  const fake = {
    categoriaFake: {
      scope: 'scoped',
      why: 'reference data',
      publicList: 'the listing tabs enumerate every category of this organization',
    },
    /**
     * Declared with an EMPTY reason, on purpose.
     *
     * `publicListCollections` filters on `!== undefined`, not on truthiness, and that
     * distinction is the whole point: an empty reason is still a declaration, so T003's
     * non-empty-reason guard has to be able to SEE it. Without this entry, mutating the filter
     * to `Boolean(entry.publicList)` survived — and under that mutation the rot guard would
     * iterate straight past the one case it exists to catch, passing vacuously.
     */
    vazioFake: { scope: 'scoped', why: 'declared with no reason at all', publicList: '' },
    projetoFake: { scope: 'scoped', why: 'content, reached with a published-only filter' },
    usuarioFake: { scope: 'global', why: 'platform-wide identity' },
  } satisfies Record<string, ScopeEntry>

  it('reads the reason a collection may be listed anonymously', () => {
    expect(publicListReason('categoriaFake', fake)).toBe(
      'the listing tabs enumerate every category of this organization',
    )
  })

  it('answers undefined for a collection that declared nothing — deny is the default', () => {
    // The direction that matters: an undeclared collection, and an unregistered slug, must
    // both look exactly like a refusal to the caller. Anything else re-opens the 002 leak.
    expect(publicListReason('projetoFake', fake)).toBeUndefined()
    expect(publicListReason('usuarioFake', fake)).toBeUndefined()
    expect(publicListReason('naoRegistrado', fake)).toBeUndefined()
  })

  it('enumerates exactly the collections that declared one', () => {
    // `vazioFake` is included on purpose: membership is "declared it at all", never "declared
    // it with a non-empty reason". T003's rot guard is what rejects an empty reason, and it can
    // only do that if this accessor hands it the entry in the first place. Mutating the filter
    // to `Boolean(entry.publicList)` drops `vazioFake` here and makes that guard vacuous.
    expect(publicListCollections(fake)).toEqual(['categoriaFake', 'vazioFake'])
    expect(
      publicListReason('vazioFake', fake),
      'an empty reason must read as the empty string, not as undefined — the difference is ' +
        'exactly what separates "declared badly" from "not declared"',
    ).toBe('')
  })

  it('answers for the shipped registry, not only for a fake one', () => {
    for (const slug of registeredCollections()) {
      expect(publicListReason(slug), `${slug}`).toBe((SCOPE_REGISTRY[slug] as ScopeEntry).publicList)
    }
    expect(publicListCollections()).toEqual(
      registeredCollections().filter((slug) => publicListReason(slug) !== undefined),
    )
  })

  it('declares exactly the four collections a page LISTS, and no more', () => {
    // The assertion above restates the accessor against a direct read of the same field, so it
    // proves the plumbing and not the decision. THIS is the decision, and it is the one with a
    // security consequence: every entry here is a collection an anonymous visitor may enumerate
    // in full, with no published-only filter.
    //
    // The four are the ones a page enumerates — the filter vocabularies and the machine select.
    // Everything else the pages render is reached by POPULATING a published document, which the
    // gate does not re-check, so it needs no declaration and must not be given one. Declaring
    // `midiaImagem` here would make every draft's files enumerable; declaring `perfilMaker`
    // would list the members of the lab. Neither is hypothetical — the 002 leak was exactly
    // this shape, one collection at a time.
    expect(publicListCollections()).toEqual([
      'categoriaProjeto',
      'categoriaArtigo',
      'categoriaModelo',
      'maquina',
    ])
  })
})
