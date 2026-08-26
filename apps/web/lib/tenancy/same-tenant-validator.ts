import { isScoped } from './scope-registry'
import { unscopedLookupTenant } from './unscoped'

/**
 * The same-tenant relationship guard (FR-016).
 *
 * **This is project code because the plugin does not do it.** Spike S4c proved it live: a
 * row in organization A was updated to point at a row in organization B and the write
 * *succeeded*. Without this validator, a scoped relationship is a hole straight through the
 * tenancy model.
 */

type RelationshipRef = { relationTo: string; id: string | number }

/**
 * Relationship values arrive in four shapes and the first draft handled one.
 *
 *   'abc'                                   single, id only
 *   ['abc', 'def']                          hasMany
 *   { relationTo: 'x', value: 'abc' }       polymorphic
 *   { id: 'abc', ... }                      populated document
 */
export function normalizeRefs(value: unknown, relationTo: string | string[] | undefined): RelationshipRef[] {
  const defaultTarget = Array.isArray(relationTo) ? undefined : relationTo
  const items = Array.isArray(value) ? value : [value]

  return items.flatMap((item): RelationshipRef[] => {
    if (item === null || item === undefined) return []

    if (typeof item === 'string' || typeof item === 'number') {
      return defaultTarget ? [{ relationTo: defaultTarget, id: item }] : []
    }

    if (typeof item === 'object') {
      const obj = item as Record<string, unknown>
      // polymorphic: { relationTo, value }
      if (typeof obj.relationTo === 'string' && obj.value !== undefined) {
        const inner = obj.value
        const id =
          typeof inner === 'object' && inner !== null && 'id' in inner
            ? (inner as { id: string | number }).id
            : (inner as string | number)
        return [{ relationTo: obj.relationTo, id }]
      }
      // populated document
      if ('id' in obj && defaultTarget) {
        return [{ relationTo: defaultTarget, id: obj.id as string | number }]
      }
    }
    return []
  })
}

/**
 * **Payload spreads the field config into the TOP LEVEL of the validate options.**
 * `ValidateOptions = BaseValidateOptions & TFieldConfig`, so the target collection is
 * `options.relationTo` — there is **no** `options.field`.
 *
 * This cost a real defect. The first version read `options.field.relationTo`, got
 * `undefined`, and `normalizeRefs` therefore returned an empty list for every bare id — so
 * the validator answered `true` to everything and the cross-tenant hole stayed wide open.
 * Worse, the unit tests passed, because they constructed the `{ field: { … } }` shape the
 * implementation assumed. Only the integration test — which lets Payload call the validator
 * — caught it. A unit test that builds its own inputs can only ever confirm the author's
 * mental model.
 *
 * `field` is kept as a fallback so a hand-constructed call still works.
 */
type ValidateOptions = {
  siblingData?: Record<string, unknown>
  data?: Record<string, unknown>
  /** Field config, spread here by Payload. */
  name?: string
  relationTo?: string | string[]
  /** Fallback shape for direct callers. */
  field?: { name?: string; relationTo?: string | string[] }
  /** Payload supplies these; they are what makes the update path safe. */
  collectionSlug?: string
  id?: string | number
  operation?: string
}

const asId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return String(value)
}

/**
 * Attach to **every** relationship between scoped collections.
 *
 * @example
 *   { name: 'related', type: 'relationship', relationTo: 'tenantCanaries',
 *     validate: sameTenant }
 */
export async function sameTenant(value: unknown, options: ValidateOptions): Promise<true | string> {
  const fieldName = options?.name ?? options?.field?.name ?? 'relacionamento'

  // **[Spike S4]** The tenant is read from siblingData first, then data. `siblingData`
  // resolves only for a ROOT-level field: for a relationship nested in a group or array it
  // is the nested object, where `tenant` does not exist. Falling back to `data` is what
  // makes this correct in both positions.
  let ownTenantId = asId(options?.siblingData?.tenant ?? options?.data?.tenant)

  // **A partial update carries no `tenant`.** `payload.update({ data: { related } })` sends
  // only the changed field, so both siblingData and data are silent about the tenant. The
  // create-time guard below would then return `true` and wave every cross-tenant UPDATE
  // through — which is precisely the S4c hole this validator exists to close, reopened by
  // the fix for a different case. Measured: the guardrail test caught an accepted A -> B
  // update. So fall back to the STORED tenant of the document being written.
  if (ownTenantId === null && options?.id && options?.collectionSlug) {
    ownTenantId = await unscopedLookupTenant(options.collectionSlug, options.id)
  }

  // **[Spike S4]** On a create with no tenant this validator runs BEFORE the tenant field
  // reports its own "required" error, so it is handed `tenant: null` and there is no stored
  // document to fall back to. Returning true lets the tenant field own that failure;
  // competing for it would produce two errors for one cause and point at the wrong field.
  if (ownTenantId === null) return true

  const refs = normalizeRefs(value, options?.relationTo ?? options?.field?.relationTo)
  if (refs.length === 0) return true

  for (const ref of refs) {
    // Relationships to global collections always pass — `users` and `organizations` are
    // platform-wide by design, so "same tenant" is not a meaningful question for them.
    if (!isScoped(ref.relationTo)) continue

    const targetTenant = await unscopedLookupTenant(ref.relationTo, ref.id)
    if (targetTenant !== ownTenantId) {
      // The message names **the field only**. Naming the other organization would turn any
      // relationship input into an ID-ownership oracle — feed it ids, read back who owns
      // them — which contradicts US8's anti-enumeration stance just as surely as the invite
      // endpoint leaking account existence would.
      return `Campo "${fieldName}": o documento referenciado pertence a outra organização.`
    }
  }

  return true
}
