import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { STATUS_SUBMISSAO, type StatusSubmissao } from '../../collections/content/MissaoSubmissao'
import {
  ETAPAS_DA_MISSAO,
  ETAPAS_POR_ESTADO,
  estadoDe,
  type EstadoPessoal,
  type SubmissaoDoc,
} from '../../lib/content/missoes'

/**
 * T015/T016 / FR-007 — **the two-step mission model, with no database at all.**
 *
 * FR-007 says the arithmetic is expressed *once* and shared with `/missoes`. A shared module is
 * only worth the move if it is the module that gets tested, so this file asserts the model
 * directly rather than through either page: no Payload, no `next/headers`, no fake needed —
 * which is the whole reason plan.md § D3 split the pure half out of the RSC reader.
 *
 * **`recusada` is 0, not half.** The spec's first draft of CLR-003 said "awaiting review or
 * rejected 50%", and it was corrected against the code that already shipped: nothing was
 * credited, and CLR-015 reopens the row on the maker's next photo, so the work still ahead of
 * them is the whole of it. The assertion is spelled out here so a future reader who finds the
 * uncorrected sentence in the spec finds the counter-evidence with it.
 */
describe('lib/content/missoes — the pure two-step model (FR-007)', () => {
  it('a mission is two steps: the maker submits, the team validates', () => {
    expect(ETAPAS_DA_MISSAO).toBe(2)
  })

  it('maps each review state to its step count — and `recusada` to 0, not half (CLR-003)', () => {
    expect(ETAPAS_POR_ESTADO).toEqual({ enviada: 1, aprovada: 2, recusada: 0 })
    expect(ETAPAS_POR_ESTADO.aprovada).toBe(ETAPAS_DA_MISSAO)
    expect(ETAPAS_POR_ESTADO.recusada).toBe(0)
  })

  it('answers for every state the collection actually has, and for no other', () => {
    // A fourth review state added to `MissaoSubmissao.ts` must not arrive here as a silent 0% —
    // the typecheck catches it, and this catches the case where someone widens the record
    // instead.
    expect(Object.keys(ETAPAS_POR_ESTADO).sort()).toEqual([...STATUS_SUBMISSAO].sort())
    for (const status of STATUS_SUBMISSAO) {
      expect(typeof ETAPAS_POR_ESTADO[status]).toBe('number')
      expect(ETAPAS_POR_ESTADO[status]).toBeLessThanOrEqual(ETAPAS_DA_MISSAO)
    }
  })
})

describe('estadoDe — an unknown status is no submission, never a lookup miss', () => {
  const comStatus = (status: string): SubmissaoDoc => ({ id: 7, missao: 3, status })

  it('narrows each of the collection\'s own states to itself', () => {
    for (const status of STATUS_SUBMISSAO) {
      expect(estadoDe(comStatus(status))).toBe(status)
    }
  })

  it('reads a missing submission as no submission', () => {
    expect(estadoDe(undefined)).toBeUndefined()
  })

  it('reads a row with no status at all as no submission', () => {
    expect(estadoDe({ id: 7, missao: 3 })).toBeUndefined()
  })

  it('refuses a status the collection does not have, rather than indexing the record with it', () => {
    // The trap this function exists for: `ETAPAS_POR_ESTADO[status]` on an unrecognised value is
    // `undefined`, and `ProgressBar` would draw that as 0% — a mission silently reported as not
    // started is the failure nobody sees.
    for (const desconhecido of ['arquivada', 'ENVIADA', '', 'toString', 'constructor']) {
      expect(estadoDe(comStatus(desconhecido))).toBeUndefined()
    }
  })

  it('does not inherit a step count from the prototype chain', () => {
    // `'toString' in ETAPAS_POR_ESTADO` is true for a plain object literal, so a membership test
    // written with a bare `in` would accept it. Pinned because the fix is invisible once made.
    expect(ETAPAS_POR_ESTADO).not.toHaveProperty('toString', expect.any(Number))
    expect(Object.prototype.hasOwnProperty.call(ETAPAS_POR_ESTADO, 'toString')).toBe(false)
  })
})

