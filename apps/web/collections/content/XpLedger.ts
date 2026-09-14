import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { scopedAccess } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * The five actions that earn XP (FR-006), and **exactly** five.
 *
 * Exported because two later modules must agree with this list rather than retype it: the
 * `beforeValidate` that composes `chaveIdempotencia` (T007) and `creditXp` (T015), which is
 * called from the four publishables and from `progressoAula`. A sixth value added here without
 * a hook to write it is dead; a hook writing a value absent from here is refused by the select.
 *
 * **Likes and events are missing on purpose.** FR-008 gives likes and calendar attendance no XP
 * in v1, and CLR-012 keeps the credit hook off `evento` — which carries `aprovacaoRegistrada`
 * exactly like the four publishables, so "register it on the reviewable collections" would have
 * credited event publication. The checklist caught that before a line was written, and this
 * list is where the refusal is enforceable: `publicar_evento` is not a value the column accepts.
 */
export const ACOES_XP = [
  'assistir_aula',
  'publicar_projeto',
  'publicar_modelo3d',
  'publicar_artigo',
  'concluir_missao',
] as const

export type AcaoXp = (typeof ACOES_XP)[number]

const ROTULOS_ACAO: Record<AcaoXp, string> = {
  assistir_aula: 'Assistiu uma aula até o fim',
  publicar_projeto: 'Publicou um projeto',
  publicar_modelo3d: 'Publicou um modelo 3D',
  publicar_artigo: 'Publicou um artigo',
  concluir_missao: 'Concluiu uma missão',
}

/**
 * The kinds of content an entry can point at — **collection slugs**, deliberately.
 *
 * `refTipo` is a scalar rather than half of a polymorphic relationship (see the collection
 * docstring), so nothing in Payload resolves it for us. Keeping the values identical to the
 * slugs is what lets a reader of the ledger — the reconstruction SC-019 asks for — load the
 * referenced document with `{ collection: entry.refTipo, id: entry.refId }` and no lookup
 * table in between.
 */
export const REF_TIPOS_XP = ['aula', 'projeto', 'modelo3d', 'artigo', 'missao'] as const

export type RefTipoXp = (typeof REF_TIPOS_XP)[number]

const ROTULOS_REF_TIPO: Record<RefTipoXp, string> = {
  aula: 'Aula',
  projeto: 'Projeto',
  modelo3d: 'Modelo 3D',
  artigo: 'Artigo',
  missao: 'Missão',
}

