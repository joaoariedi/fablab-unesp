import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FindArgs } from '../../lib/tenancy/client'

/**
 * T026b / FR-002, FR-009, US1 — the two `VOLTAR`s of signup, and the e-mail rule that is a
 * **rule about what must never be added**.
 *
 * ── Why this suite exists beside the two page suites ────────────────────────────────────────
 *
 * `tests/public/criar-conta-page.test.ts` proves step 1's rail and
 * `tests/public/criar-conta-dados-page.test.ts` proves step 2's form; each renders **one** page
 * and neither can see the thing FR-002 actually promises, which spans both: pressing `VOLTAR`
 * on step 2 must land on step 1 *with the avatar intact* — and "intact" is only observable by
 * walking back and then forward again. Step 2 handing a perfect href to a step 1 that discards
 * the query is two green page suites over a flow that silently loses the avatar the moment the
 * visitor returns to the form. §2 drives the whole loop, byte for byte.
 *
 * The other half of FR-002 is an **asymmetry**: step 1's `VOLTAR` leaves the flow for the Home
 * (PO, 2026-08-24) while step 2's comes back here. §1 pins it with a draft on the query too,
 * because the tempting "fix" for a lost avatar is to make step 1's `VOLTAR` carry it somewhere,
 * and the button's destination is not negotiable.
 *
 * ── §3 is a negative test, and that is the point ────────────────────────────────────────────
 *
 * FR-009: *any* e-mail is accepted — no institutional domain is required, and the UNESP
 * relationship is declared in `vinculoUnesp`. Nothing in the product needs writing for that to
 * be true today, which is exactly why it needs a test: it is the rule someone adds back as a
 * "fix" ("surely a lab account should be `@unesp.br`"), and a rule that is enforced by an
 * *absence* has nothing to fail when the absence ends. §3 reads both the rendered control and
 * the source of every file on the signup path, so a `pattern=` on the field and a hand-written
 * domain check in the action are each caught where they would be written.
 *
 * ── No DOM, no database ─────────────────────────────────────────────────────────────────────
 *
 * 001's CLR-003 keeps the stack at Vitest with no DOM, so both pages are awaited and rendered
 * with `renderToStaticMarkup`, and step 1's catalogue read is mocked at the anonymous choke
 * point — the same seam `criar-conta-page.test.ts` uses. What a browser does with `type="email"`
 * is the browser's contract; what this suite owns is that nothing narrower is declared.
 */

const CRIAR_CONTA_DIR = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'criar-conta')

/** One row per catalogue collection: step 1 must render its rail, and an empty catalogue is a
 *  different page (`EmptyState`) whose rail this suite would then be reading by accident. */
const LINHAS: Record<string, readonly Record<string, unknown>[]> = {
  tomDePele: [{ id: 1, nome: 'Pele Amanhecer', hex: '#f7d9c4', ordem: 1 }],
  tomDeCabelo: [{ id: 11, nome: 'Cabelo Grafite', hex: '#1c1c1c', ordem: 1 }],
  avatarItem: [{ id: 21, categoria: 'cabelo', nome: 'Moicano curto', camadaZ: 40 }],
}

/** The anonymous catalogue client, as a named fake rather than an inline stub. */
class FakeCatalogueClient {
  readonly tenantId = 'org-fake'

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    const docs = (LINHAS[args.collection] ?? []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

const mocks = vi.hoisted(() => {
  /** The real `notFound()` throws and never returns; a mock that returned would let step 1 fall
   *  through to a render the runtime never reaches. */
  const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    NOT_FOUND,
    notFound: vi.fn((): never => {
      throw NOT_FOUND
    }),
    getPublicScopedPayloadForRSC: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

const { default: Passo1 } = await import('../../app/(frontend)/criar-conta/page')
const { default: Passo2, PARAM_AVATAR } = await import(
  '../../app/(frontend)/criar-conta/dados/page'
)

type Query = Record<string, string | string[] | undefined>

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakeCatalogueClient())
})

const passo1 = async (query: Query = {}): Promise<string> =>
  renderToStaticMarkup((await Passo1({ searchParams: Promise.resolve(query) })) as never)

const passo2 = async (query: Query = {}): Promise<string> =>
  renderToStaticMarkup((await Passo2({ searchParams: Promise.resolve(query) })) as never)

/** `<a href>` → its text, tags stripped: both rails' buttons are anchors, because they navigate. */
const linksIn = (markup: string): Record<string, string> => {
  const links: Record<string, string> = {}
  for (const [, href, inner] of markup.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    links[inner!.replaceAll(/<[^>]*>/g, '').replaceAll('&#x27;', "'").trim()] = href!
  }
  return links
}

/** Every form control, by its `name` — the whole opening tag, so an attribute can be read off it. */
const controles = (markup: string): Record<string, string> => {
  const encontrados: Record<string, string> = {}
  for (const achado of markup.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)) {
    const nome = /\bname="([^"]*)"/.exec(achado[0])?.[1]
    if (nome !== undefined) encontrados[nome] = achado[0]
  }
  return encontrados
}

