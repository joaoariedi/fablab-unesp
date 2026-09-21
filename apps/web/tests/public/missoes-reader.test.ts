import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EstadoPessoal, SubmissaoDoc } from '../../lib/content/missoes'
import type { FindArgs } from '../../lib/tenancy/client'

/**
 * T017 / FR-008, FR-010 — **the personal read, as a module instead of a page.**
 *
 * `plan.md` § D3 splits the mission model in two: the pure half (`ETAPAS_*`, `estadoDe`) goes to
 * `lib/content/missoes.ts` where a unit test needs no database at all, and the **RSC reader** —
 * `estadoPessoal`, `submissoesDoMaker` — goes to `lib/public/` beside `listing.ts`, because it
 * calls `getTenantScopedPayloadForRSC` and that is RSC-only. This suite is the reader's, and it
 * exists because from T018 onward **two** pages depend on it: `/missoes` and the Home's band. A
 * defect asserted only through `/missoes`'s tree would be a defect the Home inherits silently.
 *
 * ── Why the fake client FILTERS rather than answering every read the same way ────────────────
 *
 * FR-008: *"the percentage is the signed-in maker's own submission for that mission, and no
 * other maker's state is readable from this page"*. `missaoSubmissao.read` is `scopedAccess()` —
 * scoped to the **lab**, not to the row — so a reader that asked for the lab's submissions would
 * be *allowed* to, and would be one forgotten clause away from keying a lab-mate's `aprovada`
 * onto this maker's mission. A fake that ignored `where` would return the same rows either way
 * and this suite would be green over exactly that bug. So `FakeLabClient` applies the `maker`
 * constraint it is handed, and the fixture carries a second maker's approved row on a mission
 * this maker has not touched: delete the constraint from the reader and § 2 fails on it.
 *
 * ── Why the session is mocked and the client is not injected ─────────────────────────────────
 *
 * `estadoPessoal` takes no client parameter, the same absence `listing.ts` keeps and for the
 * same reason (T002, run 1): a `db` argument is a seam a page could reach, and a page that can
 * pass a client can pass one with no tenant constraint at all. The seam is `vi.mock`, which
 * exists only inside this process.
 */

/** The missions on screen, as the band and `/missoes` hand them over — only the id is read, so
 *  this fixture carries only ids. The reader must not require the rest of a `MissaoDoc`. */
const MISSAO_LASER = { id: 1 }
const MISSAO_3D = { id: 2 }
const MISSAO_BORDADO = { id: 3 }
const MISSOES = [MISSAO_LASER, MISSAO_3D, MISSAO_BORDADO]

const USUARIO = { id: 700 }
const PERFIL = { id: 42 }
const OUTRO_MAKER = 99

/** Mine on `MISSAO_LASER` (awaiting review) and on `MISSAO_BORDADO` (refused); the lab-mate's
 *  **approved** row on `MISSAO_3D` — the row a reader that forgot the maker constraint would key
 *  onto my card as a finished mission. `missao` arrives populated on one row and as a bare id on
 *  another, because `depth: 0` is what the reader asks for and a caller may still hand it either. */
const MINHA_ENVIADA = { id: 10, missao: MISSAO_LASER.id, maker: PERFIL.id, status: 'enviada' }
const MINHA_RECUSADA = { id: 11, missao: { id: MISSAO_BORDADO.id }, maker: PERFIL.id, status: 'recusada' }
const DO_OUTRO_APROVADA = { id: 12, missao: MISSAO_3D.id, maker: OUTRO_MAKER, status: 'aprovada' }

const SUBMISSOES = [MINHA_ENVIADA, MINHA_RECUSADA, DO_OUTRO_APROVADA]

type Where = Record<string, unknown> | undefined

/** The `{ equals }` constraint this `where` places on a field, wherever it sits in the tree —
 *  the reader may nest it under `and`, and the assertion is about the constraint, not its depth. */
function equalsConstraint(where: Where, field: string): unknown {
  if (!where || typeof where !== 'object') return undefined
  const direct = (where as Record<string, { equals?: unknown } | undefined>)[field]
  if (direct && typeof direct === 'object' && 'equals' in direct) return direct.equals
  for (const chave of ['and', 'or']) {
    const ramos = (where as Record<string, unknown>)[chave]
    if (!Array.isArray(ramos)) continue
    for (const ramo of ramos) {
      const achado = equalsConstraint(ramo as Where, field)
      if (achado !== undefined) return achado
    }
  }
  return undefined
}

