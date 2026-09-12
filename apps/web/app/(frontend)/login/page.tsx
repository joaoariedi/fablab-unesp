import type { CSSProperties, ReactElement } from 'react'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { Button } from '@fablab/ui'

import { currentUser, signIn } from '../../../lib/tenancy/session'

/**
 * T013 / FR-014, FR-016, US3 — `/login`, replacing feature 001's placeholder.
 *
 * `login.md` fixes the screen (*"card centralizado, sem coluna"*, title `ENTRAR`, subtitle
 * *"Bem-vindo de volta, maker!"*, the canonical pink submit) and the two behaviours this task is
 * actually about: *"mensagem inline neutra (`E-mail ou senha incorretos`) — sem revelar qual dos
 * dois falhou nem se o e-mail existe"*, and *"pós-login: retorna à página de origem; quem abriu o
 * login diretamente (ou pelo `PERFIL`) cai na Minha Conta"*.
 *
 * ── No island, and what that costs ──────────────────────────────────────────────────────────
 *
 * Every control here is a plain form control and the submit is a **server action**, so this page
 * adds nothing to `ALLOWED_ISLANDS` (FR-024). The cost is real and worth naming: the message
 * arrives after a round trip rather than in place, and the typed address is not echoed back into
 * the refilled form. The second one is a feature rather than a regret — see `PARAM_ERRO` below.
 *
 * ── The neutral message is produced *here*, deliberately ────────────────────────────────────
 *
 * `signIn` throws and says nothing a caller may branch on (`lib/tenancy/session.ts`), and this
 * page catches **every** failure into one outcome. That includes failures that are not the
 * visitor's fault at all — a database that will not answer becomes `E-mail ou senha incorretos`,
 * which is a misleading message during an outage. The alternative is a branch that reads the
 * error to decide, and every such branch is one edit away from being the oracle FR-014 exists to
 * deny: "this account is locked" and "no such user" each reveal whether an address is registered.
 * A misleading message during an outage is recoverable; an enumeration oracle is not.
 *
 * ── Why there is no `Esqueci minha senha` link yet ──────────────────────────────────────────
 *
 * FR-017's reset is configured (`Users.auth.forgotPassword`) and tested against Payload's own
 * endpoints (T015), but **no task in this feature builds a reset screen**, so the link would
 * point at a route that does not exist. `login.md` decided the link enters; it enters with the
 * screen it opens. A control that answers a press with a 404 is the half-shipped heart 003 §
 * CLR-010 moved into this feature, and shipping a second one here would be doing it knowingly.
 */

export const metadata = { title: 'ENTRAR — Fab Lab CITe Bauru' }

/** This page's own path. Used to recognise — and refuse — itself as a post-login destination. */
export const LOGIN_PATH = '/login'

/** Where a maker lands when nothing better is known: a direct visit, the `PERFIL` tab, or a
 *  destination this page refused to trust. Matches `profileHref`'s signed-in answer. */
export const DESTINO_PADRAO = '/minha-conta'

/**
 * The one thing a failed attempt says, whatever failed (FR-014).
 *
 * Exported because `tests/accounts/login.test.ts` (T014) proves the same message answers a wrong
 * password and an unknown address, and a test retyping the copy would still pass on the day the
 * page starts saying two different things.
 */
export const MENSAGEM_NEUTRA = 'E-mail ou senha incorretos'

/**
 * The query the refusal redirect carries — a flag, and never the address that was typed.
 *
 * Echoing the e-mail back so the form can refill it would put it in the browser history, in the
 * `Referer` of the next request and in every access log in between, for a page whose entire
 * subject is not revealing which addresses exist (FR-020, FR-022).
 */
const PARAM_ERRO = 'erro'

/** Where to go after signing in, carried through a refused attempt so it is not lost. */
const PARAM_DESTINO = 'de'

/** The hidden form field the destination travels in. It is the visitor's to edit, which is why
 *  `entrar` re-validates rather than trusting what comes back. */
const CAMPO_DESTINO = 'destino'

