import fs from 'node:fs'

import { REST_POST } from '@payloadcms/next/routes'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '../../payload.config'

/**
 * T017 / FR-020, SC-005, US3, US4 — **no password, hash or reset token in any emitted log line**.
 *
 * SC-005 fixes the validation method: *"test scanning emitted logs during auth flows"*. So this
 * file does exactly that — it drives the real sign-in, the real refusal, the real
 * forgot-password and the real reset against a real database, with everything the process writes
 * captured, and then reads the capture back looking for the secrets it planted.
 *
 * ── Where a log line actually comes out, and why one spy is not enough ──────────────────────
 *
 * "Emitted" has three separate meanings in this process, and a capture that covered one of them
 * would report "nothing was logged" while the other two were printing credentials:
 *
 *  1. **`payload.logger`** is pino, and Payload's default destination is `pino-pretty`'s
 *     `build()` — which writes through `sonic-boom` **straight to file descriptor 1**. It never
 *     calls `process.stdout.write`, so a spy on the stream misses every framework log line.
 *     Hence the patch on `fs.write`/`fs.writeSync`, filtered to fds 1 and 2.
 *  2. **`console.*`** is the app's own channel (`app/(frontend)/login/page.tsx` warns on every
 *     refused attempt). Under Vitest the global `console` is replaced by one writing to the
 *     reporter, which does *not* reach `process.stdout.write` either — so the console methods
 *     are patched directly.
 *  3. **`process.stdout` / `process.stderr`** covers anything that writes to the streams the
 *     ordinary way.
 *
 * Every patch delegates to the function it replaced, so the run still prints what it always did.
 *
 * ── Why §1 alone would not be a test of FR-020 ─────────────────────────────────────────────
 *
 * §1 was green the day it was written, and that is the honest starting point: Payload logs an
 * `AuthenticationError` with its stack and nothing of the request body, the console email
 * adapter prints only the recipient and the subject, and T013's own warning deliberately
 * interpolates `err.name` and never the form data. Measured, not assumed — the capture was
 * dumped and read before a single assertion was written.
 *
 * That makes §1 a **regression fence**, not a driver. It fails the day a `console.warn(erro)`
 * carrying the credentials, or a `payload.logger.info({ user })` carrying the row's `hash`, is
 * added to any of these flows.
 *
 * FR-020 says *"no password or reset token is **ever** logged"*, and a fence around today's call
 * sites is not that. §2 is: it proves the property holds **of the logger**, so a future log line
 * that carries an auth field prints a censor instead of the secret — wherever that call site is,
 * and whoever writes it.
 *
 * ── Watched failing (the RED this file was written for) ────────────────────────────────────
 *
 * §2 was red on the untouched tree — every one of its secret searches — because Payload's
 * default logger has no `redact` at all: the first run printed
 *
 *     INFO: marcador-raso  password: "t017-valor-secreto-que-nao-pode-vazar"  hash: "…"
 *
 * verbatim to fd 1. It went green with `logger.options.redact` in `payload.config.ts`, and
 * `deve continuar registrando` is the half that stops the cheap fix: silencing the logger
 * censors nothing, it only destroys the evidence, and that assertion fails when it is tried.
 *
 * ── What redaction deliberately does **not** cover ─────────────────────────────────────────
 *
 * pino redacts **values at key paths**. A secret interpolated into the *message string* —
 * `logger.info(`senha ${senha}`)` — is not a value at a path, and nothing here would censor it.
 * That is why §1 exists over the real flows, and why the neutral warning in `login/page.tsx`
 * interpolates `err.name` rather than the error: the redaction is a second layer under the rule,
 * never a licence to log the credential.
 */

/** The host the REST requests arrive on. `users` is global, so no tenant header is needed. */
const HOST = 'cite.fablab.test'

const mocks = vi.hoisted(() => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async (): Promise<unknown> => undefined),
}))

// The login page's server action writes the session cookie through `next/headers`, and there is
// no request scope here. `next/navigation` is deliberately left alone: the thrown redirect is how
// the action answers, and a mock of it would be this file asserting against its own fixture.
vi.mock('next/headers', () => ({ cookies: mocks.cookies, headers: mocks.headers }))

const { entrar } = await import('../../app/(frontend)/login/page.js')

/** The account the flows are driven against, and the password that really opens it. */
const CONTA = { email: 't017-registrada@example.com', senha: 't017-senha-que-so-existe-aqui-123' }

/** An address with no account anywhere: the unknown-address branch of the same two flows. */
const DESCONHECIDA = 't017-nunca-cadastrada@example.com'

/** Every secret string is distinct, so no assertion can pass by two of them being equal. */
const SENHA_ERRADA = 't017-senha-errada-457'
const SENHA_DEPOIS_DO_RESET = 't017-senha-depois-do-reset-789'

