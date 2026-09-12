import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, it } from 'vitest'

import { ESCOLARIDADES, VINCULOS_UNESP } from '../../collections/content/PerfilMaker'

/**
 * T026 / FR-008, FR-012, US1 — step 2 of `/criar-conta`: the personal data, the terms checkbox
 * carrying the **version** accepted, and a `VOLTAR` that returns to step 1 with the avatar.
 *
 * ── Why the three subjects are one task, and one suite ──────────────────────────────────────
 *
 * They are the three things that make step 2 *this* screen rather than a second login form:
 * `onboarding.md` § 6 fixes the seven fields and their order, round 5 (2026-08-24) put the
 * consent gate inside this form, and the PO's ruling the same day made step 2's `VOLTAR` the one
 * that comes back — *"o avatar que ele construiu no passo 1 continua lá"* (US1's edge).
 *
 * ── The assertions with teeth ──────────────────────────────────────────────────────────────
 *
 * §1 reads the option values against `VINCULOS_UNESP` / `ESCOLARIDADES`, which are exported from
 * `PerfilMaker.ts` **so that the form and the column cannot hold different lists**. A test that
 * retyped the four vínculos here would stay green on the day the form starts offering a value
 * the enum refuses — which is a signup that fails at the database with no field to point at.
 *
 * §2 does not merely look for a checkbox: it demands the **version that is stamped be the
 * version that is shown**. FR-012 buys one thing with the version — the ability to demand a new
 * consent from the people who accepted the old text — and a stamp written from a constant the
 * form never displayed cannot support that claim.
 *
 * §3 round-trips a draft containing `&`, `#` and `=`. A `VOLTAR` built by string concatenation
 * renders a perfectly plausible href that truncates the avatar at the first `&`, and the person
 * arrives back at step 1 with *part* of their work — the failure that looks like it worked.
 *
 * ── No database, and no browser ────────────────────────────────────────────────────────────
 *
 * The page is a server component that reads nothing: every value on it is either a constant, a
 * form control or the query it was handed. So it is awaited and rendered with
 * `renderToStaticMarkup`, exactly as `criar-conta-page.test.ts` renders step 1. What a browser
 * does with `required` and with the `list` attribute is the browser's contract, not ours.
 */

const PAGE_DIR = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'criar-conta', 'dados')

const { default: DadosPage, metadata, TERMS_VERSION, PARAM_AVATAR, TERMOS_PATH } = await import(
  '../../app/(frontend)/criar-conta/dados/page'
)

type Query = Record<string, string | string[] | undefined>

const render = async (query: Query = {}): Promise<string> =>
  renderToStaticMarkup((await DadosPage({ searchParams: Promise.resolve(query) })) as never)

/** Every form control, by its `name`: the whole opening tag, so an attribute can be read off it. */
const controles = (markup: string): Record<string, string> => {
  const encontrados: Record<string, string> = {}
  for (const achado of markup.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)) {
    const tag = achado[0]
    const nome = /\bname="([^"]*)"/.exec(tag)?.[1]
    if (nome !== undefined) encontrados[nome] = tag
  }
  return encontrados
}

/** `<a href>` → its text, tags stripped — how the destinations of `VOLTAR` and the terms link
 *  are read, the same way step 1's suite reads its rail. */
const linksIn = (markup: string): Record<string, string> => {
  const links: Record<string, string> = {}
  for (const [, href, inner] of markup.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    links[inner!.replaceAll(/<[^>]*>/g, '').replaceAll('&#x27;', "'").trim()] = href!
  }
  return links
}

/** The whole `<a>` tag whose text matches — `target` and `rel` are attributes, not copy. */
const ancoraComTexto = (markup: string, texto: string): string | undefined =>
  [...markup.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].find(
    (achado) => achado[1]!.replaceAll(/<[^>]*>/g, '').trim() === texto,
  )?.[0]

/** The values a `<select name=…>` offers, in order — including its placeholder. */
const opcoesDe = (markup: string, nome: string): string[] => {
  const bloco = new RegExp(`<select\\b[^>]*name="${nome}"[^>]*>([\\s\\S]*?)</select>`).exec(markup)
  if (bloco === null) return []
  return [...bloco[1]!.matchAll(/<option\b[^>]*value="([^"]*)"/g)].map((achado) => achado[1]!)
}

