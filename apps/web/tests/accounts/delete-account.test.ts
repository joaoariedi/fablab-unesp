import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { deleteAccount, type DeletionStore } from '../../lib/accounts/deletion'
import type { ByIDArgs, FindArgs, UpdateArgs } from '../../lib/tenancy'
import type { PaginatedResult } from '../../lib/tenancy/client'

/**
 * T032 / FR-031, SC-010, US8 — **deletion, and the three outcomes it owes the person**.
 *
 * CLR-003 decided the mechanism: the personal data goes, the published work **stays** with
 * authorship rendered as a tombstone, and the person's likes are removed with the counters
 * recomputed in the same transaction. Each of the three is breakable on its own, and two of
 * them fail *silently* if this module gets them wrong:
 *
 *   1. deleting the content along with the author would take down teaching material the lab
 *      depends on — CLR-003's whole reason for existing — so the assertion is that the rows
 *      are still there and only `autor` moved;
 *   2. a counter left alone after the likes are deleted is drift nothing reports
 *      (`counters.ts` names it as the failure its strategy exists to prevent), so the count
 *      is asserted as the **recount from the remaining rows** and not as `armazenado - 1`;
 *   3. the global `users` row is shared — one login may hold profiles in two labs (002's
 *      CLR-002) — so deleting it when another lab still holds one erases a person who never
 *      asked, from a lab that never heard about it.
 *
 * ── Why a named fake and not Postgres ─────────────────────────────────────────────────────
 *
 * Claim 2 is only visible when the stored column and the source rows **disagree**, which a
 * healthy database will not hold still in; the world below is seeded with exactly that drift,
 * so a decrementing implementation reads right against Postgres and wrong here. `one
 * transaction` is likewise a claim about *which client* the writes went through — a fake can
 * count that, a database cannot. `curtir.test.ts` and `complete-signup.test.ts` split the same
 * way for the same reason; T033 is where the three halves are proven end to end.
 */

const LAB = 'org-bauru'
const OUTRO_LAB = 'org-rio'

/** The person being erased: profile 7 in this lab, account 42. */
const PERFIL = 7
const CONTA = 42
/** Someone else's profile and account — the control for every "untouched" assertion. */
const PERFIL_ALHEIO = 8
const CONTA_ALHEIA = 99

const REQ = { id: 'req-delete-1', user: { id: CONTA } } as unknown as PayloadRequest

type LinhaCurtida = {
  id: number
  usuario: string | number
  conteudo: { relationTo: string; value: string | number }
}
type LinhaConteudo = { id: number; autor: string | number | null; curtidas: number }
type LinhaPerfil = { id: number; usuario: string | number }
type LinhaConta = { id: number; orgs: { organization: string }[] }

const curtida = (
  id: number,
  usuario: string | number,
  relationTo: string,
  value: number,
): LinhaCurtida => ({ id, usuario, conteudo: { relationTo, value } })

/**
 * `projeto 5` stores **9** while only three `curtida` rows point at it, one of them this
 * person's. `9 - 1 = 8`; the recount is `2`. Only one of those two numbers is what FR-031's
 * *"counters recomputed"* means, and the drift is reachable in production for the reasons
 * `counters.test.ts` lists — an admin bulk delete, a migration, a manual SQL fix.
 */
const ARMAZENADO_DESATUALIZADO = 9

type Mundo = {
  perfis: LinhaPerfil[]
  curtidas: LinhaCurtida[]
  conteudos: Record<string, LinhaConteudo[]>
  contas: LinhaConta[]
}

const mundoPadrao = (): Mundo => ({
  perfis: [
    { id: PERFIL, usuario: CONTA },
    { id: PERFIL_ALHEIO, usuario: CONTA_ALHEIA },
  ],
  curtidas: [
    curtida(1, CONTA, 'projeto', 5),
    curtida(2, CONTA, 'artigo', 3),
    curtida(3, CONTA_ALHEIA, 'projeto', 5),
    curtida(4, CONTA_ALHEIA, 'artigo', 3),
  ],
  conteudos: {
    // Authored by the person: kept, and only `autor` moves.
    artigo: [
      { id: 3, autor: PERFIL, curtidas: 4 },
      { id: 4, autor: PERFIL_ALHEIO, curtidas: 0 },
    ],
    aula: [{ id: 10, autor: PERFIL, curtidas: 0 }],
    modelo3d: [{ id: 20, autor: PERFIL, curtidas: 0 }],
    // Liked by the person, authored by someone else: the counter moves, the row does not.
    projeto: [{ id: 5, autor: PERFIL_ALHEIO, curtidas: ARMAZENADO_DESATUALIZADO }],
  },
  contas: [
    { id: CONTA, orgs: [{ organization: LAB }] },
    { id: CONTA_ALHEIA, orgs: [{ organization: LAB }] },
  ],
})

type Operacao = 'delete-perfilMaker' | 'delete-users' | 'delete-curtida' | 'update'

/** A `where` as this module writes it, flattened — the assertions are about clauses, never
 *  about how a client chose to nest them. */