/**
 * The XP ledger (T006, FR-001, FR-002) — **the only thing in this feature that is not derived**.
 *
 * CLR-001: `perfilMaker.xpTotal`, each skill's level, the Nível do Lab and the ranking are
 * projections. They are stored for reading, maintained inside the writing transaction the way
 * `counters.ts` maintains its counters, and reconciled against these rows by a CI gate — so
 * when a projection and the ledger disagree, **the ledger is right**. That only buys something
 * while the ledger itself cannot be rewritten, which is what the access rules below are for.
 *
 * **Append-only is an ACCESS RULE, not a convention.** `update` and `delete` are flat refusals
 * for everybody — maker, lab team, master. Two weaker shapes are available and both are wrong:
 *
 *   - `teamOnly()` reads like caution and in fact hands the team the power to edit history that
 *     FR-001 says nobody has. The team is exactly who would be asked to "fix" a total.
 *   - a `Where` constraint *authorises the verb* and merely narrows the rows, so the operation
 *     exists and the guarantee becomes "only your own history is editable".
 *
 * `false` is what makes *"the ledger is immutable"* a property of the system rather than of
 * everyone's care. The same idiom as `curtida.update` and `regrasXp.create`.
 *
 * **What that does NOT block, and why the two erasure paths still work.** Access rules apply to
 * *requests*. `getSystemScopedPayload` and the erasure door built on it run with
 * `overrideAccess: true`, so CLR-011's tombstone — nulling `perfil` on erasure (T011b) rather
 * than deleting the entry — reaches the row, and `resetWorld` can still clear the table between
 * tests. That is the design: the refusal stops a *user* rewriting history; the trusted server
 * path keeps the one edit LGPD requires, which removes the person's name and leaves the credit
 * standing so the Nível do Lab stays honest.
 *
 * **`refTipo` and `refId` are SCALARS — a `select` and a `number`.** This is the shape decision
 * that would otherwise cost the constitution its own clause, and this tree already measured the
 * cost. `Curtida.ts` records the finding: Payload expresses compound uniqueness as
 * `indexes: [{ fields, unique: true }]`, over *columns of the row* — and a polymorphic
 * relationship is stored in the **relationships join table**, where there is no column pair to
 * constrain. `curtida` paid for it (*"until then a double POST writes two rows"*). A polymorphic
 * `ref` here would put FR-003's unique index somewhere Postgres cannot build it, and idempotency
 * — constitution Principle 3, verbatim — would degrade from a database guarantee into an
 * application-code check. `chaveIdempotencia` is what makes the index buildable at all: **one
 * text column of the row** carrying the whole tuple, so a single-column unique index covers a
 * key that includes a reference to five different collections.
 *
 * **T007 delivered both halves of that key**: the `unique: true` index over
 * `chaveIdempotencia`, and `composeIdempotencyKey` — the `beforeValidate` below that fills the
 * column from `(tenant, perfil, acao, refTipo, refId)` so no caller can get the tuple wrong.
 * T006 had already declared the one property T007 could not have added afterwards without a
 * migration — `required: true`. Postgres treats NULLs as **distinct** in a unique index, so a
 * nullable key column would let unlimited unkeyed rows through the very index meant to refuse
 * the second one.
 *
 * **FR-002's "when" is Payload's own `createdAt`**, not a `criadoEm` column of our own. The
 * `curtida` precedent verbatim: two answers to one question, of which only one would be
 * maintained. CHK019 asked whether that is precise enough to order two credits inside the same
 * second — the column is `timestamp(3) with time zone` and the serial `id` breaks a tie inside
 * the same millisecond, so the reconstruction SC-019 asks for has a total order without a column
 * anybody has to remember to write.
 *
 * The `tenant` field is injected by the multi-tenant plugin, so it is not declared here.
 * Registration in `payload.config.ts` and the `SCOPE_REGISTRY` entry land together in **T009** —
 * `registry.test.ts` diffs config against registry in both directions — and the ledger is
 * declared **last** of this feature's four collections (`regrasXp → missao → missaoSubmissao →
 * xpLedger`): seeding walks the registry forward and `resetWorld` deletes in reverse, so a
 * collection referenced by another is declared before it. Entries are the leaves, and they are
 * deleted first.
 *
 * **Deliberately absent, with the reason:**
 *   - **A `max` on `quantidade`.** The cap is a *rule*, applied in `packages/game` and nowhere
 *     else (FR-043, CLR-010) — `xpTotal` is uncapped and only `nivel` stops. A column ceiling
 *     would make retuning the economy a migration, which is the retune-by-edit constitution
 *     Principle 3 protects.
 *   - **A `defaultValue` on `quantidade`.** It would be `regrasXp.xpPorAcao`'s seed value
 *     written into the schema, where an entry created without an amount would silently record
 *     the CITe economy at a lab that retuned. The amount is read from the organization's own
 *     row at credit time.
 *   - **A `unique: true` on `chaveIdempotencia` the field.** Payload's field-level `unique` is a
 *     constraint over the whole table, and the tuple already contains `tenant`, so it would be
 *     correct — but it is declared as a **table index** instead, beside `pendingInvites`' and
 *     `progressoAula`', so every compound and single-column uniqueness rule in this codebase is
 *     read from one place in the config rather than from two.
 */
/**
 * One component of the key, as a comparable string.
 *
 * A relationship arrives either as a bare id or as a **populated document**, depending on the
 * depth the write was issued at — `getTenantScopedPayload` stamps `tenant` as a bare id, while
 * a write that read the row first hands over `{ id, ... }`. `String()` on the object form
 * yields `[object Object]`, which is the same string for every row: the first populated credit
 * in the whole table would take the key and the unique index would refuse every credit after
 * it. Normalised here, once, for the same reason `sameTenant`'s `asId` normalises.
 *
 * A missing component is the empty string rather than `'null'` or `'undefined'`, so the key of
 * an entry with no `perfil` (CLR-011 makes it nullable) is stable whichever of those two the
 * caller happened to send.
 */
const componentOf = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return String(value)
}

/**
 * The separator. `:` is safe because **no component can contain one**: `tenant`, `perfil` and
 * `refId` are serial ids, and `acao`/`refTipo` are drawn from `ACOES_XP` and `REF_TIPOS_XP`,
 * which are snake_case literals right here in this file. A separator a component could contain
 * is how a composed key stops being injective — `a:b` + `c` and `a` + `b:c` would be one key,
 * and two different credits would collide into one.
 */
const SEPARADOR_CHAVE = ':'

