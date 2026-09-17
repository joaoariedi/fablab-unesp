import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ORDENACAO_DO_RANKING } from '../../app/(frontend)/ranking/page'
import { ESCOLARIDADES, VINCULOS_UNESP } from '../../collections/content/PerfilMaker'
import { PublicReadDeniedError, TenantUnresolvedError } from '../../lib/tenancy/errors'
import {
  CAMPOS_DO_RANKING,
  getPublicScopedPayloadForRSC,
  readPublicRanking,
} from '../../lib/tenancy/public-payload'
import { buildWorld, type Fixture } from './fixtures'

/**
 * T009 / FR-017, FR-021, FR-031 — **`readPublicRanking`**, the projected anonymous reader.
 *
 * D2 puts this reader in `lib/tenancy` because neither existing path serves it: `scopedAccess()`
 * refuses an anonymous caller outright, and a bare `publicList` declaration serves the **whole
 * `perfilMaker` row** — `dataNascimento`, `escolaridade`, `curso`, `vinculoUnesp`, `usuario`, the
 * consented personal data of feature 004. The bound is therefore the `select` in the query, and
 * this file measures it against a real Postgres rather than against a fake that could not tell a
 * projected read from a full row trimmed afterwards.
 *
 * ── Why the fixture is built the way it is ──────────────────────────────────────────────────
 *
 * The board below is arranged so that **every wrong sort gives a different answer**:
 *
 *   created:   @zelia(30) → @amanda(12) → @bruna(12) → @carlos(50), after the seeded @makera(0)
 *   expected:  @carlos, @zelia, @amanda, @bruna, @makera      — `['-xpTotal', 'handle']`
 *   -createdAt: @carlos, @bruna, @amanda, @zelia, @makera     — the measured 005 defect's answer
 *
 * `@amanda` and `@bruna` are tied at 12 XP **on purpose**, and their handles ascend in creation
 * order, so the declared tie-break and the newest-first fallback disagree about them too. A
 * fixture with distinct XP values would pass against a reader that declared no tie-break at all,
 * which is the half of FR-013 `/ranking` already paid to learn (`tests/public/ranking-ordem.test.ts`).
 *
 * `@makerb`, in the neighbouring organization, is given more XP than anyone here: if the tenant
 * clause were ever dropped it would top this board rather than be quietly absent from it.
 *
 * T009b, T010 and T011 extend this file: the door's refusal of an unprojected call, the security
 * assertion against a maker with **all five** personal columns populated, and the tree scan.
 */

const request = vi.hoisted(() => ({ host: 'org-a.localhost' }))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: request.host }),
}))

/** The six columns FR-017/FR-018 render, and the whole of what the projection may fetch. */
const CAMPOS_PUBLICOS = ['id', 'nome', 'handle', 'avatarRender', 'xpTotal', 'nivel'] as const

/** The board this fixture is built to produce, top to bottom. */
const ORDEM_ESPERADA = ['@carlos', '@zelia', '@amanda', '@bruna', '@makera']

/** What a reader that lost its sort would answer instead — Payload's `-createdAt` fallback. */
const ORDEM_DO_DEFEITO = ['@carlos', '@bruna', '@amanda', '@zelia', '@makera']

/**
 * The two personal values §9 searches the serialized row for (T010).
 *
 * Declared here rather than typed twice: the scan asserts the *datum* never leaves, so the value
 * the fixture writes and the value the assertion looks for have to be the same string or the
 * search is for something nobody stored.
 */
const CURSO_DO_CARLOS = 'Engenharia de Controle e Automação'
const NASCIMENTO_DO_CARLOS = '1999-04-01T00:00:00.000Z'

let world: Fixture
/**
 * Captured rather than thrown: a throw in `beforeAll` aborts the file and reports its tests as
 * *skipped*, which a gate reading the output cannot tell from a harness that measured nothing
 * (tasks.md § preamble item 4). §1 asserts it in wording no ranking assertion shares.
 */
let falhaNoPreparo: unknown = null