/**
 * A candidate destination, if it is somewhere on this site — otherwise `null`.
 *
 * This is an open-redirect guard, not a tidy-up. Anyone can link to `/login?de=…`, so whatever
 * lands here is attacker-chosen, and a login form that forwards to an arbitrary URL is the
 * classic phishing amplifier: the victim sees this site's domain, signs in, and is handed to
 * somewhere else. Hence a strict allow of *path-absolute* references only:
 *
 * ── Asked of the URL parser, never of a character blocklist ─────────────────────────────────
 *
 * The first draft enumerated the spellings it had seen: no `//`, no backslash, no CR, no LF.
 * It shipped an open redirect. The WHATWG parser strips **TAB** exactly as it strips CR and
 * LF, so `/<TAB>/evil.example/x` passed every one of those checks and
 * `new URL(that, 'https://cite.test')` resolves to `https://evil.example/x` — the classic
 * phishing amplifier this function exists to stop, reachable through
 * `/login?de=/%09/evil.example/x`, surviving the hidden field, and re-validated by the very
 * second check that was supposed to make the round trip safe.
 *
 * A blocklist can only refuse what its author thought of, and the authority on what a string
 * means as a URL is the parser the browser will use — Next resolves the redirect with
 * `new URL(location, base)` in `assign-location.js`. So this asks the same question the same
 * way: resolve against a sentinel origin, and require the answer to still be on it. TAB, the
 * next control character somebody discovers, and every spelling of `..` are all covered by the
 * one rule, because none of them can move the origin without the parser saying so.
 *
 * It returns the **parser's** normalised path rather than the caller's string, so the value
 * that is redirected to is character-for-character the value that was validated. A differential
 * between our reading and Next's is exactly how the first draft's check passed a URL that later
 * resolved somewhere else.
 *
 * `/login` itself is refused because returning here after signing in is a loop.
 *
 * @example caminhoInterno('/projetos?pagina=2') // '/projetos?pagina=2'
 * @example caminhoInterno('https://evil.example') // null
 */
/** Resolved against, never navigated to: `.invalid` is reserved by RFC 2606 and can never be
 *  a real host, so a candidate that stays on this origin cannot have escaped to a real one. */
const ORIGEM_SENTINELA = 'https://interno.invalid'

export function caminhoInterno(candidato: unknown): string | null {
  if (typeof candidato !== 'string' || candidato.length === 0) return null
  // Path-absolute in the source text, before any parsing: it is what makes a bare `evil.example`
  // (a relative reference, which WOULD stay on the sentinel origin) a refusal rather than a path.
  if (!candidato.startsWith('/')) return null

  let resolvido: URL
  try {
    resolvido = new URL(candidato, ORIGEM_SENTINELA)
  } catch {
    return null
  }
  if (resolvido.origin !== ORIGEM_SENTINELA) return null
  if (resolvido.pathname === LOGIN_PATH) return null
  return `${resolvido.pathname}${resolvido.search}${resolvido.hash}`
}

/**
 * The page the visitor came from, when they came from this site.
 *
 * The `Referer` is how "the page they came from" is known at all: the header's `ENTRAR` and the
 * `PERFIL` tab are plain links carrying no state, so there is nothing else to read. It is
 * untrusted input like any other header — hence the host comparison, and then the same path check
 * every destination goes through.
 *
 * @example caminhoDoReferer('https://cite.test/aulas', 'cite.test') // '/aulas'
 */
export function caminhoDoReferer(referer: string | null, host: string | null): string | null {
  if (!referer || !host) return null
  try {
    const origem = new URL(referer)
    return origem.host === host ? caminhoInterno(`${origem.pathname}${origem.search}`) : null
  } catch {
    // A `Referer` that is not a URL tells us nothing; it is not an error worth a page for.
    return null
  }
}

/** A query value as Next hands it over: absent, one string, or repeated. Only a single value can
 *  be a destination — a repeated `?de=` is ambiguous, and guessing is how the guard gets bypassed. */
const umValor = (valor: string | string[] | undefined): string | undefined =>
  typeof valor === 'string' ? valor : undefined

/**
 * Sign in, then go where the visitor was headed (FR-016) — or refuse, neutrally (FR-014).
 *
 * `redirect()` throws, so neither branch falls through. The destination is re-validated here and
 * not merely when the form was drawn: the hidden field travels through the browser, so a check
 * that happened at render time is a check on a value that has since been replaced.
 */
export async function entrar(dados: FormData): Promise<void> {
  'use server'

  const destino = caminhoInterno(dados.get(CAMPO_DESTINO)) ?? DESTINO_PADRAO

  try {
    await signIn({
      email: String(dados.get('email') ?? ''),
      senha: String(dados.get('senha') ?? ''),
    })
  } catch (err) {
    // The error's *name* only. Its message may name the account, and the form data must never
    // reach a log line at all (FR-020, SC-005) — which is why neither is interpolated here.
    console.warn(`[login] tentativa recusada: ${err instanceof Error ? err.name : 'desconhecido'}`)
    redirect(`${LOGIN_PATH}?${PARAM_ERRO}=1&${PARAM_DESTINO}=${encodeURIComponent(destino)}`)
  }

  // Outside the `catch`: a redirect throws, and a `redirect()` to the destination *inside* the
  // `try` would be caught by the handler above and reported to the maker as a failed sign-in.
  redirect(destino)
}

type LoginPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * `/login` — the e-mail-and-password screen.
 *
 * @example /login?erro=1&de=%2Fprojetos  (the shape a refused attempt redirects to)
 */
