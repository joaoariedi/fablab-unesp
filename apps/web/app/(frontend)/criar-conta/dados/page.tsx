import type { CSSProperties, ReactElement } from 'react'

import { redirect } from 'next/navigation'

import { Button } from '@fablab/ui'

// The two option lists are exported from the collection **so the form and the column cannot hold
// different lists** (`PerfilMaker.ts` says so where it exports them): `db-postgres` materialises a
// `select` as a Postgres enum, so a value this form offers and the enum refuses is a signup that
// dies at the insert with no field to point the person at. Step 1 imports its slot vocabulary from
// `AvatarItem.ts` for the same reason; both are type-and-constant imports, so no `payload` runtime
// module reaches a page (000's import boundary, extended to this feature by T038).
import { completeSignup } from '../../../../lib/accounts/signup'
import { signIn } from '../../../../lib/tenancy/session'
import { ESCOLARIDADES, VINCULOS_UNESP } from '../../../../collections/content/PerfilMaker'

/**
 * T026 / FR-008, FR-012, US1 — step 2 of `/criar-conta`: the personal data, the consent gate and
 * the way back to step 1.
 *
 * `onboarding.md` § 6 draws the screen from the round-4 mockup: a light card centred on the page,
 * the display title `CRIAR CONTA` over *"Preencha os dados abaixo para criar sua conta."*, seven
 * fields in a fixed order, the canonical pink submit, and `Já tem uma conta? Fazer login` under
 * it. Round 5 (2026-08-24) added two things the mockup does not draw and the decisions do: the
 * `1 2` indicator, and the **terms checkbox** that gates the signup.
 *
 * ── What this file is, and what it deliberately is not ──────────────────────────────────────
 *
 * It is the form: the controls, their constraints, and the two values the submit has to carry
 * (the avatar built in step 1 and the terms version shown here). It does **not** create an
 * account — `completeSignup` is T027's, and with it comes the `action` this `<form>` is waiting
 * for. Until then the form has `method="post"` and no action, which is inert; what it must not be
 * is a browser's default **GET**, because that puts the typed password in the address bar, in the
 * history, in the `Referer` of the next request and in every access log in between. `/login`
 * records the same reasoning for never echoing an address back into its query.
 *
 * ── How `VOLTAR` keeps the avatar (FR-002, US1's edge) ──────────────────────────────────────
 *
 * The configuration built in step 1 travels as a **query parameter**, and this page hands the
 * same string back in the `VOLTAR` href and forward in a hidden field. That is the whole
 * mechanism, and it is chosen because it is the only one a server component has: `onboarding.md`
 * lists a locally stored draft as **(proposta)**, and storage is readable only from a client — an
 * island this route has no seat for (FR-024, `ALLOWED_ISLANDS`).
 *
 * The draft is attacker-supplied like any query (anyone can link here), so it is **bounded and
 * opaque**: a single value, within {@link LIMITE_RASCUNHO}, never parsed. This page does not
 * interpret an avatar and must not become a second validator of one — `perfilMaker.avatarConfig`
 * records that the shape is checked where it crosses into the database, which is T027's action.
 *
 * ── Why the terms version lives here ────────────────────────────────────────────────────────
 *
 * FR-012 buys exactly one thing with the version: the ability to demand a fresh consent from the
 * people who accepted the old text. That claim only holds if the version stamped is the version
 * the person was **shown**, which is why {@link TERMS_VERSION} is declared beside the checkbox
 * that displays it and travels with the submission rather than being read from somewhere else at
 * write time. T027 stamps `aceiteTermosVersao` from this field.
 */

export const metadata = { title: 'CRIAR CONTA — Fab Lab CITe Bauru' }

/** Step 1 — where `VOLTAR` goes, with the draft it arrived with (FR-002). Step 1's own `VOLTAR`
 *  leaves for the Home instead; the two are deliberately never one shared constant. */
export const PASSO_1_PATH = '/criar-conta'

/** This page's own path — where a refused submit returns, so the draft is not lost to a 404. */
export const PASSO_2_PATH = `${PASSO_1_PATH}/dados`