/**
 * **`(tenant, perfil, acao, refTipo, refId)` — constitution Principle 3's key, composed here so
 * no caller composes it** (T007, FR-003).
 *
 * The unique index below is the guarantee; this hook is what makes the column it constrains
 * worth constraining. The index covers **one text column**, so its teeth are exactly as sharp
 * as whatever is written there: a caller that left a component out, or ordered them differently,
 * or omitted the tenant, would write a key colliding with nobody and be credited a second time
 * through an index that refused nothing. So the composition is not offered to callers — it
 * **overwrites** whatever `data.chaveIdempotencia` carried, and `creditXp` (T015) never sends
 * one. That is the difference between "the callers agree on a format" and FR-003.
 *
 * **Create only, and that is CLR-011 rather than tidiness.** Erasing a profile nulls `perfil` on
 * its entries through the trusted server path, which `update: () => false` does not stop
 * (`overrideAccess: true`). Recomposing there would re-key the entry to its no-`perfil` tuple —
 * and the content it credited would become creditable all over again, an append-only ledger
 * growing a duplicate *because* somebody exercised their right to be forgotten. The stored key
 * outlives the profile it names. Same create-only shape, for the same class of reason, as
 * `curtida`'s `attributeLikeToRequester` and `progressoAula`'s `attributeProgressToRequester`.
 *
 * **It does not refuse a create that names no tenant**, and that is deliberate: the injected
 * `tenant` field is `required` and owns that failure. Competing for it would produce two errors
 * for one cause and point at the wrong field — the reasoning `sameTenant` records verbatim.
 *
 * @example
 *   // { tenant: 1, perfil: 42, acao: 'publicar_artigo', refTipo: 'artigo', refId: 7 }
 *   // composes '1:42:publicar_artigo:artigo:7'
 */
export const composeIdempotencyKey: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (operation !== 'create' || !data) return data

  return {
    ...data,
    chaveIdempotencia: [data.tenant, data.perfil, data.acao, data.refTipo, data.refId]
      .map(componentOf)
      .join(SEPARADOR_CHAVE),
  }
}