/** What a query value reached `VOLTAR` as, read back through a URL parser rather than a regex:
 *  the point of §3 is that the whole value survives encoding, and a parser is what decides that. */
const avatarNoHref = (href: string): string | null =>
  new URL(href, 'https://cite.test').searchParams.get(PARAM_AVATAR)

/** A draft with the three characters that break a hand-built query string, plus an accent. */
const RASCUNHO = '{"base":"f","pele":"1&2","cabelo":"#3","itens":{"chapeu":"a=b"},"nome":"Ana Té"}'

describe('§1 — the seven fields the mockup fixes (FR-008)', () => {
  it('collects name, birth date, e-mail, UNESP link, schooling, course and password', async () => {
    const campos = controles(await render())

    // `onboarding.md` § 6 numbers them 1..7 and this is that list. A field missing here is a
    // column of `perfilMaker` that step 2 was supposed to fill and no other screen ever does.
    for (const nome of ['nome', 'dataNascimento', 'email', 'vinculoUnesp', 'escolaridade', 'curso', 'senha']) {
      expect(campos[nome], `step 2 has no control named "${nome}"`).toBeDefined()
    }
  })

  it('draws them in the mockup order', async () => {
    const markup = await render()
    const ordem = ['nome', 'dataNascimento', 'email', 'vinculoUnesp', 'escolaridade', 'curso', 'senha'].map(
      (nome) => markup.indexOf(`name="${nome}"`),
    )

    expect(ordem, 'a field is missing, so the order cannot be read').not.toContain(-1)
    expect(
      [...ordem].sort((a, b) => a - b),
      'the fields are on screen in an order the mockup does not draw',
    ).toEqual(ordem)
  })

  it('caps the name at 60 and types each control as what it collects', async () => {
    const campos = controles(await render())

    // ≤60 (round 4, 2026-08-24) — `nome` is also `nome_avatar` and the handle's source, and the
    // AutorInline block has a layout that cap protects.
    //
    // Case-insensitively, because React 19 emits the camelCase spelling (`maxLength="60"`) into
    // the HTML and an attribute name is case-insensitive to a parser. Pinning the lowercase
    // spelling would be asserting the renderer's habits rather than the cap.
    expect(campos['nome']).toMatch(/maxlength="60"/i)
    // A `date` input, not free text: a birthday typed as `03/04` is ambiguous in exactly the two
    // locales this site is read in.
    expect(campos['dataNascimento']).toMatch(/type="date"/)
    expect(campos['email']).toMatch(/type="email"/)
    // Never `type="text"`: a visible password is one shoulder away from being someone else's.
    expect(campos['senha']).toMatch(/type="password"/)
    // A new one, so a browser offers to generate rather than to refill the last site's.
    expect(campos['senha']).toMatch(/autocomplete="new-password"/i)
  })

  it('requires every field the account cannot be created without', async () => {
    const campos = controles(await render())

    for (const nome of ['nome', 'dataNascimento', 'email', 'vinculoUnesp', 'escolaridade', 'curso', 'senha']) {
      // `perfilMaker`'s columns are all nullable **because this form is where an empty answer is
      // refused** (PerfilMaker.ts: "with a field error the person can act on, not a NOT NULL
      // violation from the database"). Drop `required` here and nothing else refuses it.
      expect(campos[nome], `"${nome}" can be left empty, and nothing downstream refuses it`).toMatch(
        /\brequired\b/,
      )
    }
  })

  it('offers exactly the vínculos and escolaridades the column admits', async () => {
    const markup = await render()

    // Both lists are exported from `PerfilMaker.ts` for this reason: `db-postgres` materialises a
    // `select` as a Postgres enum, so a value this form offers and the enum does not is a signup
    // that dies at the insert. Reading the constant is what makes the two one list.
    expect(opcoesDe(markup, 'vinculoUnesp').filter((valor) => valor !== '')).toEqual(
      Object.keys(VINCULOS_UNESP),
    )
    expect(opcoesDe(markup, 'escolaridade').filter((valor) => valor !== '')).toEqual(
      Object.keys(ESCOLARIDADES),
    )
  })

  it('opens both selects on their placeholder, which is not a choosable answer', async () => {
    const markup = await render()

    // `Selecione seu vínculo` / `Selecione sua escolaridade` are the mockup's placeholders. They
    // carry the empty value so a form submitted untouched is refused by `required` rather than
    // silently recording whichever option happened to be first.
    expect(opcoesDe(markup, 'vinculoUnesp')[0]).toBe('')
    expect(opcoesDe(markup, 'escolaridade')[0]).toBe('')
    expect(markup).toContain('Selecione seu vínculo')
    expect(markup).toContain('Selecione sua escolaridade')
  })

  it('makes `curso` a combobox — suggestions allowed, free text accepted (FR-008)', async () => {
    const markup = await render()
    const curso = controles(markup)['curso']!

    // A `select` would validate against its options and refuse every course nobody thought to
    // list, which for a lab open to the whole community is most of them (PerfilMaker.ts).
    expect(markup, '`curso` is a select, so an unlisted course cannot be typed').not.toMatch(
      /<select\b[^>]*name="curso"/,
    )
    const lista = /\blist="([^"]*)"/.exec(curso)?.[1]
    expect(lista, '`curso` has no suggestion list, so it is an input and not a combobox').toBeDefined()
    expect(markup).toMatch(new RegExp(`<datalist\\b[^>]*id="${lista}"`))
    expect(markup).toContain('Digite ou selecione seu curso')
  })
})

