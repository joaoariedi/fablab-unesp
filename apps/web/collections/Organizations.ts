import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

/**
 * The tenant (FR-008). Declared `global` in the scope registry — it *is* the tenant, so
 * scoping it to itself would be circular.
 *
 * Naming follows CLR-002: English slugs and field names, PT-BR admin labels. The lab team
 * reads this panel daily in Portuguese; the code stays English.
 */
export const Organizations: CollectionConfig = {
  slug: 'organizations',
  labels: {
    singular: 'Organização',
    plural: 'Organizações',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'status'],
    description: 'Cada organização é um fab lab na plataforma.',
  },
  hooks: {
    beforeChange: [
      ({ data, operation, originalDoc }) => {
        // FR-008: the slug is immutable after creation. This is enforcement, not advice —
        // storage keys (`org/<slug>/…`) and hostnames are derived from it, so a rename
        // orphans every uploaded file and breaks host resolution for that organization.
        // `admin.readOnly` would only hide the input; the REST API would still accept it.
        if (operation === 'update' && originalDoc?.slug && data.slug !== undefined) {
          if (data.slug !== originalDoc.slug) {
            throw new APIError(
              `O slug é imutável após a criação (tentativa: "${originalDoc.slug}" → "${data.slug}"). ` +
                `Chaves de storage e hostnames derivam dele.`,
              400,
            )
          }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nome da organização',
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Identificador (slug)',
      admin: {
        description: 'Imutável. Vira o subdomínio e o prefixo de storage. Ex.: "bauru".',
      },
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value.length === 0) return 'Informe o slug.'
        // Constrained to what is legal in a hostname label AND safe in an S3 key prefix.
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
          return `Slug inválido: "${value}". Use apenas letras minúsculas, números e hífens (ex.: "cite-bauru").`
        }
        if (value.length > 63) {
          return `Slug muito longo (${value.length}). O limite de um rótulo de hostname é 63 caracteres.`
        }
        return true
      },
    },
    {
      name: 'domains',
      type: 'array',
      label: 'Domínios adicionais',
      admin: {
        description: 'Hostnames além de <slug>.<domínio>. Consultado na resolução por host.',
      },
      fields: [{ name: 'domain', type: 'text', required: true, label: 'Domínio' }],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      index: true,
      label: 'Situação',
      options: [
        { label: 'Ativa', value: 'active' },
        { label: 'Suspensa', value: 'suspended' },
        { label: 'Arquivada', value: 'archived' },
      ],
      admin: {
        // Spec decision 6: the field exists and only `active` resolves by host in this
        // feature. What suspension does to content and logins is feature 007.
        description: 'Apenas organizações ativas resolvem por host. Semântica completa: feature 007.',
      },
    },
    {
      name: 'theme',
      type: 'group',
      label: 'Identidade visual',
      fields: [
        { name: 'primaryColor', type: 'text', label: 'Cor primária' },
        {
          name: 'logoUrl',
          type: 'text',
          label: 'URL do logo',
          admin: {
            // Deliberately text, not an upload field: no upload-enabled collection exists
            // until feature 002, and an `upload` field pointing at a collection that does
            // not exist fails config validation at boot.
            description: 'URL. Vira campo de upload na feature 002.',
          },
        },
        { name: 'heroImageUrl', type: 'text', label: 'URL da imagem de destaque' },
      ],
    },
    {
      name: 'storageQuotaMb',
      type: 'number',
      label: 'Cota de storage (MB)',
      admin: { description: 'Declarada agora; aplicada na feature 002.' },
    },
    {
      name: 'storageUsedMb',
      type: 'number',
      defaultValue: 0,
      label: 'Storage usado (MB)',
      admin: { readOnly: true, description: 'Reconciliado por job periódico (feature 002).' },
    },
    {
      name: 'lgpdContact',
      type: 'email',
      label: 'Contato LGPD',
      admin: { description: 'Encarregado de dados desta organização.' },
    },
  ],
}