const clausulas = (where: unknown): Record<string, { equals?: unknown }> => {
  const w = (where ?? {}) as Record<string, unknown> & { and?: unknown[] }
  if (Array.isArray(w.and)) return Object.assign({}, ...w.and.map(clausulas))
  return w as Record<string, { equals?: unknown }>
}

const igual = (where: unknown, campo: string): unknown => clausulas(where)[campo]?.equals

/**
 * A named fake for the choke-point client, holding a **real world**: every delete and update
 * mutates the rows, so the recount `syncCounter` issues is a recount and not a number the
 * fake was told to say. A fake with a fixed `totalDocs` would agree with any implementation.
 *
 * It models the choke point's scoping the way the real one behaves: `perfilMaker` holds only
 * **this lab's** profiles, which is why the cross-lab question has to be answered from the
 * global `users` row rather than from a profile count.
 */
class FakeDeletionStore implements DeletionStore {
  readonly tenantId = LAB
  /** Every write, in order — the ordering claim reads this. */
  readonly trilha: string[] = []

  constructor(
    readonly mundo: Mundo = mundoPadrao(),
    private readonly falhaEm?: Operacao,
  ) {}

  private falhar(op: Operacao): void {
    if (this.falhaEm === op) throw new Error(`${op} recusado pelo banco (teste)`)
  }

  private linhas(collection: string): LinhaConteudo[] {
    return this.mundo.conteudos[collection] ?? []
  }

  find = async <T>(args: FindArgs): Promise<PaginatedResult<T>> => {
    this.trilha.push(`find:${args.collection}`)
    const docs = this.buscar(args) as T[]
    return { docs, totalDocs: docs.length }
  }

  private buscar(args: FindArgs): unknown[] {
    if (args.collection === 'curtida') {
      const usuario = igual(args.where, 'usuario')
      const alvo = igual(args.where, 'conteudo.value')
      return this.mundo.curtidas.filter(
        (l) =>
          (usuario === undefined || l.usuario === usuario) &&
          (alvo === undefined || l.conteudo.value === alvo),
      )
    }
    if (args.collection === 'perfilMaker') {
      const usuario = igual(args.where, 'usuario')
      return this.mundo.perfis.filter((p) => usuario === undefined || p.usuario === usuario)
    }
    const autor = igual(args.where, 'autor')
    return this.linhas(args.collection).filter((c) => autor === undefined || c.autor === autor)
  }

  findByID = async <T>(args: ByIDArgs): Promise<T | null> => {
    this.trilha.push(`findByID:${args.collection}`)
    if (args.collection === 'perfilMaker') {
      return (this.mundo.perfis.find((p) => p.id === args.id) ?? null) as T | null
    }
    if (args.collection === 'users') {
      return (this.mundo.contas.find((c) => c.id === args.id) ?? null) as T | null
    }
    return (this.linhas(args.collection).find((c) => c.id === args.id) ?? null) as T | null
  }

  update = async <T>(args: UpdateArgs): Promise<T | null> => {
    this.falhar('update')
    this.trilha.push(`update:${args.collection}:${String(args.id)}`)
    const alvo = this.linhas(args.collection).find((c) => c.id === args.id)
    if (!alvo) return null
    Object.assign(alvo, args.data)
    return alvo as T
  }

  delete = async <T>(args: ByIDArgs): Promise<T | null> => {
    this.falhar(`delete-${args.collection}` as Operacao)
    this.trilha.push(`delete:${args.collection}:${String(args.id)}`)
    if (args.collection === 'curtida') return this.remover(this.mundo.curtidas, args.id) as T | null
    if (args.collection === 'perfilMaker') return this.remover(this.mundo.perfis, args.id) as T | null
    if (args.collection === 'users') return this.remover(this.mundo.contas, args.id) as T | null
    return this.remover(this.linhas(args.collection), args.id) as T | null
  }

  private remover<T extends { id: number }>(rows: T[], id: string | number): T | null {
    const i = rows.findIndex((r) => r.id === id)
    if (i < 0) return null
    return rows.splice(i, 1)[0] ?? null
  }
}

/** Builds the store once and records how often it was asked for — the transaction claim. */
const comLoja = (store: FakeDeletionStore) => {
  const pedidos: PayloadRequest[] = []
  return {
    pedidos,
    deps: {
      getStore: async (req: PayloadRequest) => {
        pedidos.push(req)
        return store
      },
    },
  }
}

const conteudo = (store: FakeDeletionStore, collection: string, id: number) =>
  (store.mundo.conteudos[collection] ?? []).find((c) => c.id === id)

