import type { CollectionConfig } from 'payload'

import { masterOnly } from '../../lib/tenancy/access'

/**
 * The nine slots and the size of each, as `onboarding.md` § `avatar_item` fixes them
 * (FR-003).
 *
 * **Exported so the seed (T008) is held to a number** rather than counting whatever it
 * happens to write, and so the admin description below is built from the same values instead
 * of restating them. The catalogue has already moved once — the round-3 mockup cut `olhos`,
 * `nariz` and `boca` from five-with-a-`Ver mais` to a flat four and deleted the `Ver mais`
 * row with them, and it superseded a catalogue of six skin tones that survived in prose
 * because nothing held it to a number.
 *
 * The key order is load-bearing: it is the order the builder stacks its pickers in.
 *
 * ── Every number here is OPTIONS OFFERED, never rows stored ─────────────────────────────────
 *
 * The two differ for exactly one slot, and the first draft of this file got it backwards: it
 * read `roupaCima: 10` as a row count and left the f/m split to the seed. `onboarding.md`
 * § *Card `ROUPAS`* does not leave it — *"catálogo de **10**: camisetas, moletons, jaqueta,
 * regata e croppeds listrados"*, and then *"é o **único slot que varia por base** — **cada peça
 * tem versão `F` (com peitos) e `M`**"*. Ten **pieces**, each existing as two sprites. So a
 * person who picks either base is offered ten tops, and the table holds twenty rows. Under the
 * row reading the seed would have been held to ten, split f/m, and the builder would have
 * offered five — half the catalogue FR-003 names, with a green test on the integer `10`.
 *
 * § *Card da base do corpo* confirms it from the other side: every other slot is *"produzido em
 * versão única de sprite"* — singular, because `roupaCima` is the one with two.
 *
 * {@link LINHAS_AVATAR} is what the seed is held to. Keeping the two apart is the point: one
 * number answers "what does the picker show" for all nine slots consistently, and the other
 * answers "how many rows exist", and only the second is special-cased.
 */
export const CATEGORIAS_AVATAR = Object.freeze({
  cabelo: 30,
  olhos: 4,
  nariz: 4,
  boca: 4,
  roupaCima: 10,
  roupaBaixo: 10,
  sapatos: 10,
  oculos: 5,
  chapeu: 5,
})

export type CategoriaAvatar = keyof typeof CATEGORIAS_AVATAR


/**
 * The one slot that varies by base (FR-004).
 *
 * A constant rather than a literal repeated in the validate, the admin condition and the
 * builder: FR-004 is a single decision, and three copies of `'roupaCima'` are three places
 * for it to stop being one.
 */
export const CATEGORIA_COM_BASE: CategoriaAvatar = 'roupaCima'

/**
 * PT-BR labels for the admin picker (Principle 4 — the admin is the lab team's surface).
 *
 * `chapeu` is **singular**, and deliberately not `onboarding.md`'s plural heading `chapeus`.
 * That table is counting rows; this enum is the slot vocabulary, and `avatar_config` and
 * FR-005 both name the slot `chapeu`. One vocabulary for the slot and another for the
 * category would be a mapping table between two names for the same thing — which is exactly
 * the reconciliation feature 000 exists to prevent. The count of 5 is unchanged.
 */
const ROTULOS: Readonly<Record<CategoriaAvatar, string>> = Object.freeze({
  cabelo: 'Cabelo',
  olhos: 'Olhos',
  nariz: 'Nariz',
  boca: 'Boca',
  roupaCima: 'Roupa (cima)',
  roupaBaixo: 'Roupa (baixo)',
  sapatos: 'Sapatos',
  oculos: 'Óculos',
  chapeu: 'Chapéu',
})

const CATEGORIAS = Object.keys(CATEGORIAS_AVATAR) as CategoriaAvatar[]

/** `cabelo (30), olhos (4), …` — the description is generated, so it cannot drift. */
const CATALOGO_ESCRITO = CATEGORIAS.map(
  (categoria) => `${categoria} (${CATEGORIAS_AVATAR[categoria]})`,
).join(', ')

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

/** Payload spreads the field config into the top level of the options; `field` is a fallback. */
type ValidateOptions = {
  siblingData?: Record<string, unknown>
  data?: Record<string, unknown>
}

const BASES = ['f', 'm'] as const

/**
 * Rows the table holds per slot — what the seed (T008) is held to.
 *
 * Derived rather than written out, so the two can never disagree: it is
 * {@link CATEGORIAS_AVATAR} with the one base-varying slot doubled, because each of its pieces
 * ships as an `f` sprite and an `m` sprite. Deriving it also means a change to a catalogue size
 * moves both numbers in one edit, which is the drift the exported constant exists to prevent.
 *
 * Declared HERE and not beside `CATEGORIAS_AVATAR`, because it reads `BASES` and
 * `CATEGORIA_COM_BASE`: a `const` referenced above its own declaration is a temporal dead zone
 * error at module load, and this object is built eagerly.
 */
export const LINHAS_AVATAR: Readonly<Record<CategoriaAvatar, number>> = Object.freeze(
  Object.fromEntries(
    Object.entries(CATEGORIAS_AVATAR).map(([categoria, opcoes]) => [
      categoria,
      categoria === CATEGORIA_COM_BASE ? opcoes * BASES.length : opcoes,
    ]),
  ) as Record<CategoriaAvatar, number>,
)

const vazio = (value: unknown): boolean => value === undefined || value === null || value === ''

