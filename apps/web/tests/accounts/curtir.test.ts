import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  alternarCurtida,
  type CurtidaAlvo,
  type CurtirStore,
  type EstadoCurtida,
} from '../../lib/accounts/curtir'
import type { ByIDArgs, CreateArgs, FindArgs, UpdateArgs } from '../../lib/tenancy'
import type { PaginatedResult } from '../../lib/tenancy/client'

/**
 * T028b / FR-026, US7 — **the signed-in half of the heart**: the write, the count that follows
 * the server's answer, and the failed write that restores it.
 *
 * T001 shipped the visitor's branch and `like-button.test.ts` pins it: the count a visitor sees
 * never moves. The signed-in branch of `LikeButton` does `setEstado(await onCurtir())` — it
 * holds no opinion of its own about the number, which means **every** guarantee FR-026 makes
 * lives in what this module returns. Three of them, and each is breakable on its own:
 *
 *   1. the returned count is the one the server **derived from the rows**, not `anterior + 1`;
 *   2. a write that fails answers with the count as it was — an optimistic bump that survives
 *      the failure is exactly what FR-026 forbids, and it is the one the person cannot undo;
 *   3. a counter that fails after the row was written **undoes the row**, so the restore is in
 *      the database and not merely on screen. `counters.ts` names this drift as the failure its
 *      whole strategy exists to prevent: the like commits, the recount does not, and the number
 *      is wrong forever with nothing reporting it.
 *
 * ── Why a named fake and not Postgres ──────────────────────────────────────────────────────
 *
 * Claim 1 is only visible when the stored column and the source rows **disagree**, which is a
 * state a healthy database will not hold still in; the fake is seeded with exactly that drift,
 * so an implementation that increments locally reads right against a real database and wrong
 * here. Claims 2 and 3 are about failure injection, which a real database cannot be asked for.
 * `complete-signup.test.ts` makes the same split for the same reason.
 */

/** The requester. `usuario` is stamped from the session by `attributeLikeToRequester`, so the
 *  claim here is only that the *lookup* is scoped to this person — a like is per account. */
const MAKER = 42
const REQ = { id: 'req-1', user: { id: MAKER } } as unknown as PayloadRequest

const ALVO: CurtidaAlvo = { collection: 'projeto', id: 5 }

/**
 * The stored `curtidas` column is **5** while nine source rows exist. Deliberate drift, and the
 * whole of claim 1: `anterior + 1` is 6, the recount is 9, and only one of them is the server's
 * answer. `counters.test.ts` exists because this state is reachable — an admin bulk delete, a
 * migration, a manual SQL fix — and `count` was chosen over `delta` precisely so a write
 * self-heals it.
 */
const ARMAZENADO_DESATUALIZADO = 5

type LinhaCurtida = {
  id: number
  usuario: string | number
  conteudo: { relationTo: string; value: string | number }
}

const linha = (id: number, usuario: string | number): LinhaCurtida => ({
  id,
  usuario,
  conteudo: { relationTo: ALVO.collection, value: ALVO.id },
})

/** Eight likes by other makers of this organization. The ninth is the one under test. */
const DE_OUTROS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => linha(n, 900 + n))

type Operacao = 'create' | 'update' | 'delete'

/** A `where` as this module writes it, flattened so the fake reads either the flat form or the
 *  `and` form — the assertions are about the clauses, never about how they were nested. */
const clausulas = (where: unknown): Record<string, { equals?: unknown }> => {
  const w = (where ?? {}) as Record<string, unknown> & { and?: unknown[] }
  if (Array.isArray(w.and)) return Object.assign({}, ...w.and.map(clausulas))
  return w as Record<string, { equals?: unknown }>
}

/**
 * A named fake for the choke-point client (`.claude/rules/code-quality.md`), holding a **real
 * world**: `create` and `delete` mutate the rows, so the recount `syncCounter` issues is a
 * recount and not a number the fake was told to say. That is what makes claim 1 provable —
 * a fake with a fixed `totalDocs` would agree with any implementation that returned it.
 */
class FakeCurtirStore implements CurtirStore {
  readonly finds: FindArgs[] = []
  readonly leituras: ByIDArgs[] = []
  readonly creates: CreateArgs[] = []
  readonly updates: UpdateArgs[] = []
  readonly deletes: ByIDArgs[] = []

  readonly tenantId = 'org-bauru'

  private linhas: LinhaCurtida[]
  private armazenado: number
  private proximoId = 100

  constructor(
    private readonly mundo: {
      linhas?: readonly LinhaCurtida[]
      armazenado?: number
      /** Which operation rejects. The failure injection claims 2 and 3 are about. */
      falhaEm?: ReadonlySet<Operacao>
    } = {},
  ) {
    this.linhas = [...(mundo.linhas ?? [])]
    this.armazenado = mundo.armazenado ?? 0
  }

  /** The rows as they stand — what "the restore is in the database" is asserted against. */
  get linhasDe(): (usuario: string | number) => LinhaCurtida[] {
    return (usuario) => this.linhas.filter((l) => l.usuario === usuario)
  }

  private falha(op: Operacao): void {
    if (this.mundo.falhaEm?.has(op)) throw new Error(`${op} recusado pelo banco (teste)`)
  }

  find = async <T>(args: FindArgs): Promise<PaginatedResult<T>> => {
    this.finds.push(args)
    const where = clausulas(args.where)
    const docs = this.linhas.filter((l) => {
      const porConteudo = where['conteudo.value']?.equals
      const porUsuario = where.usuario?.equals
      if (porConteudo !== undefined && l.conteudo.value !== porConteudo) return false
      if (porUsuario !== undefined && l.usuario !== porUsuario) return false
      return true
    })
    // `totalDocs` is the honest total; `limit` only slices the page, exactly as Payload does.
    return { docs: docs.slice(0, args.limit ?? docs.length) as T[], totalDocs: docs.length }
  }

