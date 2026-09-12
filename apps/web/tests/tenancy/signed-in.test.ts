import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ErasureNotOwnedError, getErasureScopedPayload } from '../../lib/tenancy/erasure-payload'
import { lookupOrganizationByHost } from '../../lib/tenancy/resolve'
import { getTenantScopedPayload } from '../../lib/tenancy/scoped-payload'
import { getSystemScopedPayload } from '../../lib/tenancy/system-payload'
import { isScoped, registeredCollections } from '../../lib/tenancy/scope-registry'
import { buildWorld, type Fixture } from './fixtures'

/**
 * T038 / FR-028, FR-029, SC-007, US10 — **the signed-in vantage point**, and the choke-point
 * rule for the pages this feature adds.
 *
 * ## Why this file exists beside `isolation.test.ts`
 *
 * That harness drives seven surfaces as an **organization admin** and as `master`. Every page
 * feature 004 adds is reached by neither: a maker holds `orgs[].role === 'maker'`, and it is
 * the first role in the product whose pages are *signed in*. `scopedAccess()` is shared, so
 * the point is not that the constraint differs — it is that nothing had ever asked the
 * question from the seat a real person occupies on `/minha-conta`, and a vantage nobody has
 * driven is a vantage nobody has measured.
 *
 * ## The two halves, and why they are one file
 *
 * FR-028 is a single sentence with two clauses: *"signed-in reads go through
 * `getTenantScopedPayload(req)`; no page module imports `payload` or touches `req.payload`."*
 * The second clause is what makes the first one enforceable — a page that reaches Payload
 * directly is isolated by nothing, and no amount of driving the choke point would notice,
 * because the leak would not travel through it. So the static half (§1, §2) fixes *which door*
 * each page may open and the live half (§3–§5) drives what comes through it.
 *
 * ## Nothing here is hand-listed twice
 *
 * Phase 1 cost a round to the opposite: T003's file list named three listings where six
 * qualified, and every page was internally consistent, so no per-page suite could see the gap.
 * The inventory below is therefore checked against the **filesystem** (§1), and the
 * collections each page is measured on are extracted from **its own source** (§3) rather than
 * restated here. A seventh page, or a fourth collection on an existing one, arrives in this
 * matrix without anyone remembering to add it.
 */

const WEB_DIR = fileURLToPath(new URL('../..', import.meta.url))
const FRONTEND = join(WEB_DIR, 'app', '(frontend)')

/**
 * The route roots feature 004 adds. `/login` replaces 001's stub (T013); the other two are
 * new trees. Roots rather than files, because §1 walks them: a page added under one of these
 * is this feature's page whether or not anybody updates `PAGINAS`.
 */
const RAIZES = ['login', 'criar-conta', 'minha-conta'] as const

/** Every door in the product, by the name a module has to write to open it. */
const PORTAS = {
  /** The signed-in choke point (FR-028). */
  sessao: /\bgetTenantScopedPayload(ForRSC)?\b/,
  /** The anonymous path — `overrideAccess: true`, host-bound, published rows and the three
   *  global catalogues its `PUBLIC_GLOBAL_CATALOGUE` allow-list names. */
  anonima: /\bgetPublicScopedPayload(ForRSC)?\b/,
  /** The signup door, reached by `lib/accounts/signup.ts` and never by a page. */
  cadastro: /\bgetSignupScopedPayload\b/,
  /** The erasure door, bounded by ownership rather than by host. */
  exclusao: /\bgetErasureScopedPayload\b/,
} as const

type Porta = keyof typeof PORTAS

/**
 * The pages, and the doors each is allowed to open.
 *
 * The *collections* are deliberately absent: §3 reads those out of each file, so this table
 * cannot drift from what the page does. What it declares is the one thing a source scan
 * cannot infer — which doors are **intended**, so a page that quietly grows a second one is a
 * failure rather than a diff nobody read.
 */
