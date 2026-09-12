import type { PayloadRequest } from 'payload'

import type { CreateArgs, FindArgs } from './client'
import { TenantUnresolvedError } from './errors'
import { resolveTenant } from './resolve'
import { getSystemScopedPayload } from './system-payload'

/**
 * T027 / US1, FR-013 — the one path by which an account can come into existence.
 *
 * ## Why this module has to exist
 *
 * Signup is an **anonymous write**, and nothing in this codebase's tenancy design had a path for
 * one. Measured against the running stack, `completeSignup` was refused at every single
 * operation it performs:
 *
 *   - `users.create` is `masterOnly()` — a visitor cannot create their own account;
 *   - `skill.read` and `perfilMaker.create` are `scopedAccess()`, which returns **`false`** for a
 *     user with zero memberships (`access.ts` § "A user with no memberships can authenticate but
 *     sees no scoped data").
 *
 * The second is the one that makes opening the first pointless: a freshly created account is a
 * member of no organization, so it would be denied its own profile and its own skill catalogue.
 * The account would exist and the person would have nothing. The fix is therefore not "relax an
 * access rule" but "**write the membership**", which is what `criarConta` below does in the same
 * breath as the account — and it is what makes US1's *"a perfilMaker exists in this
 * organization"* true of the **person** rather than merely of the row.
 *
 * ## Why it is a named door and not a widened rule
 *
 * The same argument, and the same shape, as `PUBLIC_GLOBAL_CATALOGUE` in `public-payload.ts`:
 * **no collection's access control is changed.** `users.create` stays `masterOnly()`, so the
 * REST surface still refuses an anonymous account create; this module is the only way in, it is
 * `import`-fenced to `lib/tenancy` by `eslint.config.mjs` (it builds on `system-payload`, which
 * that fence already names), and it is bounded three ways:
 *
 *   1. **One tenant, resolved from the host** — never named by the caller, exactly as the
 *      anonymous read path resolves it. A signup cannot land in another lab.
 *   2. **Three operations, allow-listed by collection.** Not a general client: `criarConta`
 *      writes `users`, `create` accepts only `perfilMaker`, `find` accepts only `skill`. Every
 *      other collection throws. `getSystemScopedPayload` — which this wraps — is a *general*
 *      `overrideAccess: true` client, and handing one of those to `lib/accounts` would put the
 *      most dangerous object in the codebase behind the least trusted input in the product.
 *   3. **No `update` and no `delete`.** Creating an account edits nothing that already exists.
 *
 * ## Why `maker` and not a role the caller chooses
 *
 * A signup produces a maker. If the role were a parameter it would be a parameter reachable from
 * a public form, and `admin` is one string away — feature 000's FR-021 makes membership an
 * invite-only decision precisely so nobody can grant themselves one.
 */

/** The role every self-service signup gets. Not a parameter — see the docblock. */
const PAPEL_DO_CADASTRO = 'maker' as const

/** Written by `criarConta`; read by `completeSignup` for `perfilMaker.usuario`. */
export type ContaCriada = { readonly id: string | number }

export type SignupScopedPayload = {
  /** The organization the host resolved to — the lab this person is joining. */
  readonly tenantId: string
  /**
   * The account **and** its membership of this lab, in that order.
   *
   * Both, or the account is useless: `scopedAccess()` refuses a user with no memberships, so an
   * account created without one cannot read the skill catalogue it is about to be given or write
   * the profile that is about to point at it.
   */
  criarConta: (dados: { email: string; senha: string }) => Promise<ContaCriada>
  /** `perfilMaker` only. `CreateArgs` is the choke point's own vocabulary, so a caller — and a
   *  fake in a test — satisfies both this and `createWithHandle`'s `HandleStore` unchanged. */
  create: <T>(args: CreateArgs) => Promise<T>
  /** `skill` only. */
  find: <T>(args: FindArgs) => Promise<{ docs: T[]; totalDocs: number }>
}

/** The collections this door opens, and nothing else. */
const CRIAVEIS = new Set(['perfilMaker'])
const LEGIVEIS = new Set(['skill'])

/** Refuses by naming both the collection and the rule, so the message is actionable from a log. */
function recusar(operacao: string, collection: string, permitidas: ReadonlySet<string>): never {
  throw new Error(
    `o cliente de cadastro nao faz ${operacao} em "${collection}". Este caminho existe apenas ` +
      `para criar uma conta e seu perfil; ${operacao} e permitido em ` +
      `${[...permitidas].map((c) => `"${c}"`).join(', ')}. Amplia-lo e uma decisao sobre a ` +
      `superficie anonima de escrita, e pertence a este modulo com o motivo escrito ao lado.`,
  )
}

/**
 * The signup client for a host.
 *
 * @example
 *   const db = await getSignupScopedPayload(host, { req })
 *   const conta = await db.criarConta({ email, senha })
 */
export async function getSignupScopedPayload(
  host: string,
  options: { req?: PayloadRequest } = {},
): Promise<SignupScopedPayload> {
  // `resolveTenant` directly, not `public-payload`'s memo: that cache is keyed per request for
  // reads issued many times while rendering one page. A signup resolves the host exactly once.
  const organization = await resolveTenant(host ?? '')
  // An unresolved host is an error, never a silent "some tenant". Creating an account in the
  // wrong lab is worse than refusing to create one, and nobody is signed in to notice.
  if (!organization) throw new TenantUnresolvedError(host)

  const tenantId = String(organization.id)
  const sistema = await getSystemScopedPayload(tenantId, options)

  return {
    tenantId,

    criarConta: async ({ email, senha }) => {
      const conta = await sistema.create<ContaCriada>({
        collection: 'users',
        // `senha` is the form's word for it; `password` is Payload's. The translation happens
        // here, once, at the boundary — two spellings in flight is a value that arrives
        // `undefined` and an account with no usable password.
        data: { email, password: senha, role: 'user', orgs: [] },
      })

      // The half that was missing, and the half that matters: without it `scopedAccess()`
      // returns `false` for this account and the person is locked out of the lab they just
      // joined. `addMembership` is idempotent and reports which branch it took.
      await sistema.addMembership(conta.id, PAPEL_DO_CADASTRO)
      return conta
    },

    create: async <T>(args: CreateArgs): Promise<T> => {
      if (!CRIAVEIS.has(args.collection)) recusar('create', args.collection, CRIAVEIS)
      return sistema.create<T>(args)
    },

    find: async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
      if (!LEGIVEIS.has(args.collection)) recusar('find', args.collection, LEGIVEIS)
      return sistema.find<T>(args)
    },
  }
}
