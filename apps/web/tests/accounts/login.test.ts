import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Next's own reading of what a thrown `redirect()` becomes on the wire, imported rather than
// re-derived. The digest is a string format (`NEXT_REDIRECT;replace;/login?erro=1;307;`) this
// file could parse itself — and a parser of our own would be a second opinion about what the
// runtime does, green on the day the two disagree. `tests/public/detalhe.test.ts` imports
// Next's 404 mapping the same way and for the same reason; deep imports because `next`
// publishes no `exports` map and ships the `.d.ts` beside each file.
import {
  getRedirectStatusCodeFromError,
  getURLFromRedirectError,
} from 'next/dist/client/components/redirect.js'
import { isRedirectError, type RedirectError } from 'next/dist/client/components/redirect-error.js'

import config from '../../payload.config'

/**
 * T014 / FR-014, SC-002 — **a refused sign-in that tells nothing**, against a real database.
 *
 * SC-002: *"a wrong password and an unregistered e-mail produce byte-identical responses"*.
 *
 * ── What this file adds over `login-page.test.ts` ───────────────────────────────────────────
 *
 * That file drives the page against a **mocked** `lib/tenancy/session`: it rejects `signIn`
 * with three hand-written errors and proves the page funnels them into one outcome. It says so
 * itself, and names the gap it cannot close — the errors are the test's own, so it cannot show
 * that *Payload*, on a real account in real Postgres, fails the two causes indistinguishably.
 * Payload raises `AuthenticationError` for an unknown address and `AuthenticationError` for a
 * wrong password from two different branches of `login.js`, one of them after a bcrypt compare
 * and a write that increments `loginAttempts`. Whether those two branches stay
 * indistinguishable *to the visitor* is a fact about the product, not about the mock.
 *
 * This file closes that gap the only way it can be closed: one account really in the database,
 * one address that really has none, the real `signIn`, the real `redirect()`, the real page.
 * **Nothing is stubbed except `next/headers`** — Vitest has no Next request scope (feature 000,
 * spike S8), and it is the page's sole other input.
 *
 * ── What stands in for "the same body and status" ───────────────────────────────────────────
 *
 * A refused attempt is **two** HTTP exchanges, and a test that looked at only one would miss
 * half of what a prober sees:
 *
 *   - the POST answers with a redirect — its **status** and its `Location`, both read out of
 *     the error `redirect()` throws, through Next's own helpers;
 *   - the browser then GETs that location, and *that* response's **body** is the markup this
 *     page builds for it — the neutral message, or whatever a future "helpful" refusal put
 *     there instead.
 *
 * Both halves are captured per attempt and compared whole. A refusal that named the cause in a
 * query parameter would differ in the first; one that named it on the page would differ in the
 * second; one that only changed the status would differ in neither's text and still be caught.
 *
 * The reference answer is the **address that has no account**: the one case that leaks nothing
 * by construction, because there is nothing behind it to leak. Every other refusal must be
 * identical to it. Stated that way round, the assertion cannot be satisfied by every answer
 * drifting together into something that mentions a password.
 *
 * ── Watched failing before it was believed ─────────────────────────────────────────────────
 *
 * This suite is green the day it is written: T013 built the neutral refusal, so there is no
 * red to observe from the requirement's side, and a proof test that was never seen failing is
 * indistinguishable from one that asserts nothing. Two mutations were therefore run against a
 * **copy** of the page (`page.mutante.tsx`, with a copy of this file pointed at it, both
 * deleted afterwards) — a copy rather than `page.tsx` itself because sibling tasks were driving
 * the real page concurrently, and a mutation they observed would have been reported as their
 * own defect:
 *
 *   1. the refusal looks the address up and says `Conta não encontrada` for one of the two
 *      causes — **3 of 7 red**: the byte comparison, the neutral-message check, and the
 *      cause-naming check;
 *   2. the same lookup, but the visible copy left neutral and only `?motivo=` carrying the
 *      answer — **1 of 7 red**, the byte comparison alone. This is the one that matters: the
 *      page still *reads* neutrally, and a suite that only inspected the rendered message
 *      would have passed a refusal that tells a prober which addresses are registered.
 *
 * §2 is the non-vacuity half, and it is not optional — it is *more* load-bearing here than in
 * the 404 suite it is modelled on. "Every attempt was refused identically" is exactly what a
 * suite proves when the account was never created, when the password it thinks is right is
 * wrong, or when the database is empty: the "wrong password" case is then a second unknown
 * address, and the file compares two copies of one answer. So §2 signs in *with the same
 * credentials*, through the same action, and requires a different response.
 */

/** The host the mocked request arrives on. Only used to resolve relative locations. */
const HOST = 'cite.fablab.test'

const mocks = vi.hoisted(() => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async (): Promise<unknown> => undefined),
}))

