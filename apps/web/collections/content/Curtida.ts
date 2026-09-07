import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { scopedAccess } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * **The like is attributed to the requester, never to the account the payload names.**
 *
 * `create: scopedAccess()` already refuses a request with no session, which is FR-017's first
 * and load-bearing gate. This closes the second one: with `usuario` writable from the body, a
 * signed-in maker could manufacture likes attributed to anybody, and the `curtidas` counter
 * would stop measuring what people liked while every row still satisfied "attribution is
 * always to an account" (PO, 2026-08-24).
 *
 * **Why it stamps rather than refuses when there is no user.** Fixtures, seeds and migrations
 * write through the Local API with `overrideAccess: true` and no session at all — the
 * isolation harness seeds every scoped collection that way (`tests/tenancy/fixtures.ts`), so a
 * hook that threw here would make `curtida` unseedable and take the harness down with it. The
 * anonymous *request* never reaches this hook: access control refuses it one layer up, and
 * that is the layer which actually sees requests. Trusted server code keeps the attribution
 * it supplies.
 *
 * **Create only.** `update` is refused for everyone (see `access` below), so the only writes
 * that reach an existing row come from that same trusted server code, and re-stamping them
 * with whoever happened to be signed in would rewrite history rather than record it.
 */
export const attributeLikeToRequester: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  if (operation !== 'create') return data

  const userId = (req?.user as { id?: string | number } | undefined)?.id
  if (userId === undefined || userId === null) return data

  return { ...data, usuario: userId }
}

/**
 * A like — **`usuario` × conteúdo** (FR-003, FR-017, T043).
 *
 * **Curtir exige login; não há curtida anônima** (PO, 2026-08-24, recorded in
 * `gamification.md` § Curtidas e social and repeated in all four page specs). The heart
 * clicked by a visitor opens the sign-up invitation; it does not write a row.
 *
 * This sits deliberately beside FR-015, which points the other way: a **download** is open and
 * anonymous and is counted through the host-resolved tenancy path. Two adjacent counters, two
 * opposite policies, both decided on the same day — so the asymmetry is stated here rather
 * than left for a later reader to take as an oversight and "fix".
 *
 * FR-017 is enforced in three places, and no one of them is sufficient alone:
 *
 *   1. `create: scopedAccess()` refuses a request carrying no `req.user` — the door itself;
 *   2. `usuario` is **required**, so no row can exist that names no account, whatever path
 *      wrote it; and
 *   3. `attributeLikeToRequester` binds that account to the requester, so "always attributed
 *      to an account" cannot be satisfied by attributing it to somebody else's.
 *
 * **Anonymous reads are refused too, and it costs the product nothing.** The `♥ n` a visitor
 * sees is the target document's own `curtidas` column (`data-model.md` § Derived values),
 * maintained in the same transaction as the like and served through
 * `getPublicScopedPayload` — never a listing of these rows. Opening this collection to
 * anonymous reads would publish who liked what, for a number that is already public.
 *
 * `criado_em` from `biblioteca-3d.md` § Coleção `curtida` is Payload's automatic `createdAt`
 * (`timestamps` defaults to true), not a second column: two answers to one question, of which
 * only one would be maintained.
 *
 * The `tenant` field is injected by the multi-tenant plugin, so it is not declared here. This
 * collection's entry in the plugin's `collections` map and in `SCOPE_REGISTRY` lands with T044.
 *
 * **Deliberately absent, with the reason:**
 *   - **`modelo3d`, `artigo` and `aula` as `conteudo` targets.** The heart is on all four
 *     content types (`gamification.md` § Curtidas e social), but a `relationTo` naming a
 *     collection that is not in the config throws `InvalidFieldRelationship` at load, and the
 *     generated `CollectionSlug` union does not contain them either — the typecheck refuses it
 *     before Payload gets the chance. This is FR-022's amendment exactly: *a declaration cannot
 *     precede its target*. `conteudo` is therefore already the **polymorphic** array form with
 *     one entry, so the day 002b's remaining collections are registered each is a single-token
 *     addition here and not a change of storage: a polymorphic relationship lives in the
 *     relationships join table from the first row, where a single `relationTo` would have been
 *     a column that then needed migrating.
 *   - **The unique `(usuario, conteudo)` key** the page specs propose for idempotency. Payload
 *     expresses compound uniqueness as `indexes: [{ fields, unique: true }]`, over *columns of
 *     the row* — and `conteudo` is polymorphic, so Postgres stores it in the relationships
 *     join table and there is no such column pair to constrain. Enforcing it needs either a
 *     hand-written migration index over that join table or a lookup through the choke point in
 *     this hook; both belong with the toggle endpoint that actually creates and withdraws
 *     likes, which is feature 003's, and neither is FR-017. Until then a double POST writes
 *     two rows, and `counters.ts` derives `curtidas` by `count`, so the number would be two.
 *   - **Per-row ownership.** `scopedAccess` scopes to the *lab*, not to the row, so a member of
 *     lab A can delete another member of lab A's like. Narrowing it needs an "own row"
 *     constraint joining `usuario` to `req.user.id`; `perfilMaker` carries the same gap for the
 *     same reason, and both close with the feature that puts these rows under a user's own UI.
 */
