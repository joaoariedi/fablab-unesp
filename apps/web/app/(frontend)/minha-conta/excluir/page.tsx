import type { CSSProperties, ReactElement } from 'react'

import { redirect } from 'next/navigation'

import { Button } from '@fablab/ui'

import { deleteAccount } from '../../../../lib/accounts/deletion'
import { getErasureScopedPayload, getTenantScopedPayloadForRSC } from '../../../../lib/tenancy'
import { currentUser, signOut } from '../../../../lib/tenancy/session'

/**
 * T032b / FR-031b, SC-015, US8 — **the deletion screen**: all three outcomes named, and the
 * person's own `@handle` typed before anything is erased (CLR-010).
 *
 * ── Why the copy is the feature, and not the decoration ─────────────────────────────────────
 *
 * CLR-003 decided that a deleted maker's published work **stays**, credited to a tombstone, so a
 * departure cannot silently withdraw the lab's teaching material. That is the half nobody
 * expects: someone pressing EXCLUIR in the belief their projects disappear has been misled by a
 * screen that said nothing, and the act is irreversible, so there is no later moment to correct
 * the impression. CLR-010 answers it by fixing what the screen owes the person — the three
 * outcomes, each named — which is why {@link RESULTADOS} is a declared constant with a test on
 * it rather than prose scattered through the markup.
 *
 * ── Why the handle is checked in the action and not by the input ────────────────────────────
 *
 * `required` is a browser's courtesy. A server action is reachable without a browser, so a gate
 * that lives in an attribute is a gate an accidental or forged POST walks past — and what it
 * guards here cannot be undone. {@link confirmacaoConfere} therefore runs inside
 * {@link excluirConta}, before anything is read for writing.
 *
 * ── Why the expected handle never travels in the form ───────────────────────────────────────
 *
 * Every field of a `FormData` is the sender's to write. Comparing the typed value against a
 * handle the form carried — or deleting whatever `perfilId` it named — would make the gate
 * self-certifying: send the same string twice and the screen proceeds, for somebody else's
 * profile. So the identity is read from the session on every call, the lookup is filtered by the
 * signed-in account (never by the lab alone, which would return whichever profile came first),
 * and nothing submitted is consulted except the confirmation itself.
 *
 * ── What this file deliberately does not do ─────────────────────────────────────────────────
 *
 * It does not erase anything. The three outcomes are one transaction in `lib/accounts/deletion`,
 * and a second implementation of them here would be a second thing to get wrong — with the
 * failure being a partial erasure nobody can repair. This screen collects the confirmation,
 * calls that module, and ends the session.
 */

export const metadata = { title: 'EXCLUIR CONTA — Fab Lab CITe Bauru' }

/** This screen's own path — where a refused confirmation returns. */
export const EXCLUIR_PATH = '/minha-conta/excluir'

/** Minha Conta: where CANCELAR goes, and where a signed-in visitor with no profile here lands. */
export const CONTA_PATH = '/minha-conta'

/** Where the person goes once the account is gone. **Not** an account page: their session has
 *  just been ended and every page under `/minha-conta` would bounce them to login. */
export const DESTINO_APOS_EXCLUSAO = '/'

const LOGIN_PATH = '/login'

/** The field the confirmation is typed into. */
export const CAMPO_CONFIRMACAO = 'confirmacao'

/** The query this screen answers a refused confirmation with. A parameter rather than a message
 *  in the URL: the value is echoed back into the page, and the copy is fixed here. */
const PARAM_ERRO = 'erro'
const ERRO_CONFIRMACAO = 'confirmacao'

export const MENSAGEM_CONFIRMACAO_INVALIDA =
  'O identificador digitado não confere com o seu. Nada foi excluído.'

/**
 * The three outcomes, in the order CLR-010 names them (FR-031b).
 *
 * Declared as data so the screen cannot ship two of three: each line is one outcome, and the
 * middle one — the work stays — is the reason the decision exists at all.
 */
export const RESULTADOS = [
  'Seus dados pessoais são apagados: nome, e-mail, data de nascimento, vínculo, escolaridade, ' +
    'curso e o avatar que você montou.',
  'O que você publicou permanece no site. Artigos, aulas e modelos 3D continuam disponíveis para ' +
    'a comunidade e passam a ser exibidos como autor removido, sem o seu nome e sem link para o ' +
    'seu perfil.',
  'Suas curtidas são removidas e o número de curtidas de cada conteúdo é recalculado.',
] as const

/** A typed confirmation and a stored handle, reduced to the same shape before comparison. */
const normalizar = (valor: string): string => valor.trim().replace(/^@+/, '').toLowerCase()