export default async function Page({ searchParams }: LoginPageProps): Promise<ReactElement> {
  // US3's edge: someone already signed in is sent to Minha Conta rather than shown a second form.
  // `currentUser()` verifies the token instead of noticing a cookie, so a stale session renders
  // the form here rather than bouncing between this page and the guarded one.
  if (await currentUser()) redirect(DESTINO_PADRAO)

  const query = await searchParams
  const cabecalhos = await headers()
  const destino =
    caminhoInterno(umValor(query[PARAM_DESTINO])) ??
    caminhoDoReferer(cabecalhos.get('referer'), cabecalhos.get('host')) ??
    DESTINO_PADRAO

  return (
    <main style={ESTILO.pagina}>
      <div className={CLASSE.card} style={ESTILO.card}>
        <h1 style={ESTILO.titulo}>ENTRAR</h1>
        <p style={ESTILO.subtitulo}>Bem-vindo de volta, maker!</p>

        {query[PARAM_ERRO] === undefined ? null : (
          // `role="alert"` because this text is the answer to something the visitor just did,
          // and it arrives on a fresh document where nothing else would announce it.
          <p role="alert" style={ESTILO.erro}>
            {MENSAGEM_NEUTRA}
          </p>
        )}

        <form action={entrar} className={CLASSE.form}>
          <input type="hidden" name={CAMPO_DESTINO} value={destino} />
          {campo('email', 'EMAIL', 'email', 'Digite seu e-mail', 'email')}
          {campo('senha', 'SENHA', 'password', 'Digite sua senha', 'current-password')}
          <Button type="submit">ENTRAR →</Button>
        </form>

        <p style={ESTILO.rodape}>
          Não tem uma conta?{' '}
          <a href="/criar-conta" style={ESTILO.link}>
            Criar conta
          </a>
        </p>
      </div>
      <style href="fablab-login" precedence="default">
        {LOGIN_CSS}
      </style>
    </main>
  )
}

/** One labelled control. The label wraps its input, so the association needs no `id` — and an
 *  `id` on a page that may one day render twice is a duplicate waiting to happen. */
function campo(
  name: string,
  rotulo: string,
  type: 'email' | 'password',
  placeholder: string,
  autoComplete: string,
): ReactElement {
  return (
    <label key={name} style={ESTILO.rotulo}>
      {rotulo}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        style={ESTILO.entrada}
      />
    </label>
  )
}

/** The class names, in one place: the markup and `LOGIN_CSS` must agree, and a typo in either is
 *  an unstyled element or a breakpoint that switches nothing. */
const CLASSE = { card: 'fl-login', form: 'fl-login__form' } as const

/** Only what a style object cannot express — React has no media query and no pseudo-class. */
const LOGIN_CSS = `
.${CLASSE.card} { width: 100%; max-width: 420px; }
.${CLASSE.form} { display: flex; flex-direction: column; gap: var(--space-5); }
@media (min-width: 834px) {
  .${CLASSE.card} { max-width: 480px; padding: var(--space-9); }
}
`

const ESTILO: Record<string, CSSProperties> = {
  pagina: {
    display: 'flex',
    justifyContent: 'center',
    padding: 'var(--space-9) var(--space-5) var(--space-11)',
    minHeight: '60vh',
  },
  // A light card on the navy page, so the focus ring is re-declared beside the surface it sits
  // on: `--focus-ring-color` resolves to the accent at `:root`, which scores ~2:1 on a light
  // surface — invisible on exactly the controls a keyboard visitor is aiming for (tokens/focus.css).
  card: {
    '--focus-ring-color': 'var(--text-on-light)',
    background: 'var(--surface-light)',
    color: 'var(--text-on-light)',
    border: '2px solid var(--color-navy)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-hard)',
    padding: 'var(--space-7) var(--space-6)',
    // `as CSSProperties`, as every other page here does it: React accepts a custom property in a
    // style object and the DOM typings do not describe one, so the cast is what the token-driven
    // rule above costs. It is narrowed to the one object that declares a custom property.
  } as CSSProperties,
  titulo: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    color: 'var(--text-on-light)',
    margin: 0,
  },
  subtitulo: {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    margin: 'var(--space-2) 0 var(--space-6)',
  },
  erro: {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    // Navy on the light card, never the accent: FR-028 forbids the pink on small text over a
    // light surface, and this is the smallest text on the page.
    color: 'var(--text-on-light)',
    border: '2px solid var(--color-navy)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3) var(--space-4)',
    margin: '0 0 var(--space-5)',
  },
  rotulo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
    letterSpacing: '0.06em',
  },
  entrada: {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    color: 'var(--text-on-light)',
    background: 'var(--surface-inverted)',
    border: '2px solid var(--color-navy)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3) var(--space-4)',
  },
  rodape: {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    margin: 'var(--space-6) 0 0',
  },
  link: { color: 'var(--color-azul)' },
}
