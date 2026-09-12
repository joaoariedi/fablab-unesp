import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The submit — the line that makes signup a thing a person can do (US1, SC-001).
 *
 * ## Why this file exists
 *
 * T028's verification found that **nothing in the product called `completeSignup` at all**.
 * Step 2's form carried `method="post"` with no `action`; `completeSignup`, `createWithHandle`,
 * the builder, the draft round trip and the profile were each built and each tested, and
 * SC-001's sentence — *"a visitor completes signup and is signed in"* — was false in a browser.
 * No task in `tasks.md` owned the wiring, so nothing downstream would have added it either: the
 * end-to-end suite substituted a direct `completeSignup(...)` call for the submission the
 * product did not have, and was green.
 *
 * That is the failure mode this project has now paid for three times — a module with tests and
 * no caller is not a feature — so the wiring gets a test of its own rather than being implied by
 * one that constructs its own inputs.
 *
 * ## What is driven, and what is mocked
 *
 * The **action itself**, with `completeSignup` and `signIn` mocked. The point is not that
 * Payload creates rows — `signup.test.ts` drives that against a real Postgres — it is that the
 * form reaches them, in the right order, with the right values read off the FormData, and that
 * the consent gate is a gate.
 *
 * `redirect()` throws by design, so every path here ends in a throw; the assertions read where
 * it went.
 */

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destino: string): never => {
    throw new Error(`NEXT_REDIRECT:${destino}`)
  }),
  headers: vi.fn(async () => new Headers({ host: 'cite.fablab.test' })),
  // Typed through the variable, not through an unused parameter name: the args type is what
  // lets `mock.calls[0][0]` be read without a cast, and eslint refuses a parameter nobody uses.
  completeSignup: vi.fn<(entrada: Record<string, unknown>) => Promise<{ id: number }>>(() =>
    Promise.resolve({ id: 1 }),
  ),
  signIn: vi.fn<(credenciais: { email: string; senha: string }) => Promise<void>>(() =>
    Promise.resolve(),
  ),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('../../lib/accounts/signup', () => ({ completeSignup: mocks.completeSignup }))
vi.mock('../../lib/tenancy/session', () => ({ signIn: mocks.signIn }))

const pagina = await import('../../app/(frontend)/criar-conta/dados/page.js')
const { criarConta, DESTINO_APOS_CADASTRO, PASSO_2_PATH } = pagina

const PAGE_SOURCE = readFileSync(
  join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'criar-conta', 'dados', 'page.tsx'),
  'utf8',
)

/** A completed step 2, as the browser would post it. `aceite` omitted means the box was not
 *  ticked — an unticked checkbox is ABSENT from FormData, never `'false'`. */
function submissao(over: { aceite?: boolean; avatar?: string } = {}): FormData {
  const dados = new FormData()
  dados.set('nome', 'Maria Silva')
  dados.set('email', 'maria@exemplo.br')
  dados.set('senha', 'uma-senha-bem-comprida')
  dados.set('dataNascimento', '2001-04-03')
  dados.set('vinculoUnesp', 'aluno')
  dados.set('escolaridade', 'superior')
  dados.set('curso', 'Engenharia de Produção')
  dados.set('aceiteTermosVersao', '0-iss-002')
  if (over.aceite !== false) dados.set('aceiteTermos', 'on')
  if (over.avatar !== undefined) dados.set('avatar', over.avatar)
  return dados
}