export const XpLedger: CollectionConfig = {
  slug: 'xpLedger',
  // Nothing is written to `payload-locked-documents` for this collection, so there is nothing
  // in it for another organization to enumerate (FR-018, CLR-004) — that internal collection is
  // not scoped by the plugin and each row names a document by collection and id. Locking is ON
  // by default (the predicate is `lockDocuments !== false`), so the leak reopens by omission.
  // It would also be pure cost here: an append-only row is never held open in an editor.
  lockDocuments: false,
  // **FR-003 / SC-002 — the guarantee itself, at the database and not in application code.**
  //
  // One column, because `chaveIdempotencia` already carries the whole tuple: the reference is
  // to five different collections, and a compound index over `(tenant, perfil, acao, refTipo,
  // refId)` would work too — but the composed column is what survives `refTipo`/`refId` ever
  // becoming polymorphic, which is the failure mode the collection docstring measures.
  //
  // `creditXp` (T015) turns the resulting violation into FR-025's no-op: **insert-and-catch is
  // the race-free shape, check-then-insert is not**. `PendingInvites.ts` records paying for
  // exactly that lesson — two concurrent writers both read zero rows and both insert — and two
  // reviewers approving one submission at the same instant (US3's edge) is that race, live.
  indexes: [{ fields: ['chaveIdempotencia'], unique: true }],
  hooks: {
    beforeValidate: [composeIdempotencyKey],
  },
  labels: {
    singular: 'Registro de XP',
    plural: 'Registros de XP',
  },
  admin: {
    // No text field to title a row with: an entry *is* who earned, for what, and how much.
    defaultColumns: ['perfil', 'acao', 'refTipo', 'refId', 'quantidade', 'createdAt'],
    description:
      'Histórico de XP desta organização. Somente leitura: cada linha é um crédito já concedido — editar ou apagar tornaria ilegível o total, o nível e o ranking derivados dela.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-035, SC-010). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing — and FR-035 asks for a vantage point on the
  // ledger in particular, since a leak here exposes another lab's whole history.
  endpoints: [scopedListEndpoint('xpLedger')],
  access: {
    // A constraint, never a boolean (FR-006): a boolean authorises the operation and then leaks
    // every row — here the other lab's entire XP history, which is also its ranking.
    read: scopedAccess(),
    // `creditXp` writes through the tenant client carrying the causing write's own `req`
    // (FR-004), so the credit is created by whoever performed the action. Scoped rather than
    // `teamOnly()`: watching a class to the end is the maker's own act and nobody approves it.
    create: scopedAccess(),
    // **FR-001.** See the docstring: a flat refusal, not a narrowed row set, and not `teamOnly`.
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'perfil',
      type: 'relationship',
      relationTo: 'perfilMaker',
      // **NULLABLE, and that is CLR-011 rather than an oversight.** Erasing a profile nulls
      // this and leaves the entry otherwise untouched (FR-040, T011b) — 004's tombstone applied
      // to the ledger. Required would leave deletion only one move, removing the rows, which
      // breaks append-only *and* drops the Nível do Lab by however much the departing maker
      // earned. Every reader of this collection is written knowing an entry may name no profile.
      index: true,
      label: 'Perfil',
      admin: {
        description: 'Quem recebeu o XP. Fica vazio quando a pessoa apaga a conta — o crédito permanece.',
      },
      // Both sides are scoped, and spike S4c measured the plugin ACCEPTING a row in A updated to
      // reference a row in B. The shared validator, never a local reimplementation: FR-030 is a
      // guarantee only while there is one of it. On a null it returns true — the field is not
      // `required`, so there is nothing for it to refuse.
      validate: sameTenant,
    },
    {
      name: 'skill',
      type: 'relationship',
      relationTo: 'skill',
      // Nullable for the same reason `projeto.skill` is (FR-039, CLR-009): a publication that
      // names no skill still credits the maker's total. Requiring it would refuse the credit
      // entirely and lose both halves, which is worse than losing the skill half.
      index: true,
      label: 'Skill',
      admin: {
        description: 'A skill creditada. Vazio quando o conteúdo não nomeia nenhuma — o total do maker sobe do mesmo jeito.',
      },
      validate: sameTenant,
    },
    {
      name: 'acao',
      type: 'select',
      required: true,
      options: ACOES_XP.map((value) => ({ label: ROTULOS_ACAO[value], value })),
      index: true,
      label: 'Ação',
      admin: {
        description: 'O que rendeu o XP. Curtidas e presença em eventos não rendem (FR-008).',
      },
    },
    {
      name: 'refTipo',
      // A SCALAR, not half of a polymorphic relationship — the collection docstring carries the
      // measurement and what it would cost. This half names the collection.
      type: 'select',
      required: true,
      options: REF_TIPOS_XP.map((value) => ({ label: ROTULOS_REF_TIPO[value], value })),
      label: 'Tipo do conteúdo',
      admin: {
        description: 'Qual coleção o crédito aponta. Mantido pelo sistema.',
      },
    },
    {
      name: 'refId',
      // The other half, and also a column of the row. Required because idempotency is **per
      // content** (FR-025): a class credits once ever however often it is rewatched, and an
      // entry naming no content cannot be deduplicated against the next credit for it.
      //
      // A `number` rather than `text` because every collection it can name uses Postgres serial
      // ids; a lab migrating to uuids would migrate this column with them, and a text column
      // chosen now to avoid that would make `(refTipo, refId)` compare '10' to 10.
      type: 'number',
      required: true,
      index: true,
      label: 'ID do conteúdo',
      admin: {
        description: 'O id do conteúdo creditado, dentro da coleção acima. Mantido pelo sistema.',
      },
    },
    {
      name: 'quantidade',
      type: 'number',
      required: true,
      // Zero is meaningful — a lab that paused its gamification by setting `xpPorAcao` to 0
      // still records that the action happened, which is what keeps idempotency honest if the
      // rate is raised again. Negative is not: nothing in this economy takes XP away, and a
      // negative entry would make the ledger's sum disagree with its own count.
      min: 0,
      label: 'Quantidade',
      admin: {
        description: 'Quanto XP este crédito vale, copiado de regrasXp.xpPorAcao no momento do crédito.',
      },
      // No `max` and no `defaultValue` — see the docstring. The cap is a rule, and the rate is
      // per-organization data.
    },
    {
      name: 'chaveIdempotencia',
      type: 'text',
      // Load-bearing, and the one property T007 cannot add afterwards without a migration:
      // Postgres considers NULLs distinct in a unique index, so a nullable key column would let
      // unlimited unkeyed rows past the very index meant to refuse the second one.
      required: true,
      label: 'Chave de idempotência',
      admin: {
        readOnly: true,
        description:
          '(organização, perfil, ação, tipo, id) — composta pelo sistema e protegida por índice único. É o que impede um segundo crédito pela mesma ação.',
      },
    },
  ],
}