// `next/navigation` is deliberately **not** mocked: the thrown redirect is the response under
// test, and a mock of it would be this file asserting against its own fixture.
vi.mock('next/headers', () => ({ cookies: mocks.cookies, headers: mocks.headers }))

const pagina = await import('../../app/(frontend)/login/page.js')
const { default: Page, entrar, MENSAGEM_NEUTRA, LOGIN_PATH, DESTINO_PADRAO } = pagina

/** The account that exists, and the password that really opens it. */
const REGISTRADA = { email: 't014-registrada@example.com', senha: 't014-senha-correta-123' }

/** An address with no account anywhere — asserted in §2, never assumed. */
const DESCONHECIDA = 't014-nunca-cadastrada@example.com'

/** Wrong passwords, distinct from each other so no assertion can pass by their being equal. */
const SENHA_ERRADA = { primeira: 't014-errada-primeira', segunda: 't014-errada-segunda' }

/**
 * What a cookie jar was told. A successful sign-in writes the session cookie through
 * `next/headers`, and there is no jar outside a request scope; this collects the writes so §2's
 * success is a real sign-in rather than one that throws on its last line.
 *
 * A named fake rather than an inline stub, and write-only on purpose: nothing here ever feeds a
 * cookie back into {@link mocks.headers}, so no test can be ordered into signing the *page*
 * in — which would redirect it to Minha Conta and silently stop rendering the thing §1 compares.
 */
class FakeCookieJar {
  readonly escritos: Array<{ name: string; value?: string }> = []

  set(cookie: { name: string; value?: string }): void {
    this.escritos.push(cookie)
  }

  delete(name: string): void {
    this.escritos.push({ name })
  }
}

let payload: Payload
let jar: FakeCookieJar

/** A response as a visitor receives it: the redirect, and the page underneath it. */
type Resposta = { readonly status: number; readonly local: string; readonly corpo: string }

const formulario = (email: string, senha: string): FormData => {
  const dados = new FormData()
  dados.set('email', email)
  dados.set('senha', senha)
  return dados
}

/**
 * Runs `entrar` and returns the redirect it threw.
 *
 * An action that returned normally is a failure this file must report as itself: neither branch
 * of `entrar` falls through, so a return means the page stopped answering sign-ins at all — and
 * a harness that quietly produced an empty response for it would compare two empty responses and
 * call them identical.
 */
async function redirecionamentoDe(acao: () => Promise<void>): Promise<RedirectError> {
  try {
    await acao()
  } catch (erro) {
    // Anything that is not a redirect is rethrown rather than dressed as a response: a database
    // that fell over must not read as "the refusal tells nothing".
    if (!isRedirectError(erro)) throw erro
    return erro
  }
  throw new Error('`entrar` returned without redirecting; a sign-in attempt got no response')
}

/**
 * The page the browser lands on after the redirect, rendered.
 *
 * A destination away from `/login` has no body this suite renders — and none it needs: leaving
 * the login screen is already a different response, and §2 is what reads that difference.
 */
async function corpoEm(local: string): Promise<string> {
  const url = new URL(local, `https://${HOST}`)
  if (url.pathname !== LOGIN_PATH) return `(saiu do login, para ${url.pathname})`
  const query = Object.fromEntries(url.searchParams)
  const arvore = (await Page({ searchParams: Promise.resolve(query) })) as ReactElement
  return renderToStaticMarkup(arvore)
}

/** One sign-in attempt, reduced to everything the visitor could tell it apart by. */
async function tentar(email: string, senha: string): Promise<Resposta> {
  const erro = await redirecionamentoDe(() => entrar(formulario(email, senha)))
  const local = getURLFromRedirectError(erro)
  return { status: getRedirectStatusCodeFromError(erro), local, corpo: await corpoEm(local) }
}

/** Removes both addresses, so a re-run starts from a world this file built. */
const limpar = () =>
  payload.delete({
    collection: 'users',
    where: { email: { in: [REGISTRADA.email, DESCONHECIDA] } },
    overrideAccess: true,
  })

beforeAll(async () => {
  payload = await getPayload({ config })
  await limpar()
  // `overrideAccess: true` because `Users.access.create` is `masterOnly()` and the public signup
  // path (T027) does not exist yet — who may create an account is FR-022's question, not this
  // file's, and forcing the setup through the guarded path would make a broken guard look like
  // a broken fixture (`tests/tenancy/fixtures.ts`).
  await payload.create({
    collection: 'users',
    data: { email: REGISTRADA.email, password: REGISTRADA.senha, role: 'user', orgs: [] },
    overrideAccess: true,
  })
}, 120_000)

beforeEach(() => {
  jar = new FakeCookieJar()
  mocks.cookies.mockResolvedValue(jar)
  mocks.headers.mockResolvedValue(new Headers({ host: HOST }))
})

afterAll(async () => {
  if (payload) await limpar()
})

