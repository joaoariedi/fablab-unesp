import type { CollectionConfig, Field } from 'payload'

import { masterOnly } from '../../lib/tenancy/access'

/**
 * The shape both palette catalogues are (T006 — FR-003, CLR-001).
 *
 * `tomDePele` and `tomDeCabelo` are the same three columns over different rows, so the shape
 * is written once and the two files carry what actually differs: the size of the catalogue
 * and the reason it is that size. A second copy of these fields would be two places for
 * `hex` to stop being a colour.
 */

/**
 * Strict `#RGB` / `#RRGGBB`, and **deliberately a second regex** rather than a shared constant
 * with `Organizations.theme.primaryColor`.
 *
 * That field is an organization admin's themeable colour, checked again in `lib/theme.ts`
 * before it becomes CSS; this one is platform reference data nobody themes. They answer to
 * different owners and different requirements, and feature 000 measured what one shared layer
 * is worth when it is mutated. Sharing the constant would make them one check wearing two hats.
 */
const STRICT_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * The colour column's own guard.
 *
 * CLR-005 exempts these rows from feature 001's colour fence — they are data, not tokens —
 * and the exemption is only safe while the column cannot hold anything else. The fence stops
 * a literal reaching a *component*; nothing else is watching this value.
 *
 * Padded input (`' #abcdef '`) is refused rather than trimmed, for the reason
 * `Organizations.ts` records: trim-then-validate stores a value that is not itself a hex, and
 * this field is composed into a sprite by more than one reader.
 */
const validateHex = (value: unknown): true | string => {
  if (typeof value !== 'string' || value === '') {
    return `Cor inválida (${JSON.stringify(value)}). Informe uma cor hexadecimal estrita: #RGB ou #RRGGBB.`
  }
  if (!STRICT_HEX.test(value)) {
    return `Cor inválida: "${value}". Use uma cor hexadecimal estrita: #RGB ou #RRGGBB. Nomes de cor, rgb(), var() e espaços em volta não são aceitos.`
  }
  return true
}

/**
 * Read is `masterOnly()`, exactly as `Organizations` declares it — and for the same reason.
 *
 * The first draft made it `() => true`, reasoning that step 1 of `/criar-conta` shows the
 * builder to somebody who has no account yet (FR-003), and that `scopedAccess()` refuses a
 * userless request while a `Where` on `tenant` would name a column this global table lacks.
 * Both halves of that are true observations about the wrong function: the anonymous page path
 * runs through `getPublicScopedPayload`, which builds its client with `overrideAccess: true`,
 * so **collection-level `read` is never consulted there at all**. What the open boolean actually
 * bought was unauthenticated enumeration of `/api/<slug>` on the REST surface — in a codebase
 * whose posture is that the global collections stay shut.
 *
 * The visitor's read is served the way `organizations` is: by a named allow-list inside
 * `lib/tenancy` — `PUBLIC_GLOBAL_CATALOGUE` in `public-payload.ts`, which carries the argument
 * for why a global catalogue may be listed anonymously when `users` may not.
 */

/** `nome`, `hex`, `ordem` — onboarding.md § `tom_de_pele` / `tom_de_cabelo`, in that order. */
const paletteFields = (exemplos: string): Field[] => [
  {
    name: 'nome',
    type: 'text',
    required: true,
    label: 'Nome',
    admin: { description: exemplos },
  },
  {
    name: 'hex',
    type: 'text',
    required: true,
    label: 'Cor',
    admin: { description: 'Cor hexadecimal estrita: #RGB ou #RRGGBB.' },
    validate: validateHex,
  },
  {
    name: 'ordem',
    type: 'number',
    required: true,
    label: 'Ordem',
    admin: {
      description: 'Posição na fileira de swatches. A grade é desenhada nesta ordem.',
    },
  },
]

export type PaletteCollectionOptions = {
  slug: string
  singular: string
  plural: string
  /** PT-BR, and it must state the catalogue size — a test holds it to the exported total. */
  description: string
  /** Example values for `nome`, so the admin knows what the column is for. */
  exemplos: string
}

/**
 * A global palette catalogue.
 *
 * **Writing is the master's alone** (CLR-001). An organization admin who could mint a skin
 * tone would have made the catalogue per-lab through the back door — which is precisely the
 * migration CLR-001 defers to feature 007's co-branding question rather than a v1 feature.
 * Read is everyone's, because the swatches are the product's, not a lab's.
 *
 * Registration in `payload.config.ts` and `SCOPE_REGISTRY` is T008's: those are single files
 * that parallel tasks cannot all write, and `registry.test.ts` fails in both directions once
 * either side moves.
 *
 * @example
 *   export const TomDePele = paletteCollection({ slug: 'tomDePele', … })
 */
export const paletteCollection = (options: PaletteCollectionOptions): CollectionConfig => ({
  slug: options.slug,
  labels: { singular: options.singular, plural: options.plural },
  admin: {
    useAsTitle: 'nome',
    defaultColumns: ['ordem', 'nome', 'hex'],
    description: options.description,
    group: 'Avatar',
  },
  access: {
    read: masterOnly(),
    create: masterOnly(),
    update: masterOnly(),
    delete: masterOnly(),
  },
  fields: paletteFields(options.exemplos),
})