/**
 * Does what the person typed name their own handle? (CLR-010)
 *
 * Tolerant about the two spellings an honest person produces — the screen prints `@handle`, so
 * the `@` is what most will retype, and the handle is folded from a name that has capitals in it
 * — and about nothing else.
 *
 * An empty stored handle matches **nothing**, including an empty confirmation. A profile whose
 * handle somehow failed to derive would otherwise be deletable by pressing the button with the
 * field untouched, which is precisely the accidental confirmation this gate exists to make
 * impossible.
 *
 * @example confirmacaoConfere('@MariaSilva', 'mariasilva') // true
 */
export function confirmacaoConfere(digitado: string, handle: string): boolean {
  const esperado = normalizar(handle)
  if (esperado === '') return false
  return normalizar(digitado) === esperado
}

/** Why this request has no profile to erase — the two cases lead to different places. */
type SemPerfil = 'sem-sessao' | 'sem-perfil'

type PerfilDoVisitante = {
  readonly id: string | number
  /** The account behind the profile — what the erasure door checks ownership against. */
  readonly usuarioId: string | number
  readonly handle: string
}

/**
 * This request's own profile in this lab, read from the session on every call.
 *
 * The lookup is filtered by the signed-in account. Scoped to the organization alone it would
 * return whichever profile came first and this screen would erase a stranger's account.
 */
async function perfilDoVisitante(): Promise<PerfilDoVisitante | SemPerfil> {
  const usuario = await currentUser()
  if (!usuario) return 'sem-sessao'


  const db = await getTenantScopedPayloadForRSC()
  const { docs } = await db.find<{ id: string | number; handle?: unknown }>({
    collection: 'perfilMaker',
    where: { usuario: { equals: usuario.id } },
    limit: 1,
    depth: 0,
  })

  const perfil = docs[0]
  // One login may hold profiles in two labs (002 § CLR-002). No profile *here* means there is
  // nothing for this lab's screen to erase, and reaching for another lab's is never the answer.
  if (!perfil) return 'sem-perfil'
  // `usuarioId` travels with the profile because the erasure door needs BOTH: the profile it
  // is about to delete, and the account it must prove that profile belongs to. Re-reading the
  // session inside the door would be a second opinion on the same question.
  return {
    id: perfil.id,
    usuarioId: usuario.id,
    handle: typeof perfil.handle === 'string' ? perfil.handle : '',
  }
}

const destinoSemPerfil = (motivo: SemPerfil): string =>
  motivo === 'sem-sessao' ? `${LOGIN_PATH}?de=${encodeURIComponent(EXCLUIR_PATH)}` : CONTA_PATH

/**
 * The confirmation, and then the erasure (FR-031b, US8).
 *
 * Order, and why it is this one: the session is checked, the confirmation is compared against
 * the handle **read from that session**, the erasure runs, and only then is the session ended.
 * Signing out first would take away the credentials `deleteAccount` performs its writes with.
 *
 * Nothing is caught. A failed erasure rolls the transaction back, so the account is still there;
 * reporting success and dropping the session would tell the person their data is gone and leave
 * them unable to check — the one report they cannot verify.
 */
export async function excluirConta(dados: FormData): Promise<void> {
  'use server'

  const perfil = await perfilDoVisitante()
  if (typeof perfil === 'string') redirect(destinoSemPerfil(perfil))

  const digitado = String(dados.get(CAMPO_CONFIRMACAO) ?? '')
  if (!confirmacaoConfere(digitado, perfil.handle)) {
    redirect(`${EXCLUIR_PATH}?${PARAM_ERRO}=${ERRO_CONFIRMACAO}`)
  }

  const { headers } = await import('next/headers')
  const cabecalhos = await headers()
  const req = { headers: cabecalhos } as never

  // The erasure door, not the request-scoped client, and not a fabricated request.
  //
  // The first draft passed `{ headers } as never` — with no `user` on it — so `scopedAccess()`
  // denied the very first read and nothing was ever erased. The `as never` was the only reason
  // it compiled. And a real session would not have been enough either: `perfilMaker.delete` is
  // `teamOnly()` and `users.delete` is `masterOnly()`, both written against somebody erasing
  // OTHER people's work. LGPD asks for the case neither rule describes.
  //
  // `getErasureScopedPayload` proves this profile belongs to this authenticated account before
  // it unseals anything, and then refuses every id but those two. The proof is the reason it is
  // allowed to exist; `perfil.usuarioId` comes from `currentUser()`, never from the form.
  const porta = await getErasureScopedPayload({
    host: cabecalhos.get('x-tenant-host') ?? cabecalhos.get('host') ?? '',
    usuarioId: perfil.usuarioId,
    perfilId: perfil.id,
    req,
  })

  await deleteAccount({ req, perfilId: perfil.id }, { getStore: async () => porta })
  await signOut()

  redirect(DESTINO_APOS_EXCLUSAO)
}