const onde = async (dados: FormData): Promise<string> => {
  await expect(criarConta(dados)).rejects.toThrow(/NEXT_REDIRECT/)
  return String(mocks.redirect.mock.calls.at(-1)?.[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.completeSignup.mockResolvedValue({ id: 1 })
  mocks.signIn.mockResolvedValue(undefined)
})

describe('§1 — the form has a submit, and it reaches the account (US1, SC-001)', () => {
  it('binds the action to the form rather than posting into the void', () => {
    // The regression this file was written for. `method="post"` with no `action` renders, submits
    // and does nothing, and no test that constructs its own inputs can see it.
    expect(
      /<form\s+action=\{criarConta\}/.test(PAGE_SOURCE),
      'step 2 is not wired to its action. A form with `method="post"` and no `action` is inert: ' +
        'the person fills it in, presses CRIAR CONTA, and no account is created.',
    ).toBe(true)
  })

  it('creates the account and then signs the person in, in that order', async () => {
    expect(await onde(submissao())).toBe(DESTINO_APOS_CADASTRO)

    expect(mocks.completeSignup).toHaveBeenCalledTimes(1)
    expect(mocks.signIn).toHaveBeenCalledTimes(1)
    // US1 ends "and is signed in". An account created without a session sends somebody who has
    // just typed their password to a login form to type it again.
    expect(
      mocks.completeSignup.mock.invocationCallOrder[0],
      'the sign-in ran before the account existed',
    ).toBeLessThan(mocks.signIn.mock.invocationCallOrder[0] as number)
  })

  it('hands over what the visitor typed, under the names the lib expects', async () => {
    await onde(submissao({ avatar: '{"base":"f"}' }))

    const entrada = mocks.completeSignup.mock.calls[0]?.[0]
    expect(entrada, 'the action never reached `completeSignup`').toBeDefined()
    if (entrada === undefined) return
    expect(entrada.nome).toBe('Maria Silva')
    expect(entrada.email).toBe('maria@exemplo.br')
    expect(entrada.senha).toBe('uma-senha-bem-comprida')
    expect(entrada.curso).toBe('Engenharia de Produção')
    // The step-1 draft goes FORWARD as well as back: if only VOLTAR carried it, pressing
    // CRIAR CONTA would create a profile with no avatar at all (FR-002).
    expect(entrada.avatarConfig).toBe('{"base":"f"}')
  })
})

describe('§2 — the consent checkbox is the gate, not the hidden version (FR-012, US1)', () => {
  it('reports the box as ticked only when it was', async () => {
    await onde(submissao())
    expect(mocks.completeSignup.mock.calls[0]?.[0]?.aceiteTermos).toBe(true)
  })

  it('reports it as UNTICKED when the box was not sent at all', async () => {
    // The defect this asserts against: an unticked checkbox is absent from FormData, so
    // `String(dados.get(...))` yields `'null'` — truthy — and every submit would consent.
    // Meanwhile `aceiteTermosVersao` is a HIDDEN field posted either way, so gating on the
    // version alone stamped an LGPD acceptance for a form where the box was never ticked.
    await onde(submissao({ aceite: false }))

    expect(
      mocks.completeSignup.mock.calls[0]?.[0]?.aceiteTermos,
      'an unticked box was reported as consent. The version travels hidden on every submit, so ' +
        'it proves nothing on its own — this boolean is the whole of the record LGPD asks for.',
    ).toBe(false)
  })
})

describe('§3 — a refused signup returns the person to the form (US1 error)', () => {
  it('sends them back to step 2 rather than to the account they do not have', async () => {
    mocks.completeSignup.mockRejectedValue(Object.assign(new Error('e-mail já cadastrado'), {
      name: 'ValidationError',
    }))

    expect(await onde(submissao())).toBe(`${PASSO_2_PATH}?erro=1`)
    expect(mocks.signIn, 'signed in after the account was refused').not.toHaveBeenCalled()
  })

  it('keeps the refusal reason out of the log line (FR-020, SC-005)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.completeSignup.mockRejectedValue(
      Object.assign(new Error('e-mail maria@exemplo.br já cadastrado'), { name: 'ValidationError' }),
    )

    await onde(submissao())

    const linha = String(aviso.mock.calls[0]?.[0] ?? '')
    // The error's NAME only. A duplicate-e-mail message names the address, and FR-020 keeps
    // personal data out of logs as firmly as it keeps passwords out.
    expect(linha).toContain('ValidationError')
    expect(linha, 'the log line carries the address the visitor typed').not.toContain(
      'maria@exemplo.br',
    )
    aviso.mockRestore()
  })
})