beforeAll(async () => {
  try {
    world = await buildWorld()

    const criar = async (handle: string, xpTotal: number, extra: Record<string, unknown> = {}) =>
      world.payload.create({
        collection: 'perfilMaker',
        data: {
          nome: `Maker ${handle}`,
          handle,
          usuario: world.userA.id,
          tenant: world.orgA.id,
          xpTotal,
          nivel: 1,
          ...extra,
        } as never,
        overrideAccess: true,
      })

    // Creation order IS the fixture: see the docblock. Sequential awaits, so `createdAt` ascends.
    await criar('@zelia', 30)
    await criar('@amanda', 12)
    await criar('@bruna', 12)
    await criar('@carlos', 50, {
      // The image seeded into THIS organization — `sameTenant` refuses the neighbour's.
      avatarRender: Number(world.rows.midiaImagem!.A),
      // **All five consented columns of feature 004, populated** (T010, FR-030). `usuario` the
      // `criar` helper above already writes, because the column is required; the other four are
      // null on every seeded profile, and a null column is absent from every result — projected
      // or not. §4 and §9 assert this reader discloses none of them, and neither assertion can
      // mean anything unless the row it is made against HAD them to disclose (tasks.md §
      // preamble item 3, in its sixth occurrence).
      dataNascimento: NASCIMENTO_DO_CARLOS,
      // The option keys, read from the collection's own lists: a literal here would be a second
      // copy of an enum `db-postgres` materialises as a Postgres type, and it would fail the
      // create — not the assertion — the day a value is renamed.
      vinculoUnesp: Object.keys(VINCULOS_UNESP)[0],
      escolaridade: Object.keys(ESCOLARIDADES)[0],
      curso: CURSO_DO_CARLOS,
    })

    // The seeded profiles carry whatever the ledger gave them; pinned here so the board is a
    // property of this file rather than of `sincronizarDerivadosSemeados`.
    await world.payload.update({
      collection: 'perfilMaker',
      id: world.rows.perfilMaker!.A,
      data: { xpTotal: 0, nivel: 0 } as never,
      overrideAccess: true,
    })
    await world.payload.update({
      collection: 'perfilMaker',
      id: world.rows.perfilMaker!.B,
      data: { xpTotal: 999, nivel: 9 } as never,
      overrideAccess: true,
    })
  } catch (err) {
    falhaNoPreparo = err
  }
}, 120_000)

/** The board as an anonymous visitor on organization A's host receives it. */
const ler = async (limite: number) => {
  request.host = world.orgA.host
  return readPublicRanking(limite)
}

describe('§1 — the harness ran, and the premise it rests on', () => {
  it('built a world with a board to read', () => {
    expect(falhaNoPreparo, `the harness never ran: ${String(falhaNoPreparo)}`).toBeNull()
  })

  it('reads the order `/ranking` declares, rather than one of its own', () => {
    // The premise of §2: if the page's declared order ever changes, the expectations below
    // describe a board nobody asked for, and this is where that is said out loud.
    expect(
      ORDENACAO_DO_RANKING,
      'the declared order changed; §2 below is written against `-xpTotal` then `handle`',
    ).toEqual(['-xpTotal', 'handle'])
  })
})

describe('§2 — the order, and the tie-break', () => {
  it('lists this lab by XP descending, ties broken by handle', async () => {
    const linhas = await ler(10)

    expect(linhas, 'the read failed; there is no board to judge').not.toBeNull()
    expect(
      linhas!.map((linha) => linha.handle),
      'the board is not in the order `/ranking` declares',
    ).toEqual(ORDEM_ESPERADA)
  })

  it('is not the newest-first board a dropped sort would produce', async () => {
    // Named separately from the equality above, because this is the failure that actually
    // shipped once: a sort Payload could not resolve leaves the `-createdAt` it pushes
    // unconditionally, and the board looks plausible while ordering by nothing anyone asked for.
    const linhas = await ler(10)

    expect(
      linhas!.map((linha) => linha.handle),
      'the reader ordered by creation date — its sort resolved to nothing',
    ).not.toEqual(ORDEM_DO_DEFEITO)
  })

  it('never crosses into the neighbouring lab, whose maker has more XP than anyone here', async () => {
    const linhas = await ler(10)

    expect(
      linhas!.map((linha) => linha.handle),
      "organization B's maker is on organization A's board — the tenant clause was displaced",
    ).not.toContain('@makerb')
  })
})