/**
 * `compativelBase` belongs to `roupaCima` and to nothing else (FR-004).
 *
 * Asserted in **both** directions, because both are broken rows the builder cannot recover
 * from: a base on `sapatos` is an item no slot will ever offer (every other slot is one
 * sprite), and a `roupaCima` with no base is an item the builder cannot choose between when
 * the person picks `F` or `M`. Round 3 decided this field applies to that one category; a
 * check in only one direction would enforce half of that decision.
 *
 * The value check is done here rather than left to Payload's `options` list on purpose: a
 * declared `validate` **replaces** the default, it does not compose with it (measured in
 * `sanitize.js`, and recorded on `same-tenant-validator.ts` where it cost a real defect). So
 * the moment this function exists, nothing else is checking that the value is `f` or `m`.
 */
const validateCompativelBase = (value: unknown, options: ValidateOptions): true | string => {
  const categoria = options?.siblingData?.categoria ?? options?.data?.categoria

  if (categoria !== CATEGORIA_COM_BASE) {
    if (vazio(value)) return true
    return (
      `Base ${JSON.stringify(value)} informada em "${String(categoria)}". Apenas ` +
      `"${CATEGORIA_COM_BASE}" varia por base (FR-004); nas demais categorias o campo fica vazio.`
    )
  }

  if (vazio(value)) {
    return `Informe a base de "${CATEGORIA_COM_BASE}": "f" ou "m". É o único slot que varia por base.`
  }
  if (typeof value !== 'string' || !BASES.includes(value as (typeof BASES)[number])) {
    return `Base inválida: ${JSON.stringify(value)}. Use "f" ou "m" (minúsculas).`
  }
  return true
}

/**
 * `avatarItem` — the **global** cosmetic catalogue (CLR-001, FR-003, FR-004, FR-027).
 *
 * Global for its siblings' reason: these are one designer's sprites shipped with the product,
 * identical for every lab, and scoping them would mean seeding ~100 rows per organization for
 * a catalogue nobody varies. The cost is priced rather than overlooked — a second lab cannot
 * supply its own cosmetics in v1, which CLR-001 names as feature 007's co-branding question,
 * so the day it is answered this becomes a migration rather than a surprise.
 *
 * **`sprite` and `spriteFolhas` are two columns on purpose**, and the plan depends on it: one
 * picker sheet per category carrying a single direction is what the grid of choices needs and
 * is loaded up front, while the four-direction preview sheets are loaded only for the items
 * actually chosen. A category sheet carrying all four directions is roughly 4x what the picker
 * needs — `cabelo` alone is 30 items x 4 directions.
 *
 * Registration in `payload.config.ts` and `SCOPE_REGISTRY` is **T008's**: those are single
 * files parallel tasks cannot all write, and `registry.test.ts` fails in both directions once
 * either side moves.
 */
export const AvatarItem: CollectionConfig = {
  slug: 'avatarItem',
  labels: { singular: 'Item de avatar', plural: 'Itens de avatar' },
  admin: {
    useAsTitle: 'nome',
    defaultColumns: ['categoria', 'nome', 'compativelBase', 'camadaZ'],
    description:
      `Catálogo de peças cosméticas do avatar: ${CATALOGO_ESCRITO}. ` +
      'Arte da plataforma: idêntica em todas as organizações (CLR-001).',
    group: 'Avatar',
  },
  access: {
    read: masterOnly(),
    create: masterOnly(),
    update: masterOnly(),
    delete: masterOnly(),
  },
  fields: [
    {
      name: 'categoria',
      type: 'select',
      required: true,
      label: 'Categoria',
      options: CATEGORIAS.map((categoria) => ({ label: ROTULOS[categoria], value: categoria })),
      admin: {
        description: `Slot do avatar. Tamanho do catálogo por categoria: ${CATALOGO_ESCRITO}.`,
      },
    },
    {
      name: 'nome',
      type: 'text',
      required: true,
      label: 'Nome',
      admin: { description: 'Ex.: Cabelo curto, Camiseta lisa, Tênis branco.' },
    },
    {
      name: 'sprite',
      type: 'relationship',
      relationTo: 'midiaImagem',
      required: true,
      label: 'Sprite',
      // No `validate`: `sameTenant` guards a scoped relationship by comparing tenants, and
      // this row is global — it has no tenant to compare against. Declaring one anyway would
      // also replace Payload's default and silently make `required` inert (the defect
      // `same-tenant-validator.ts` records), leaving a NOT NULL error as the only backstop.
      admin: {
        description: 'Pixel art (.png/.webp) de uma direção — o que a grade de escolhas desenha.',
      },
    },
    {
      name: 'spriteFolhas',
      type: 'relationship',
      relationTo: 'midiaImagem',
      label: 'Spritesheet de rotação',
      admin: {
        description: 'Spritesheet das 4 direções, carregado apenas para os itens escolhidos.',
      },
    },
    {
      name: 'compativelBase',
      type: 'select',
      label: 'Base compatível',
      options: BASES.map((base) => ({ label: base.toUpperCase(), value: base })),
      // Hidden on every other category, so the admin is not offered a field that the validate
      // will then refuse. The condition is presentation; `validate` is the guarantee — the
      // REST and Local APIs never run a condition.
      admin: {
        condition: (data, siblingData) =>
          ((siblingData ?? data) as { categoria?: unknown } | undefined)?.categoria ===
          CATEGORIA_COM_BASE,
        description: `Somente para "${CATEGORIA_COM_BASE}", o único slot que varia por base (FR-004).`,
      },
      validate: validateCompativelBase,
    },
    {
      name: 'camadaZ',
      type: 'number',
      required: true,
      label: 'Camada Z',
      admin: {
        description: 'Ordem de composição do preview: menor desenha primeiro, maior por cima.',
      },
    },
    {
      name: 'pintavel',
      type: 'checkbox',
      label: 'Pintável',
      admin: {
        description:
          'Aceita um tom de cabelo. Marcado nos cortes, para os 10 tons repintarem os 30 cortes.',
      },
    },
  ],
}
