import type { PayloadRequest } from 'payload'

import { getSignupScopedPayload, type SignupScopedPayload } from '../tenancy'
import { createWithHandle, foldToHandle } from './handle'

/**
 * The slice of the choke-point client this needs (`lib/tenancy/client.ts`).
 *
 * Narrowed to two operations for the reason `CounterStore` is narrowed to three: signup reads
 * one catalogue and writes two rows, and a type that cannot express `update` or `delete` is the
 * cheapest way of saying that no part of creating an account edits anything that already exists.
 * It is also what lets the unit test supply a named fake without standing up a database — and
 * `Pick<…, 'create'>` is exactly {@link createWithHandle}'s `HandleStore`, so the same client
 * satisfies both without a second type to keep in step.
 */
export type SignupStore = Pick<SignupScopedPayload, 'find' | 'create' | 'criarConta'>

export type SignupDeps = {
  /**
   * Defaults to the **signup** door — `lib/tenancy/signup-payload.ts` — and not to
   * `getTenantScopedPayload`, which was the first draft and could not perform a single one of
   * the three writes below. Measured: `users.create` is `masterOnly()`, and `skill.read` and
   * `perfilMaker.create` are `scopedAccess()`, which returns `false` for a user with no
   * memberships — so the account this function creates was refused its own profile and its own
   * catalogue. It threw `Forbidden` at the first write while the unit test, which supplies a
   * store with no access control at all, stayed green. Injected by tests.
   */
  getStore?: (req: PayloadRequest) => Promise<SignupStore>
  /** The consent clock. Injected so the stamp is assertable; production reads the wall clock. */
  agora?: () => Date
}

/**
 * What step 2 submits (`app/(frontend)/criar-conta/dados/page.tsx`), plus the request it
 * submitted under.
 *
 * The field names are the form's own — `senha`, not `password` — because a second spelling
 * between the form and this function is a value that silently arrives `undefined`. The
 * translation to Payload's `password` happens once, below, where the account is created.
 *
 * Every personal field is optional **here** and refused **there**: `perfilMaker`'s columns are
 * all nullable precisely because the form is where an empty answer gets a field error the person
 * can act on, rather than a NOT NULL violation from the database (`PerfilMaker.ts`).
 */
export type SignupInput = {
  /** The request the whole signup runs under — its transaction is the one every write joins. */
  req: PayloadRequest
  /**
   * The person's name — and, by FR-011, **the avatar's name too**. There is no second field:
   * `nome_avatar` is this value, so the two can never disagree and nobody is asked twice.
   */
  nome: string
  email: string
  senha: string
  dataNascimento?: string | null
  vinculoUnesp?: string | null
  escolaridade?: string | null
  curso?: string | null
  /** The step-1 draft, carried forward by the form so `VOLTAR` loses nothing (FR-002). */
  avatarConfig?: unknown
  /** The version of the terms the person was **shown**, submitted with the acceptance (FR-012). */
  aceiteTermosVersao: string
  /**
   * The checkbox itself — *did they tick it* (US1, FR-012).
   *
   * Separate from the version, and required, because the version alone does not gate anything:
   * step 2 posts it as a **hidden** field on every submit, ticked or not. The first draft
   * checked only the version, so an account was created with a stamped LGPD acceptance from a
   * form where the box was never ticked — and the end-to-end test, which submitted no checkbox
   * state at all, was green on exactly that. `required` on the input is a browser courtesy;
   * this is the gate.
   */
  aceiteTermos: boolean
}

/**
 * The host this signup arrived on — the lab the person is joining.
 *
 * `x-tenant-host` first, for the reason every other tenant read prefers it: `proxy.ts` sets it
 * and strips any client-supplied `x-tenant`, so it is the one spelling a visitor cannot choose.
 */
function hostDe(req: PayloadRequest): string {
  const headers = req.headers
  return headers?.get('x-tenant-host') ?? headers?.get('host') ?? ''
}

/**
 * `limit: 0` — every active skill, not the first page of them (FR-013).
 *
 * Payload's `find` defaults to **ten** when no limit is named
 * (`payload/dist/collections/operations/find.js:72`: `limit ?? (usePagination ? 10 : 0)`), and
 * `limit === 0` is its documented "no limit" — `@payloadcms/drizzle`'s `findMany` turns it into
 * an unbounded query. A lab with an eleventh skill would otherwise create profiles missing it,
 * with no error anywhere: the panel simply renders ten skills and looks complete.
 *
 * Unbounded is right here and nowhere near "SELECT everything": the catalogue is one lab's
 * skill list, curated by its team, and a profile has to carry a row for each of them anyway.
 */
export const TODAS_AS_SKILLS_ATIVAS = 0

/** Level and XP a skill enters at — `onboarding.md` round 4: the pip bar starts empty. */
export const NIVEL_INICIAL = 0
export const XP_INICIAL = 0

/** One row of the `perfilMaker.skills` array. */
type SkillInicial = { skill: string | number; nivel: number; xp: number }

/**
 * The lab's active catalogue, as the array `perfilMaker.skills` stores.
 *
 * The `ativa` filter is part of the **query** and not a `.filter()` on the result, because the
 * result is paginated: filtering afterwards would drop retired skills out of a page that was
 * already cut to size, and a lab with four retired skills would hand its next maker six.
 */