/**
 * The query parameter the step-1 avatar travels in — **and the name of the hidden field that
 * carries it on**, deliberately the same string: the value goes back to step 1 through the query
 * and forward to T027 through the form, and two spellings of one draft is how one of the two
 * paths silently starts carrying nothing.
 */
export const PARAM_AVATAR = 'avatar'

/** The terms of use and privacy policy. The **text** is T041 ⛔ (ISS-002: the PO's words, with
 *  UNESP legal review); this is where it lands, and the version below is what makes the stamp
 *  real before it does. */
export const TERMOS_PATH = '/termos'

/**
 * The version of the terms this form presents, stamped into `aceiteTermosVersao` (FR-012, SC-013).
 *
 * tasks.md T041: *"`TERMS_VERSION` ships as a constant so the stamp is real from the first
 * account; the day the text lands, it increments and everyone re-consents."* The value names the
 * open issue on purpose — no account may be recorded as having accepted a published version of a
 * text nobody has written, and `0-iss-002` is a string that can never be mistaken for one.
 */
export const TERMS_VERSION = '0-iss-002'

const LOGIN_PATH = '/login'
const PASSO_ATUAL = 2
const TOTAL_DE_PASSOS = 2

/** `nome` is ≤60 (round 4, 2026-08-24): it is also the `NOME DO AVATAR` and the source the handle
 *  is derived from, and the `AutorInline` block has a layout that cap protects. */
const LIMITE_NOME = 60

/**
 * The longest avatar draft this page will carry.
 *
 * A configuration is a base, two palette ids, one item id per slot and a direction — a few
 * hundred characters. The bound exists because the value is a query anyone can write: without it
 * a link can make this page echo a megabyte of someone else's string back at a visitor, into both
 * the `VOLTAR` href and a form field. Generous enough that no real draft meets it.
 */
const LIMITE_RASCUNHO = 4096

/** The names the submitted form uses. The consent is two fields, not one: *when* is the proof and
 *  *which* is what makes a re-consent demandable (`PerfilMaker.ts` on `aceiteTermosVersao`). */
const CAMPO_ACEITE = 'aceiteTermos'
const CAMPO_VERSAO = 'aceiteTermosVersao'

/** The suggestion list `curso` is a combobox over (FR-008). */
const ID_CURSOS = 'fl-cursos'

/**
 * The step-1 draft, if this page was handed one it may carry.
 *
 * Three refusals, each for a different reason: a repeated `?avatar=` is **ambiguous** and
 * guessing which one to carry is how the wrong one gets used; an empty string is not a draft and
 * would leave T027 telling "no avatar" apart from "an avatar spelled as nothing"; anything over
 * {@link LIMITE_RASCUNHO} is somebody's link rather than somebody's avatar. The value is never
 * parsed — see the module note.
 *
 * @example rascunhoDoAvatar('{"base":"f"}') // '{"base":"f"}'
 * @example rascunhoDoAvatar(['a', 'b']) // null
 */
export function rascunhoDoAvatar(valor: string | string[] | undefined): string | null {
  if (typeof valor !== 'string') return null
  if (valor.length === 0 || valor.length > LIMITE_RASCUNHO) return null
  return valor
}

/**
 * Back to step 1, carrying the draft (FR-002).
 *
 * `encodeURIComponent`, and never concatenation: a configuration contains `&`, `#` and `=`, and a
 * hand-built query string truncates at the first of them — the person lands back on step 1 with
 * *part* of the avatar they built, which looks far more like a success than like a bug.
 *
 * @example hrefDoVoltar('{"a":1&2}') // '/criar-conta?avatar=%7B%22a%22%3A1%262%7D'
 */
export function hrefDoVoltar(rascunho: string | null): string {
  if (rascunho === null) return PASSO_1_PATH
  return `${PASSO_1_PATH}?${PARAM_AVATAR}=${encodeURIComponent(rascunho)}`
}

