import type { Payload, PayloadRequest, Where } from 'payload'

import { isScoped } from './scope-registry'

/**
 * The one place a Payload data operation is actually issued.
 *
 * Both public clients — request-scoped (`getTenantScopedPayload`) and explicit-tenant
 * (`getSystemScopedPayload`) — are thin wrappers over this builder, so the tenant rules
 * live once rather than twice.
 */

export type TenantScopedPayload = {
  find: <T = Record<string, unknown>>(args: FindArgs) => Promise<PaginatedResult<T>>
  findByID: <T = Record<string, unknown>>(args: ByIDArgs) => Promise<T | null>
  create: <T = Record<string, unknown>>(args: CreateArgs) => Promise<T>
  update: <T = Record<string, unknown>>(args: UpdateArgs) => Promise<T | null>
  delete: <T = Record<string, unknown>>(args: ByIDArgs) => Promise<T | null>
  /** The organization every operation above is confined to. */
  tenantId: string
}

export type PaginatedResult<T> = { docs: T[]; totalDocs: number }
/**
 * `sort` and `page` are **optional and forwarded verbatim**, added for the public listing
 * reader (`lib/public/listing.ts`, T008): FR-011 orders every listing most-recent-first and
 * FR-029 paginates it at twelve per page, and neither is expressible with `limit` alone.
 *
 * Neither widens what a caller may see, which is the only question this type has to answer.
 * `where` is the one field that decides *which rows*, and it is AND-ed with the tenant
 * constraint below rather than replacing it; a sort key and a page offset re-order and slice
 * a result set that has already been confined. A caller naming a column it may not read gets
 * a query error, not another organization's row.
 */
export type FindArgs = {
  collection: string
  where?: Where
  limit?: number
  depth?: number
  /** Payload's sort syntax: a field name, `-` prefixed for descending. */
  sort?: string
  /** 1-based, as Payload counts pages. */
  page?: number
}
export type ByIDArgs = { collection: string; id: string | number; depth?: number }
export type CreateArgs = { collection: string; data: Record<string, unknown>; depth?: number }
export type UpdateArgs = ByIDArgs & { data: Record<string, unknown> }

const and = (...clauses: (Where | undefined)[]): Where => {
  const present = clauses.filter((c): c is Where => Boolean(c))
  return present.length === 1 ? (present[0] as Where) : { and: present }
}

export type ClientOptions = {
  payload: Payload
  tenantId: string
  /**
   * `false` runs every operation through Payload's access control with the request's user —
   * the request-scoped client. `true` is the explicit-tenant system client, which performs
   * writes no user is allowed to see (memberships into the global `users` collection) and
   * is import-fenced because of it.
   */
  overrideAccess: boolean
  req?: PayloadRequest
  user?: PayloadRequest['user']
}

/**
 * **[CF-8] The registry decides whether `tenant` means anything for a collection.**
 *
 * Stamping `tenant` onto a `global` collection would write a column that does not exist;
 * filtering by it would silently return zero rows for every query against `users` or
 * `organizations`. Neither failure announces itself, so the scope registry — not the
 * caller, and not a hardcoded list — is what this consults.
 */
export function buildTenantClient(opts: ClientOptions): TenantScopedPayload {
  const { payload, tenantId, overrideAccess, req, user } = opts
  const base = { overrideAccess, ...(req ? { req } : {}), ...(user ? { user } : {}) }
  const byTenant = (collection: string): Where | undefined =>
    isScoped(collection) ? ({ tenant: { equals: tenantId } } as Where) : undefined

  return {
    tenantId,

    find: async <T>(args: FindArgs) => {
      const result = await payload.find({
        ...base,
        collection: args.collection as never,
        depth: args.depth ?? 0,
        limit: args.limit,
        // Spread rather than passed unconditionally: Payload reads `sort: undefined` and
        // `page: undefined` as "no opinion" today, but an explicit undefined is a value some
        // future version may validate, and this is the one method every read in the product
        // goes through.
        ...(args.sort !== undefined ? { sort: args.sort } : {}),
        ...(args.page !== undefined ? { page: args.page } : {}),
        // The caller's `where` is merged with the tenant constraint, never replaced by it —
        // and the merge is an AND, so a caller cannot widen the scope by supplying its own.
        where: and(args.where, byTenant(args.collection)),
      })
      return { docs: result.docs as T[], totalDocs: result.totalDocs }
    },

    findByID: async <T>(args: ByIDArgs) => {
      // Issued as a constrained `find` rather than `findByID`: a foreign document must match
      // zero rows, not be fetched and then judged. The difference matters because
      // `findByID` would have already read the row before any check we could apply.
      const result = await payload.find({
        ...base,
        collection: args.collection as never,
        depth: args.depth ?? 0,
        limit: 1,
        where: and({ id: { equals: args.id } } as Where, byTenant(args.collection)),
      })
      return (result.docs[0] as T) ?? null
    },

    create: async <T>(args: CreateArgs) => {
      const data = isScoped(args.collection)
        ? { ...args.data, tenant: tenantId }
        : { ...args.data }
      const doc = await payload.create({
        ...base,
        collection: args.collection as never,
        depth: args.depth ?? 0,
        data: data as never,
      })
      return doc as T
    },

    update: async <T>(args: UpdateArgs) => {
      // Same reasoning as findByID: constrain the operation itself so a foreign id updates
      // nothing, rather than reading it first and then deciding — no read-modify race.
      const result = await payload.update({
        ...base,
        collection: args.collection as never,
        depth: args.depth ?? 0,
        where: and({ id: { equals: args.id } } as Where, byTenant(args.collection)),
        data: args.data as never,
      })
      return ((result as { docs?: unknown[] }).docs?.[0] as T) ?? null
    },

    delete: async <T>(args: ByIDArgs) => {
      const result = await payload.delete({
        ...base,
        collection: args.collection as never,
        depth: args.depth ?? 0,
        where: and({ id: { equals: args.id } } as Where, byTenant(args.collection)),
      })
      return ((result as { docs?: unknown[] }).docs?.[0] as T) ?? null
    },
  }
}