  findByID = async <T>(args: ByIDArgs): Promise<T | null> => {
    this.leituras.push(args)
    return { id: args.id, curtidas: this.armazenado } as T
  }

  create = async <T>(args: CreateArgs): Promise<T> => {
    this.falha('create')
    this.creates.push(args)
    const conteudo = args.data.conteudo as LinhaCurtida['conteudo']
    const nova: LinhaCurtida = {
      id: this.proximoId++,
      usuario: (args.data.usuario ?? MAKER) as string | number,
      conteudo,
    }
    this.linhas.push(nova)
    return nova as T
  }

  update = async <T>(args: UpdateArgs): Promise<T | null> => {
    this.falha('update')
    this.updates.push(args)
    this.armazenado = args.data.curtidas as number
    return { id: args.id, ...args.data } as T
  }

  delete = async <T>(args: ByIDArgs): Promise<T | null> => {
    this.falha('delete')
    this.deletes.push(args)
    const alvo = this.linhas.find((l) => l.id === args.id) ?? null
    this.linhas = this.linhas.filter((l) => l.id !== args.id)
    return alvo as T | null
  }
}

const curtir = async (
  store: FakeCurtirStore,
  req: PayloadRequest = REQ,
): Promise<EstadoCurtida> =>
  alternarCurtida({ req, alvo: ALVO }, { getStore: async () => store })

describe('alternarCurtida — a curtida do maker logado (FR-026)', () => {
  it('grava a curtida e devolve a contagem que o SERVIDOR derivou, não a anterior mais um', async () => {
    const store = new FakeCurtirStore({
      linhas: DE_OUTROS,
      armazenado: ARMAZENADO_DESATUALIZADO,
    })

    const estado = await curtir(store)

    // Nove linhas existem depois da escrita. `anterior + 1` daria 6 — e é a implementação que
    // este número existe para reprovar.
    expect(estado).toEqual({ curtidas: 9, curtido: true })
    expect(store.linhasDe(MAKER)).toHaveLength(1)
    expect(store.creates.map((c) => c.collection)).toEqual(['curtida'])
    expect(store.creates[0]?.data.conteudo).toEqual({
      relationTo: ALVO.collection,
      value: ALVO.id,
    })
    // O contador é escrito com o valor derivado, na mesma passagem.
    expect(store.updates).toEqual([
      { collection: ALVO.collection, id: ALVO.id, data: { curtidas: 9 } },
    ])
  })

  it('descurte a linha desta pessoa — e a busca é escopada à conta dela, não ao conteúdo só', async () => {
    const minha = linha(50, MAKER)
    const store = new FakeCurtirStore({
      linhas: [...DE_OUTROS, minha],
      armazenado: 9,
    })

    const estado = await curtir(store)

    expect(estado).toEqual({ curtidas: 8, curtido: false })
    expect(store.deletes).toEqual([{ collection: 'curtida', id: minha.id }])
    expect(store.linhasDe(MAKER)).toHaveLength(0)
    // Sem a cláusula `usuario`, a curtida de outra pessoa responderia por esta — e o coração
    // apareceria aceso para quem nunca curtiu.
    const busca = clausulas(store.finds[0]?.where)
    expect(busca.usuario?.equals).toBe(MAKER)
    expect(busca['conteudo.value']?.equals).toBe(ALVO.id)
  })

  it('uma escrita que falha restaura a contagem — nada de aumento otimista que fica', async () => {
    const store = new FakeCurtirStore({
      linhas: DE_OUTROS,
      armazenado: ARMAZENADO_DESATUALIZADO,
      falhaEm: new Set<Operacao>(['create']),
    })

    const estado = await curtir(store)

    expect(estado.curtidas).toBe(ARMAZENADO_DESATUALIZADO)
    expect(estado.curtido).toBe(false)
    expect(estado.falhou).toBe(true)
    expect(store.linhasDe(MAKER)).toHaveLength(0)
    expect(store.updates).toEqual([])
  })

  it('um contador que falha DESFAZ a linha — a restauração está no banco, não só na tela', async () => {
    const store = new FakeCurtirStore({
      linhas: DE_OUTROS,
      armazenado: ARMAZENADO_DESATUALIZADO,
      falhaEm: new Set<Operacao>(['update']),
    })

    const estado = await curtir(store)

    expect(estado).toEqual({
      curtidas: ARMAZENADO_DESATUALIZADO,
      curtido: false,
      falhou: true,
    })
    // A linha foi criada e apagada: uma curtida que commita sem o contador é a deriva que
    // `counters.ts` existe para impedir.
    expect(store.creates).toHaveLength(1)
    expect(store.linhasDe(MAKER)).toHaveLength(0)
  })

  it('sem sessão não escreve nada — a porta do FR-017, antes de qualquer escrita', async () => {
    const store = new FakeCurtirStore({ linhas: DE_OUTROS, armazenado: 8 })
    const visitante = { id: 'req-2' } as unknown as PayloadRequest

    await expect(curtir(store, visitante)).rejects.toThrow(/sess/i)
    expect(store.creates).toEqual([])
    expect(store.deletes).toEqual([])
    expect(store.updates).toEqual([])
  })

  it('abre UM cliente, a partir do req de quem chamou — é disso que a transação é feita', async () => {
    const store = new FakeCurtirStore({ linhas: DE_OUTROS, armazenado: 8 })
    const pedidos: PayloadRequest[] = []

    await alternarCurtida(
      { req: REQ, alvo: ALVO },
      {
        getStore: async (req) => {
          pedidos.push(req)
          return store
        },
      },
    )

    expect(pedidos).toEqual([REQ])
  })
})