describe('EstadoPessoal — four states, because "signed out" is the only one invited to sign in', () => {
  it('carries the maker\'s own submissions keyed by mission, and nothing on the other three', () => {
    const submissoes = new Map<string, SubmissaoDoc>([['3', { id: 7, missao: 3, status: 'enviada' }]])
    const maker: EstadoPessoal = { tipo: 'maker', submissoes }
    const estados: readonly EstadoPessoal[] = [
      { tipo: 'anonimo' },
      { tipo: 'sem-perfil' },
      { tipo: 'indisponivel' },
      maker,
    ]

    expect(estados.map((estado) => estado.tipo)).toEqual(['anonimo', 'sem-perfil', 'indisponivel', 'maker'])

    // Narrowed through `tipo`, which is the point of the discriminated union: `submissoes` is
    // unreachable on the other three, so a card cannot draw a percentage for a visitor the page
    // has not identified (CLR-002) by forgetting a check.
    expect(maker.tipo).toBe('maker')
    const doEstado: StatusSubmissao | undefined = estadoDe(maker.submissoes.get('3'))
    expect(doEstado).toBe('enviada')
    expect(maker.submissoes.get('99')).toBeUndefined()
  })
})

describe('the module is PURE — that is the only reason it could be tested like this', () => {
  const fonte = readFileSync(new URL('../../lib/content/missoes.ts', import.meta.url), 'utf8')
  /**
   * **Either quote, and a side-effect import too.**
   *
   * The first version of this line matched single quotes alone. Nothing in the repository
   * normalises quote style — there is no prettier config and `eslint.config.mjs` declares no
   * `quotes` rule — so `import { getTenantScopedPayloadForRSC } from "../tenancy"` sailed past
   * both assertions below and they stayed green. Measured by a verifier, who added exactly that
   * line and watched 11 tests pass.
   *
   * It is the failure this repository has now paid for eight times in a different costume: a
   * guard written against the formatting its own author happened to use. The mutation probe used
   * single quotes too, so the gap went unmeasured by the very cycle meant to find it.
   *
   * `import '...'` is matched as well: a side-effect import of a door pulls the door in without
   * naming a binding, and the `from` form would never see it.
   */
  const especificadores = [
    ...fonte.matchAll(/from\s+['"]([^'"]+)['"]/g),
    ...fonte.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
  ].map(([, alvo]) => alvo ?? '')

  it('imports the collection\'s vocabulary and NOTHING else', () => {
    // plan.md § D3: `lib/content/`'s convention is a module with no RSC-only reach. The moment a
    // payload door or `next/headers` lands here, this file stops being runnable without a
    // database and the split it was made for is gone.
    //
    // Asserted as the exact import set rather than as a blacklist of forbidden names: a
    // blacklist only catches the doors someone thought to list, and — measured, not assumed —
    // it also fires on the module's own DOCBLOCK, which names `getTenantScopedPayloadForRSC`
    // to explain why that door is not here. A guard that can only be satisfied by deleting the
    // explanation is a guard that gets deleted instead. This one reads the import statements.
    expect(especificadores).toEqual(['../../collections/content/MissaoSubmissao'])
  })

  it('reaches for no door, under any name', () => {
    for (const porta of ['next/headers', 'tenancy', 'payload', 'server-only', 'public-payload']) {
      expect(especificadores.some((alvo) => alvo.includes(porta))).toBe(false)
    }
  })
})

/**
 * T019 / FR-007 — **the split is real: neither screen imports the other's page module.**
 *
 * FR-007 asks that the arithmetic be *"expressed once and shared with `/missoes`, never
 * restated"*. T015–T018 answered the "expressed once" half by moving the model into
 * `lib/content/missoes.ts` and the personal read into `lib/public/missoes.ts`. What nothing
 * asserted is the reason that move was made rather than the cheaper alternative: the Home's
 * band could have reached straight into `app/(frontend)/missoes/page.tsx` and imported the
 * constants from there, and "expressed once" would still have been literally true — while a
 * page module became a library, `'use client'`-free by luck, and every future edit to the
 * Missões screen silently belonged to the Home too.
 *
 * So the rule is a *negative* one, and negatives are exactly what rot unwatched: an import
 * added during a hurried Home change compiles, renders, and passes every other test in this
 * repo. This file reads the two page sources and answers it by command, the way
 * `tests/public/page-stub-retired.test.ts` answers CHK001 for `PageStub`.
 *
 * ── Why the sweep, and not just the two named pages ──────────────────────────────────────────
 *
 * The defect class is "a page imported another page", and the pair named in T019 is only
 * today's instance of it. A check pinned to those two would go green on a third route that
 * reaches into `/missoes` for the same constants tomorrow — the same blind spot a per-page
 * assertion has when a route is shipped without one. Both are asserted: the named pair,
 * because that is the requirement's own claim, and the whole of `app/(frontend)`, because that
 * is the rule.
 *
 * ── Why the detector is proven against constructed sources ──────────────────────────────────
 *
 * A source-scanning gate can pass by scanning nothing — a moved file, a regex that stopped
 * matching, a resolver that quietly returns `undefined` for every specifier. It would then be a
 * green test asserting the empty set. The probe below feeds {@link paginasImportadasPor} two
 * sources that MUST be caught and one that must NOT (a docblock that merely quotes an import,
 * which is how this very file talks about the thing it forbids), so the detector is proven by
 * what it answers rather than by the absence of a violation nobody has committed.
 */

