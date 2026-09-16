import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SKILL_PIP_COUNT, SkillPips } from '@fablab/ui'

import type { FindArgs } from '../../lib/tenancy/client'

/**
 * T042 / FR-032, FR-019, US9 — **SUAS SKILLS reads real levels**: every *active* skill of this
 * organization, at the level the ledger projected onto the profile, as a ten-pip bar that is
 * empty at level 0.
 *
 * ── Why the panel is driven by the CATALOGUE and not by the profile's array (§1, §4) ────────
 *
 * US9 is worded about the lab's vocabulary, not about one row of one profile: *"the SUAS SKILLS
 * panel shows **each active skill** with its real level … starting empty at level 0"*. Until
 * T042 the page rendered `perfilMaker.skills[]` and nothing else, which is a different set in
 * every direction that matters:
 *
 *   - a profile that was not created by the signup flow — the tenancy fixtures seed one from
 *     `nome`/`handle`/`usuario` alone, and `PerfilMaker.ts` says so — carries **no rows at
 *     all**, so a lab with five skills drew an empty panel under the copy *"este lab ainda não
 *     cadastrou skills"*. The page cannot tell "the lab has no catalogue" from "this profile
 *     has no rows" without reading the catalogue, and it printed the first while observing the
 *     second;
 *   - a skill added to the lab is assigned at level 0 by `Skill.ts`'s hook, and a maker whose
 *     assignment has not landed is a maker missing a skill the lab offers — level 0 is the
 *     **true** level there (no ledger entry credits it), so showing it claims nothing the
 *     ledger cannot account for. Nothing is written to make it so (CLR-014: no runtime repair).
 *
 * The stored rows stay authoritative for the **level**, which is the half FR-032 calls real:
 * `skills[].nivel` is `levelFor` over that skill's ledger entries (CLR-001), recomputed inside
 * the crediting transaction. This page reads it; it never derives one.
 *
 * ── Why a retired skill is checked from BOTH sides (§2) ─────────────────────────────────────
 *
 * FR-019: *"hidden from the maker's panel … without changing stored progress"*. The profile
 * keeps carrying the retired skill precisely so its XP survives, and now the catalogue is read
 * too — so there are two doors a retired skill can walk through, and the fake below deliberately
 * answers the catalogue read **unfiltered** so that a page relying on the query alone is caught
 * by the render rather than by a fake that was kind to it.
 *
 * ── Why this suite calls the page instead of rendering it ───────────────────────────────────
 *
 * Feature 001's CLR-003 keeps the stack at Vitest with no DOM, so the page is awaited as the
 * async function it is and the tree it returns is walked. `SkillPips` is matched by **identity**
 * against the same `@fablab/ui` instance the page imports, so a look-alike strip of divs cannot
 * satisfy an assertion about the ten-pip bar.
 */

/** The lab's catalogue. `SKILL_RETIRADA` is `ativa: false` — deactivation is the product's
 *  remove (FR-015), and the row survives so the XP does. */
const SKILL_A = { id: 1, nome: 'Impressão 3D', slug: 'impressao-3d', ativa: true }
const SKILL_B = { id: 2, nome: 'Corte a Laser', slug: 'corte-a-laser', ativa: true }
/** The skill this maker has **no row for**: added to the lab after they signed up, or assigned
 *  by a path that never ran. The lab offers it, so the panel owes them an empty bar. */
const SKILL_NOVA = { id: 4, nome: 'Eletrônica', slug: 'eletronica', ativa: true }
const SKILL_RETIRADA = { id: 3, nome: 'Serralheria', slug: 'serralheria', ativa: false }

const CATALOGO = [SKILL_A, SKILL_B, SKILL_NOVA, SKILL_RETIRADA]

const PERFIL = {
  id: 42,
  nome: 'Maria Silva',
  handle: 'mariasilva',
  avatarConfig: { itens: {}, direcao: 'frente' },
  nivel: 3,
  xpTotal: 55,
  skills: [
    { skill: SKILL_A, nivel: 3, xp: 15 },
    // Level 0 is the state every new account is in (FR-013): the panel that cannot draw it is
    // the panel nobody sees working.
    { skill: SKILL_B, nivel: 0, xp: 0 },
    // Progress in a skill the lab has since retired. It stays stored (FR-019) and stays hidden.
    { skill: SKILL_RETIRADA, nivel: 7, xp: 38 },
  ],
}

type Linhas = Readonly<Record<string, readonly unknown[]>>

const LINHAS_PADRAO: Linhas = {
  perfilMaker: [PERFIL],
  skill: CATALOGO,
  artigo: [],
  modelo3d: [],
  aula: [],
}