describe('§3 — the limit the caller names', () => {
  it('returns exactly that many rows, taken from the top', async () => {
    const linhas = await ler(2)

    expect(linhas, 'the read failed; there is no board to judge').not.toBeNull()
    expect(linhas!.map((linha) => linha.handle), 'the limit was ignored or applied after the sort').toEqual(
      ORDEM_ESPERADA.slice(0, 2),
    )
  })
})

describe('§4 — the projection is the bound', () => {
  it('returns the six public columns and nothing else', async () => {
    const linhas = await ler(10)
    const topo = linhas![0]!

    expect(
      Object.keys(topo).sort(),
      'the row carries a column the ranking never asked for — the select is not the bound',
    ).toEqual([...CAMPOS_PUBLICOS].sort())
  })

  it('does not fetch a consented personal column the fixture actually populated', async () => {
    const linhas = await ler(10)
    const topo = linhas![0]! as unknown as Record<string, unknown>

    expect(topo.handle, 'the assertion below is about the wrong row').toBe('@carlos')
    expect(
      Object.prototype.hasOwnProperty.call(topo, 'curso'),
      '`curso` crossed the anonymous door — it was read into an elevated context, not projected away',
    ).toBe(false)
  })
})

describe('§5 — depth 1, for `avatarRender` alone', () => {
  it('populates the composed render instead of handing the page an id', async () => {
    const linhas = await ler(10)
    const comAvatar = linhas!.find((linha) => linha.handle === '@carlos')!

    expect(
      typeof comAvatar.avatarRender === 'object' && comAvatar.avatarRender !== null,
      'avatarRender came back unpopulated — the card would render an id',
    ).toBe(true)
    expect((comAvatar.avatarRender as { id?: unknown }).id).toBe(Number(world.rows.midiaImagem!.A))
  })

  it('leaves a maker with no composed render null, rather than absent', async () => {
    // FR-019: the compositor is blocked, so a null render is the ordinary case and the card
    // draws the placeholder. A row that omitted the key would make that indistinguishable from
    // a projection that forgot to ask for it.
    const linhas = await ler(10)
    const semAvatar = linhas!.find((linha) => linha.handle === '@zelia')!

    expect(
      Object.prototype.hasOwnProperty.call(semAvatar, 'avatarRender'),
      'the key is missing on a maker with no render — the card cannot tell null from unasked',
    ).toBe(true)
    expect(semAvatar.avatarRender ?? null).toBeNull()
  })
})

describe('§6 — an unresolved host is the site 404, never an empty board', () => {
  it('rethrows TenantUnresolvedError rather than reporting a failed read', async () => {
    // The obligation D1 spells out: a reader that caught this and returned `null` would swallow
    // its own 404, and the Home would render an error card on a host that belongs to nobody.
    request.host = 'nao-existe.localhost'

    await expect(readPublicRanking(5)).rejects.toBeInstanceOf(TenantUnresolvedError)
  })
})

describe('§7 — the order is shared, not retyped (FR-021)', () => {
  it('imports `ORDENACAO_DO_RANKING` and declares no sort literal of its own', async () => {
    const fonte = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../lib/tenancy/public-payload.ts', import.meta.url), 'utf8'),
    )

    expect(
      fonte.includes('ORDENACAO_DO_RANKING'),
      'the reader does not reference the declared order — a second ranking is free to disagree',
    ).toBe(true)
    expect(
      fonte.includes("'-xpTotal'") || fonte.includes('"-xpTotal"'),
      'the sort key is retyped here; FR-021 says the order is expressed once, in `/ranking`',
    ).toBe(false)
  })
})