/** The `{ in }` constraint on a field, found the same way. */
function inConstraint(where: Where, field: string): unknown[] | undefined {
  if (!where || typeof where !== 'object') return undefined
  const direct = (where as Record<string, { in?: unknown[] } | undefined>)[field]
  if (direct && typeof direct === 'object' && Array.isArray(direct.in)) return direct.in
  for (const chave of ['and', 'or']) {
    const ramos = (where as Record<string, unknown>)[chave]
    if (!Array.isArray(ramos)) continue
    for (const ramo of ramos) {
      const achado = inConstraint(ramo as Where, field)
      if (achado !== undefined) return achado
    }
  }
  return undefined
}

/**
 * The signed-in maker's own client. It **applies the `maker` constraint** — see the header.
 *
 * `falha` names the collection whose read throws, so FR-010's two failure points can be driven
 * one at a time: the profile lookup and the submissions read fail for different reasons in
 * production (one is the session, one is the query) and both must cost the percentages only.
 */
class FakeLabClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'
  // The write half exists so this fake satisfies `TenantScopedPayload` as the reader declares
  // it. It throws rather than resolving: this module is a *reader*, and a version of it that
  // wrote through the session client must fail here loudly instead of passing through a stub
  // that answered `{}`.
  create = async <T>(): Promise<T> => {
    throw new Error('o leitor pessoal não escreve')
  }
  update = async <T>(): Promise<T | null> => {
    throw new Error('o leitor pessoal não escreve')
  }
  delete = async <T>(): Promise<T | null> => {
    throw new Error('o leitor pessoal não escreve')
  }

  constructor(
    private readonly perfis: readonly unknown[] = [PERFIL],
    private readonly submissoes: readonly { maker: number }[] = SUBMISSOES,
    private readonly falha?: string,
  ) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    if (this.falha === args.collection) throw new Error(`leitura de ${args.collection} falhou`)
    if (args.collection === 'perfilMaker') {
      const docs = this.perfis as T[]
      return { docs, totalDocs: docs.length }
    }
    if (args.collection === 'missaoSubmissao') {
      const maker = equalsConstraint(args.where as Where, 'maker')
      const docs = this.submissoes.filter(
        (linha) => maker === undefined || String(linha.maker) === String(maker),
      ) as T[]
      return { docs, totalDocs: docs.length }
    }
    return { docs: [] as T[], totalDocs: 0 }
  }

  findByID = async <T>(): Promise<T | null> => null

  paraColecao(collection: string): FindArgs[] {
    return this.calls.filter((call) => call.collection === collection)
  }
}

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(async (): Promise<{ id: string | number } | null> => null),
  getTenantScopedPayloadForRSC: vi.fn(),
}))

vi.mock('../../lib/tenancy/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))

const { estadoPessoal, submissoesDoMaker } = await import('../../lib/public/missoes')

/** Arms the session and the tenant door, and hands back the client the reader will be given. */
function servindo(opcoes: { sessao?: { id: string | number } | null; cliente?: FakeLabClient } = {}) {
  const cliente = opcoes.cliente ?? new FakeLabClient()
  mocks.currentUser.mockResolvedValue(opcoes.sessao ?? null)
  mocks.getTenantScopedPayloadForRSC.mockResolvedValue(cliente)
  return cliente
}

/** The map a `maker` state carries — asserted through a helper so a non-`maker` state fails with
 *  the state it actually returned rather than with `undefined is not a Map`. */
function submissoesDe(estado: EstadoPessoal): ReadonlyMap<string, SubmissaoDoc> {
  expect(estado.tipo).toBe('maker')
  return (estado as { submissoes: ReadonlyMap<string, SubmissaoDoc> }).submissoes
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — who is reading (FR-008, CLR-002)', () => {
  it('reads a visitor with no session as `anonimo`, and never opens the tenant door', async () => {
    servindo({ sessao: null })

    expect(await estadoPessoal(MISSOES)).toEqual({ tipo: 'anonimo' })
    // The door FR-028 is about is opened only when there is a session to open it for: a
    // signed-out visitor costing a tenant-scoped client is the read CLR-012 counts out of the
    // Home's four, and it must not happen at all.
    expect(mocks.getTenantScopedPayloadForRSC).not.toHaveBeenCalled()
  })

  it('reads a login with no profile in THIS lab as `sem-perfil`, not as a maker with nothing', async () => {
    // 002 § CLR-002 allows one login to hold profiles in two labs. No profile *here* means there
    // is no progress of theirs to show on this lab's missions — and it must not be reported as
    // `anonimo`, because that state is the one that invites a signed-in person to sign in.
    const cliente = servindo({ sessao: USUARIO, cliente: new FakeLabClient([]) })

    expect(await estadoPessoal(MISSOES)).toEqual({ tipo: 'sem-perfil' })
    expect(cliente.paraColecao('missaoSubmissao')).toHaveLength(0)
  })

  it('resolves the profile from the SESSION user, never from anything the caller passed', async () => {
    const cliente = servindo({ sessao: USUARIO })
    await estadoPessoal(MISSOES)

    const [perfilRead] = cliente.paraColecao('perfilMaker')
    expect(equalsConstraint(perfilRead?.where as Where, 'usuario')).toBe(USUARIO.id)
  })
})