/**
 * The signed-in client.
 *
 * **It answers `skill` with the whole catalogue, retired row included, whatever `where` it was
 * handed.** A fake that honoured the filter would make §2 green for a page that never filters
 * anything itself, and would then be asserting the fake.
 */
class FakeContaClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'
  readonly create = vi.fn(async () => ({}))
  readonly update = vi.fn(async () => ({}))
  readonly delete = vi.fn(async () => ({}))

  constructor(
    private readonly linhas: Linhas,
    /** The collection whose read blows up. */
    private readonly falha?: string,
  ) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    if (this.falha === args.collection) throw new Error(`leitura de ${args.collection} falhou`)
    const docs = (this.linhas[args.collection] ?? []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null

  paraColecao(collection: string): FindArgs[] {
    return this.calls.filter((call) => call.collection === collection)
  }
}

/** The anonymous door the avatar catalogue opens to. It has nothing to do with skills; it is
 *  here because the page reads it, and a rejected promise there would fail every test. */
class FakeCatalogoClient {
  readonly tenantId = 'org-fake'
  find = async <T>(): Promise<{ docs: T[]; totalDocs: number }> => ({ docs: [] as T[], totalDocs: 0 })
  findByID = async <T>(): Promise<T | null> => null
}

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destino: string): never => {
    throw new Error(`NEXT_REDIRECT:${destino}`)
  }),
  currentUser: vi.fn(async (): Promise<{ id: string | number } | null> => ({ id: 7 })),
  getTenantScopedPayloadForRSC: vi.fn(),
  getPublicScopedPayloadForRSC: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('../../lib/tenancy/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))
vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

const { default: Page } = (await import('../../app/(frontend)/minha-conta/page')) as {
  default: () => Promise<ReactNode>
}

type AnyElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

function texto(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(texto).join(' ')
  if (!isElement(node)) return ''
  if (node.type === 'style') return ''
  return texto((node.props.children ?? null) as ReactNode)
}

type OpcoesDeRender = { readonly linhas?: Linhas; readonly falha?: string }

async function renderizar(
  opcoes: OpcoesDeRender = {},
): Promise<{ tree: ReactNode; db: FakeContaClient }> {
  const db = new FakeContaClient(opcoes.linhas ?? LINHAS_PADRAO, opcoes.falha)
  mocks.getTenantScopedPayloadForRSC.mockResolvedValue(db)
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakeCatalogoClient())
  return { tree: (await Page()) as ReactNode, db }
}