describe('§2 — the terms checkbox, stamped with the version shown (FR-012)', () => {
  it('gates the form on a checkbox that must be ticked', async () => {
    const campos = controles(await render())
    const aceite = campos['aceiteTermos']

    // Round 5 (2026-08-24): the consent is a **gate** of the signup, not a preference.
    expect(aceite, 'step 2 has no terms checkbox, so an account can be created without consent').toMatch(
      /type="checkbox"/,
    )
    expect(aceite).toMatch(/\brequired\b/)
  })

  it('links the terms, opening them in a new tab (PO, 2026-08-24)', async () => {
    const markup = await render()
    const ancora = ancoraComTexto(markup, 'termos de uso e política de privacidade')

    expect(ancora, `the terms link is missing; the anchors were ${JSON.stringify(linksIn(markup))}`).toBeDefined()
    expect(ancora).toContain(`href="${TERMOS_PATH}"`)
    // A new tab, so a half-filled form is not thrown away to read the text it is consenting to.
    expect(ancora).toContain('target="_blank"')
    // `noopener` is the security half of that decision, not politeness: without it the opened
    // document can reach back through `window.opener` and navigate this one.
    expect(ancora).toMatch(/rel="[^"]*noopener[^"]*"/)
  })

  it('carries the accepted version in the form, and it is the version on screen', async () => {
    const markup = await render()
    const versao = controles(markup)['aceiteTermosVersao']

    // T041 ⛔: the words are the PO's and UNESP legal review's, but the **mechanism** ships now —
    // "`TERMS_VERSION` ships as a constant so the stamp is real from the first account".
    expect(TERMS_VERSION, 'no terms version is declared, so `aceiteTermosVersao` has nothing to store').toBeTruthy()
    expect(versao, 'the form carries no version, so the stamp can only be written blind').toMatch(
      /type="hidden"/,
    )
    // The one thing FR-012's version buys is demanding a re-consent from whoever accepted the old
    // text. A version stamped from a constant this form never displayed cannot support that: it
    // records which text the *server* had, not which one the person was shown.
    expect(versao).toContain(`value="${TERMS_VERSION}"`)
  })
})

