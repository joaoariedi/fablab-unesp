import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { buildTenantClient } from '../../lib/tenancy/client'

/**
 * `select` reaches the query, or D2's bound does not exist (T006, FR-030).
 *
 * The measured trap this file exists for: `buildTenantClient.find` does **not** spread its
 * args. It names `collection`, `depth`, `limit`, `sort`, `page` and `where` one by one, so
 * adding `select?` to `FindArgs` alone type-checks green, every caller compiles, and the
 * projection is silently dropped — `perfilMaker`'s personal columns come back in full while
 * the reader that asked for four fields looks correct at every call site.
 *
 * A row count cannot see that: the rows are the same rows either way. Only the arguments the
 * client handed to Payload can, which is what this asserts. Whether the database honours the
 * projection is T007's question, against a real database; this one is about the wiring.
 */
describe('buildTenantClient.find threads select', () => {
  /**
   * A named fake rather than an inline stub: the recorded call is the assertion subject in
   * every case below, and `calls` has to survive being read after the await.
   */
  class RecordingPayload {
    readonly calls: Record<string, unknown>[] = []
    find = async (args: Record<string, unknown>) => {
      this.calls.push(args)
      return { docs: [], totalDocs: 0 }
    }
  }

  const clientOver = (fake: RecordingPayload) =>
    buildTenantClient({
      payload: fake as unknown as Payload,
      tenantId: 'org-a',
      overrideAccess: true,
    })

  it('passes the projection through to the query verbatim', async () => {
    const fake = new RecordingPayload()
    const select = { handle: true, xpTotal: true, nivel: true, avatarRender: true }

    await clientOver(fake).find({ collection: 'perfilMaker', limit: 12, select })

    expect(
      fake.calls[0]?.select,
      'the select never reached payload.find — the query fetched every column',
    ).toEqual(select)
  })

  it('omits the key entirely when no projection was asked for', async () => {
    // Conditionally spread for the same reason as `sort` and `page`: Payload reads an absent
    // key as "no opinion" today, but an explicit `select: undefined` is a value a future
    // version may validate — and every read in the product goes through this one method.
    const fake = new RecordingPayload()

    await clientOver(fake).find({ collection: 'projeto', limit: 12 })

    expect(
      Object.prototype.hasOwnProperty.call(fake.calls[0] ?? {}, 'select'),
      'find sent select: undefined instead of leaving the key out',
    ).toBe(false)
  })

  it('does not let the projection displace the tenant constraint', async () => {
    // The select decides which *columns*; the tenant clause decides which *rows*. Threading
    // one must not disturb the other — asserted on the query, because both cases return the
    // same (empty) result here.
    const fake = new RecordingPayload()

    await clientOver(fake).find({
      collection: 'perfilMaker',
      select: { handle: true },
      where: { nivel: { greater_than: 1 } },
    })

    const where = JSON.stringify(fake.calls[0]?.where ?? {})
    expect(where, 'the tenant constraint was lost once a select was supplied').toContain('org-a')
    expect(where, "the caller's where was dropped once a select was supplied").toContain('nivel')
  })
})