describe('§1 — a wrong password and an address with no account get one answer (FR-014, SC-002)', () => {
  /**
   * Ordered so the reference — the address with no account at all — is computed first.
   *
   * Two wrong-password attempts rather than one, because they are not the same request twice:
   * the first increments `loginAttempts` on a row the second then reads. That stored state is
   * the asymmetry between the two causes (an address with no account has no counter to move),
   * and a single attempt each would never exercise it. Both stay well under `maxLoginAttempts`,
   * so the lock — T016's subject — is not what this file is measuring.
   */
  const CASOS: readonly (readonly [string, string, string])[] = [
    ['um endereço que não tem conta', DESCONHECIDA, SENHA_ERRADA.primeira],
    ['um endereço sem conta, com a senha que abre a conta que existe', DESCONHECIDA, REGISTRADA.senha],
    ['a conta que existe, com a senha errada', REGISTRADA.email, SENHA_ERRADA.primeira],
    ['a conta que existe, com a senha errada outra vez', REGISTRADA.email, SENHA_ERRADA.segunda],
  ]

  let respostas: { caso: string; resposta: Resposta }[]

  beforeAll(async () => {
    respostas = []
    for (const [caso, email, senha] of CASOS) {
      respostas.push({ caso, resposta: await tentar(email, senha) })
    }
  }, 120_000)

  it('answers every one of them, and answers with a redirect', () => {
    // A vacuous pass has a shape here: an empty list satisfies every loop below it.
    expect(respostas, 'the attempts were never made').toHaveLength(CASOS.length)
    for (const { caso, resposta } of respostas) {
      expect(resposta.status, `${caso} did not come back as a redirect`).toBeGreaterThanOrEqual(300)
      expect(resposta.status, `${caso} did not come back as a redirect`).toBeLessThan(400)
    }
  })

  it('answers all of them exactly as it answers the address that has no account', () => {
    const referencia = respostas[0]?.resposta
    for (const { caso, resposta } of respostas.slice(1)) {
      expect(
        resposta,
        `${caso} produced a different response than an address with no account — the refusal ` +
          `tells a prober which of the two it was, which is what FR-014 forbids`,
      ).toEqual(referencia)
    }
  })

  it('is the neutral message that every one of them lands on', () => {
    for (const { caso, resposta } of respostas) {
      expect(
        resposta.corpo,
        `${caso} rendered no message at all. An identical *empty* answer satisfies the ` +
          'comparison above while telling the maker nothing about what just happened.',
      ).toContain(MENSAGEM_NEUTRA)
    }
  })

  it('names neither the cause, the address, nor the password anywhere in the response', () => {
    for (const { caso, resposta } of respostas) {
      const inteira = `${resposta.status} ${resposta.local} ${resposta.corpo}`
      expect(
        inteira,
        `${caso} carried the submitted credentials into the response, where they reach the ` +
          'browser history, the referer of the next request and every log in between (FR-020)',
      ).not.toMatch(/t014-registrada|t014-nunca-cadastrada|t014-errada|t014-senha-correta/)
      expect(
        inteira,
        `${caso} named which half failed, or whether the address is registered`,
      ).not.toMatch(/senha incorreta|não encontrad|bloquead|inexistente|usuári[oa] não/i)
    }
  })
})

describe('§2 — the world this file compared was the one it meant to build', () => {
  it('the unknown address really has no account', async () => {
    const { totalDocs } = await payload.find({
      collection: 'users',
      where: { email: { equals: DESCONHECIDA } },
      overrideAccess: true,
    })
    expect(
      totalDocs,
      'the address §1 used as its reference has an account, so the reference answer is not ' +
        '"an address nothing is behind" and every comparison above is against the wrong case',
    ).toBe(0)
  })

  it('the registered address really is registered, and the password really opens it', async () => {
    // The discriminating half. Without it, "the wrong password was refused identically" is also
    // what a suite reports when the account was never created and both causes were the same one.
    const erro = await redirecionamentoDe(() =>
      entrar(formulario(REGISTRADA.email, REGISTRADA.senha)),
    )

    expect(
      getURLFromRedirectError(erro),
      'the credentials §1 calls “the wrong password on an account that exists” did not sign in ' +
        'either — so that case was a second unknown address, and §1 compared one answer with ' +
        'itself',
    ).toBe(DESTINO_PADRAO)
    expect(
      jar.escritos.some((cookie) => cookie.value),
      'the sign-in left no session cookie, so nobody was signed in',
    ).toBe(true)
  })

  it('answers an accepted sign-in differently from a refused one', async () => {
    const aceita = await tentar(REGISTRADA.email, REGISTRADA.senha)
    const recusada = await tentar(REGISTRADA.email, SENHA_ERRADA.primeira)

    expect(
      aceita,
      'a sign-in that succeeded is indistinguishable from one that was refused — the harness ' +
        'cannot tell two responses apart, so §1 proving them equal proves nothing',
    ).not.toEqual(recusada)
  })
})
