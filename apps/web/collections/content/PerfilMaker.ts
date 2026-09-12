import type { CollectionConfig, Option } from 'payload'

import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * The `VÍNCULO COM UNESP` list (FR-008, FR-009).
 *
 * **Exported so step 2's form and this column cannot hold different lists** — the mockup draws
 * a select and the value it writes has to be one this enum admits, which is only true while
 * there is one list. Same reason `CATEGORIAS_AVATAR` is exported from `AvatarItem.ts`.
 *
 * `onboarding.md` line 390 still marks the option list **(proposta)**: round 3 decided the
 * *field* exists, not its values, and the only values ever written down are the three of the
 * superseded round-3 draft (`Aluno`, `Servidor`, `Voluntário externo`). Those three are here
 * verbatim, plus one the product requires and that draft predates:
 *
 * **`sem-vinculo` is not decoration.** FR-009 accepts any e-mail *precisely because* the UNESP
 * relationship is declared in this field instead, and `concept.md` opens the lab to the
 * community. A list of only the three leaves a community member with no truthful answer, so
 * they either lie or leave it blank — and a column whose blank means both "not answered" and
 * "no link" cannot be reported on.
 *
 * Changing this list is a config edit **and a migration**: `db-postgres` materialises a
 * `select` as a Postgres enum type. That price is what buys validation at the boundary; a
 * `text` column would take any value a caller invented.
 */
export const VINCULOS_UNESP: Readonly<Record<string, string>> = Object.freeze({
  aluno: 'Aluno(a)',
  servidor: 'Servidor(a)',
  voluntario: 'Voluntário(a) externo(a)',
  'sem-vinculo': 'Sem vínculo com a UNESP',
})

/**
 * The `ESCOLARIDADE` list (FR-008) — **(proposta)**, exactly as `onboarding.md` line 390 leaves
 * it, and exported for the same reason as `VINCULOS_UNESP`.
 *
 * No round of `onboarding.md` ever wrote these values down: the mockup fixes the placeholder
 * (`Selecione sua escolaridade`) and nothing else. These are the levels of Brazilian schooling
 * a person can be *at*, which is what the field asks; the PO narrowing or renaming them is one
 * edit here plus the enum migration.
 */
export const ESCOLARIDADES: Readonly<Record<string, string>> = Object.freeze({
  fundamental: 'Ensino fundamental',
  medio: 'Ensino médio',
  tecnico: 'Ensino técnico',
  superior: 'Ensino superior',
  pos: 'Pós-graduação',
})