/** The panel as it renders: one entry per pip strip, in order. */
async function painel(opcoes: OpcoesDeRender = {}): Promise<{ label: string; level: number }[]> {
  const { tree } = await renderizar(opcoes)
  return findAll(tree, SkillPips).map((strip) => ({
    label: String(strip.props.label ?? ''),
    level: Number(strip.props.level),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUser.mockResolvedValue({ id: 7 })
})

describe('§1 — every ACTIVE skill of the lab, at its real level (FR-032, US9)', () => {
  it('shows the skill the lab offers that this profile carries no row for, at level 0', async () => {
    const strips = await painel()

    expect(
      strips.map((strip) => strip.label),
      'the panel is missing an active skill of this lab. US9 asks for “each active skill”, and ' +
        'the profile’s array is not that set: a skill added after a maker signed up, or assigned ' +
        'by a path that never ran, leaves the lab offering a skill the maker’s panel denies.',
    ).toEqual([SKILL_A.nome, SKILL_B.nome, SKILL_NOVA.nome])
    expect(
      strips.map((strip) => strip.level),
      'the levels are not the ones the ledger projected onto the profile. `skills[].nivel` is ' +
        '`levelFor` over that skill’s entries (CLR-001) — and a skill with no row has no entry ' +
        'either, so 0 is its real level and not a placeholder.',
    ).toEqual([3, 0, 0])
  })

  it('prints the real level as text beside each strip', async () => {
    const { tree } = await renderizar()

    expect(
      texto(tree),
      'the panel draws pips but never the level as text (`NÍVEL n`, minha-conta.md § Painel ' +
        'SUAS SKILLS) — a strip alone makes the reader count boxes.',
    ).toMatch(/n[ÍI]VEL\s*3/i)
    expect(texto(tree)).toMatch(/n[ÍI]VEL\s*0/i)
  })

  it('draws every bar with ten segments, empty at level 0', async () => {
    const strips = await painel()
    const zerada = strips.find((strip) => strip.level === 0)

    expect(SKILL_PIP_COUNT, 'the decided scale is ten pips (visual-identity.md)').toBe(10)
    expect(
      zerada,
      'no skill renders at level 0, so the empty bar — the state every new account and every ' +
        'newly offered skill is in — is undrawn.',
    ).toBeDefined()
  })
})

describe('§2 — a retired skill is hidden from both doors (FR-019)', () => {
  it('leaves it out even though the catalogue read returned it', async () => {
    const strips = await painel()

    expect(
      strips.map((strip) => strip.label),
      'a deactivated skill reached the panel. The fake answers the catalogue read unfiltered on ' +
        'purpose: a page that trusts its own `where` and never checks `ativa` again shows the ' +
        'retired skill the moment the query is widened or the filter is dropped.',
    ).not.toContain(SKILL_RETIRADA.nome)
  })

  it('leaves the maker’s stored progress in it untouched and unprinted', async () => {
    const { tree, db } = await renderizar()

    expect(
      texto(tree),
      '`Skill.ts`: “Skills inativas somem do painel sem alterar o XP de ninguém.” The level 7 ' +
        'this maker holds in the retired skill is stored, and must be neither shown nor rewritten.',
    ).not.toMatch(/n[ÍI]VEL\s*7/i)
    expect(db.update, 'the page rewrote a profile while rendering').not.toHaveBeenCalled()
  })

  it('asks the catalogue for the active skills rather than filtering the lab’s whole vocabulary', async () => {
    const { db } = await renderizar()
    const leituras = db.paraColecao('skill')

    expect(
      leituras,
      'the page never read the lab’s skill catalogue, so “each active skill” is whatever one ' +
        'profile row happens to carry.',
    ).toHaveLength(1)
    expect(
      JSON.stringify(leituras[0]?.where ?? {}),
      'the catalogue read is unfiltered: it pulls every retired skill the lab ever had in order ' +
        'to discard them in JavaScript. `ativa` is a column, and the query can say so.',
    ).toContain('ativa')
  })
})

describe('§3 — the empty panel means the LAB has no skills, not that this profile has no rows', () => {
  it('draws a level-0 bar per offered skill for a maker whose profile carries none', async () => {
    const semLinhas = { ...PERFIL, skills: [] as unknown[] }
    const strips = await painel({ linhas: { ...LINHAS_PADRAO, perfilMaker: [semLinhas] } })

    expect(
      strips.map((strip) => strip.label),
      'a maker with no stored skill rows saw an empty panel under the copy “este lab ainda não ' +
        'cadastrou skills”, while the lab has three. Profiles exist that the signup flow never ' +
        'created (PerfilMaker.ts names the tenancy fixtures), and the page was reporting one ' +
        'thing while observing another.',
    ).toEqual([SKILL_A.nome, SKILL_B.nome, SKILL_NOVA.nome])
    expect(strips.every((strip) => strip.level === 0)).toBe(true)
  })

  it('keeps the empty copy for a lab whose catalogue really is empty', async () => {
    const semLinhas = { ...PERFIL, skills: [] as unknown[] }
    const { tree } = await renderizar({
      linhas: { ...LINHAS_PADRAO, perfilMaker: [semLinhas], skill: [] },
    })

    expect(findAll(tree, SkillPips), 'a lab with no skills drew a bar for something').toHaveLength(0)
    expect(
      texto(tree),
      'a brand-new organization starts with an empty catalogue and its first maker’s panel is ' +
        'empty with it — an ordinary state (FR-013), and it needs to say so.',
    ).toMatch(/skill/i)
  })
})

describe('§4 — a failed catalogue read costs the catalogue, never the panel or the page', () => {
  it('falls back to the levels the profile already carries', async () => {
    const strips = await painel({ falha: 'skill' })

    expect(
      strips.map((strip) => strip.label),
      'an outage on the skill catalogue emptied the panel of skills the profile already holds ' +
        'the levels for. Every 003 listing degrades in place; the maker’s own stored progress ' +
        'does not depend on a second read succeeding.',
    ).toEqual([SKILL_A.nome, SKILL_B.nome])
    expect(strips.map((strip) => strip.level)).toEqual([3, 0])
  })

  it('still renders the rest of the account', async () => {
    const { tree } = await renderizar({ falha: 'skill' })

    expect(
      texto(tree),
      'a failed catalogue read took the whole page down. One outage costs one region.',
    ).toContain(PERFIL.nome)
  })
})

describe('§5 — it displays, and never awards (FR-022)', () => {
  it('writes nothing while rendering the panel', async () => {
    const { db } = await renderizar()

    expect(db.create, 'the panel created a row while rendering').not.toHaveBeenCalled()
    expect(
      db.update,
      'the panel updated a row while rendering. A missing skill row is NOT repaired here: ' +
        'CLR-014 puts reconciliation in CI, and a page that healed projections on view would ' +
        'write on every refresh.',
    ).not.toHaveBeenCalled()
    expect(db.delete).not.toHaveBeenCalled()
  })
})
