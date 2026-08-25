import type { CollectionConfig } from 'payload'

/**
 * An invitation to an e-mail that has **no account yet** (FR-029).
 *
 * No `users` row is created before the person accepts and agrees to the terms — the
 * constitution makes terms acceptance a signup gate, and someone who never consented should
 * not exist as an account. This collection is therefore the handoff to feature 004, which
 * adds token, expiry, delivery and the accept/set-password flow once an e-mail transport
 * exists. There is no transport in feature 000: the compose file ships Postgres and MinIO
 * only, and no Payload email adapter is configured.
 *
 * Declared `scoped`, so organization A cannot read organization B's invite list — asserted
 * by the isolation harness.
 */
export const PendingInvites: CollectionConfig = {
  slug: 'pendingInvites',
  labels: {
    singular: 'Convite pendente',
    plural: 'Convites pendentes',
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'role', 'createdAt'],
    description: 'Convites para e-mails sem conta. Entrega e aceite: feature 004.',
  },
  // Unique per (tenant, email) — FR-021's idempotence, enforced by Postgres.
  //
  // The first draft did this as a `beforeValidate` hook that read the collection and threw
  // on a clash. Two things were wrong with it. It called `req.payload`, which is the exact
  // unscoped-client leak vector the import boundary exists to stop — and the lint rule
  // caught it on the first run, which is the guardrail working as designed. And it was
  // racy: two concurrent invites for the same address both read zero rows and both insert.
  //
  // A unique index has neither problem. The invite endpoint (feature 000, T044/T046) turns
  // the resulting constraint violation into FR-021's no-op — insert-and-catch is the
  // race-free shape, where check-then-insert is not.
  indexes: [{ fields: ['tenant', 'email'], unique: true }],
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
      index: true,
      label: 'E-mail convidado',
      admin: {
        // Deliberately NOT globally unique: the same person may be invited independently by
        // two organizations, and a platform-wide unique here would let one organization's
        // invite reveal the existence of another's (US8's anti-enumeration stance).
        description: 'Único por organização, não globalmente.',
      },
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'maker',
      label: 'Papel ao aceitar',
      options: [
        { label: 'Admin da organização', value: 'admin' },
        { label: 'Equipe', value: 'staff' },
        { label: 'Maker', value: 'maker' },
      ],
    },
    {
      name: 'invitedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: 'Convidado por',
      admin: { description: 'Trilha de auditoria. `users` é global, então não cruza tenants.' },
    },
  ],
}
