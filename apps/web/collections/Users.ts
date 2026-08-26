import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { masterOnly, masterOrSelf } from '../lib/tenancy/access'

/**
 * Identity (FR-009). Declared `global`: one e-mail is one account across the whole
 * platform, and the *role* is what varies per organization.
 *
 * **The `orgs` array is not declared here.** `@payloadcms/plugin-multi-tenant` injects it
 * via `tenantsArrayField` (see payload.config.ts), carrying `organization` plus our `role`
 * row field. Hand-rolling an `orgs` array beside the plugin's would be the subtle failure
 * mode: the plugin discovers memberships through the field *it* configures, so a
 * hand-rolled one leaves the admin tenant selector and access composition seeing **no
 * memberships** — organization admins then get either nothing or everything.
 * Spike S2 confirmed the naming works: `orgs[] = { organization, role, id }`.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  labels: {
    singular: 'Usuário',
    plural: 'Usuários',
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'role'],
    description: 'Identidade é global; o papel vive em cada vínculo com uma organização.',
    // FR-022: org admins cannot browse the platform's user list — knowing which addresses
    // hold accounts is the enumeration US8 forbids.
    hidden: ({ user }) => (user as { role?: string })?.role !== 'master',
  },
  access: {
    // A signed-in user must still read their own row; everything else is master.
    read: masterOrSelf(),
    create: masterOnly(),
    update: masterOrSelf(),
    delete: masterOnly(),
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        // FR-009 invariant 2: `orgs[].organization` is unique within a user. Payload has no
        // composite unique across array rows, so this is the mechanism.
        //
        // It matters because the invite path is idempotent by contract (FR-021): inviting
        // someone who is already a member must be a no-op, not a second membership row that
        // silently doubles their access surface and makes "which role?" ambiguous.
        const orgs = data?.orgs
        if (!Array.isArray(orgs)) return data

        const seen = new Set<string>()
        for (const row of orgs) {
          const ref = row?.organization
          if (ref === null || ref === undefined) continue
          // The row carries an id on write and a populated object on read — normalise both.
          const id = String(typeof ref === 'object' && 'id' in ref ? ref.id : ref)
          if (seen.has(id)) {
            throw new APIError(
              `Vínculo duplicado: a organização "${id}" aparece mais de uma vez neste usuário. ` +
                `Cada usuário tem no máximo um papel por organização.`,
              400,
            )
          }
          seen.add(id)
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'user',
      index: true,
      label: 'Papel global',
      options: [
        { label: 'Master (vê todas as organizações)', value: 'master' },
        { label: 'Usuário', value: 'user' },
      ],
      admin: {
        description:
          'Master é o único papel que atravessa organizações. Todo o resto é por vínculo.',
      },
    },
  ],
}

/** The only role that reads across tenants. Referenced by the plugin and the access factories. */
export const isMaster = (user: { role?: string } | null | undefined): boolean =>
  user?.role === 'master'