const TODOS_OS_EMAILS = [CONTA.email, DESCONHECIDA]

/**
 * What a cookie jar was told. A named fake rather than an inline stub: it is greppable, and the
 * written cookie is itself one of the secrets this file scans for — the session token travels in
 * it, and a log line carrying the cookie leaks a live session as surely as one carrying a hash.
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

/** The credential columns as Postgres holds them, below the field layer that hides them. */
type LinhaDeCredencial = {
  /** Required by `payload.db.findOne`'s `TypeWithID` constraint, never read here. */
  id: number | string
  hash?: null | string
  resetPasswordToken?: null | string
  salt?: null | string
}

/**
 * Everything this process writes while it is switched on, from all three channels above.
 *
 * A named fake for the same reason `FakeCookieJar` is one, and installed exactly once: each patch
 * delegates to the function it replaced, so nesting two of them would double every line.
 */
class CapturaDeLog {
  private ligada = false
  private readonly pedacos: string[] = []
  private desfazer: Array<() => void> = []

  instalar(): void {
    this.trocarFs('write')
    this.trocarFs('writeSync')
    this.trocarFluxo(process.stdout)
    this.trocarFluxo(process.stderr)
    for (const nivel of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
      this.trocarConsole(nivel)
    }
  }

  desinstalar(): void {
    for (const restaurar of this.desfazer.reverse()) restaurar()
    this.desfazer = []
  }

  ligar(): void {
    this.pedacos.length = 0
    this.ligada = true
  }

  /**
   * Stops capturing — after waiting for pino to flush.
   *
   * `sonic-boom` writes asynchronously, so the last lines of a flow land a tick or two after the
   * call that produced them. Switching off immediately would drop exactly the lines an error path
   * emits last, and this file would then report "nothing was logged" about them.
   */
  async desligar(): Promise<void> {
    await new Promise((resolva) => setTimeout(resolva, 250))
    this.ligada = false
  }