const RAIZ_WEB = fileURLToPath(new URL('../..', import.meta.url))
const PAGINA_HOME = join('app', '(frontend)', 'page.tsx')
const PAGINA_MISSOES = join('app', '(frontend)', 'missoes', 'page.tsx')
const DIR_FRONTEND = join(RAIZ_WEB, 'app', '(frontend)')

/** Block comments and whole-line `//` comments removed, so a docblock that *quotes* an import —
 *  this file's own prose does — is not read as one. Partial-line `//` is left alone on purpose:
 *  cutting at the first `//` would truncate a `'https://…'` string literal and could unbalance
 *  the quotes the specifier scan below depends on. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/** Every module specifier the file actually imports: static `from '…'`, side-effect
 *  `import '…'`, and dynamic `import('…')` — a lazy page import is the same defect. */
function especificadoresDe(fonte: string): readonly string[] {
  const codigo = semComentarios(fonte)
  const padrao = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  return [...codigo.matchAll(padrao)].map(([, alvo]) => alvo ?? '')
}

/** Where a specifier lands on disk, or `undefined` for a bare package — a route of this app is
 *  never one. `@/*` is resolved too: `tsconfig.json` maps it to the package root, so
 *  `@/app/(frontend)/missoes/page` is the same import wearing a different hat. */
function caminhoAlvo(arquivoRelativo: string, especificador: string): string | undefined {
  if (especificador.startsWith('.')) {
    return resolve(dirname(join(RAIZ_WEB, arquivoRelativo)), especificador)
  }
  if (especificador.startsWith('@/')) return join(RAIZ_WEB, especificador.slice(2))
  return undefined
}

/** The repo-relative page module a resolved path names, or `undefined`. Extensionless and
 *  directory forms are both tried, because `'../missoes/page'` is how it would really be
 *  written. */
function moduloDePagina(alvo: string): string | undefined {
  for (const candidato of [alvo, `${alvo}.tsx`, `${alvo}.ts`, join(alvo, 'page.tsx')]) {
    if (/[/\\]page\.tsx?$/.test(candidato) && existsSync(candidato)) {
      return relative(RAIZ_WEB, candidato)
    }
  }
  return undefined
}

/** Page modules `arquivoRelativo` imports, itself excluded. Sorted, so a failure names them. */
function paginasImportadasPor(arquivoRelativo: string, fonte: string): readonly string[] {
  const importadas = especificadoresDe(fonte)
    .map((especificador) => caminhoAlvo(arquivoRelativo, especificador))
    .filter((alvo): alvo is string => alvo !== undefined)
    .map(moduloDePagina)
    .filter((pagina): pagina is string => pagina !== undefined && pagina !== arquivoRelativo)
  return [...new Set(importadas)].sort()
}

function fonteDe(arquivoRelativo: string): string {
  return readFileSync(join(RAIZ_WEB, arquivoRelativo), 'utf8')
}

/** Every `page.tsx` under `app/(frontend)`, repo-relative. Walked rather than listed: a route
 *  added next week is in scope the day it exists, which a hardcoded inventory would miss. */
function todasAsPaginas(diretorio: string = DIR_FRONTEND): readonly string[] {
  const encontradas: string[] = []
  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
    const caminho = join(diretorio, entrada.name)
    if (entrada.isDirectory()) encontradas.push(...todasAsPaginas(caminho))
    else if (/^page\.tsx?$/.test(entrada.name)) encontradas.push(relative(RAIZ_WEB, caminho))
  }
  return encontradas.sort()
}