/** `{ aluno: 'Aluno(a)' }` → what Payload's `options` takes, so neither list is written twice. */
const asOptions = (rotulos: Readonly<Record<string, string>>): Option[] =>
  Object.entries(rotulos).map(([value, label]) => ({ label, value }))

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
 * **Feature 004 arrived, additively** (T009). The prediction T042 made — that the avatar and
 * the skills would *extend* this collection rather than reshape it — is what actually happened:
 * `nome`, `handle` and `usuario` are untouched, and step 2's personal data, `avatarConfig`,
 * `avatarRender`, the consent stamp and `skills` are new columns beside them. What is still
 * deliberately absent is feature 005's **ledger**: a maker's overall `nivel` and `xpTotal`. The
 * per-skill numbers below belong to a maker's relation to one skill, not to the profile.
 *
 * **Every field 004 adds is nullable, and that is a decision.** FR-008 says step 2 *collects*
 * the personal data, and step 2's form is where an empty course must be refused — with a field
 * error the person can act on, not a NOT NULL violation from the database. Profiles exist that
 * the signup form never created: the tenancy fixtures seed one per organization from `nome`,
 * `handle` and `usuario` alone, and a required column here would not fail one test — it throws
 * inside `beforeAll` and reports the whole `tests/tenancy/` directory as *skipped*, the exact
 * failure tasks.md preamble item 1 records costing feature 002 160 silent tests.
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
    {
      name: 'dataNascimento',
      type: 'date',
      label: 'Data de nascimento',
      admin: {
        // `dayOnly`, because a birthday has no time of day: the default picker offers one and
        // the instant it then stores depends on whose clock filled the form. The mockup's own
        // field is `DD / MM / AAAA`.
        date: { pickerAppearance: 'dayOnly', displayFormat: 'dd/MM/yyyy' },
        description: 'Coletada no passo 2 do cadastro. Dado pessoal — ver docs/lgpd.md.',
      },
    },
    {
      name: 'vinculoUnesp',
      type: 'select',
      label: 'Vínculo com a UNESP',
      options: asOptions(VINCULOS_UNESP),
      admin: {
        description:
          'Como a pessoa se relaciona com a UNESP. O cadastro aceita qualquer e-mail (FR-009): ' +
          'é aqui, e não no domínio do e-mail, que o vínculo é declarado.',
      },
    },
    {
      name: 'escolaridade',
      type: 'select',
      label: 'Escolaridade',
      options: asOptions(ESCOLARIDADES),
      admin: {
        description: 'Nível de escolaridade informado no passo 2.',
      },
    },
    {
      name: 'curso',
      type: 'text',
      label: 'Curso',
      admin: {
        description: 'Texto livre: o passo 2 sugere cursos, mas aceita qualquer um (combobox).',
      },
      // **Text, and never a `select`** (FR-008). The round-4 mockup makes this a *combobox* —
      // `Digite ou selecione seu curso` — so the list is a suggestion, not a constraint. A
      // `select` validates against its options and would refuse every course nobody thought to
      // list, which for a lab open to the whole community is most of them. Uncapped for the
      // same reason `nome` is capped at 60: that cap exists because the AutorInline block has
      // a layout to protect, and no rendered surface reads this one.
    },
    {
      name: 'avatarConfig',
      type: 'json',
      label: 'Configuração do avatar',
      admin: {
        description: 'Base, tons e itens escolhidos no passo 1. Renderizado por AvatarPreview.',
      },
      // **JSON, not text.** The builder's choice is a structure — base, tom de pele, tom de
      // cabelo and one item per slot — that the preview reads on every render; a text blob
      // would be parsed again by every reader and validated by none of them.
      //
      // No `jsonSchema` here **on purpose**: the shape belongs to the builder, which does not
      // exist yet, and a schema written now would be a second definition of it to keep in
      // step. The value arrives from a client, so the signup and avatar-edit actions validate
      // it where it crosses the boundary — this column is storage, not the gate.
    },
    {
      name: 'avatarRender',
      type: 'relationship',
      relationTo: 'midiaImagem',
      label: 'Avatar renderizado',
      admin: {
        description: 'PNG composto no servidor para cards e ranking. Regerado quando o avatar muda.',
      },
      // Optional by construction (FR-024): the profile is created with its configuration and
      // the PNG is composed afterwards, so a required column would make the profile
      // uncreatable until a file exists. A relationship rather than a raw key, so the upload
      // goes through the media collections and their limits (FR-033).
      //
      // Both sides are scoped, and spike S4c measured the plugin ACCEPTING a cross-tenant
      // write on its own — without this a profile can point at another lab's image.
      validate: sameTenant,
    },
    {
      name: 'aceiteTermosEm',
      type: 'date',
      label: 'Aceite dos termos em',
      admin: {
        description: 'Momento em que a pessoa marcou o aceite no passo 2 (LGPD).',
      },
    },
    {
      name: 'aceiteTermosVersao',
      type: 'text',
      label: 'Versão dos termos aceita',
      admin: {
        description: 'Qual versão dos termos foi aceita. Sem isso, um novo aceite não pode ser exigido.',
      },
      // FR-012 asks for the version **as well as** the timestamp, and the two are separate
      // fields rather than one stamp because they answer different questions: *when* is the
      // proof of consent, *which* is what makes a re-consent demandable of the people who
      // accepted the old text. A timestamp alone can only be compared against a release date
      // somebody remembers.
    },
    {
      name: 'skills',
      type: 'array',
      label: 'Skills',
      labels: { singular: 'Skill', plural: 'Skills' },
      admin: {
        description: 'Painel SUAS SKILLS. Atribuídas no cadastro, no nível 0 — nunca escolhidas.',
      },
      // **An array, not a `hasMany` relationship.** The panel renders a level and its pips per
      // skill, so the row has to carry the number; a relationship list records which skills and
      // not how far the maker got with each.
      //
      // **No `minRows`.** FR-013 assigns every *active* skill at creation, and a new
      // organization has none until its team adds them — a minimum would refuse the first maker
      // to sign up there.
      fields: [
        {
          name: 'skill',
          type: 'relationship',
          relationTo: 'skill',
          required: true,
          label: 'Skill',
          // Scoped → scoped: `skill` is the one catalogue this feature scopes (CLR-001), so
          // without this a maker of lab A carries a level in lab B's vocabulary.
          validate: sameTenant,
        },
        {
          name: 'nivel',
          type: 'number',
          required: true,
          defaultValue: 0,
          min: 0,
          label: 'Nível',
          admin: {
            description: 'Começa em 0 (onboarding.md rodada 4): a barra de pips entra vazia.',
          },
          // No `max` here even though gamification.md caps the level at 10 *"por enquanto"* —
          // the cap is feature 005's to enforce where XP is awarded, and a column constraint
          // would make moving it a migration rather than a rule change.
        },
        {
          name: 'xp',
          type: 'number',
          required: true,
          defaultValue: 0,
          min: 0,
          label: 'XP',
          admin: {
            description: 'Progresso dentro do nível. Feature 005 concede XP; aqui ele apenas mora.',
          },
        },
      ],
    },
  ],
}