describe('§2 — "their own" is a constraint on the query, not a filter on the render (FR-008)', () => {
  it('keys this maker\'s own submissions by mission, populated or not', async () => {
    servindo({ sessao: USUARIO })

    const submissoes = submissoesDe(await estadoPessoal(MISSOES))
    expect(submissoes.get(String(MISSAO_LASER.id))).toMatchObject({ status: 'enviada' })
    expect(submissoes.get(String(MISSAO_BORDADO.id))).toMatchObject({ status: 'recusada' })
  })

  it('never returns a lab-mate\'s row — the constraint is named in the `where`', async () => {
    const cliente = servindo({ sessao: USUARIO })

    const submissoes = submissoesDe(await estadoPessoal(MISSOES))
    // The lab-mate's `aprovada` on MISSAO_3D is in the fixture and reachable under
    // `scopedAccess()`. A reader that dropped the maker clause would key it here as a finished
    // mission on this visitor's card.
    expect(submissoes.has(String(MISSAO_3D.id))).toBe(false)
    expect([...submissoes.values()].map((linha) => linha.id)).toEqual([MINHA_ENVIADA.id, MINHA_RECUSADA.id])

    const [read] = cliente.paraColecao('missaoSubmissao')
    expect(equalsConstraint(read?.where as Where, 'maker')).toBe(PERFIL.id)
  })
})

describe('§3 — the submissions read is scoped to what is on screen', () => {
  it('asks only about the missions it was handed, at depth 0, with room for all of them', async () => {
    const cliente = servindo({ sessao: USUARIO })
    await estadoPessoal(MISSOES)

    const [read] = cliente.paraColecao('missaoSubmissao')
    expect(inConstraint(read?.where as Where, 'missao')).toEqual(MISSOES.map((missao) => missao.id))
    expect(read?.depth).toBe(0)
    // One row per mission per maker, forever (FR-023), so the ceiling is the number of missions
    // asked about — never Payload's default 10, which would drop a maker's own progress the day
    // a lab publishes an eleventh mission.
    expect(read?.limit).toBe(MISSOES.length)
  })

  it('issues no query at all when there are no missions on screen', async () => {
    const cliente = servindo({ sessao: USUARIO })

    const submissoes = submissoesDe(await estadoPessoal([]))
    expect(submissoes.size).toBe(0)
    expect(cliente.paraColecao('missaoSubmissao')).toHaveLength(0)
  })

  it('ignores a mission with no id rather than asking about `undefined`', async () => {
    const cliente = servindo({ sessao: USUARIO })
    await estadoPessoal([MISSAO_LASER, {}])

    const [read] = cliente.paraColecao('missaoSubmissao')
    expect(inConstraint(read?.where as Where, 'missao')).toEqual([MISSAO_LASER.id])
    expect(read?.limit).toBe(1)
  })

  it('is callable directly with a client, which is what makes the map testable per maker', async () => {
    const cliente = new FakeLabClient()
    const submissoes = await submissoesDoMaker(cliente, PERFIL.id, MISSOES)

    expect([...submissoes.keys()]).toEqual([String(MISSAO_LASER.id), String(MISSAO_BORDADO.id)])
  })
})

describe('§4 — a failed personal read costs the percentages, not the band (FR-010, CLR-013)', () => {
  it('reports `indisponivel` when the profile lookup fails, and does not reject', async () => {
    servindo({ sessao: USUARIO, cliente: new FakeLabClient([PERFIL], SUBMISSOES, 'perfilMaker') })

    await expect(estadoPessoal(MISSOES)).resolves.toEqual({ tipo: 'indisponivel' })
  })

  it('reports `indisponivel` when the submissions read fails', async () => {
    servindo({ sessao: USUARIO, cliente: new FakeLabClient([PERFIL], SUBMISSOES, 'missaoSubmissao') })

    await expect(estadoPessoal(MISSOES)).resolves.toEqual({ tipo: 'indisponivel' })
  })

  it('reports `indisponivel` when the tenant door itself cannot be opened', async () => {
    // The Home awaits this read (plan § Sketch 1) and it is NOT one of the four that catch their
    // own failure, so a rejection here is a blank page rather than a band without percentages —
    // which is precisely what FR-010 forbids. `/missoes` left the session lookup outside its
    // try; the moved reader does not, and this is the assertion that says so.
    mocks.currentUser.mockRejectedValue(new Error('sessão indisponível'))

    await expect(estadoPessoal(MISSOES)).resolves.toEqual({ tipo: 'indisponivel' })
  })
})