/**
 * The page-to-page imports that already existed when this rule was written — an *inventory*,
 * not a blessing, and the shape `page-stub-retired.test.ts` uses for the same reason: a
 * hardcoded "must be empty" would have to be satisfied by editing a route this feature does not
 * own, and a rule that cannot go green on the tree it lands in gets deleted rather than kept.
 *
 * `criar-conta/page.tsx` imports `PARAM_AVATAR` and `rascunhoDoAvatar` from `./dados/page` —
 * feature 004's two-step wizard, where step 1 writes the draft that step 2 reads, and the
 * comment at that import argues the case: a second spelling of the parameter is half a round
 * trip carrying nothing. It is one flow split across two route files, which is not the defect
 * T019 is about — two *separate screens* sharing a model through one of their page modules.
 *
 * What matters is that this set does not GROW. The Home reaching into `/missoes` — or anything
 * reaching into anything else — fails here even though the pair below passes, which is exactly
 * what an exemption has to buy to be worth having.
 */
const CRUZAMENTOS_HERDADOS: Readonly<Record<string, readonly string[]>> = {
  [join('app', '(frontend)', 'criar-conta', 'page.tsx')]: [
    join('app', '(frontend)', 'criar-conta', 'dados', 'page.tsx'),
  ],
}

describe('T019 / FR-007 — neither page imports the other, asserted rather than assumed', () => {
  it('has both screens where the requirement says they are', () => {
    // A rename would otherwise vacate every assertion below by making them read nothing.
    expect(existsSync(join(RAIZ_WEB, PAGINA_HOME))).toBe(true)
    expect(existsSync(join(RAIZ_WEB, PAGINA_MISSOES))).toBe(true)
  })

  it('`/missoes` imports no page module — not the Home, not any other route', () => {
    expect(paginasImportadasPor(PAGINA_MISSOES, fonteDe(PAGINA_MISSOES))).toEqual([])
  })

  it('the Home imports no page module — not `/missoes`, not any other route', () => {
    expect(paginasImportadasPor(PAGINA_HOME, fonteDe(PAGINA_HOME))).toEqual([])
  })

  it('no route under app/(frontend) imports another, beyond the one pair that predates this rule', () => {
    const paginas = todasAsPaginas()
    expect(paginas).toContain(PAGINA_HOME)
    expect(paginas).toContain(PAGINA_MISSOES)

    const infratoras = paginas
      .map((pagina) => [pagina, paginasImportadasPor(pagina, fonteDe(pagina))] as const)
      .filter(([, importadas]) => importadas.length > 0)
    expect(Object.fromEntries(infratoras)).toEqual(CRUZAMENTOS_HERDADOS)
  })

  it('reaches the shared model through `lib/content/missoes`, which is what made the ban payable', () => {
    // The negative above is only a requirement because the positive exists: forbidding the
    // page-to-page import without a shared module would just be forbidding the feature.
    expect(especificadoresDe(fonteDe(PAGINA_MISSOES))).toContain('../../../lib/content/missoes')
  })
})

describe('the cross-page detector — proven against sources, not against an absent violation', () => {
  it('catches the Home reaching into the Missões page, in every spelling it could use', () => {
    const espelhados = [
      "import { ETAPAS_DA_MISSAO } from './missoes/page'",
      "import { ETAPAS_DA_MISSAO } from '@/app/(frontend)/missoes/page'",
      "const { ETAPAS_DA_MISSAO } = await import('./missoes/page')",
    ]
    for (const fonte of espelhados) {
      expect(paginasImportadasPor(PAGINA_HOME, fonte)).toEqual([PAGINA_MISSOES])
    }
  })

  it('catches the Missões page reaching back into the Home', () => {
    expect(paginasImportadasPor(PAGINA_MISSOES, "import algo from '../page'")).toEqual([PAGINA_HOME])
  })

  it('does not fire on a docblock that merely quotes the import it forbids', () => {
    // This file's own prose does exactly that, and so does the page's. A guard satisfiable only
    // by deleting the explanation is a guard that gets deleted instead — the same trap the
    // purity check above records.
    const fonte = "/**\n * Never write `import x from '../page'` here.\n */\nexport const a = 1\n"
    expect(paginasImportadasPor(PAGINA_MISSOES, fonte)).toEqual([])
  })

  it('leaves the imports both screens are supposed to have alone', () => {
    const legitimos = [
      "import { estadoDe } from '../../../lib/content/missoes'",
      "import { estadoPessoal } from '../../../lib/public/missoes'",
      "import { ProgressBar } from '@fablab/ui'",
    ].join('\n')
    expect(paginasImportadasPor(PAGINA_MISSOES, legitimos)).toEqual([])
  })
})
