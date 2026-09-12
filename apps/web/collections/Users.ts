import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { EMAIL_VERIFICATION_REQUIRED } from '../lib/accounts/settings'
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
  // Was a bare `true`, which meant Payload's defaults were in force and nobody had chosen
  // them. Every value below is *adopted* rather than inherited, so an upgrade that moves one
  // is a diff somebody reads instead of a silent change to an auth property.
  auth: {
    // PHASE 1: no e-mail verification (FR-019, spec § CLR-006). Written as the constant and
    // never as the boolean beside it — a literal here passes every runtime "they agree" check
    // while the constant is still `false`, and then phase 2 flips the constant and this does
    // not move. `tests/accounts/auth-options.test.ts` holds the source text to this reference.
    //
    // It is also the only shape Payload can express: `verify: true` makes `login.js` refuse an
    // unverified account outright, so the "may sign in, may not publish" middle state CLR-006
    // withdrew does not exist. What bounds an unverified account instead is 002's
    // `canPublishField` — staff-only, lab-scoped publication.
    verify: EMAIL_VERIFICATION_REQUIRED,
    // FR-015: rate limiting is per account, by Payload's own lock — 5 failures, then ten
    // minutes shut. Payload's defaults, adopted on purpose rather than inherited.
    //
    // WHAT THESE TWO NUMBERS DO NOT STOP, recorded here and not only in spec CLR-007,
    // because this is the line someone reads when they decide whether login is "rate
    // limited" or when they reach for the 5 and raise it. The counter is kept per account,
    // so an attacker spraying one common password across many accounts never trips it: a
    // single attempt each, no account anywhere near 5, and the whole user list gets tried.
    // Raising this number does not close that gap and lowering it does not either — the
    // control that closes it is per-source limiting, which phase 1 deliberately does not
    // build (it needs a shared store: in-memory dies on restart and is per-instance, Redis
    // is a new service; plus a proxy decision, and a university network puts a whole cohort
    // behind one address). Revisit when the platform is public or a second organization
    // exists — spec CLR-007 carries the full rationale.
    maxLoginAttempts: 5,
    lockTime: 600_000, // 10 minutes
    // FR-018 asked for a stated session lifetime, and this is the number: 2 hours, in seconds.
    tokenExpiration: 7_200,
    // FR-017's reset window, in milliseconds: 1 hour for a single-use token.
    forgotPassword: {
      expiration: 3_600_000,
    },
  },
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