/**
 * T009b / FR-036, SC-021 — **the refusal is the door's, not the reader's.**
 *
 * §4 above proves `readPublicRanking` asks for six columns. That is a property of *that reader*,
 * and FR-036 is a property of the **door**: the `publicList` declaration admitting `perfilMaker`
 * is collection-wide and permanent, so the day after FR-017 ships, any page may write
 * `db.find({ collection: 'perfilMaker' })` and — without this gate — receive `dataNascimento`,
 * `escolaridade`, `curso`, `vinculoUnesp` and `usuario`, the consented personal data of feature
 * 004. A careful reader is not a bound; the refusal at the door is.
 *
 * So this section does not go through `readPublicRanking`. It **cannot**: that function catches
 * everything but `TenantUnresolvedError` and answers `null`, which is indistinguishable from a
 * database that was down — a refusal observed through it would prove nothing about who refused.
 * The public client is opened directly and asked the unprojected question itself.
 *
 * The three refused shapes are one requirement, not three: `namesItsColumns` is written against
 * payload 3.88's `getSelectMode`, which flips the whole projection to **exclude** mode the moment
 * any value is `false`. An absent select, `{ dataNascimento: false }` and `{}` therefore all end
 * in columns nobody named being fetched (the first two) or in a gate satisfied by an object that
 * names nothing (the third). A test that only covered the absent case would pass against a guard
 * weakened to `select !== undefined`, which is the exact shape of preamble item 3.
 */
describe('§8 — the door refuses an unprojected `perfilMaker` read (FR-036, SC-021)', () => {
  /** The anonymous client an RSC on organization A's host receives. */
  const porta = async () => {
    // §6 left the host unresolvable. Restored here, so a refusal below is the projection gate's
    // and not a 404 wearing its name.
    request.host = world.orgA.host
    return getPublicScopedPayloadForRSC()
  }

  it('refuses `{ collection: perfilMaker }` with no select, as a rejection', async () => {
    const db = await porta()

    // Captured, not awaited inline: the door's `find` is `async` deliberately — a synchronous
    // throw out of a promise-returning method is a different thing for a caller to catch than a
    // rejection, and every other method here rejects. A sync throw fails this line by name.
    let tentativa: Promise<unknown> = Promise.resolve()
    expect(() => {
      tentativa = db.find({ collection: 'perfilMaker' })
    }, 'the door threw synchronously; a caller with `.catch()` on the promise never sees it').not.toThrow()

    await expect(tentativa).rejects.toBeInstanceOf(PublicReadDeniedError)
  })

  it('names the reason: the projection, the personal columns, and the collection', async () => {
    const db = await porta()

    const erro = await db.find({ collection: 'perfilMaker' }).then(
      () => null,
      (causa: unknown) => causa as Error,
    )

    expect(erro, 'the unprojected read was served — there is no refusal to read').not.toBeNull()
    // SC-021 asks for a message that names the reason, because the reader who trips this is
    // holding a declaration that says the collection IS listable: a message about `publicList`
    // would send them to fix something that is not broken.
    expect(erro!.message, 'the refusal does not name the collection it is about').toContain('perfilMaker')
    expect(erro!.message, 'the refusal does not tell the caller a `select` is what is missing').toContain(
      '`select`',
    )
    expect(
      erro!.message,
      'the refusal does not say what is behind the gate — consented personal data',
    ).toContain('dataNascimento')
  })

  it('refuses an exclude-mode select, which looks like a projection and binds nothing', async () => {
    const db = await porta()

    // `getSelectMode` returns `exclude` on the first `false`: every column NOT named comes back,
    // so this call would serve the four personal ones the caller forgot to exclude.
    await expect(
      db.find({ collection: 'perfilMaker', select: { dataNascimento: false } }),
    ).rejects.toBeInstanceOf(PublicReadDeniedError)
  })

  it('refuses an empty select — carrying an object is not naming a column', async () => {
    const db = await porta()

    // Harmless today (include mode with nothing included yields `{ id }`), and refused anyway:
    // "carries a select" and "says which columns may leave" have to be the same question, or the
    // next dynamically-built projection satisfies the gate while naming nothing.
    await expect(db.find({ collection: 'perfilMaker', select: {} })).rejects.toBeInstanceOf(
      PublicReadDeniedError,
    )
  })

  it('serves the same call once it names its columns — the gate is the projection, not the collection', async () => {
    const db = await porta()

    // The contrast is the point. Without it, a door that refused `perfilMaker` outright would
    // pass every assertion above while breaking FR-017, and the four refusals would be measuring
    // an admission that no longer exists.
    const { docs } = await db.find<Record<string, unknown>>({
      collection: 'perfilMaker',
      select: { ...CAMPOS_DO_RANKING },
      limit: 1,
    })

    expect(docs.length, 'the projected read returned nothing; the contrast proves nothing').toBeGreaterThan(0)
    expect(
      Object.prototype.hasOwnProperty.call(docs[0]!, 'curso'),
      'the projected read served a consented column — the select is not the bound',
    ).toBe(false)
  })
})

