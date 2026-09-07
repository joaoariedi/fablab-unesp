import type { CollectionConfig } from 'payload'

import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * The maker profile of **one** lab (FR-003b, FR-005, T042) — the author block every content
 * card renders: `nome` and the `@nomesobrenome` handle.
 *
 * **Why it is a collection at all, rather than fields on `usuario`** (CLR-002). Level, XP and
 * skills are per-organization by design, so a person who makes at two labs has *one login and
 * two profiles*. Hanging `nome` and `handle` off the global `usuario` would work exactly until
 * the second lab exists, and would then need the reshape feature 000 exists to prevent —
 * identity is global, everything the lab colours is not.
 *
 * **What is deliberately absent.** `avatar` is feature 004's and `nivel`/`xp`/`skills` are
 * feature 005's, and they arrive *here*, as additive fields on this collection. Inventing a
 * placeholder now would give them something to reshape rather than something to extend, which
 * is the entire point of splitting the profile out early: feature 003 can render the author
 * block without waiting on 004.
 *
 * The `tenant` field is injected by the multi-tenant plugin, so it is not declared here. This
 * collection's entry in the plugin's `collections` map and in `SCOPE_REGISTRY` lands with
 * T044: `registry.test.ts` diffs the two in both directions and fails the build whenever they
 * disagree, so config registration and registry entry cannot be added separately.
 */
export const PerfilMaker: CollectionConfig = {
  slug: 'perfilMaker',
  // Nothing is written to `payload-locked-documents` for this collection, so there is nothing
  // in it for another organization to enumerate (FR-018, CLR-004) — that internal collection
  // is not scoped by the plugin and each row names a document by collection and id. Same
  // switch, same reason, as the `projeto` template.
  lockDocuments: false,
  labels: {
    singular: 'Perfil de maker',
    plural: 'Perfis de maker',
  },
  admin: {
    // Also what a relationship picker renders (FR-021): `projeto.autor` points here, and
    // without this the admin offers ids instead of names.
    useAsTitle: 'nome',
    defaultColumns: ['nome', 'handle', 'updatedAt'],
    description: 'Perfis dos makers desta organização. Uma pessoa que faz em dois labs tem dois perfis.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-021, SC-002). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('perfilMaker')],
  access: {
    // A constraint, never a boolean (FR-006): a boolean authorises the operation and then
    // leaks every row — here, the other lab's roster of makers and handles.
    read: scopedAccess(),
    // Creating and editing a profile is a member's, not the team's: the profile is written at
    // onboarding by the person it describes.
    //
    // **Known gap, priced rather than discovered:** `scopedAccess` scopes to the *lab*, not to
    // the *row*, so a maker of lab A can edit another maker of lab A's profile. Narrowing that
    // needs an "own row" constraint joining `usuario` to `req.user.id`, and it belongs with
    // feature 004, which is what first makes the profile user-editable outside onboarding.
    // FR-003b asks for the author fields content renders; per-row ownership is not it.
    create: scopedAccess(),
    update: scopedAccess(),
    // Deleting is the team's: a profile is the author side of published content, and a maker
    // who could delete theirs would orphan every card that credits them.
    delete: teamOnly(),
  },
  fields: [
    {
      name: 'nome',
      type: 'text',
      required: true,
      // 60, from onboarding.md round 4 (it replaced an earlier 20). Unbounded, the AutorInline
      // block breaks in feature 003 on the first maker who pastes a sentence, rather than here.
      maxLength: 60,
      label: 'Nome',
      admin: {
        description: 'Nome da pessoa, até 60 caracteres. É o que aparece publicamente nos cards.',
      },
    },
    {
      name: 'handle',
      type: 'text',
      required: true,
      // Looked up by the public maker profile the author block links to (projetos.md, PO
      // 2026-08-24), so it is indexed.
      index: true,
      label: 'Identificador',
      admin: {
        description: 'Modelo @nomesobrenome, derivado do nome — não é digitado no cadastro.',
      },
      // **Deliberately NOT `unique`.** Payload's `unique` is a constraint over the whole
      // table and the multi-tenant plugin does not narrow it to the tenant (it composes
      // access, not indexes). The handle is *derived from the person's name*, so the same
      // person joining a second lab derives the same handle — a global unique index would
      // refuse their second profile, which is exactly the "one login, two profiles" CLR-002
      // exists to make possible. Per-tenant uniqueness needs a composite `(tenant, handle)`
      // constraint, and homonym disambiguation is still **(proposta)** in onboarding.md; both
      // land with the onboarding feature that actually derives the value.
    },
    {
      name: 'usuario',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: 'Usuário',
      admin: {
        description: 'A identidade global por trás deste perfil. Um login, um perfil por lab.',
      },
      // **No `sameTenant` here, and its absence is the design.** `users` is global — it has no
      // `tenant` to compare against, so the validator would measure a document against a
      // column that does not exist. data-model.md § "Relationships that need sameTenant" names
      // this relationship as the one exception for exactly that reason.
    },
  ],
}