  /** The capture as one searchable string, with the terminal colour escapes removed — they sit
   *  *between* characters and would break a substring search for a secret. */
  texto(): string {
    // An ANSI SGR sequence is a control sequence by definition; matching it is the point.
    // eslint-disable-next-line no-control-regex
    return this.pedacos.join('').replace(/\u001B\[[0-9;]*m/g, '')
  }

  private anotar(valor: unknown): void {
    if (this.ligada) this.pedacos.push(descrever(valor))
  }

  /** pino's real exit: `pino-pretty`'s sonic-boom destination calls `fs.write(1, …)` directly. */
  private trocarFs(nome: 'write' | 'writeSync'): void {
    const alvo = fs as unknown as Record<string, (...args: unknown[]) => unknown>
    const original = alvo[nome] as (...args: unknown[]) => unknown
    alvo[nome] = (...args: unknown[]): unknown => {
      if (args[0] === 1 || args[0] === 2) this.anotar(args[1])
      return original.apply(fs, args)
    }
    this.desfazer.push(() => {
      alvo[nome] = original
    })
  }

  private trocarFluxo(fluxo: NodeJS.WriteStream): void {
    const original = fluxo.write.bind(fluxo) as (...args: unknown[]) => boolean
    fluxo.write = ((pedaco: unknown, ...resto: unknown[]): boolean => {
      this.anotar(pedaco)
      return original(pedaco, ...resto)
    }) as typeof fluxo.write
    this.desfazer.push(() => {
      fluxo.write = original as unknown as typeof fluxo.write
    })
  }

  private trocarConsole(nivel: 'debug' | 'error' | 'info' | 'log' | 'trace' | 'warn'): void {
    const alvo = console as unknown as Record<string, (...args: unknown[]) => void>
    const original = alvo[nivel] as (...args: unknown[]) => void
    alvo[nivel] = (...args: unknown[]): void => {
      for (const arg of args) this.anotar(arg)
      original.apply(console, args)
    }
    this.desfazer.push(() => {
      alvo[nivel] = original
    })
  }
}

/**
 * One logged argument, rendered the way a reader of the log would see it.
 *
 * An `Error` is spelled out rather than stringified to `[object Object]`, and an object is
 * serialised whole: a `console.warn('falhou', usuario)` leaks the row's `hash` through its second
 * argument, and a capture that kept only the first would miss it.
 */
function descrever(valor: unknown): string {
  if (typeof valor === 'string') return valor
  if (valor instanceof Error) return `${valor.name}: ${valor.message}\n${valor.stack ?? ''}`
  try {
    return JSON.stringify(valor) ?? String(valor)
  } catch {
    // A cyclic or otherwise unserialisable value: its own rendering beats nothing, and an
    // exception here would take down the flow being observed.
    return String(valor)
  }
}

let payload: Payload
let jar: FakeCookieJar
const captura = new CapturaDeLog()

const postar = async (acao: string, dados: Record<string, unknown>): Promise<string> => {
  const handler = REST_POST(config)
  const request = new Request(`https://${HOST}/api/users/${acao}`, {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(dados),
  })
  const response = await handler(request, { params: Promise.resolve({ slug: ['users', acao] }) })
  return response.text()
}

/** The credential row as Postgres holds it. `payload.find` hides all three columns. */
const credenciaisDe = (email: string): Promise<LinhaDeCredencial | null> =>
  payload.db.findOne<LinhaDeCredencial>({
    collection: 'users',
    where: { email: { equals: email } },
  })

/**
 * Runs the login page's server action and swallows the redirect it answers with.
 *
 * Both branches of `entrar` end in `redirect()`, which throws; this file is not asserting on the
 * destination (T014 does that) — it is here to make the action's own `console.warn` run.
 */
async function pelaPagina(email: string, senha: string): Promise<void> {
  const dados = new FormData()
  dados.set('email', email)
  dados.set('senha', senha)
  try {
    await entrar(dados)
  } catch {
    // The redirect. A genuine failure shows up in the assertions that read the capture.
  }
}

const limpar = () =>
  payload.delete({
    collection: 'users',
    where: { email: { in: TODOS_OS_EMAILS } },
    overrideAccess: true,
  })

beforeAll(async () => {
  payload = await getPayload({ config })
  await limpar()
  // `overrideAccess: true` because `Users.access.create` is `masterOnly()`: who may create an
  // account is not this file's question, and forcing the setup through the guarded path would
  // make a broken guard look like a leaking log.
  await payload.create({
    collection: 'users',
    data: { email: CONTA.email, password: CONTA.senha, role: 'user', orgs: [] } as never,
    overrideAccess: true,
  })
  jar = new FakeCookieJar()
  mocks.cookies.mockImplementation(async () => jar)
  captura.instalar()
}, 120_000)

afterAll(async () => {
  captura.desinstalar()
  await limpar()
})

/**
 * §1 — the auth flows, with everything they print captured (SC-005).
 */
describe('nenhum segredo aparece nos logs dos fluxos de autenticação (FR-020, SC-005)', () => {
  let emitido: string
  let tokenDeSessao: string
  let tokenDeReset: string
  /** Before and after the reset: it writes a new hash and salt, and both pairs must be absent. */
  const segredosDaConta: string[] = []

  beforeAll(async () => {
    const antes = await credenciaisDe(CONTA.email)

    captura.ligar()
    // A refusal, an unknown address, an accepted sign-in, the same two through the page's own
    // action, then the whole reset. The successes are interleaved with the refusals on purpose:
    // a sign-in clears Payload's attempt counter, so the refusals cannot walk this account
    // towards `maxLoginAttempts` and turn §1 into a test of the lock instead.
    await postar('login', { email: CONTA.email, password: SENHA_ERRADA })
    await postar('login', { email: DESCONHECIDA, password: CONTA.senha })
    const corpo = await postar('login', { email: CONTA.email, password: CONTA.senha })
    tokenDeSessao = (JSON.parse(corpo) as { token?: string }).token ?? ''

    await pelaPagina(CONTA.email, SENHA_ERRADA)
    await pelaPagina(CONTA.email, CONTA.senha)

    await postar('forgot-password', { email: CONTA.email })
    await postar('forgot-password', { email: DESCONHECIDA })
    tokenDeReset = (await credenciaisDe(CONTA.email))?.resetPasswordToken ?? ''
    await postar('reset-password', { token: tokenDeReset, password: SENHA_DEPOIS_DO_RESET })
    await postar('login', { email: CONTA.email, password: SENHA_DEPOIS_DO_RESET })
    await captura.desligar()

    emitido = captura.texto()

    const depois = await credenciaisDe(CONTA.email)
    for (const linha of [antes, depois]) {
      if (linha?.hash) segredosDaConta.push(linha.hash)
      if (linha?.salt) segredosDaConta.push(linha.salt)
    }
  }, 120_000)

  it('capturou de fato o que os fluxos escreveram', () => {
    // The non-vacuity half, and it is not optional: "no secret was found" is exactly what a scan
    // of an empty buffer reports. The page's own warning is the anchor — it is emitted by *this*
    // repository's code, on the refused attempt above, through `console.warn`.
    expect(
      emitido,
      'a captura não viu a advertência que `login/page.tsx` emite em toda tentativa recusada, ' +
        'então ela não viu nada dos fluxos e todas as buscas abaixo varreram um texto vazio',
    ).toContain('[login] tentativa recusada')
  })

  it('os segredos procurados são reais, e não cadeias vazias', () => {
    // `not.toContain('')` passes against any text at all. Each needle is checked to be a real
    // secret of a real shape first, so the searches below mean what they say.
    expect(segredosDaConta).toHaveLength(4)
    for (const segredo of segredosDaConta) expect(segredo.length).toBeGreaterThan(20)
    expect(tokenDeReset).toMatch(/^[0-9a-f]{40}$/)
    expect(tokenDeSessao.split('.')).toHaveLength(3)
    expect(jar.escritos.some((cookie) => cookie.value)).toBe(true)
  })

  it('nenhuma senha digitada foi registrada', () => {
    for (const senha of [CONTA.senha, SENHA_ERRADA, SENHA_DEPOIS_DO_RESET]) {
      expect(emitido, `a senha ${senha} apareceu em uma linha de log`).not.toContain(senha)
    }
  })

  it('nenhum hash nem salt da conta foi registrado', () => {
    for (const segredo of segredosDaConta) {
      expect(
        emitido,
        'o hash ou o salt da conta apareceu em uma linha de log',
      ).not.toContain(segredo)
    }
  })

  it('nenhum token de reset foi registrado', () => {
    expect(emitido).not.toContain(tokenDeReset)
  })

  it('nenhum token de sessão foi registrado', () => {
    expect(emitido).not.toContain(tokenDeSessao)
    for (const cookie of jar.escritos) {
      if (cookie.value) expect(emitido).not.toContain(cookie.value)
    }
  })
})

/**
 * §2 — FR-020 as a property of the logger, not of today's call sites.
 */
describe('o logger em execução redige campos de autenticação (FR-020)', () => {
  const SEGREDO = 't017-valor-secreto-que-nao-pode-vazar'
  let emitido: string

  beforeAll(async () => {
    const erro = Object.assign(new Error('falha ao gravar o perfil'), { password: SEGREDO })

    captura.ligar()
    payload.logger.info(
      { hash: SEGREDO, password: SEGREDO, resetPasswordToken: SEGREDO, salt: SEGREDO },
      'marcador-raso',
    )
    // The shape that actually happens by accident: a whole row handed to the logger with its
    // credential columns still on it, nested under a key nobody thought about.
    payload.logger.warn(
      { contexto: { usuario: { hash: SEGREDO, salt: SEGREDO } } },
      'marcador-fundo',
    )
    payload.logger.warn({ orgs: [{ token: SEGREDO }] }, 'marcador-lista')
    payload.logger.error({ err: erro }, 'marcador-erro')
    // `Credenciais` — THIS repository's own name for a password in clear, and the one shape the
    // first version of the list did not cover. Logged both bare and nested, because the accident
    // this layer exists for is a whole object handed over by a call site that did not think
    // about it, and `{ credenciais }` is the likeliest such object in this tree: it is the only
    // typed value here that holds what the visitor typed. Verified against the real config
    // before `senha` was added to the list — both of these printed the password verbatim.
    payload.logger.error({ senha: SEGREDO }, 'marcador-senha-rasa')
    payload.logger.error(
      { credenciais: { email: 'maria@exemplo.br', senha: SEGREDO } },
      'marcador-senha-aninhada',
    )
    await captura.desligar()

    emitido = captura.texto()
  }, 60_000)

  it('deve continuar registrando — redigir não é silenciar', () => {
    // Without this, the cheapest way to green is to switch the logger off, which leaves FR-020
    // trivially satisfied and every incident unreadable. It also keeps the capture honest: a
    // marker that never arrived would make the searches below scan an empty text.
    for (const marcador of [
      'marcador-raso',
      'marcador-fundo',
      'marcador-lista',
      'marcador-erro',
      'marcador-senha-rasa',
      'marcador-senha-aninhada',
    ]) {
      expect(emitido, `a linha ${marcador} não foi emitida`).toContain(marcador)
    }
  })

  it('não imprime o segredo em campo algum', () => {
    expect(emitido).not.toContain(SEGREDO)
  })

  it('marca onde redigiu, em vez de omitir o campo em silêncio', () => {
    // A field that simply vanished would read as "nothing was there", and an incident would be
    // debugged against a log that lies by omission. The censor says a value was withheld.
    expect(emitido).toContain('[REDACTED]')
  })

  it('preserva o diagnóstico do erro que carregava o segredo', () => {
    // Redaction that ate the message and the stack would be a green test and a blind outage.
    expect(emitido).toContain('falha ao gravar o perfil')
    expect(emitido).toContain('no-secrets-logged.test.ts')
  })
})