/**
 * T010 / FR-030, FR-031 — **the security assertion, made against a row that had something to leak.**
 *
 * §4 above asks the same question of one column. This section is the whole of it, and it exists
 * separately because the half that does the work is not the absence assertion — it is the
 * **control** above it. `perfilMaker` is seeded with `nome`, `handle` and `usuario` alone, so
 * `dataNascimento`, `escolaridade`, `curso` and `vinculoUnesp` are null on every fixture profile;
 * a null column is absent from every result, projected or not. Asserting its absence on such a row
 * measures nothing at all, and passes just as well against a reader with no `select` — which is
 * preamble item 3 in its sixth occurrence, and four of the previous five were live security
 * defects.
 *
 * So the maker this section reads is created with **all five** populated, the control asserts an
 * elevated read still sees them, and only then does the absence of each one through the anonymous
 * door mean the projection kept it out.
 *
 * **The value scan is the second half.** `hasOwnProperty` answers *"is the column named here"*,
 * and a row that carried `curso` under some other key — inside the populated `avatarRender`, in a
 * serialized error, in a field a later feature adds — would satisfy every key assertion while
 * disclosing the datum. The two personal values distinctive enough to search for are searched for
 * in the serialized row itself.
 */
describe('§9 — the five consented columns, on a maker that has them (FR-030)', () => {
  /** The consented personal data of feature 004; the whole of what this door must not fetch. */
  const PESSOAIS = ['dataNascimento', 'escolaridade', 'curso', 'vinculoUnesp', 'usuario'] as const

  /** `@carlos` as an elevated reader sees him — every column, no projection. */
  const perfilCompleto = async (): Promise<Record<string, unknown>> => {
    const { docs } = await world.payload.find({
      collection: 'perfilMaker',
      where: { handle: { equals: '@carlos' } } as never,
      depth: 0,
      overrideAccess: true,
    })
    return (docs[0] ?? {}) as unknown as Record<string, unknown>
  }

  it('the control: the fixture maker really carries all five, so their absence can mean something', async () => {
    const cheio = await perfilCompleto()

    expect(cheio.handle, 'the control read found no `@carlos`; there is no row to judge').toBe('@carlos')
    for (const campo of PESSOAIS) {
      expect(
        cheio[campo] ?? null,
        `the fixture maker has no ${campo}, so asserting the ranking omits it proves nothing — ` +
          'populate the column in `beforeAll` (tasks.md § preamble item 3)',
      ).not.toBeNull()
    }
  })

  it('returns none of them through the anonymous ranking', async () => {
    const linhas = await ler(10)

    expect(linhas, 'the read failed; there is no board to judge').not.toBeNull()
    const topo = linhas![0]! as unknown as Record<string, unknown>
    expect(topo.handle, 'the assertions below are about the wrong row').toBe('@carlos')

    for (const campo of PESSOAIS) {
      expect(
        Object.prototype.hasOwnProperty.call(topo, campo),
        `${campo} crossed the anonymous door — it was read into an elevated context on behalf ` +
          'of nobody, not projected away',
      ).toBe(false)
    }
  })

  it('carries neither personal value anywhere in the row, under any key', async () => {
    const linhas = await ler(10)
    const serializada = JSON.stringify(linhas![0])

    // Only the two values distinctive enough to be searched for: a `vinculoUnesp` of `aluno` or
    // an `escolaridade` of `fundamental` are short enough to collide with unrelated text, and a
    // scan that can false-positive is a scan somebody will delete.
    expect(
      serializada,
      'the course reached the anonymous row under some other key — the column is absent, the datum is not',
    ).not.toContain(CURSO_DO_CARLOS)
    expect(
      serializada,
      'the date of birth reached the anonymous row under some other key',
    ).not.toContain(NASCIMENTO_DO_CARLOS.slice(0, 10))
  })
})