describe('deleteAccount — os três resultados que a exclusão deve à pessoa (FR-031, SC-010)', () => {
  it('apaga o perfil, mantém o conteúdo com autoria nula e remove as curtidas recontando', async () => {
    const store = new FakeDeletionStore()
    const { deps } = comLoja(store)

    const resultado = await deleteAccount({ req: REQ, perfilId: PERFIL }, deps)

    // 1. Os dados pessoais: a linha de perfilMaker deixa de existir. A de outra pessoa fica.
    expect(store.mundo.perfis.map((p) => p.id)).toEqual([PERFIL_ALHEIO])

    // 2. O trabalho publicado continua no ar, com autoria nula — a lápide é estado de
    //    renderização, nunca uma linha de perfil substituta (CLR-003).
    expect(conteudo(store, 'artigo', 3)).toMatchObject({ id: 3, autor: null })
    expect(conteudo(store, 'aula', 10)).toMatchObject({ id: 10, autor: null })
    expect(conteudo(store, 'modelo3d', 20)).toMatchObject({ id: 20, autor: null })
    // O de outra pessoa não é tocado.
    expect(conteudo(store, 'artigo', 4)?.autor).toBe(PERFIL_ALHEIO)
    expect(resultado.conteudosAnonimizados).toBe(3)

    // 3. As curtidas da pessoa somem; as das outras ficam.
    expect(store.mundo.curtidas.map((l) => l.id)).toEqual([3, 4])
    expect(resultado.curtidasRemovidas).toBe(2)

    // ...e o contador é a RECONTAGEM das linhas restantes, não `armazenado - 1`.
    expect(conteudo(store, 'projeto', 5)?.curtidas).toBe(1)
    expect(conteudo(store, 'artigo', 3)?.curtidas).toBe(1)
  })

  it('roda tudo em um cliente só — a transação de quem chamou', async () => {
    const store = new FakeDeletionStore()
    const { deps, pedidos } = comLoja(store)

    await deleteAccount({ req: REQ, perfilId: PERFIL }, deps)

    // Um cliente, construído a partir do req de quem chamou: é assim que Payload junta cada
    // operação à transação aberta (`req.transactionID`). Um segundo cliente é uma segunda
    // conexão, e a exclusão parcial que ela permite não tem conserto depois.
    expect(pedidos).toEqual([REQ])
  })

  it('conta os perfis restantes DENTRO da transação, depois de apagar o perfil', async () => {
    const store = new FakeDeletionStore()
    const { deps } = comLoja(store)

    const resultado = await deleteAccount({ req: REQ, perfilId: PERFIL }, deps)

    const apagouPerfil = store.trilha.indexOf(`delete:perfilMaker:${PERFIL}`)
    const contou = store.trilha.lastIndexOf('find:perfilMaker')
    const apagouConta = store.trilha.indexOf(`delete:users:${CONTA}`)

    expect(apagouPerfil).toBeGreaterThanOrEqual(0)
    // A ordem é a decisão: contar antes de apagar sempre enxerga "resta um" e ninguém apaga
    // a conta; contar fora da transação é como dois labs excluindo ao mesmo tempo veem isso.
    expect(contou).toBeGreaterThan(apagouPerfil)
    expect(apagouConta).toBeGreaterThan(contou)
    expect(resultado.perfisRestantes).toBe(0)
    expect(resultado.contaRemovida).toBe(true)
    expect(store.mundo.contas.map((c) => c.id)).toEqual([CONTA_ALHEIA])
  })

  it('preserva a conta global quando a pessoa ainda tem vínculo com outro lab', async () => {
    const mundo = mundoPadrao()
    // Um login, dois labs (002 § CLR-002). O perfil do outro lab não é visível por este
    // cliente — o choke point o confina a esta organização — então a resposta vem do vínculo.
    mundo.contas[0] = { id: CONTA, orgs: [{ organization: LAB }, { organization: OUTRO_LAB }] }
    const store = new FakeDeletionStore(mundo)
    const { deps } = comLoja(store)

    const resultado = await deleteAccount({ req: REQ, perfilId: PERFIL }, deps)

    expect(resultado.contaRemovida).toBe(false)
    expect(store.mundo.contas.map((c) => c.id)).toEqual([CONTA, CONTA_ALHEIA])
    // E ainda assim o perfil deste lab foi apagado: a exclusão daqui não espera o outro lab.
    expect(store.mundo.perfis.map((p) => p.id)).toEqual([PERFIL_ALHEIO])
  })

  it('propaga a falha em vez de engolir — é o rollback de quem chamou', async () => {
    const store = new FakeDeletionStore(mundoPadrao(), 'delete-perfilMaker')
    const { deps } = comLoja(store)

    await expect(deleteAccount({ req: REQ, perfilId: PERFIL }, deps)).rejects.toThrow(
      /delete-perfilMaker/,
    )
    // Nada de conta apagada num caminho que falhou no meio.
    expect(store.mundo.contas.map((c) => c.id)).toEqual([CONTA, CONTA_ALHEIA])
  })

  it('a segunda exclusão é um no-op que relata a primeira (US8)', async () => {
    const store = new FakeDeletionStore()
    const { deps } = comLoja(store)

    await deleteAccount({ req: REQ, perfilId: PERFIL }, deps)
    const trilhaAteAqui = store.trilha.length

    const segunda = await deleteAccount({ req: REQ, perfilId: PERFIL }, deps)

    expect(segunda.jaRemovido).toBe(true)
    expect(segunda.curtidasRemovidas).toBe(0)
    expect(segunda.contaRemovida).toBe(false)
    // Nenhuma escrita: a segunda chamada só procura o perfil e para.
    expect(store.trilha.slice(trilhaAteAqui)).toEqual(['findByID:perfilMaker'])
  })
})