const PAGINAS: { readonly rota: string; readonly arquivo: string; readonly portas: Porta[] }[] = [
  // Authentication is not a data read: `users` is global and a sign-in has no tenant, so this
  // page opens no door at all (`lib/tenancy/session.ts` is the sanctioned path for auth).
  { rota: '/login', arquivo: 'login/page.tsx', portas: [] },
  // Step 1 is the builder. The catalogue is `global` and its collection `read` is `masterOnly`,
  // so the anonymous door is the *only* one that can serve it — CLR-001 and the narrow
  // `PUBLIC_GLOBAL_CATALOGUE` list phase 2 added for exactly these three slugs.
  { rota: '/criar-conta', arquivo: 'criar-conta/page.tsx', portas: ['anonima'] },
  // Step 2 holds the signup action, which reaches the signup door through `lib/accounts`.
  { rota: '/criar-conta/dados', arquivo: 'criar-conta/dados/page.tsx', portas: [] },
  { rota: '/minha-conta', arquivo: 'minha-conta/page.tsx', portas: ['sessao', 'anonima'] },
  { rota: '/minha-conta/avatar', arquivo: 'minha-conta/avatar/page.tsx', portas: ['sessao', 'anonima'] },
  { rota: '/minha-conta/excluir', arquivo: 'minha-conta/excluir/page.tsx', portas: ['sessao', 'exclusao'] },
]

/** Every `.tsx` under a route root, relative to `app/(frontend)` — pages and the modules
 *  beside them, because a co-located island reaches Payload exactly as easily as a page. */
function modulosDe(raiz: string): string[] {
  const encontrados: string[] = []
  const andar = (relativo: string): void => {
    for (const entrada of readdirSync(join(FRONTEND, relativo), { withFileTypes: true })) {
      const filho = join(relativo, entrada.name)
      if (entrada.isDirectory()) andar(filho)
      else if (entrada.name.endsWith('.tsx')) encontrados.push(filho)
    }
  }
  andar(raiz)
  return encontrados
}

const TODOS_OS_MODULOS = RAIZES.flatMap(modulosDe)
const fonte = (arquivo: string): string => readFileSync(join(FRONTEND, arquivo), 'utf8')

/**
 * The collections a module names, from its own source.
 *
 * Both spellings: `collection:` is Payload's argument and `colecao:` is what `minha-conta`'s
 * own content blocks are declared with. A computed slug (`collection: bloco.colecao`) is not
 * matched and does not need to be — the literals it resolves to are in the same file.
 */
const colecoesDe = (texto: string): string[] => [
  ...new Set(
    [...texto.matchAll(/\b(?:collection|colecao)\s*:\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1] ?? ''),
  ),
]

const portasDe = (texto: string): Porta[] =>
  (Object.keys(PORTAS) as Porta[]).filter((porta) => PORTAS[porta].test(texto))

describe('§1 — the inventory covers every page this feature adds', () => {
  it('declares every page.tsx under the feature’s route roots', () => {
    const noDisco = TODOS_OS_MODULOS.filter((m) => m.endsWith('page.tsx')).sort()
    const declarados = PAGINAS.map((p) => p.arquivo).sort()

    expect(
      noDisco,
      'a page under /login, /criar-conta or /minha-conta is not in PAGINAS, so nothing below ' +
        'measures it. Declare it with the doors it may open — this is T003’s lesson, where a ' +
        'hand-kept list named three listings and six qualified.',
    ).toEqual(declarados)
  })

  it('found the modules beside the pages too', () => {
    // A vacuous walk would make every case in §2 pass over an empty set. The islands are the
    // reason the scan is `.tsx` and not `page.tsx`: `PassoDoAvatar` and `EditorDoAvatar` hold
    // the builder, and a client module reaching Payload is the worse version of the same bug.
    expect(
      TODOS_OS_MODULOS.length,
      'the walk found no modules at all — §2 would report a clean scan of nothing.',
    ).toBeGreaterThan(PAGINAS.length)
  })
})

/**
 * The four spellings of reaching past the choke point, as **one** scanner.
 *
 * A function rather than four assertions inline, so the same code that scans the real modules
 * can be pointed at a planted one — preamble item 4: *a gate nobody has watched fail is not a
 * gate*. The planted case is the last `it` in this block and it is permanent, because the day
 * somebody "simplifies" a regex into one that matches nothing, every module below reports clean.
 */
