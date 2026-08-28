import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { masterOnly } from '../lib/tenancy/access'
import { revalidateTenantResolution, seedNewOrganization } from '../lib/tenancy/seed-on-create'

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
    // FR-022: organization admins must not even see that other organizations exist.
    hidden: ({ user }) => (user as { role?: string })?.role !== 'master',
  },
  // Global collection: no tenant constraint is possible, so the gate is the role.
  // Host resolution reads this collection on the allowlisted path inside lib/tenancy.
  access: {
    read: masterOnly(),
    create: masterOnly(),
    update: masterOnly(),
    delete: masterOnly(),
  },
  hooks: {
    // Order matters: seed first so a new organization is complete before anything can
    // resolve to it, then invalidate so it becomes reachable by host immediately.
    afterChange: [seedNewOrganization, revalidateTenantResolution],
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
        {
          name: 'primaryColor',
          type: 'text',
          label: 'Cor primária',
          admin: {
            description:
              'Cor hexadecimal estrita: #RGB ou #RRGGBB. Vira --color-primary nas páginas da organização.',
          },
          // FR-019 / CLR-004, checkpoint ONE of two. The other lives in lib/theme.ts and
          // runs when the value becomes CSS.
          //
          // The duplication is the mechanism, not an oversight: an organization admin owns
          // this value and the REST API writes the same field, so two INDEPENDENT checks are
          // the point. Feature 000 measured what one layer is worth — mutating any single
          // tenancy layer there left the whole harness green. Do not extract these two
          // regexes into a shared constant: a shared constant is one layer wearing two hats.
          //
          // Rejecting padded input (' #abcdef ') rather than trimming it is also deliberate.
          // Trim-then-validate would store a value that is not itself a hex, and lib/theme.ts
          // is not the only thing that will ever read this field.
          validate: (value: unknown) => {
            // Optional field: organizations created before this feature carry no theme, and
            // Payload runs validate on absent values too. Rejecting them here would turn a
            // config change into a migration and make every existing record unsaveable.
            if (value === undefined || value === null || value === '') return true
            if (typeof value !== 'string') {
              return `Cor primária inválida (${JSON.stringify(value)}). Use uma cor hexadecimal: #RGB ou #RRGGBB.`
            }
            if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
              return `Cor primária inválida: "${value}". Use uma cor hexadecimal estrita: #RGB ou #RRGGBB. Nomes de cor, rgb(), var() e ponto e vírgula não são aceitos.`
            }
            return true
          },
        },
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