export const Curtida: CollectionConfig = {
  slug: 'curtida',
  // Nothing is written to `payload-locked-documents` for this collection, so there is nothing
  // in it for another organization to enumerate (FR-018, CLR-004) — that internal collection
  // is not scoped by the plugin and each row names a document by collection and id. Same
  // switch, same reason, as the `projeto` template.
  lockDocuments: false,
  hooks: {
    beforeValidate: [attributeLikeToRequester],
  },
  labels: {
    singular: 'Curtida',
    plural: 'Curtidas',
  },
  admin: {
    // No text field to title a row with: a like *is* its pair of relationships, so the admin
    // lists the pair rather than inventing a label for it.
    defaultColumns: ['usuario', 'conteudo', 'createdAt'],
    description: 'Curtidas desta organização. Curtir exige login — não existe curtida anônima.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-021, SC-002). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('curtida')],
  access: {
    // A constraint, never a boolean (FR-006): a boolean authorises the operation and then
    // leaks every row — here, who liked what in the other lab.
    read: scopedAccess(),
    // **FR-017's door.** `scopedAccess` opens `if (!user) return false`, so an anonymous POST
    // is refused before any field is considered. The refusal is the product behaviour the page
    // specs describe, not an omission: the heart shows the sign-up invitation instead.
    create: scopedAccess(),
    // A like is made or withdrawn — there is nothing in it to edit. Refusing update outright
    // is what stops the account a like is attributed to being rewritten after the fact, which
    // is the same forgery the create-time stamp prevents, arriving through the other verb.
    // `false` rather than a constraint: this is a flat refusal, not a narrowed row set.
    update: () => false,
    // Unliking is the maker's own act, so `scopedAccess()` and not `teamOnly()` — a like the
    // team alone could remove would leave the heart permanently on.
    delete: scopedAccess(),
  },
  fields: [
    {
      name: 'usuario',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      // Every read of this collection asks "did this account like this document?", so the
      // account side is the one queried.
      index: true,
      label: 'Usuário',
      admin: {
        description: 'A conta que curtiu. Preenchida pelo sistema a partir da sessão.',
      },
      // **No `sameTenant`, and its absence is the design.** `users` is global — it has no
      // `tenant` to compare against — and data-model.md § "Relationships that need sameTenant"
      // names the global side as the exception for exactly that reason (`perfilMaker.usuario`
      // carries the same note). The scoped half of `curtida.*` is `conteudo`, below.
    },
    {
      name: 'conteudo',
      // **Polymorphic from the first row, deliberately, with one target so far.** The heart is
      // on projects, 3D models, articles and classes, and each is its own collection; one field
      // over the four keeps a single like row shape instead of four nullable columns of which
      // exactly one is ever set. `modelo3d`, `artigo` and `aula` join this array as their
      // collections land (T038–T040) — see the deferral note in the docstring for why they
      // cannot be named before they exist.
      type: 'relationship',
      relationTo: ['projeto'],
      required: true,
      label: 'Conteúdo',
      admin: {
        description: 'O projeto, modelo 3D, artigo ou aula curtido.',
      },
      // Both sides are scoped, and spike S4c measured the plugin ACCEPTING a row in A updated
      // to reference a row in B. Without the shared validator a like crosses organizations and
      // lands on another lab's counter. The shared one, never a local reimplementation:
      // FR-007 is a guarantee only while there is one of it, and `normalizeRefs` already
      // handles the `{ relationTo, value }` shape a polymorphic relationship arrives in.
      validate: sameTenant,
    },
  ],
}
