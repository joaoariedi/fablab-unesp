import type { PayloadRequest } from 'payload'

import { TenantUnresolvedError } from './errors'
import { resolveTenant } from './resolve'
import { getSystemScopedPayload } from './system-payload'
import type { ByIDArgs, FindArgs, UpdateArgs } from './client'

/**
 * T032b / FR-031, CLR-003 — the one path by which a person can erase themselves.
 *
 * ## Why this module has to exist
 *
 * The same shape as `signup-payload.ts`, and found the same way: the plan assumed an operation
 * the architecture refuses. Measured against the running config, the deletion screen could not
 * perform a single step of the erasure it offers:
 *
 *   - `perfilMaker.delete` is `teamOnly()` — *"Deleting is the team's"*, written so an author
 *     cannot erase the review trail an approval stamp is meant to make permanent;
 *   - `users.delete` is `masterOnly()`;
 *   - and the screen's own action fabricated `{ headers } as never` as its request, so
 *     `req.user` was `undefined` and `scopedAccess()` denied it at the **first read**, before
 *     any of that mattered. The `as never` cast is the only reason it compiled.
 *
 * Neither rule is wrong. They are both about somebody erasing *other people's* work, and LGPD
 * asks for something they do not describe: a person removing **their own**.
 *
 * ## What makes this safe — the ownership check, not the allow-list
 *
 * The signup door is bounded by the host: a signup cannot land in another lab. Bounding erasure
 * by host is not enough, because every maker of a lab shares one. So this door is bounded by
 * **whose data it is**, and the check runs BEFORE it hands anything back:
 *
 *   1. The host resolves to one organization, exactly as every other anonymous path resolves it.
 *   2. The profile must exist, belong to **that** organization, and its `usuario` must be the
 *      **authenticated** caller. Any of those failing is a refusal, not an empty result.
 *   3. Only then are two ids unsealed — this profile and this account — and `delete` refuses
 *      every other id it is handed, by comparison, at the moment of the call.
 *
 * So possession of this client is not authority over a collection; it is authority over two
 * rows that were proven to be the caller's. A bug that passed the wrong id gets a throw naming
 * both ids rather than a deletion.
 *
 * `update` is confined to the three collections that carry an author, because that is the
 * tombstone (FR-031) and nothing else about erasure edits anything. There is no `create`.
 */

/** The collections whose `autor` the tombstone nulls — the same three `deletion.ts` walks. */
const ANONIMIZAVEIS = new Set(['artigo', 'aula', 'modelo3d'])

export type ErasureScopedPayload = {
  readonly tenantId: string
  /** The profile proven to belong to the caller, and the account behind it. */
  readonly perfilId: string | number
  readonly usuarioId: string | number
  find: <T>(args: FindArgs) => Promise<{ docs: T[]; totalDocs: number }>
  findByID: <T>(args: ByIDArgs) => Promise<T | null>
  /** `artigo`, `aula`, `modelo3d` only. */
  update: <T>(args: UpdateArgs) => Promise<T | null>
  /** The caller's own `perfilMaker` row, and their own `users` row. Nothing else. */
  delete: <T>(args: ByIDArgs) => Promise<T | null>
}

export class ErasureNotOwnedError extends Error {
  constructor(perfilId: string | number, usuarioId: string | number) {
    super(
      `o perfil #${String(perfilId)} nao pertence ao usuario autenticado #${String(usuarioId)} ` +
        `nesta organizacao. A porta de exclusao so abre sobre as linhas de quem a pediu (FR-031).`,
    )
    this.name = 'ErasureNotOwnedError'
  }
}

/**
 * The erasure client for one authenticated person.
 *
 * @example
 *   const db = await getErasureScopedPayload({ host, usuarioId: sessao.id, perfilId, req })
 *   await deleteAccount({ req, perfilId: db.perfilId }, { getStore: async () => db })
 */
export async function getErasureScopedPayload(input: {
  host: string
  /** From `currentUser()` — an id the caller PROVED, never one a form supplied. */
  usuarioId: string | number
  perfilId: string | number
  req?: PayloadRequest
}): Promise<ErasureScopedPayload> {
  const organization = await resolveTenant(input.host ?? '')
  if (!organization) throw new TenantUnresolvedError(input.host)

  const tenantId = String(organization.id)
  const sistema = await getSystemScopedPayload(tenantId, { req: input.req })

  // The ownership proof, before anything is unsealed. `findByID` through the tenant client
  // already confines this to the resolved organization, so a profile of another lab reads as
  // absent rather than as somebody else's.
  const perfil = await sistema.findByID<{ id: string | number; usuario?: unknown }>({
    collection: 'perfilMaker',
    id: input.perfilId,
    depth: 0,
  })
  const dono =
    typeof perfil?.usuario === 'object' && perfil.usuario !== null
      ? (perfil.usuario as { id?: unknown }).id
      : perfil?.usuario
  if (perfil === null || String(dono ?? '') !== String(input.usuarioId)) {
    throw new ErasureNotOwnedError(input.perfilId, input.usuarioId)
  }

  const APAGAVEIS = new Map<string, string>([
    ['perfilMaker', String(input.perfilId)],
    ['users', String(input.usuarioId)],
  ])

  return {
    tenantId,
    perfilId: input.perfilId,
    usuarioId: input.usuarioId,

    find: (args) => sistema.find(args),
    findByID: (args) => sistema.findByID(args),

    update: async <T>(args: UpdateArgs): Promise<T | null> => {
      if (!ANONIMIZAVEIS.has(args.collection)) {
        throw new Error(
          `a porta de exclusao nao atualiza "${args.collection}". Ela existe para apagar a ` +
            `autoria em ${[...ANONIMIZAVEIS].join(', ')} e nada mais (FR-031, CLR-003).`,
        )
      }
      return sistema.update<T>(args)
    },

    delete: async <T>(args: ByIDArgs): Promise<T | null> => {
      const permitido = APAGAVEIS.get(args.collection)
      // Compared at the moment of the call, against ids proven above — so a bug that passes the
      // wrong id throws naming both, instead of deleting somebody else's row.
      if (permitido === undefined || permitido !== String(args.id)) {
        throw new Error(
          `a porta de exclusao recusou apagar ${args.collection} #${String(args.id)}: ela so ` +
            `abre sobre perfilMaker #${String(input.perfilId)} e users #${String(input.usuarioId)}, ` +
            `que foram provados pertencer a quem pediu a exclusao (FR-031).`,
        )
      }
      return sistema.delete<T>(args)
    },
  }
}