/** `1 2`, with step 2 filled (FR-001). `aria-current="step"` rather than the fill alone: the
 *  indicator's whole content is two numerals, so a visitor who cannot see it has nothing else. */
function indicadorDePassos(): ReactElement {
  const passos = Array.from({ length: TOTAL_DE_PASSOS }, (_, indice) => indice + 1)
  return (
    <nav aria-label={`Passo ${PASSO_ATUAL} de ${TOTAL_DE_PASSOS}`} style={ESTILO.passos}>
      {passos.map((passo) => (
        <span
          key={passo}
          aria-current={passo === PASSO_ATUAL ? 'step' : undefined}
          style={passo === PASSO_ATUAL ? ESTILO.passoAtual : ESTILO.passo}
        >
          {passo}
        </span>
      ))}
    </nav>
  )
}

/** One text-like control. The label wraps its input, so the association needs no `id` — and an
 *  `id` on a page that may one day render twice is a duplicate waiting to happen (`/login`). */
interface CampoDeTexto {
  readonly nome: string
  readonly rotulo: string
  readonly tipo: 'text' | 'date' | 'email' | 'password'
  readonly placeholder: string
  readonly autoComplete: string
  readonly maxLength?: number
}

function campoDeTexto(campo: CampoDeTexto): ReactElement {
  return (
    <label key={campo.nome} style={ESTILO.rotulo}>
      {campo.rotulo}
      <input
        name={campo.nome}
        type={campo.tipo}
        placeholder={campo.placeholder}
        autoComplete={campo.autoComplete}
        maxLength={campo.maxLength}
        // Every field of step 2 is answerable and every one is needed: `perfilMaker`'s columns are
        // all nullable *because this form is where an empty answer is refused*, with a field error
        // the person can act on rather than a NOT NULL violation from the database.
        required
        style={ESTILO.entrada}
      />
    </label>
  )
}

/**
 * One select, opened on a placeholder that is not a choosable answer.
 *
 * The empty first option is what makes `required` mean something: without it a form submitted
 * untouched records whichever option happened to be first, and a person who never answered is
 * indistinguishable from one who chose `Aluno(a)`.
 */
