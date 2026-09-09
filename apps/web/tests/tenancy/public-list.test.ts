import { flattenAllFields } from 'payload'
import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config.js'
import type { PublishableCollection } from '../../lib/tenancy/public-payload.js'
import {
  publicListCollections,
  publicListReason,
  type ScopeEntry,
  type ScopeRegistryLike,
  SCOPE_REGISTRY,
} from '../../lib/tenancy/scope-registry.js'

/**
 * The `publicList` rot guard (FR-002, SC-012, T003).
 *
 * `publicList` is the one way past `assertPubliclyReadable` that is **not** derived from the
 * config — somebody writes a sentence and an anonymous visitor may then enumerate that
 * collection with the tenant constraint and **no status filter**. That is precisely the shape
 * of the feature-002 leak, so the declaration is the thing most worth guarding, and the plan
 * names the failure mode it guards against: "`publicList` becomes a habit — the 002 leak,
 * reintroduced one collection at a time".
 *
 * Two properties, and the second is the load-bearing one:
 *
 *   1. **The reason is non-empty.** `publicList: ''` type-checks, satisfies every accessor, and
 *      admits the collection just as widely as a real justification would — while looking, in a
 *      diff, like somebody thought about it. `publicListCollections` deliberately reports an
 *      empty string as declared (see its docstring) so this guard can see it at all.
 *   2. **It declares no queryable `status`.** A collection with one is *publishable*: the
 *      derived path filters it to `publicado` and drafts stay private. Declaring `publicList`
 *      on it instead does not add a second door — it takes the filter **off**, because
 *      `publicWhere` returns a status clause only for a member of `PUBLISHABLE`, and a
 *      collection that is both is served unfiltered the moment its status field is removed or
 *      renamed. "It should be publishable instead" is not style advice; it is the difference
 *      between drafts being private and drafts being public.
 *
 * **Why the guard is a function over an injected registry and config.** The subject that
 * matters is the shipped pair, but no collection declares `publicList` until T004 — so a bare
 * loop over `SCOPE_REGISTRY` would pass today by iterating nothing, which is exactly the
 * vacuous gate `registry.test.ts` already calls out ("the isolation harness would pass
 * vacuously"). The hand-built cases below are what prove the guard has teeth; the last case
 * points the *same* function at the real registry and the real Payload config, so the fixtures
 * can never drift into testing a private universe.
 */

/**
 * Every way this registry's `publicList` declarations are wrong, as sentences.
 *
 * Sentences rather than slugs because the message *is* the gate's output: a contributor who
 * trips this reads it instead of the test, so it has to name the collection, the problem and
 * the remedy. Returns `[]` for a registry that is clean.
 */
const publicListViolations = (
  registry: ScopeRegistryLike,
  collections: readonly PublishableCollection[],
): string[] =>
  publicListCollections(registry).flatMap((slug) => {
    const problems: string[] = []
    const reason = publicListReason(slug, registry)
    const collection = collections.find((candidate) => candidate.slug === slug)

    if ((reason ?? '').trim().length === 0) {
      problems.push(
        `${slug}: declares publicList with an empty reason. The declaration is a sentence ` +
          `somebody has to defend — write why an anonymous visitor may enumerate it, or drop it.`,
      )
    }

    // A slug the config does not carry would sail through the status check below on an empty
    // field list — the guard would report nothing about the one collection it could not look
    // at. `registry.test.ts` fails an orphaned entry too, but a guard that fails open when its
    // subject is missing is not one this file may rely on somebody else keeping honest.
    if (!collection) {
      problems.push(
        `${slug}: declares publicList but no collection in the Payload config has that slug, ` +
          `so its status field cannot be checked at all. Remove the entry or fix the slug.`,
      )
      return problems
    }

    // Payload's own flattening is the oracle, for the reason `declaresQueryableStatus` gives in
    // public-payload.ts: a walk of our own missed the unnamed group, whose `status` is queryable
    // as `status`. The question is whether `{ status: { equals: … } }` addresses a real field —
    // not whether the string appears in the config.
    const hasQueryableStatus = flattenAllFields({ fields: collection.fields as never }).some(
      (field) => field.name === 'status',
    )
    if (hasQueryableStatus) {
      problems.push(
        `${slug}: declares publicList AND a queryable status field. It should be publishable ` +
          `instead — publicList serves it with no published-only filter, so every draft in it ` +
          `is public. Drop the publicList declaration; the derived publishable set already ` +
          `admits it, filtered to 'publicado'.`,
      )
    }

    return problems
  })