/** What an href carries the draft as, read back through a URL parser rather than a regex: the
 *  claim under test is that the *whole* value survives the trip, and a parser is what decides. */
const avatarNoHref = (href: string): string | null =>
  new URL(href, 'https://cite.test').searchParams.get(PARAM_AVATAR)

/** A draft with the three characters that break a hand-built query string, plus an accent. */
const RASCUNHO = '{"base":"f","pele":"1&2","cabelo":"#3","itens":{"chapeu":"a=b"},"nome":"Ana Té"}'

const VOLTAR = 'VOLTAR'
const CONTINUAR = 'SALVAR E CONTINUAR →'

describe('§1 — step 1`s `VOLTAR` leaves the flow for the Home (FR-002)', () => {
  it('goes to the Home from a step 1 nobody arrived at with a draft', async () => {
    expect(linksIn(await passo1())[VOLTAR]).toBe('/')
  })

  it('still goes to the Home when a draft is on the query', async () => {
    const links = linksIn(await passo1({ [PARAM_AVATAR]: RASCUNHO }))

    // The asymmetry is the requirement, not an oversight: step 1's `VOLTAR` leaves signup, and
    // step 2's returns here. The tempting repair for a lost avatar is to make *this* button
    // carry it somewhere — which quietly turns the only exit from the flow into a loop.
    expect(links[VOLTAR], `the anchors found were ${JSON.stringify(links)}`).toBe('/')
  })
})

describe('§2 — step 2`s `VOLTAR` returns to step 1 with the avatar intact (FR-002, US1)', () => {
  it('survives the whole trip back and forward again, byte for byte', async () => {
    // Step 2, holding a draft, offers the way back…
    const voltar = linksIn(await passo2({ [PARAM_AVATAR]: RASCUNHO }))[VOLTAR]!
    const noVoltar = avatarNoHref(voltar)
    expect(noVoltar, 'step 2 dropped the draft on the way back to step 1').toBe(RASCUNHO)

    // …the visitor lands on step 1 with it, and presses `SALVAR E CONTINUAR →` again.
    const continuar = linksIn(await passo1({ [PARAM_AVATAR]: noVoltar! }))[CONTINUAR]!
    expect(
      avatarNoHref(continuar),
      `step 1 was handed the draft and continued to "${continuar}": everything the visitor built ` +
        'is gone the moment they go back and forward again, which is the exact loss FR-002 forbids',
    ).toBe(RASCUNHO)

    // …and step 2 receives the same avatar it started with, still carried into the submit.
    const campo = controles(await passo2({ [PARAM_AVATAR]: avatarNoHref(continuar)! }))[
      PARAM_AVATAR
    ]
    expect(campo, 'the returning visitor would create a profile with no avatar at all').toMatch(
      /type="hidden"/,
    )
    expect(campo).toContain(`value="${RASCUNHO.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`)
  })

  it('continues plainly to step 2 when step 1 was handed no draft', async () => {
    // No empty `?avatar=` either: a blank draft is not a draft, and step 2 already refuses one —
    // handing it a value it must then reject is a round trip that only looks like it worked.
    expect(linksIn(await passo1())[CONTINUAR]).toBe('/criar-conta/dados')
  })

  it('refuses a draft that is repeated or absurdly large', async () => {
    // Anyone can link to step 1. A repeated parameter is ambiguous and guessing is how the wrong
    // one is carried; a megabyte of query is a page built out of an attacker's string.
    const repetido = await passo1({ [PARAM_AVATAR]: [RASCUNHO, 'outro'] })
    expect(linksIn(repetido)[CONTINUAR]).toBe('/criar-conta/dados')

    const enorme = await passo1({ [PARAM_AVATAR]: 'x'.repeat(100_000) })
    expect(linksIn(enorme)[CONTINUAR]).toBe('/criar-conta/dados')
    expect(enorme.length, 'step 1 echoed a 100 kB query back at the visitor').toBeLessThan(100_000)
  })
})

