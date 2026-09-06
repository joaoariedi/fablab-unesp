import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'
import { canPublishField } from '../../lib/tenancy/access'
import { derivePublishable } from '../../lib/tenancy/public-payload'

/**
 * T027 / FR-008, FR-010 — the review queue is `rascunho → em_revisao → publicado`, and the
 * hop the lab team owns is guarded **on the `status` field**, not on the collection.
 *
 * `projeto` grants `create`/`update` to any signed-in maker of the organization (T024), which
 * is deliberate: FR-008 has the maker submit and the team approve, so a collection-level write
 * guard cannot express the rule — it can only say "may this user write this document at all",
 * and both answers are wrong. The distinction "may this user write `status = publicado`" exists
 * at exactly one layer, field access, which is the only place Payload hands the guard the
 * *incoming value*. `canPublishField`'s own behaviour is proven in
 * `tests/tenancy/can-publish-field.test.ts`; what is asserted here is that `projeto` is wired
 * to it, and that the wiring covers **create** as well as update — a guard that only watches
 * updates is bypassed by a maker who posts a new project already published.
 *
 * Identity (`toBe(canPublishField)`), not "is a function": SC-005 is a guarantee only while
 * there is one implementation of it, and an inline reimplementation on this collection is the
 * drift that makes the rule stop holding on the twelve collections copied from this template.
 *
 * Config-shape only: no database, like `projeto.test.ts` and `publishable.test.ts`.
 */

const SLUG = 'projeto'

type GuardedField = {
  name?: string
  type: string
  options?: { value?: string }[]
  access?: { create?: unknown; read?: unknown; update?: unknown }
}

const collectionConfig = async () => {
  const config = await configPromise
  return config.collections.find((c) => c.slug === SLUG)
}

const fieldNamed = async (name: string): Promise<GuardedField | undefined> => {
  const collection = await collectionConfig()
  return (collection?.flattenedFields as unknown as GuardedField[] | undefined)?.find(
    (f) => f.name === name,
  )
}

/** Invokes the field guard the collection actually declares, exactly as Payload would. */
const decideOnStatus = async (
  operation: 'create' | 'update',
  user: unknown,
  status: string,
  doc?: unknown,
): Promise<unknown> => {
  const field = await fieldNamed('status')
  const guard = field?.access?.[operation]
  if (typeof guard !== 'function') {
    throw new Error(`projeto.status declares no ${operation} guard: any maker could publish`)
  }
  return (guard as (args: never) => unknown)({
    req: { user },
    doc,
    data: { ...(doc as Record<string, unknown> | undefined), status },
    siblingData: { status },
  } as never)
}

const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

describe('projeto.status carries canPublishField (T027, FR-008)', () => {
  it('is the three review states, so the guard has a transition to refuse', async () => {
    // Non-vacuity: every assertion below is about the hop to `publicado`, and it means
    // nothing on a field that does not offer the three states in the first place.
    const field = await fieldNamed('status')
    const values = (field?.options ?? []).map((o) => o.value)

    expect([...values].sort()).toEqual(['em_revisao', 'publicado', 'rascunho'])
  })

  it('guards update with the shared guard, never a local reimplementation', async () => {
    const field = await fieldNamed('status')

    expect(
      field?.access?.update,
      'projeto.status has no update guard wired to canPublishField: a maker of this lab ' +
        'can move their own draft straight to publicado, which SC-005 forbids',
    ).toBe(canPublishField)
  })

  it('guards create with it too, so a maker cannot post an already-published project', async () => {
    const field = await fieldNamed('status')

    expect(
      field?.access?.create,
      'only update is guarded. Payload evaluates field access per operation, so a POST that ' +
        "sets status='publicado' on a brand-new document never meets the update guard at all",
    ).toBe(canPublishField)
  })

  it('leaves the rest of the document editable by the maker who owns the draft', async () => {
    // The pair to the two above: the guard must sit on `status` alone. Locking the whole
    // document down would satisfy "a maker cannot publish" by also breaking "a maker edits
    // a draft", which is the other half of this task.
    for (const name of ['titulo', 'descricaoCurta', 'categoria', 'materiais']) {
      const field = await fieldNamed(name)

      expect(field, `projeto declares no ${name}`).toBeDefined()
      expect(
        field?.access?.update,
        `projeto.${name} is guarded: a maker could not edit their own draft (FR-008)`,
      ).toBeUndefined()
    }
  })
})

describe('the wiring refuses the publish hop and nothing else (SC-005)', () => {
  const maker = member(1, 'maker')
  const staff = member(1, 'staff')

  it('refuses a maker of this lab the hop to publicado, on update and on create', async () => {
    expect(await decideOnStatus('update', maker, 'publicado', { tenant: 1 })).toBe(false)
    expect(await decideOnStatus('create', maker, 'publicado', { tenant: 1 })).toBe(false)
  })

  it('lets that same maker submit for review and save a draft', async () => {
    expect(
      await decideOnStatus('update', maker, 'em_revisao', { tenant: 1 }),
      'the maker could not submit: the review queue is sealed shut and FR-008 is unreachable',
    ).toBe(true)
    expect(await decideOnStatus('update', maker, 'rascunho', { tenant: 1 })).toBe(true)
  })

  it('lets the team of this lab publish', async () => {
    expect(await decideOnStatus('update', staff, 'publicado', { tenant: 1 })).toBe(true)
  })

  it('refuses staff of another lab, the case a bare boolean would wave through', async () => {
    expect(await decideOnStatus('update', member(2, 'staff'), 'publicado', { tenant: 1 })).toBe(
      false,
    )
  })
})

describe('only publicado is listable publicly (FR-010)', () => {
  it('puts projeto in the derived publishable set', async () => {
    // The other half of FR-010: the public client filters on `status`, and it can only do so
    // for a collection the derivation recognises. Declaring the states without landing in
    // this set would serve drafts and in-review rows to anonymous visitors.
    const config = await configPromise

    expect(
      [...derivePublishable(config.collections)],
      'projeto is served to anonymous readers with no published-only filter',
    ).toContain(SLUG)
  })
})