const REGRAS: { readonly nome: string; readonly re: RegExp; readonly porque: string }[] = [
  {
    nome: "import from 'payload'",
    re: /from\s+['"]payload(\/[^'"]*)?['"]/,
    porque:
      'every signed-in read goes through `getTenantScopedPayload(req)` — 000’s import boundary, ' +
      'extended to this feature’s pages by FR-028.',
  },
  {
    nome: 'req.payload',
    re: /\breq\.payload\b/,
    porque:
      'it carries no tenant filter and no `overrideAccess: false`. The same escape as the ' +
      'import, spelled with a property instead of a module.',
  },
  {
    nome: 'getPayload()',
    re: /\bgetPayload\s*\(/,
    porque:
      'eslint.config.mjs fences that out of app code; a test says so as well, because a lint ' +
      'rule can be switched off on the line that breaks the rule.',
  },
  {
    nome: 'the system client',
    re: /\bgetSystemScopedPayload\b|tenancy\/unscoped/,
    porque:
      'it runs with access control OFF. It is import-fenced and unexported from `lib/tenancy` ' +
      'for that reason; a page is never one of its callers.',
  },
]

const violacoesDe = (texto: string): string[] =>
  REGRAS.filter((regra) => regra.re.test(texto)).map((regra) => `${regra.nome} — ${regra.porque}`)

describe('§2 — no page module reaches past the choke point (FR-028)', () => {
  for (const arquivo of TODOS_OS_MODULOS) {
    it(`${arquivo}: imports no payload module and touches no req.payload`, () => {
      expect(
        violacoesDe(fonte(arquivo)),
        `${arquivo} reaches Payload past the choke point.`,
      ).toEqual([])
    })
  }

  it('is a gate that can fail — a planted page trips every rule', () => {
    // Watched failing here rather than by editing a real page: the four rules are the whole
    // content of FR-028's second clause, and a scan that reports clean over a hostile module
    // is the failure mode this file exists to prevent.
    const plantada = [
      "import { getPayload } from 'payload'",
      "import { getSystemScopedPayload } from '../../lib/tenancy/system-payload'",
      'export default async function Page({ req }: { req: { payload: unknown } }) {',
      '  const solta = await getPayload({ config })',
      '  const direto = req.payload',
      "  const sistema = await getSystemScopedPayload('1')",
      '  return null',
      '}',
    ].join('\n')

    expect(
      violacoesDe(plantada),
      'the scanner found no violation in a module that opens Payload four different ways. ' +
        'Every clean report above is worth exactly as much as this case.',
    ).toHaveLength(REGRAS.length)
  })

  for (const pagina of PAGINAS) {
    it(`${pagina.rota}: opens the doors it declares, and no others`, () => {
      expect(
        portasDe(fonte(pagina.arquivo)).sort(),
        `${pagina.rota} does not open the doors this inventory declares. A page that grew a ` +
          'second door grew a second tenancy argument with it, and the argument belongs here ' +
          'beside the row rather than in a diff.',
      ).toEqual([...pagina.portas].sort())
    })
  }

  it('every scoped collection a page names is read through the signed-in door', () => {
    // The positive half of FR-028: the pages above may not reach past the choke point, and a
    // page holding this lab's rows must actually reach *through* it. Derived, not declared —
    // a page that adds a scoped read without adding the door fails here.
    for (const pagina of PAGINAS) {
      const texto = fonte(pagina.arquivo)
      const escopadas = colecoesDe(texto).filter(isScoped)
      if (escopadas.length === 0) continue
      expect(
        PORTAS.sessao.test(texto),
        `${pagina.rota} reads ${escopadas.join(', ')} — scoped rows — without ` +
          '`getTenantScopedPayload`. Whatever door it used carries no tenant filter for them.',
      ).toBe(true)
    }
  })

  it('every collection the pages name is declared in the scope registry', () => {
    // A typo'd slug reads as zero rows forever, and §3 would then measure isolation it never
    // had: "sees nothing of B" is free when the collection does not exist.
    const conhecidas = new Set<string>(registeredCollections())
    for (const pagina of PAGINAS) {
      for (const colecao of colecoesDe(fonte(pagina.arquivo))) {
        expect(
          conhecidas.has(colecao),
          `${pagina.rota} names "${colecao}", which the scope registry does not declare. ` +
            'The choke point treats an unregistered slug as global — no tenant stamp, no ' +
            'tenant filter (SC-006).',
        ).toBe(true)
      }
    }
  })
})

/** Every scoped collection the feature's pages read, across all of them. */
const ESCOPADAS_DAS_PAGINAS = [
  ...new Set(PAGINAS.flatMap((p) => colecoesDe(fonte(p.arquivo)))),
].filter(isScoped)

let world: Fixture
/** The signed-in maker of A: `orgs[].role === 'maker'`, the seat every page above is used from. */
let makerA: { id: string | number }
/** One login, two labs — US10's edge. A profile in each, and the host picks. */
let dupla: { id: string | number }
let perfilDuplaA: { id: string | number }
let perfilDuplaB: { id: string | number }

const HANDLE = `t038-${String(Date.now())}`

/** One membership row, in the shape `users.orgs` is generated with. */
type Vinculo = { organization: number; role: 'admin' | 'staff' | 'maker' }

/**
 * An organization id in the shape a **relationship** will accept.
 *
 * `Fixture` hands every organization id back as a `String(...)`, which is right for a `where`
 * clause and wrong for a write: Payload validates a relationship value with `isValidID` against
 * the collection's id type, and `'3'` is not a valid `number` id. Measured, and the message
 * names the row rather than the cause — *"The following field is invalid: Orgs 1 > Organization"*.
 *
 * It throws rather than handing `NaN` to the write, because `NaN` comes back as the same
 * unreadable validation error one layer further in.
 */
const comoRef = (id: string): number => {
  if (!/^\d+$/.test(id)) {
    throw new Error(
      `organization id "${id}" is not numeric, but \`organizations\` is a number-id collection ` +
        'in this config. A relationship write needs the id in its own type.',
    )
  }
  return Number(id)
}

beforeAll(async () => {
  world = await buildWorld()

  const conta = async (email: string, orgs: Vinculo[]) =>
    (await world.payload.create({
      collection: 'users',
      data: { email, password: 'signed-in-vantage-123', role: 'user', orgs },
      overrideAccess: true,
    })) as unknown as { id: string | number }

  makerA = await conta('maker-a@example.com', [{ organization: comoRef(world.orgA.id), role: 'maker' }])
  dupla = await conta('maker-ab@example.com', [
    { organization: comoRef(world.orgA.id), role: 'maker' },
    { organization: comoRef(world.orgB.id), role: 'maker' },
  ])

  const perfil = async (orgId: string, marca: string) =>
    (await (
      await getSystemScopedPayload(orgId)
    ).create<{ id: string | number }>({
      collection: 'perfilMaker',
      data: { nome: `Dupla ${marca}`, handle: `${HANDLE}-${marca}`, usuario: dupla.id },
    })) as { id: string | number }

  perfilDuplaA = await perfil(world.orgA.id, 'a')
  perfilDuplaB = await perfil(world.orgB.id, 'b')
}, 120_000)

/**
 * The rows this file adds, removed again. Not tidiness: `tests/content/counters.test.ts`
 * reconciles the whole database against a recount of every counter's source rows, and
 * `erasure-door.test.ts` measured its cases going red over two profiles left behind.
 */
afterAll(async () => {
  const apagar = async (orgId: string, id: string | number) =>
    (await getSystemScopedPayload(orgId)).delete({ collection: 'perfilMaker', id })
  if (perfilDuplaA) await apagar(world.orgA.id, perfilDuplaA.id)
  if (perfilDuplaB) await apagar(world.orgB.id, perfilDuplaB.id)
  for (const conta of [makerA, dupla]) {
    if (conta) await world.payload.delete({ collection: 'users', id: conta.id, overrideAccess: true })
  }
}, 60_000)

/** The choke point, opened exactly as an RSC opens it: this user, on this host. */
const comoMaker = async (usuario: { id: string | number }, host: string) =>
  getTenantScopedPayload({ user: usuario, headers: new Headers({ 'x-tenant-host': host }) } as never, {
    lookup: lookupOrganizationByHost,
  })

const ids = (docs: Record<string, unknown>[]): string[] => docs.map((d) => String(d.id))

describe('§3 — the signed-in maker vantage point (SC-007, US10)', () => {
  it('has collections to drive — an empty matrix is a failure, not a pass', () => {
    expect(
      ESCOPADAS_DAS_PAGINAS,
      'no scoped collection was extracted from the pages, so every case below would assert ' +
        'nothing at all while reporting green.',
    ).not.toHaveLength(0)
  })

  for (const colecao of ESCOPADAS_DAS_PAGINAS) {
    it(`${colecao}: a signed-in maker of A sees A’s rows and none of B’s`, async () => {
      const db = await comoMaker(makerA, world.orgA.host)
      const { docs } = await db.find({ collection: colecao })

      // The positive half first. A maker denied outright would satisfy "nothing of B" for
      // free, and this whole vantage would be measuring a 403.
      expect(
        ids(docs),
        `the maker seat cannot read ${colecao} in its OWN lab, so the isolation assertion ` +
          'below is vacuous — it would hold for a page that renders nothing.',
      ).toContain(String(world.rows[colecao]?.A))

      expect(
        ids(docs),
        `a signed-in maker of A received a ${colecao} row belonging to B (SC-007).`,
      ).not.toContain(String(world.rows[colecao]?.B))
    })

    it(`${colecao}: a row of B asked for by id reads as absent, not as forbidden`, async () => {
      // US10's error case: *"a profile id from another organization is requested directly —
      // 404, indistinguishable from one that does not exist"*. `null` is what the page turns
      // into that 404; a thrown `Forbidden` would confirm the row exists.
      const db = await comoMaker(makerA, world.orgA.host)
      const alheio = await db.findByID({ collection: colecao, id: world.rows[colecao]?.B ?? 0 })

      expect(
        alheio,
        `the choke point handed a signed-in maker of A the ${colecao} row of B when asked by id.`,
      ).toBeNull()
    })
  }

  it('the avatar save cannot be steered at another lab’s profile', async () => {
    // The one write the pages perform through the choke point (`salvarAvatar`). The id it
    // passes comes from the session, but the property that makes that safe is the client's,
    // not the caller's: a foreign id must update nothing rather than be fetched and judged.
    const db = await comoMaker(makerA, world.orgA.host)
    const alvo = world.rows.perfilMaker?.B ?? 0
    const escrita = await db.update({
      collection: 'perfilMaker',
      id: alvo,
      data: { avatarConfig: { base: 'F' } },
    })

    expect(escrita, 'a maker of A updated a perfilMaker row of B through the choke point.').toBeNull()

    const sistemaB = await getSystemScopedPayload(world.orgB.id)
    const depois = await sistemaB.findByID<{ avatarConfig?: unknown }>({
      collection: 'perfilMaker',
      id: alvo,
    })
    expect(
      depois?.avatarConfig ?? null,
      'the update returned nothing but wrote anyway — the row of B carries A’s configuration.',
    ).toBeNull()
  })
})

describe('§4 — the host decides which lab, never the session (US10)', () => {
  it('shows one login its A profile on A’s host and its B profile on B’s', async () => {
    const perfilNoHost = async (host: string) => {
      const db = await comoMaker(dupla, host)
      const { docs } = await db.find({ collection: 'perfilMaker', where: { usuario: { equals: dupla.id } } })
      return ids(docs)
    }

    // `scopedAccess()` returns `{ tenant: { in: [A, B] } }` for this account — both labs, by
    // design, because the membership is real. What confines the page to one of them is the
    // AND with the host-resolved tenant, and that is the property under test: a session that
    // decided this would show whichever profile came first.
    const naA = await perfilNoHost(world.orgA.host)
    expect(naA, 'the A host did not show this login its A profile').toContain(String(perfilDuplaA.id))
    expect(naA, 'the A host showed a profile belonging to B').not.toContain(String(perfilDuplaB.id))

    const naB = await perfilNoHost(world.orgB.host)
    expect(naB, 'the B host did not show this login its B profile').toContain(String(perfilDuplaB.id))
    expect(naB, 'the B host showed a profile belonging to A').not.toContain(String(perfilDuplaA.id))
  })
})

describe('§5 — the deletion page’s door is bounded across labs too (FR-031, US10)', () => {
  const abrir = (host: string, usuarioId: string | number, perfilId: string | number) =>
    getErasureScopedPayload({ host, usuarioId, perfilId })

  it('opens on the owner’s own host — so the refusal below is not a broken door', async () => {
    const porta = await abrir(world.orgB.host, dupla.id, perfilDuplaB.id)
    expect(String(porta.perfilId)).toBe(String(perfilDuplaB.id))
    expect(porta.tenantId).toBe(String(world.orgB.id))
  })

  it('refuses a profile of another lab, even to the account that owns it there', async () => {
    // `erasure-door.test.ts` proves the same-host case: one maker cannot open the door onto a
    // neighbour's profile. This is the other axis — the *same person*, on the wrong host. The
    // ownership proof reads through a client bound to A, so B's profile is absent rather than
    // somebody else's, and the refusal is the same `ErasureNotOwnedError` either way.
    await expect(
      abrir(world.orgA.host, dupla.id, perfilDuplaB.id),
      'the erasure door opened on A’s host onto a profile that lives in B.',
    ).rejects.toBeInstanceOf(ErasureNotOwnedError)
  })
})
