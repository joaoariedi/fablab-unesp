import type { CollectionConfig } from 'payload'

/**
 * DO NOT DELETE — this collection is the isolation harness's subject (FR-028).
 *
 * Without at least one `scoped` collection, the harness iterates an empty set and passes
 * **while testing nothing**. That is exactly what the first draft of the plan shipped: both
 * collections were `global`, so the guardrails would have gone green against zero rows.
 *
 * It is a real collection, not a test fixture, so the plugin, the access factories, the
 * same-tenant validator and the scope registry are exercised by the same code path
 * production uses. Feature 002 may remove it once genuine scoped collections exist — and
 * `registry.test.ts` will fail until that removal is also made in the scope registry, which
 * is what makes the deletion deliberate rather than accidental.
 *
 * The `tenant` field is injected by the multi-tenant plugin and is indexed automatically
 * (spike S1: `index: true` is hardcoded and cannot be overridden), so it is not declared
 * here.
 */
export const TenantCanaries: CollectionConfig = {
  slug: 'tenantCanaries',
  labels: {
    singular: 'Canário de tenant',
    plural: 'Canários de tenant',
  },
  admin: {
    useAsTitle: 'label',
    description: 'Coleção de teste dos guardrails de isolamento. Não remover sem atualizar o registro de escopo.',
    hidden: ({ user }) => (user as { role?: string })?.role !== 'master',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      label: 'Rótulo',
    },
    {
      name: 'related',
      type: 'relationship',
      relationTo: 'tenantCanaries',
      label: 'Relacionado',
      admin: {
        description:
          'Aresta scoped→scoped que o validador de mesmo-tenant precisa ter para ser testado.',
      },
      // The same-tenant validator is attached in feature-000 task T037. Spike S4c proved the
      // plugin accepts a cross-tenant relationship on its own: a row in org A was updated to
      // point at a row in org B and the write succeeded.
    },
  ],
}