async function skillsAoNivelZero(store: SignupStore): Promise<SkillInicial[]> {
  const { docs } = await store.find<{ id: string | number }>({
    collection: 'skill',
    where: { ativa: { equals: true } },
    limit: TODAS_AS_SKILLS_ATIVAS,
    depth: 0,
  })
  return docs.map((skill) => ({ skill: skill.id, nivel: NIVEL_INICIAL, xp: XP_INICIAL }))
}

/**
 * Step 2's answers, with the unanswered ones **omitted rather than written as `undefined`**.
 *
 * A key carrying `undefined` is not the same as an absent key to Payload's field hooks, and the
 * difference only ever shows up as a value that was cleared by a write that meant to say
 * nothing about it.
 */
const dadosPessoais = (input: SignupInput): Record<string, unknown> => ({
  nome: input.nome,
  ...(input.dataNascimento ? { dataNascimento: input.dataNascimento } : {}),
  ...(input.vinculoUnesp ? { vinculoUnesp: input.vinculoUnesp } : {}),
  ...(input.escolaridade ? { escolaridade: input.escolaridade } : {}),
  ...(input.curso ? { curso: input.curso } : {}),
  ...(input.avatarConfig !== undefined ? { avatarConfig: input.avatarConfig } : {}),
})

/**
 * Create the account and the profile it belongs to — one transaction (FR-011, FR-013, US1).
 *
 * ── What "one transaction" is made of ──────────────────────────────────────────────────────
 *
 * The client is built **once**, from the caller's `req`, and every write goes through it. That
 * is the whole mechanism: Payload attaches an operation to the open transaction through
 * `req.transactionID`, so a second client — or a client built without `req` — opens a second
 * connection and lands outside it (`lib/tenancy/system-payload.ts`, `lib/content/counters.ts`).
 * The failure that buys is the one that cannot be repaired afterwards: the `users` row commits,
 * the profile insert fails, and an account exists that can sign in and owns nothing — no
 * profile, no handle, no skills, and no way for the person to make one because signup would now
 * refuse their e-mail as taken.
 *
 * Nothing here catches a failure for the same reason: an error must reach the caller so the
 * request's transaction rolls back. A swallowed insert is the split account above, with a
 * success page in front of it.
 *
 * ── Why there is no `SELECT` on the handle ─────────────────────────────────────────────────
 *
 * {@link createWithHandle} owns that, and this function must not grow a read beside it: two
 * homonyms signing up at the same instant both read *"`mariasilva` is free"* and both write it.
 * The unique index on `(tenant, handle)` is the only arbiter that cannot lose that race.
 *
 * ── FR-011 ────────────────────────────────────────────────────────────────────────────────
 *
 * `nome` is written once and is also the avatar's name. No `nomeAvatar` column is written,
 * because a second copy is a second thing that can disagree with the first.
 *
 * @throws Error when no terms version was submitted — **before any write**. Consent is a signup
 * gate (constitution; FR-012), and an account with no stamp is one no record shows ever accepted
 * anything, which is exactly what LGPD asks.
 * @throws whatever the account or profile insert raises — a duplicate e-mail, a refused field,
 * or {@link createWithHandle}'s exhausted-suffix error — untouched, so the caller can both roll
 * back and put the message on the right field.
 *
 * @example
 * // In step 2's server action, which already holds the request:
 * const perfil = await completeSignup({ req, nome, email, senha, aceiteTermosVersao, ...dados })
 */
export async function completeSignup<T = Record<string, unknown>>(
  input: SignupInput,
  deps: SignupDeps = {},
): Promise<T> {
  if (!input.aceiteTermos) {
    throw new Error(
      `cadastro sem aceite dos termos: a marcação chegou como ` +
        `${JSON.stringify(input.aceiteTermos)}. O passo 2 envia a versão em campo oculto em ` +
        `toda submissão, então a versão não prova nada sozinha — a caixa é o aceite (FR-012). ` +
        `Nenhuma conta foi criada.`,
    )
  }
  if (!input.aceiteTermosVersao) {
    throw new Error(
      `cadastro sem versão dos termos: aceiteTermosVersao chegou como ` +
        `${JSON.stringify(input.aceiteTermosVersao)}. Um aceite que não diz a QUE texto se ` +
        `refere não é registro nenhum (FR-012). Nenhuma conta foi criada.`,
    )
  }

  const getStore =
    deps.getStore ??
    ((req: PayloadRequest) => getSignupScopedPayload(hostDe(req), { req }))
  const agora = deps.agora ?? (() => new Date())
  // Once. Every write below shares this client, and therefore this transaction.
  const store = await getStore(input.req)

  // Identity first: the profile carries `usuario`, so it cannot be written before there is one.
  // `criarConta`, not `create({ collection: 'users' })` — it writes the lab membership with the
  // account, and without that membership `scopedAccess()` refuses this person everything that
  // follows, including the profile two lines down.
  const conta = await store.criarConta({ email: input.email, senha: input.senha })

  return createWithHandle<T>(store, foldToHandle(input.nome), {
    ...dadosPessoais(input),
    usuario: conta.id,
    aceiteTermosEm: agora().toISOString(),
    aceiteTermosVersao: input.aceiteTermosVersao,
    skills: await skillsAoNivelZero(store),
  })
}