/**
 * T011 / FR-031, CHK022 — **the backstop, and the admission that it is one.**
 *
 * §8 is the guard. The door refuses an unprojected `perfilMaker` read at runtime, in whatever form
 * the call is written — a dynamic collection name, a helper, a shape nobody anticipated. This
 * section catches the *careless* case one step earlier, and its whole value is the **message**: a
 * developer who writes the obvious `db.find({ collection: 'perfilMaker' })` against the anonymous
 * client is told which file did it, and which reader they should have used, before the branch is
 * pushed — instead of meeting `PublicReadDeniedError` on a page at runtime.
 *
 * CHK022 asks whether a scan is a guard or a convention. **It is a convention**, and that is the
 * honest answer: it fails only against a call written in a form it recognises, which is exactly
 * why T008's refusal — not this — is what makes the bound structural. What the two controls below
 * buy is that this convention is never *vacuous*:
 *
 *   - **the real-tree control** asserts the scan still recognises the one sanctioned call that
 *     actually exists, `readPublicRanking`'s. A recogniser that matched nothing at all would
 *     satisfy the backstop for ever, and the day it broke — a rename, a reformat, an exclusion
 *     that swallowed `lib/` — is the day it would go silently green. This is preamble item 3 in
 *     the only form a negative assertion can take.
 *   - **the planted control** writes a careless caller into a scratch tree and asserts the scan
 *     names it, beside a near-miss that reads the same collection through the **signed-in** door
 *     and must not be named. The two calls are one word apart in the source; only one of them is
 *     an anonymous read, and a scan that could not tell them apart would either flag five honest
 *     pages or nothing at all.
 *
 * ── How a call is attributed to a door ──────────────────────────────────────────────────────
 *
 * Per-file matching was the first draft and is wrong here: `minha-conta/page.tsx` and
 * `missoes/page.tsx` each open the public client for a catalogue *and*, hundreds of lines away,
 * read `perfilMaker` through the signed-in one. So the scan resolves the **receiver** of the
 * `find` — the `db` of `db.find({ collection: 'perfilMaker' })` — and classifies the door by the
 * line that most recently bound that name, which catches a parameter typed
 * `Awaited<ReturnType<typeof getTenantScopedPayloadForRSC>>` as readily as a `const`.
 */