/**
 * The files a domain rule would be written in — both signup pages, plus T027's action the day it
 * lands. `existsSync` rather than a fixed list, so the scan grows with the flow instead of
 * quietly stopping at the two files that existed when it was written.
 */
const ARQUIVOS_DO_CADASTRO = [
  join(CRIAR_CONTA_DIR, 'page.tsx'),
  join(CRIAR_CONTA_DIR, 'dados', 'page.tsx'),
  join(import.meta.dirname, '..', '..', 'lib', 'accounts', 'signup.ts'),
].filter((caminho) => existsSync(caminho))

describe('§3 — any e-mail is accepted, and no domain rule exists to remove (FR-009)', () => {
  it('declares nothing narrower than `type="email"` on the field itself', async () => {
    const email = controles(await passo2())['email']!

    expect(email).toContain('type="email"')
    // `pattern` is how a domain rule is written in HTML, and it is invisible in a screenshot: the
    // field looks identical and every address outside the pattern is refused by the browser with
    // a message nobody wrote. `title` usually arrives with it, to explain the refusal.
    expect(email, `the e-mail field was rendered as ${email}`).not.toMatch(/\bpattern=/)
    expect(email).not.toMatch(/\btitle=/)
  })

  it('accepts the addresses a community lab actually receives', async () => {
    const campos = controles(await passo2())
    const email = campos['email']!

    // FR-009 names the substitute for a domain check, and it is a *declared relationship*, not a
    // guess made from the address: someone with an `@unesp.br` address may be `externo`, and the
    // `@gmail.com` may be the professor. The field below is what carries that answer.
    expect(campos['vinculoUnesp'], 'FR-009 puts the UNESP link in its own field').toBeDefined()

    // `maria@gmail.com`, `ana+lab@protonmail.com`, `aluno@unesp.br`, `visitante@fablab.example`:
    // the field must accept all four, and the only way it can name one of them is by carrying an
    // address — or a fragment of one — in an attribute. So the rule is that it carries **no `@`
    // at all**, which holds however the domain is spelled: `pattern=".+@unesp\\.br"` escapes the
    // dot and survives a literal search for `@unesp.br`, and this catches it anyway.
    expect(
      email,
      `the e-mail field carries an address fragment, which it can only be narrowing: ${email}`,
    ).not.toContain('@')
  })

  it('writes no institutional-domain check anywhere on the signup path', async () => {
    for (const caminho of ARQUIVOS_DO_CADASTRO) {
      const fonte = readFileSync(caminho, 'utf8')

      // Three shapes, because a rule reinstated by hand takes whichever is nearest: the domain
      // spelled out, a suffix test on the address, or an HTML `pattern` on the control.
      expect(fonte, `${caminho} names the institutional domain`).not.toMatch(/unesp\.br/i)
      expect(fonte, `${caminho} tests the end of an address`).not.toMatch(/endsWith\s*\(/)
      expect(fonte, `${caminho} constrains a field with a pattern`).not.toMatch(/\bpattern=/)
    }
  })

  it('scans the files that exist, and says so when the flow moves', () => {
    // A scan that silently finds nothing to read is a green test over no subject at all — the
    // failure mode this whole section is built to avoid.
    expect(ARQUIVOS_DO_CADASTRO.length, 'the signup path was scanned in no file').toBeGreaterThanOrEqual(2)
  })
})