describe('§3 — `VOLTAR` returns to step 1 with the avatar intact (FR-002, US1)', () => {
  it('hands the whole draft back to step 1, `&` and `#` included', async () => {
    const markup = await render({ [PARAM_AVATAR]: RASCUNHO })
    const voltar = linksIn(markup)['VOLTAR']!

    expect(voltar.startsWith('/criar-conta?'), `VOLTAR went to "${voltar}"`).toBe(true)
    // Byte for byte: an href built by concatenation looks right and truncates at the first `&`,
    // so the person returns to step 1 with *part* of the avatar they built — the failure that
    // looks like it worked.
    expect(avatarNoHref(voltar), 'the draft did not survive the trip back to step 1').toBe(RASCUNHO)
  })

  it('carries the same draft into the submit, so nothing is lost by continuing either', async () => {
    const campos = controles(await render({ [PARAM_AVATAR]: RASCUNHO }))

    // The plan: "`avatarConfig` arrives from step 1 as data the client carried". If only `VOLTAR`
    // held it, pressing `CRIAR CONTA →` would create a profile with no avatar at all.
    expect(campos[PARAM_AVATAR], 'the form does not carry the avatar, so the profile is created without one').toMatch(
      /type="hidden"/,
    )
    expect(campos[PARAM_AVATAR]).toContain(`value="${RASCUNHO.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`)
  })

  it('goes plainly back to step 1 when no draft was carried', async () => {
    const markup = await render()

    expect(linksIn(markup)['VOLTAR']).toBe('/criar-conta')
    // No empty `avatar=` field either: a blank draft is not a draft, and T027 would have to tell
    // the two apart at the boundary.
    expect(controles(markup)[PARAM_AVATAR]).toBeUndefined()
  })

  it('refuses a draft that is repeated or absurdly large', async () => {
    const repetido = await render({ [PARAM_AVATAR]: [RASCUNHO, 'outro'] })
    // Anyone can link to this page. A repeated parameter is ambiguous and guessing is how the
    // wrong one gets carried; a megabyte of query is a page built out of an attacker's string.
    expect(linksIn(repetido)['VOLTAR']).toBe('/criar-conta')

    const enorme = await render({ [PARAM_AVATAR]: 'x'.repeat(100_000) })
    expect(linksIn(enorme)['VOLTAR']).toBe('/criar-conta')
    expect(enorme.length, 'the page echoed a 100 kB query back at the visitor').toBeLessThan(50_000)
  })
})

describe('§4 — the screen the copy fixes (FR-001, onboarding.md § 6)', () => {
  it('shows `1 2` with step 2 as the current one', async () => {
    const markup = await render()

    // Round 5 (2026-08-24) confirmed the indicator enters the final screen too, which neither
    // mockup draws.
    expect(markup).toMatch(/Passo 2 de 2/)
    expect(markup).toMatch(/aria-current="step"/)
  })

  it('draws the title, the subtitle and the submit', async () => {
    const markup = await render()

    expect(markup).toMatch(/<h1[^>]*>CRIAR CONTA<\/h1>/)
    expect(markup).toContain('Preencha os dados abaixo para criar sua conta.')
    expect(markup).toContain('CRIAR CONTA →')
    expect(metadata.title).toMatch(/CRIAR CONTA/)
  })

  it('offers the way to the login screen under the button', async () => {
    const markup = await render()

    expect(markup).toContain('Já tem uma conta?')
    expect(linksIn(markup)['Fazer login']).toBe('/login')
  })
})

describe('§5 — no island, and no password in a URL (FR-024)', () => {
  const fonte = readFileSync(join(PAGE_DIR, 'page.tsx'), 'utf8')

  it('ships no `use client` of its own', async () => {
    // The one island this route is allowed is the builder (T024, declared in `ALLOWED_ISLANDS`).
    expect(fonte).not.toMatch(/^\s*['"]use client['"]/m)
  })

  it('posts the form rather than letting a browser GET the password into the address bar', async () => {
    const markup = await render()
    const form = /<form\b[^>]*>/.exec(markup)?.[0]

    expect(form, 'step 2 renders no form at all').toBeDefined()
    // A `<form>` with no method is a GET: the browser would put the typed password in the query
    // string, the browser history, the `Referer` of the next request and every access log in
    // between — the same reasoning `/login` records for never echoing the address back.
    //
    // The assertion is "not a GET", not `method="post"`. The form is bound to a **server
    // action** now, which React submits as a POST and renders without a literal `method` in
    // static markup — so spelling-matching the attribute would fail on the correct code and
    // pass on a form that lost its action and fell back to GET. `method="get"` is the failure.
    expect(
      form,
      'the form carries no `action` at all, so it falls back to a GET of this same URL and the ' +
        'typed password lands in the query string, the history, the next request’s Referer and ' +
        'every access log in between',
    ).toMatch(/\baction=/)
    expect(form, 'the form would submit as a GET, putting the password in the URL').not.toMatch(
      /method="get"/i,
    )
  })
})