describe('the publicList rot guard (FR-002, SC-012)', () => {
  const declaredBothWays = {
    categoriaProjeto: {
      scope: 'scoped',
      why: 'vocabulary',
      publicList: 'the listing tabs enumerate every category of this organization',
    },
  } satisfies Record<string, ScopeEntry>

  it('reports a collection declared both ways — publicList AND a queryable status', () => {
    // The planted violation the task requires, and the one this file was watched red against:
    // a declaration that silently removes the published-only filter from a collection that has
    // one to remove.
    const violations = publicListViolations(declaredBothWays, [
      { slug: 'categoriaProjeto', fields: [{ name: 'status', type: 'select' }] },
    ])

    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatch(/categoriaProjeto/)
    expect(violations[0], 'the message must say publishable is the remedy').toMatch(
      /publishable instead/,
    )
  })

  it('sees a status Payload flattens out of an unnamed group', () => {
    // `{ status: { equals: … } }` addresses this field, so the collection is publishable and
    // the declaration is just as wrong — a walk that only looked at top-level `name`s would
    // report the collection clean and hand its drafts to anonymous readers.
    const violations = publicListViolations(declaredBothWays, [
      { slug: 'categoriaProjeto', fields: [{ type: 'group', fields: [{ name: 'status' }] }] },
    ])

    expect(violations, violations.join('\n')).toHaveLength(1)
    expect(violations[0]).toMatch(/publishable instead/)
  })

  it('ignores a status nested under a NAMED group — that field is meta.status', () => {
    // The opposite direction, and it fails closed rather than open: a named group makes the
    // path `meta.status`, which no published-only filter would ever match. Flagging it would
    // send a contributor to remove a legitimate declaration.
    const violations = publicListViolations(declaredBothWays, [
      {
        slug: 'categoriaProjeto',
        fields: [{ name: 'meta', type: 'group', fields: [{ name: 'status' }] }],
      },
    ])

    expect(violations, violations.join('\n')).toEqual([])
  })

  it('reports a declaration whose reason is empty or blank', () => {
    // `publicList: ''` satisfies every accessor and admits the collection exactly as widely as
    // a real sentence would, while reading in a diff like somebody justified it.
    for (const reason of ['', '   ']) {
      const registry = {
        categoriaProjeto: { scope: 'scoped', why: 'vocabulary', publicList: reason },
      } satisfies Record<string, ScopeEntry>

      const violations = publicListViolations(registry, [
        { slug: 'categoriaProjeto', fields: [{ name: 'nome', type: 'text' }] },
      ])

      expect(violations, `reason ${JSON.stringify(reason)} was accepted`).toHaveLength(1)
      expect(violations[0]).toMatch(/empty reason/)
    }
  })

  it('reports a declaration for a slug no collection in the config carries', () => {
    const violations = publicListViolations(
      { fantasma: { scope: 'scoped', why: 'gone', publicList: 'reads its tabs' } },
      [{ slug: 'categoriaProjeto', fields: [] }],
    )

    expect(violations, violations.join('\n')).toHaveLength(1)
    expect(violations[0]).toMatch(/no collection in the Payload config/)
  })

  it('reports nothing for a collection declared the way the four categories are', () => {
    // The negative control. Without it every case above would still pass for a guard that
    // reported a violation for absolutely everything.
    const violations = publicListViolations(declaredBothWays, [
      { slug: 'categoriaProjeto', fields: [{ name: 'nome', type: 'text' }] },
    ])

    expect(violations, violations.join('\n')).toEqual([])
  })

  it('catches a REAL collection declared both ways, against the real config', async () => {
    // The fixtures above prove the function; this proves the arguments the last case passes it.
    // `projeto` carries a real `status` inside a real sanitized config, so lending it a
    // `publicList` reason is the whole 002 leak in one line — and the guard has to see it
    // through Payload's own flattening, not through a hand-built two-field fixture.
    const config = await configPromise
    const asIfDeclared = {
      ...SCOPE_REGISTRY,
      projeto: { ...SCOPE_REGISTRY.projeto, publicList: 'the listing enumerates projects' },
    }
    const violations = publicListViolations(asIfDeclared, config.collections)

    expect(violations, 'the guard cannot see a status field on the real config').toHaveLength(1)
    expect(violations[0]).toMatch(/^projeto: declares publicList AND a queryable status/)
  })

  it('holds for the shipped registry and the real Payload config', async () => {
    // The subject that actually matters. It is empty until T004 declares the first four, and
    // the fixtures above are what stop that emptiness from being mistaken for a passing gate.
    const config = await configPromise
    const violations = publicListViolations(SCOPE_REGISTRY, config.collections)

    expect(violations, violations.join('\n')).toEqual([])
  })
})