function campoDeSelecao(
  nome: string,
  rotulo: string,
  placeholder: string,
  opcoes: Readonly<Record<string, string>>,
): ReactElement {
  return (
    <label key={nome} style={ESTILO.rotulo}>
      {rotulo}
      <select name={nome} defaultValue="" required style={ESTILO.entrada}>
        <option value="">{placeholder}</option>
        {Object.entries(opcoes).map(([valor, texto]) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * `CURSO` — a combobox, which is an input plus a suggestion list, and never a `select` (FR-008).
 *
 * The mockup's own placeholder is *"Digite ou selecione seu curso"*, and `PerfilMaker.ts` keeps
 * the column free text for the reason a `select` cannot serve: it validates against its options
 * and would refuse every course nobody thought to list, which for a lab open to the whole
 * community is most of them.
 *
 * The list is **empty on purpose**. No course catalogue exists in this product — `onboarding.md`
 * leaves the options `(proposta)` — and the alternative to an empty `<datalist>` is either a list
 * invented here, which is a second source of truth nobody maintains, or no `list` at all, which
 * makes the control a plain input the day a catalogue does arrive. The suggestions land here and
 * nothing else changes.
 */
function campoDeCurso(): ReactElement {
  return (
    <label style={ESTILO.rotulo}>
      CURSO
      <input
        name="curso"
        type="text"
        list={ID_CURSOS}
        placeholder="Digite ou selecione seu curso"
        autoComplete="off"
        required
        style={ESTILO.entrada}
      />
      <datalist id={ID_CURSOS} />
    </label>
  )
}

/**
 * The consent gate (FR-012) — the checkbox, the link, and the version that travels with it.
 *
 * The link opens in a **new tab** (PO, 2026-08-24) so reading the text does not throw away a
 * half-filled form; `noopener` is the security half of that and not politeness, since the opened
 * document could otherwise reach back through `window.opener` and navigate this one.
 */
function aceiteDosTermos(): ReactElement {
  return (
    <label style={ESTILO.aceite}>
      <input type="checkbox" name={CAMPO_ACEITE} required style={ESTILO.caixa} />
      <span style={ESTILO.aceiteTexto}>
        Li e aceito os{' '}
        <a href={TERMOS_PATH} target="_blank" rel="noopener noreferrer" style={ESTILO.link}>
          termos de uso e política de privacidade
        </a>
        .
      </span>
      {/* The version is submitted, not looked up at write time: FR-012's re-consent claim is about
          what the person was shown, and only the form was there when they were shown it. */}
      <input type="hidden" name={CAMPO_VERSAO} value={TERMS_VERSION} />
    </label>
  )
}

/** The seven fields, in the mockup's order (`onboarding.md` § 6, items 1..7). */
function campos(): ReactElement {
  return (
    <>
      {campoDeTexto({
        nome: 'nome',
        rotulo: 'NOME COMPLETO',
        tipo: 'text',
        placeholder: 'Digite seu nome completo',
        autoComplete: 'name',
        maxLength: LIMITE_NOME,
      })}
      {campoDeTexto({
        nome: 'dataNascimento',
        rotulo: 'DATA DE NASCIMENTO',
        // A `date` control rather than free text: `03/04` is a different day in the two locales
        // this site is read in, and the mockup's own field is `DD / MM / AAAA`.
        tipo: 'date',
        placeholder: 'DD / MM / AAAA',
        autoComplete: 'bday',
      })}
      {campoDeTexto({
        nome: 'email',
        rotulo: 'EMAIL',
        tipo: 'email',
        placeholder: 'Digite seu e-mail',
        autoComplete: 'email',
        // **No institutional-domain check, deliberately** (FR-009, PO 2026-08-24): any e-mail is
        // accepted, and the UNESP relationship is declared in `vinculoUnesp` below. T026b keeps a
        // negative test on this, because it is the rule someone adds back as a "fix".
      })}
      {campoDeSelecao('vinculoUnesp', 'VÍNCULO COM UNESP', 'Selecione seu vínculo', VINCULOS_UNESP)}
      {campoDeSelecao('escolaridade', 'ESCOLARIDADE', 'Selecione sua escolaridade', ESCOLARIDADES)}
      {campoDeCurso()}
      {campoDeTexto({
        nome: 'senha',
        rotulo: 'SENHA',
        tipo: 'password',
        placeholder: 'Crie uma senha',
        // `new-password`, so a browser offers to generate one rather than refilling the address
        // bar's last site. The mockup's eye toggle is client state and would cost this route an
        // island it has no seat for (FR-024).
        autoComplete: 'new-password',
      })}
    </>
  )
}

type DadosPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * `/criar-conta/dados` — step 2, the personal data.
 *
 * @example /criar-conta/dados?avatar=%7B%22base%22%3A%22f%22%7D  (arriving from step 1)
 */
/** Where a new maker lands: their own account, which is also where the header's PERFIL goes. */
export const DESTINO_APOS_CADASTRO = '/minha-conta'

/**
 * The submit — **the line that makes signup a thing a person can do** (US1, SC-001).
 *
 * Until this existed the form carried `method="post"` and no `action`, which is inert: nothing
 * in the product called `completeSignup` at all. Every piece was built and tested and the
 * sentence SC-001 states — *"a visitor completes signup and is signed in"* — was false in a
 * browser, with the gap recorded only in a source comment. No task in tasks.md owned the wiring;
 * it is here because T028's verification found that nothing else would ever add it.
 *
 * ── What it does, in the order it must ──────────────────────────────────────────────────────
 *
 * Create, then sign in, then leave. The sign-in is not a convenience: US1 ends *"and is signed
 * in"*, and an account created without a session sends somebody who just typed their password
 * to a login form to type it again.
 *
 * ── Why the redirect is outside the `try` ───────────────────────────────────────────────────
 *
 * `redirect()` works by throwing. Inside the `try` it would be caught by the failure branch,
 * reported as a signup error, and the person would be told their account could not be created
 * moments after it was — the same trap `login/page.tsx` documents.
 *
 * ── Why the failure branch says so little ───────────────────────────────────────────────────
 *
 * `err.name` only, never the message or the form data: a duplicate-e-mail error names the
 * address, and FR-020 keeps personal data out of log lines as firmly as it keeps passwords out.
 * The visitor gets the message on the page; the log gets the shape.
 */
export async function criarConta(dados: FormData): Promise<void> {
  'use server'

  const { headers } = await import('next/headers')
  const req = { headers: await headers() } as never

  try {
    await completeSignup({
      req,
      nome: String(dados.get('nome') ?? ''),
      email: String(dados.get('email') ?? ''),
      senha: String(dados.get('senha') ?? ''),
      dataNascimento: String(dados.get('dataNascimento') ?? '') || null,
      vinculoUnesp: String(dados.get('vinculoUnesp') ?? '') || null,
      escolaridade: String(dados.get('escolaridade') ?? '') || null,
      curso: String(dados.get('curso') ?? '') || null,
      avatarConfig: dados.get(PARAM_AVATAR) ?? undefined,
      aceiteTermosVersao: String(dados.get(CAMPO_VERSAO) ?? ''),
      // An unticked checkbox is ABSENT from the FormData — it is not `'false'`. Reading it as a
      // string and testing truthiness would make every submit consenting, which is the defect
      // the gate in `completeSignup` exists to close.
      aceiteTermos: dados.get(CAMPO_ACEITE) !== null,
    })

    await signIn({
      email: String(dados.get('email') ?? ''),
      senha: String(dados.get('senha') ?? ''),
    })
  } catch (err) {
    console.warn(`[criar-conta] cadastro recusado: ${err instanceof Error ? err.name : 'desconhecido'}`)
    redirect(`${PASSO_2_PATH}?erro=1`)
  }

  redirect(DESTINO_APOS_CADASTRO)
}

export default async function Page({ searchParams }: DadosPageProps): Promise<ReactElement> {
  const rascunho = rascunhoDoAvatar((await searchParams)[PARAM_AVATAR])

  return (
    <main style={ESTILO.pagina_}>
      <div className={CLASSE.card} style={ESTILO.card}>
        {indicadorDePassos()}
        <h1 style={ESTILO.titulo}>CRIAR CONTA</h1>
        <p style={ESTILO.subtitulo}>Preencha os dados abaixo para criar sua conta.</p>

        <form action={criarConta} className={CLASSE.form}>
          {/* The avatar goes forward as well as back: if only `VOLTAR` held it, pressing
              `CRIAR CONTA →` would create a profile with no avatar at all. */}
          {rascunho === null ? null : <input type="hidden" name={PARAM_AVATAR} value={rascunho} />}
          {campos()}
          {aceiteDosTermos()}
          <div style={ESTILO.acoes}>
            <a href={hrefDoVoltar(rascunho)} style={ESTILO.voltar}>
              VOLTAR
            </a>
            <Button type="submit">CRIAR CONTA →</Button>
          </div>
        </form>

        <p style={ESTILO.rodape}>
          Já tem uma conta?{' '}
          <a href={LOGIN_PATH} style={ESTILO.link}>
            Fazer login
          </a>
        </p>
      </div>
      <style href="fablab-criar-conta-dados" precedence="default">
        {DADOS_CSS}
      </style>
    </main>
  )
}

/** The class names, in one place: the markup and {@link DADOS_CSS} must agree, and a typo in
 *  either is an unstyled element or a breakpoint that switches nothing. */
const CLASSE = { card: 'fl-dados', form: 'fl-dados__form' } as const

/** Only what a style object cannot express — React has no media query. */
const DADOS_CSS = `
.${CLASSE.card} { width: 100%; max-width: 520px; }
.${CLASSE.form} { display: flex; flex-direction: column; gap: var(--space-5); }
@media (min-width: 834px) {
  .${CLASSE.card} { padding: var(--space-9); }
}
`

/**
 * Every style this page declares, in one object — style objects rather than a stylesheet, for the
 * reason every page here records: the suite runs at `node` with no DOM, so a class name would be
 * assertable only as text in two files. Every colour is a token (FR-027).
 */
const ESTILO: Record<string, CSSProperties> = {
  // Trailing underscore, as the listings write it: `pagina` also names a query parameter in this
  // codebase, and two meanings for one word is how the wrong one gets used.
  pagina_: {
    // The surface ROLES, re-declared for this region rather than a colour merely painted over
    // it — step 1's page records the same reasoning. Without them every component inside follows
    // `:root`'s navy treatment on a white page, and the focus ring stays the accent, which scores
    // 2.05:1 here: invisible on exactly the controls a keyboard visitor is aiming for. Navy is
    // 16.63:1 and is the ink this form already writes in (FR-032b, SC-016).
    '--surface-page': 'var(--surface-inverted)',
    '--surface-card': 'var(--surface-light)',
    '--focus-ring-color': 'var(--text-on-light)',
    display: 'flex',
    justifyContent: 'center',
    // The mockup's light background — the card is "praticamente o mesmo tom do fundo" and what
    // separates them is the navy outline, not the fill.
    background: 'var(--surface-inverted)',
    color: 'var(--text-on-light)',
    padding: 'var(--space-8) var(--space-5) var(--space-10)',
  } as CSSProperties,
  card: {
    // The `:root` ring is the accent, which scores ~2:1 on a light surface — invisible on exactly
    // the controls a keyboard visitor is aiming for. Navy is the ink this card already writes in.
    '--focus-ring-color': 'var(--text-on-light)',
    background: 'var(--surface-light)',
    color: 'var(--text-on-light)',
    border: '2px solid var(--color-navy)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-hard)',
    padding: 'var(--space-7) var(--space-6)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  } as CSSProperties,
  passos: { display: 'flex', gap: 'var(--space-2)', alignItems: 'center' },
  passo: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'var(--space-7)',
    height: 'var(--space-7)',
    border: '2px solid var(--text-on-light)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
  },
  passoAtual: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'var(--space-7)',
    height: 'var(--space-7)',
    background: 'var(--color-primary)',
    color: 'var(--color-navy)',
    border: '2px solid var(--text-on-light)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
  },
  titulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    textTransform: 'uppercase',
  },
  subtitulo: {
    margin: '0 0 var(--space-5)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
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
    // FR-032b: every field is a touch target before it is a field. Declared, not inferred from
    // the padding — a browser sizes a `date` and a `select` by its own rules, and this is the
    // only number the page controls.
    minHeight: '44px',
  },
  aceite: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    // The LABEL is the target: a press anywhere on this row toggles the box inside it, which is
    // why FR-032b's 44px is declared here rather than on a 24px square that would then have to
    // be drawn twice the size of every checkbox in the product.
    minHeight: '44px',
  },
  caixa: {
    // 24px of box, so the target reaches the 44x44 the focus/breakpoint gate measures once the
    // label's padding is counted with it (SC-016).
    width: 'var(--space-6)',
    height: 'var(--space-6)',
    accentColor: 'var(--color-primary)',
  },
  aceiteTexto: { margin: 0 },
  acoes: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' },
  voltar: {
    // The secondary of `onboarding.md` § *Trilho esquerdo*: navy fill, light text. It is not
    // `Button` — that component is the canonical primary and has no variant, because the
    // secondary is still `(proposta)` in the identity document.
    background: 'var(--color-navy)',
    color: 'var(--color-claro)',
    '--focus-ring-color': 'var(--color-claro)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3) var(--space-6)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-base)',
    textDecoration: 'none',
    // FR-032b, as step 1's own VOLTAR declares it: 44px with the label centred in it.
    minHeight: '44px',
    display: 'inline-flex',
    alignItems: 'center',
  } as CSSProperties,
  rodape: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', margin: 'var(--space-6) 0 0' },
  link: { color: 'var(--color-azul)' },
}