/** The three outcomes, as a list — the screen's whole reason for existing (CLR-010). */
function listaDeResultados(): ReactElement {
  return (
    <ul style={ESTILO.lista}>
      {RESULTADOS.map((resultado) => (
        <li key={resultado} style={ESTILO.item}>
          {resultado}
        </li>
      ))}
    </ul>
  )
}

/** The confirmation field. The instruction is **one string** so the handle reads as one token —
 *  `@` and the handle as separate children would print as `@ mariasilva`. */
function campoDeConfirmacao(handle: string): ReactElement {
  return (
    <label style={ESTILO.rotulo}>
      {`Para confirmar, digite @${handle}`}
      <input
        name={CAMPO_CONFIRMACAO}
        type="text"
        placeholder={`@${handle}`}
        // Off, deliberately: a browser offering to fill this defeats the friction (CLR-010).
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        style={ESTILO.entrada}
      />
    </label>
  )
}

type ExcluirPageProps = {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * `/minha-conta/excluir` — the last screen before an irreversible erasure.
 *
 * @example /minha-conta/excluir?erro=confirmacao  (after a confirmation that did not match)
 */
export default async function Page({ searchParams }: ExcluirPageProps = {}): Promise<ReactElement> {
  const perfil = await perfilDoVisitante()
  if (typeof perfil === 'string') redirect(destinoSemPerfil(perfil))

  const query = (await searchParams) ?? {}
  const recusado = query[PARAM_ERRO] === ERRO_CONFIRMACAO

  return (
    <main style={ESTILO.pagina_}>
      <div className={CLASSE.card} style={ESTILO.card}>
        <h1 style={ESTILO.titulo}>EXCLUIR CONTA</h1>
        <p style={ESTILO.subtitulo}>
          Esta ação não pode ser desfeita. Antes de continuar, veja o que acontece com cada parte
          do que você deixou aqui:
        </p>

        {listaDeResultados()}

        {recusado ? (
          <p role="alert" style={ESTILO.erro}>
            {MENSAGEM_CONFIRMACAO_INVALIDA}
          </p>
        ) : null}

        <form action={excluirConta} className={CLASSE.form}>
          {campoDeConfirmacao(perfil.handle)}
          <div style={ESTILO.acoes}>
            <a href={CONTA_PATH} style={ESTILO.cancelar}>
              CANCELAR
            </a>
            <Button type="submit">EXCLUIR MINHA CONTA</Button>
          </div>
        </form>
      </div>
      <style href="fablab-excluir-conta" precedence="default">
        {EXCLUIR_CSS}
      </style>
    </main>
  )
}

/** The class names, in one place: the markup and {@link EXCLUIR_CSS} must agree, and a typo in
 *  either is an unstyled element or a breakpoint that switches nothing. */
const CLASSE = { card: 'fl-excluir', form: 'fl-excluir__form' } as const

/** Only what a style object cannot express — React has no media query. */
const EXCLUIR_CSS = `
.${CLASSE.card} { width: 100%; max-width: 560px; }
.${CLASSE.form} { display: flex; flex-direction: column; gap: var(--space-5); }
@media (min-width: 834px) {
  .${CLASSE.card} { padding: var(--space-9); }
}
`

/**
 * Every style this page declares, in one object — style objects rather than a stylesheet, for
 * the reason every page here records: the suite runs at `node` with no DOM, so a class name
 * would be assertable only as text in two files. Every colour is a token (FR-027).
 */
const ESTILO: Record<string, CSSProperties> = {
  // Trailing underscore, as the sibling pages write it: `pagina` also names a query parameter in
  // this codebase, and two meanings for one word is how the wrong one gets used.
  pagina_: {
    display: 'flex',
    justifyContent: 'center',
    background: 'var(--surface-inverted)',
    color: 'var(--text-on-light)',
    padding: 'var(--space-8) var(--space-5) var(--space-10)',
  },
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
    gap: 'var(--space-4)',
  } as CSSProperties,
  titulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    textTransform: 'uppercase',
  },
  subtitulo: { margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)' },
  lista: {
    margin: 0,
    paddingLeft: 'var(--space-6)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
  },
  item: { margin: 0 },
  erro: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-on-light)',
    background: 'var(--surface-inverted)',
    border: '2px solid var(--color-navy)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3) var(--space-4)',
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
  acoes: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' },
  cancelar: {
    // The secondary of `onboarding.md` § *Trilho esquerdo*: navy fill, light text. It is not
    // `Button` — that component is the canonical primary and has no variant.
    background: 'var(--color-navy)',
    color: 'var(--color-claro)',
    '--focus-ring-color': 'var(--color-claro)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3) var(--space-6)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-base)',
    textDecoration: 'none',
    display: 'inline-block',
  } as CSSProperties,
}