describe('§10 — no second caller lists `perfilMaker` through the public door (FR-031, CHK022)', () => {
  /** `apps/web` — everything this app ships. */
  const RAIZ_DO_APP = fileURLToPath(new URL('../../', import.meta.url))

  /** The one sanctioned caller: `readPublicRanking`, the projected reader §4 measures. */
  const LEITOR_SANCIONADO = join('lib', 'tenancy', 'public-payload.ts')

  /** Vendored, generated, or not shipped. `tests` is excluded because this file is in it. */
  const FORA_DO_ESCOPO = new Set(['node_modules', '.next', 'tests', 'public'])

  /** How far above the `collection:` line the enclosing `find(` may be. */
  const JANELA_DO_FIND = 15

  const PORTA_PUBLICA = /getPublicScopedPayload(ForRSC)?\b/
  const COLECAO = /collection:\s*['"`]perfilMaker['"`]/
  const ABERTURA_DO_FIND = /(\w+)\s*\.\s*find\s*(?:<[^>]*>)?\s*\(/

  /** Which client a `perfilMaker` listing was made through. */
  type Porta = 'publica' | 'outra' | 'indeterminada'
  type Leitura = { readonly arquivo: string; readonly linha: number; readonly porta: Porta }

  /** Every `.ts`/`.tsx` under a root that is not excluded above. */
  const fontesDeProducao = (raiz: string, achadas: string[] = []): string[] => {
    for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
      if (FORA_DO_ESCOPO.has(entrada.name)) continue
      const caminho = join(raiz, entrada.name)
      if (entrada.isDirectory()) fontesDeProducao(caminho, achadas)
      else if (/\.tsx?$/.test(entrada.name)) achadas.push(caminho)
    }
    return achadas
  }

  /** A line that runs. A docblock naming the public door is not a call of it — this file's own
   *  §8 prose would otherwise report `lib/tenancy/public-payload.ts` four times over. */
  const ehCodigo = (linha: string): boolean => {
    const inicio = linha.trimStart()
    return inicio !== '' && !inicio.startsWith('//') && !inicio.startsWith('*') && !inicio.startsWith('/*')
  }

  /** The `db` of `db.find({ collection: 'perfilMaker' })`, searched upwards from the collection
   *  line. `null` means no `find` opened above it: a `create` or an `update` is a write, and a
   *  write of one row is not the enumeration this scan is about. */
  const receptorDoFind = (linhas: readonly string[], ate: number): { nome: string; linha: number } | null => {
    for (let j = ate; j >= Math.max(0, ate - JANELA_DO_FIND); j -= 1) {
      const linha = linhas[j]!
      if (!ehCodigo(linha)) continue
      const achado = linha.match(ABERTURA_DO_FIND)
      if (achado) return { nome: achado[1]!, linha: j }
    }
    return null
  }

  /** The door a receiver came from, by the nearest line that bound its name — `const db = …`, a
   *  destructuring, or a typed parameter. `indeterminada` is reported rather than assumed
   *  harmless: a listing whose door the scan cannot name is one nobody has checked. */
  const portaDoReceptor = (linhas: readonly string[], deLinha: number, nome: string): Porta => {
    const ligacao = new RegExp(`\\b${nome}\\b\\s*[:=]`)
    for (let j = deLinha; j >= 0; j -= 1) {
      const linha = linhas[j]!
      if (!ehCodigo(linha) || !ligacao.test(linha)) continue
      return PORTA_PUBLICA.test(linha) ? 'publica' : 'outra'
    }
    return 'indeterminada'
  }

  /** Every `perfilMaker` listing in one file, each attributed to the door it went through.
   *  `raiz` is what the reported path is relative to — the app for the real scan, the scratch
   *  tree for the planted control, so neither report is a machine-specific absolute path. */
  const leiturasDoArquivo = (raiz: string, arquivo: string): Leitura[] => {
    const linhas = readFileSync(arquivo, 'utf8').split('\n')
    const achadas: Leitura[] = []
    linhas.forEach((linha, i) => {
      if (!ehCodigo(linha) || !COLECAO.test(linha)) return
      const receptor = receptorDoFind(linhas, i)
      if (receptor === null) return
      // The inline shape `(await getPublicScopedPayloadForRSC()).find(…)` binds no name at all,
      // so the receiver walk cannot classify it. A door named inside the call's own few lines is
      // that call's door — the window is deliberately the `find`'s, not the file's.
      const janela = linhas.slice(receptor.linha, i + 1).filter(ehCodigo)
      const porta = janela.some((l) => PORTA_PUBLICA.test(l))
        ? 'publica'
        : portaDoReceptor(linhas, receptor.linha, receptor.nome)
      achadas.push({ arquivo: relative(raiz, arquivo), linha: i + 1, porta })
    })
    return achadas
  }

  /** Every `perfilMaker` listing the app ships. */
  const leiturasDaArvore = (raiz: string): Leitura[] =>
    fontesDeProducao(raiz).flatMap((arquivo) => leiturasDoArquivo(raiz, arquivo))

  const descrever = (leituras: readonly Leitura[]): string =>
    leituras.map((l) => `${l.arquivo}:${l.linha}`).join(', ')

  it('the control: still recognises the one sanctioned call, so its silence means something', () => {
    const publicas = leiturasDaArvore(RAIZ_DO_APP).filter((l) => l.porta === 'publica')

    expect(
      publicas.map((l) => l.arquivo),
      'the scan no longer sees `readPublicRanking`’s own call — it recognises nothing, and ' +
        'the assertions below would stay green against any second caller (tasks.md § preamble item 3)',
    ).toContain(LEITOR_SANCIONADO)
  })

  it('the control: names a careless caller planted in a scratch tree, and spares the signed-in one', () => {
    // Written to a temp root rather than into this repository: a canary file left behind under
    // `apps/web` would be a `perfilMaker` reader that ships, which is the thing being forbidden.
    const raiz = mkdtempSync(join(tmpdir(), 'scan-perfil-'))
    try {
      writeFileSync(
        join(raiz, 'descuidado.ts'),
        [
          "import { getPublicScopedPayloadForRSC } from '../../lib/tenancy/public-payload'",
          'export async function listar() {',
          '  const db = await getPublicScopedPayloadForRSC()',
          "  const { docs } = await db.find({ collection: 'perfilMaker', limit: 5 })",
          '  return docs',
          '}',
        ].join('\n'),
      )
      writeFileSync(
        join(raiz, 'legitimo.ts'),
        [
          "import { getTenantScopedPayloadForRSC } from '../../lib/tenancy/scoped-payload'",
          'export async function meuPerfil(usuario: string) {',
          '  const db = await getTenantScopedPayloadForRSC()',
          "  const { docs } = await db.find({ collection: 'perfilMaker', where: { usuario: { equals: usuario } } })",
          '  return docs[0]',
          '}',
        ].join('\n'),
      )

      const leituras = leiturasDaArvore(raiz)

      expect(
        leituras.filter((l) => l.porta === 'publica').map((l) => l.arquivo),
        'the scan did not name a caller written in the plainest form there is — it catches nothing',
      ).toEqual(['descuidado.ts'])
      expect(
        leituras.filter((l) => l.porta !== 'publica').map((l) => l.arquivo),
        'the scan cannot tell the signed-in door from the anonymous one; it would flag the five ' +
          'honest pages that read a profile on behalf of whoever is signed in',
      ).toEqual(['legitimo.ts'])
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it('finds no second caller listing `perfilMaker` through the public door', () => {
    const intrusas = leiturasDaArvore(RAIZ_DO_APP).filter(
      (l) => l.porta === 'publica' && l.arquivo !== LEITOR_SANCIONADO,
    )

    expect(
      descrever(intrusas),
      'a second caller lists `perfilMaker` through the anonymous client. The door refuses it ' +
        'unprojected (§8), but the projection is per-call and the next one may forget: call ' +
        '`readPublicRanking(limit)` instead, which carries `CAMPOS_DO_RANKING` as its `select`',
    ).toBe('')
  })

  it('leaves no `perfilMaker` listing whose door it could not identify', () => {
    const cegas = leiturasDaArvore(RAIZ_DO_APP).filter((l) => l.porta === 'indeterminada')

    expect(
      descrever(cegas),
      'a `perfilMaker` listing is made through a client this scan cannot attribute to a door. ' +
        'It is not evidence of a leak, and it is precisely the blind spot CHK022 names: either ' +
        'bind the client to a name here, or read the call and say which door it uses',
    ).toBe('')
  })
})
