import { getPayload, type Payload, type PayloadRequest } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { completeSignup, NIVEL_INICIAL, XP_INICIAL } from '../../lib/accounts/signup'
import { foldToHandle } from '../../lib/accounts/handle'
import type { FindArgs } from '../../lib/tenancy'
import { getSystemScopedPayload, type SystemScopedPayload } from '../../lib/tenancy/system-payload'
import { signIn } from '../../lib/tenancy/session'
import config from '../../payload.config'

/**
 * T028 / US1, SC-001 — **the whole signup, from the avatar to the signed-in maker**, against a
 * real Postgres.
 *
 * SC-001: *"a visitor completes signup and is signed in, with the avatar they built persisted"*.
 * Every other suite in this feature owns one joint of that sentence and can be green while the
 * sentence is false:
 *
 *   - `signup-navigation.test.ts` (T026b) drives both pages and proves the draft survives
 *     `VOLTAR` — through **hrefs and markup**, and it stops there. A flow that carries the
 *     avatar perfectly through the browser and then stores something a preview cannot read
 *     passes it in full;
 *   - `complete-signup.test.ts` (T027) proves the writes `completeSignup` issues — against a
 *     **named fake**, which accepts whatever it is handed. It says so itself and names this file
 *     as the one that drives the flow against a database;
 *   - `handle-race.test.ts` (T021) proves the handle under load, from a `nome` the test wrote.
 *
 * So this file is the one that joins them: the value it submits is **not written by hand**. It
 * is read out of the step-2 form's own markup, after the visitor has walked step 1 → step 2 →
 * `VOLTAR` → step 1 → step 2, and every href in between is followed as a browser would follow
 * it (`new URL(...).searchParams`), never re-fed from the constant at the top. That is what
 * makes §2's assertions about the *avatar the visitor built* rather than about a fixture.
 *
 * ── The two gaps this file cannot close, named rather than left to be discovered ────────────
 *
 * 1. **There is no submit yet.** `dados/page.tsx` renders `<form method="post">` with no
 *    `action`: T026 left it for "T027's action", and T027 shipped `completeSignup` alone. So
 *    §2 calls that function with the values the rendered form carries, which is every part of
 *    the submission that exists. The day the action lands it has exactly one job — hand these
 *    same fields over — and this file is what says which fields those are.
 *
 * 2. **The store is system-scoped, and that is not what a visitor gets.** `users.access.create`
 *    is `masterOnly()` and `perfilMaker.access.create` is `scopedAccess()`, so an *anonymous*
 *    signup through the choke point is refused today — who may create an account is FR-022's
 *    question and `login.test.ts` records the same deferral for the same reason. Using the
 *    guarded path here would make that open policy question look like a broken signup, so this
 *    file measures what signup *writes*, on the same client `handle-race.test.ts` uses, and
 *    leaves the access decision where it belongs.
 *
 * Both are about the *door*. Everything behind it — the transaction, the handle, the skills, the
 * consent stamp, the avatar and the session — is real here, and is what SC-001 counts.
 *
 * ── Watched failing before it was believed ─────────────────────────────────────────────────
 *
 * This suite is green the day it is written — T022 to T027 built the flow — and a proof test
 * that was never seen failing is indistinguishable from one that asserts nothing. So it was run
 * against four planted defects, each on a **copy** (`signup.mutante.ts`, `page.mutante.tsx`,
 * with a copy of this file pointed at them, all four deleted afterwards) rather than on the real
 * modules, because sibling phase-5 tasks are editing those concurrently and a mutation they
 * observed would be reported as their own defect. The plant was asserted to have applied before
 * the result was believed — T020's warning: a mutation that mutates nothing reports PASS.
 *
 *   1. `dadosPessoais` stops writing `avatarConfig` — **red**: the avatar the visitor built is
 *      not in the profile, while every href in §1 still carries it perfectly;
 *   2. the skill read drops its `ativa` filter — **red**: the retired skill reached the profile;
 *   3. the consent is stamped with a literal version instead of the submitted one — **red**;
 *   4. step 2's `hrefDoVoltar` drops the draft — **red in eight places**, from §1's round trip
 *      through to a submission Postgres refused. This one also found a defect in *this file*:
 *      the walk used to die inside `beforeAll`, and Vitest reports that as **12 skipped tests**
 *      rather than as failures. {@link exigirLink} and {@link falhaDoCadastro} exist because of
 *      it — the same silence tasks.md preamble item 1 records costing feature 002 160 tests.
 */

/** The lab this signup happens in. Its own organization, so no other suite's rows are counted. */
const SLUG = 'signup-e2e-lab'

/** The person. The accents matter: `foldToHandle` is what turns this into an ASCII handle, and a
 *  flow that lost them somewhere between the form and the column would still look plausible. */
const NOME = 'Teodora Ávila Gonçalves'
const EMAIL = 't028-teodora@example.com'
const SENHA = 't028-uma-senha-bem-comprida'

/** What step 2 collects beside the name (FR-008). Values the enums really offer — a `select`
 *  option the Postgres enum refuses is a signup that dies at the insert with no field to blame. */
const DADOS = {
  dataNascimento: '2001-04-03',
  vinculoUnesp: 'aluno',
  escolaridade: 'superior',
  curso: 'Engenharia de Produção',
} as const

/**
 * The avatar, as the builder emits it: a configuration, not a string.
 *
 * `AvatarConfig` (`packages/ui`) is base + palette ids + one item per slot + the direction, and
 * `perfilMaker.avatarConfig` is a **`json`** column declared to hold exactly that — *"a text blob
 * would be parsed again by every reader and validated by none of them"*. It travels through the
 * browser as the JSON text below, which is the only thing a query parameter can carry; what
 * §2 asks is what came out the other end.
 */
const AVATAR = {
  base: 'f',
  pele: '3',
  cabeloTom: '11',
  itens: { cabelo: '21', roupaCima: '22', rosto: '23' },
  direcao: 'frente',
} as const

/** The draft as the query carries it. `&`, `"` and the accent are all in there on purpose. */
const RASCUNHO = JSON.stringify(AVATAR)

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
    cookies: vi.fn(async (): Promise<unknown> => undefined),
    headers: vi.fn(async () => new Headers()),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('next/headers', () => ({ cookies: mocks.cookies, headers: mocks.headers }))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

/**
 * Step 1's catalogue, as a named fake.
 *
 * The rail this suite follows is only rendered for a lab that *has* a catalogue: an empty one
 * renders `EmptyState` instead, and the whole walk would then be reading a page with no
 * `SALVAR E CONTINUAR` on it. One row per collection is enough, and none of them is the subject
 * of anything asserted below — the avatar under test is the draft, not the catalogue.
 */
class FakeCatalogueClient {
  readonly tenantId = 'org-fake'

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    const linhas: Record<string, readonly Record<string, unknown>[]> = {
      tomDePele: [{ id: 1, nome: 'Pele Amanhecer', hex: '#f7d9c4', ordem: 1 }],
      tomDeCabelo: [{ id: 11, nome: 'Cabelo Grafite', hex: '#1c1c1c', ordem: 1 }],
      avatarItem: [{ id: 21, categoria: 'cabelo', nome: 'Moicano curto', camadaZ: 40 }],
    }
    const docs = (linhas[args.collection] ?? []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

/**
 * What a cookie jar was told. There is no jar outside a Next request scope, and §3's claim is
 * that signing in **writes a session cookie** — a `signIn` that threw on its last line would
 * otherwise read as a successful sign-in.
 *
 * Write-only on purpose: nothing here ever feeds a cookie back into the mocked `headers()`, so
 * no test can accidentally sign the *pages* in and change what §1 renders.
 */
class FakeCookieJar {
  readonly escritos: { name: string; value?: string }[] = []

  set(cookie: { name: string; value?: string }): void {
    this.escritos.push(cookie)
  }

  delete(name: string): void {
    this.escritos.push({ name })
  }
}

const { default: Passo1 } = await import('../../app/(frontend)/criar-conta/page')
const {
  default: Passo2,
  PARAM_AVATAR,
  PASSO_1_PATH,
  TERMS_VERSION,
} = await import('../../app/(frontend)/criar-conta/dados/page')

type Query = Record<string, string | string[] | undefined>

const passo1 = async (query: Query = {}): Promise<string> =>
  renderToStaticMarkup((await Passo1({ searchParams: Promise.resolve(query) })) as never)

const passo2 = async (query: Query = {}): Promise<string> =>
  renderToStaticMarkup((await Passo2({ searchParams: Promise.resolve(query) })) as never)

/** The origin relative hrefs are resolved against. Never requested — only parsed. */
const ORIGEM = 'https://cite.test'

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

/**
 * The value a control carries, as the browser would submit it — entities decoded.
 *
 * React escapes `&` and `"` on the way into the attribute, and a suite that compared the escaped
 * text would be asserting about the markup rather than about what is posted. `&amp;` is decoded
 * last: decoding it first would turn `&amp;quot;` — an escaped *literal* `&quot;` — into a quote
 * that was never in the draft.
 */
const valorSubmetido = (tag: string): string =>
  (/\bvalue="([^"]*)"/.exec(tag)?.[1] ?? '')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

/** An href, as a browser follows it: whatever query it carries becomes the next page's input. */
const seguir = (href: string): Query =>
  Object.fromEntries(new URL(href, ORIGEM).searchParams) as Query

const VOLTAR = 'VOLTAR'
const CONTINUAR = 'SALVAR E CONTINUAR →'

/**
 * The rail button this leg of the walk depends on, or a failure that says which leg broke.
 *
 * Without it a missing button becomes `undefined` handed to `new URL()` three lines later, and
 * the walk dies inside `beforeAll` — where Vitest reports every test in the file as **skipped**
 * rather than failed (tasks.md preamble item 1: the silence that cost feature 002 160 tests).
 */
const exigirLink = (markup: string, rotulo: string, onde: string): string => {
  const href = linksIn(markup)[rotulo]
  if (href === undefined) {
    throw new Error(
      `${onde} rendered no \`${rotulo}\` for the visitor to press; the signup flow cannot be ` +
        `walked. The anchors it did render were ${JSON.stringify(linksIn(markup))}`,
    )
  }
  return href
}

/** The walk itself, recorded step by step so §1 can assert about each leg of it. */
type Passagem = {
  readonly continuar: string
  readonly voltar: string
  readonly continuarDeNovo: string
  readonly campos: Record<string, string>
  /** Step 1 as the returning visitor sees it. Kept so §1 can prove the walk happened on the
   *  builder and not on the catalogue's error state, whose rail carries the same two buttons. */
  readonly passo1DeVolta: string
}

/**
 * Step 1 → step 2 → `VOLTAR` → step 1 → step 2, following the product's own links.
 *
 * The draft is written into the query **once**, at the first step, exactly as the builder island
 * would put it there. Every page after that is handed what the previous page's href actually
 * carried. Re-feeding `RASCUNHO` at each leg would make the round trip untestable by
 * construction: a step that dropped the avatar entirely would be handed it again by the harness.
 */
async function percorrerOFluxo(): Promise<Passagem> {
  const continuar = exigirLink(await passo1({ [PARAM_AVATAR]: RASCUNHO }), CONTINUAR, 'step 1')
  const voltar = exigirLink(await passo2(seguir(continuar)), VOLTAR, 'step 2')
  const passo1DeVolta = await passo1(seguir(voltar))
  const continuarDeNovo = exigirLink(passo1DeVolta, CONTINUAR, 'step 1, on the way back')
  const campos = controles(await passo2(seguir(continuarDeNovo)))
  return { continuar, voltar, continuarDeNovo, campos, passo1DeVolta }
}

type Perfil = {
  id: string | number
  nome?: string
  handle?: string
  usuario?: string | number
  avatarConfig?: unknown
  aceiteTermosEm?: string
  aceiteTermosVersao?: string
  curso?: string
  vinculoUnesp?: string
  escolaridade?: string
  skills?: { skill?: string | number; nivel?: number; xp?: number }[]
}

let payload: Payload
let store: SystemScopedPayload
let orgId: number
/** The active catalogue of this lab, and the retired skill that must not reach the profile. */
let skillsAtivas: number[] = []
let skillRetirada: number
let passagem: Passagem
let perfil: Perfil | undefined
/** Whatever the submission raised. Recorded rather than thrown out of `beforeAll`, for
 *  {@link exigirLink}'s reason: a fixture that throws reports the suite as *skipped*. */
let falhaDoCadastro: unknown = null

/** Removes only this file's rows, in foreign-key order: profile, account, catalogue, lab. */
async function limpar(): Promise<void> {
  await payload.delete({
    collection: 'perfilMaker',
    where: { nome: { equals: NOME } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'users',
    where: { email: { equals: EMAIL } },
    overrideAccess: true,
  })
  const lab = await payload.find({
    collection: 'organizations',
    where: { slug: { equals: SLUG } },
    depth: 0,
    overrideAccess: true,
  })
  for (const org of lab.docs) {
    await payload.delete({
      collection: 'skill',
      where: { tenant: { equals: org.id } },
      overrideAccess: true,
    })
    await payload.delete({ collection: 'organizations', id: org.id, overrideAccess: true })
  }
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await limpar()

  const org = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab do cadastro', slug: SLUG, status: 'active' },
    overrideAccess: true,
  })
  if (typeof org.id !== 'number') {
    throw new TypeError(
      `organizations.id came back as ${typeof org.id} (${String(org.id)}); this suite compares it ` +
        'against `perfilMaker.tenant`, which the adapter stores as a numeric relationship.',
    )
  }
  orgId = org.id
  store = await getSystemScopedPayload(String(orgId))

  // Three skills, one of them retired. FR-013 is "every **active** skill at level 0", and a lab
  // whose catalogue is entirely active cannot tell that rule from "every skill".
  const catalogo = [
    { nome: 'Impressão 3D', slug: 'impressao-3d', ativa: true },
    { nome: 'Corte a laser', slug: 'corte-laser', ativa: true },
    { nome: 'Torno mecânico', slug: 'torno', ativa: false },
  ]
  skillsAtivas = []
  for (const dados of catalogo) {
    const criada = await store.create<{ id: number }>({ collection: 'skill', data: dados })
    if (dados.ativa) skillsAtivas.push(criada.id)
    else skillRetirada = criada.id
  }

  // Step 1 reads its catalogue anonymously and renders an **error state** when that read
  // fails — a state whose rail carries the same `VOLTAR` and `SALVAR E CONTINUAR`. A walk over
  // it would satisfy every href assertion below while nobody could build an avatar at all.
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakeCatalogueClient())

  passagem = await percorrerOFluxo()

  // The submission. Everything that came from the *form* is read off `passagem.campos`; only
  // what the visitor types is written here.
  try {
    perfil = await completeSignup<Perfil>(
      {
        req: { id: 't028' } as unknown as PayloadRequest,
        nome: NOME,
        email: EMAIL,
        senha: SENHA,
        ...DADOS,
        avatarConfig: valorSubmetido(passagem.campos[PARAM_AVATAR] ?? ''),
        aceiteTermosVersao: valorSubmetido(passagem.campos['aceiteTermosVersao'] ?? ''),
        // The box, ticked — as a person completing signup would. It is separate from the
        // version because the version is a HIDDEN field posted on every submit, so it proves
        // nothing about consent on its own; `criar-conta-action.test.ts` drives the untricked
        // branch against the real action.
        aceiteTermos: true,
      },
      {
        // The store the real door builds, reproduced here rather than mocked away: an account
        // AND its membership of this lab. Without the membership `scopedAccess()` refuses this
        // person their own profile and their own skill catalogue — which is what
        // `completeSignup` did against the real stack until `getSignupScopedPayload` existed.
        getStore: async () => ({
          find: store.find,
          create: store.create,
          criarConta: async ({ email, senha }: { email: string; senha: string }) => {
            const conta = await store.create<{ id: string | number }>({
              collection: 'users',
              data: { email, password: senha, role: 'user', orgs: [] },
            })
            await store.addMembership(conta.id, 'maker')
            return conta
          },
        }),
      },
    )
  } catch (erro) {
    falhaDoCadastro = erro
  }
}, 180_000)

afterAll(async () => {
  if (payload) await limpar()
})

/** The profile as Postgres holds it — never the object the create returned. A handle that was
 *  decided and not committed, or a column a hook rewrote, is exactly what that would hide. */
async function perfilPersistido(): Promise<Perfil> {
  if (perfil === undefined) {
    throw new Error(
      'the submission created no profile, so there is nothing to read back. It failed with: ' +
        String((falhaDoCadastro as { message?: string })?.message ?? falhaDoCadastro),
    )
  }
  const encontrado = await payload.findByID({
    collection: 'perfilMaker',
    id: perfil.id,
    depth: 0,
    overrideAccess: true,
  })
  return encontrado as unknown as Perfil
}

describe('§1 — the avatar survives both steps and `VOLTAR` (FR-002, US1 edge)', () => {
  it('walks the builder itself, not the catalogue`s error state', () => {
    expect(
      passagem.passo1DeVolta,
      'the returning visitor landed on the "could not load the catalogue" state; every href ' +
        'assertion below would still pass on it, over a step 1 with no avatar to build',
    ).not.toContain('Tentar novamente')
    expect(passagem.passo1DeVolta, 'no picker was rendered').toContain('TONS DE PELE')
  })

  it('carries the draft forward, back, and forward again, byte for byte', () => {
    const noHref = (href: string): string | null =>
      new URL(href, ORIGEM).searchParams.get(PARAM_AVATAR)

    expect(noHref(passagem.continuar), 'step 1 did not carry the draft to step 2').toBe(RASCUNHO)
    expect(
      new URL(passagem.voltar, ORIGEM).pathname,
      'step 2`s `VOLTAR` left the flow instead of returning to the builder',
    ).toBe(PASSO_1_PATH)
    expect(
      noHref(passagem.voltar),
      'pressing `VOLTAR` on step 2 lost the avatar built in step 1 — US1`s edge case',
    ).toBe(RASCUNHO)
    expect(
      noHref(passagem.continuarDeNovo),
      'the returning visitor continued with nothing: the avatar is gone the moment they go back ' +
        'and forward again',
    ).toBe(RASCUNHO)
  })

  it('hands the same draft to the submit, as a hidden field', () => {
    const campo = passagem.campos[PARAM_AVATAR]
    expect(campo, 'step 2 renders no field carrying the avatar; the submit posts none').toMatch(
      /type="hidden"/,
    )
    expect(valorSubmetido(campo!)).toBe(RASCUNHO)
  })

  it('hands the terms version the visitor was shown (FR-012)', () => {
    // The stamp is only worth having if it names the text that was on screen, so the version is
    // read off the form rather than imported into the submission.
    expect(valorSubmetido(passagem.campos['aceiteTermosVersao'] ?? '')).toBe(TERMS_VERSION)
  })
})

describe('§2 — the submission creates the account and the profile (US1, FR-011, FR-013)', () => {
  it('goes through at all, with the values the form carried', () => {
    // First, and separate: everything below reads a profile, and "there is no profile" must be
    // reported as the signup failing rather than as six confusing reads.
    expect(
      falhaDoCadastro === null ? null : String((falhaDoCadastro as { message?: string }).message),
      'the submission was refused',
    ).toBeNull()
    expect(perfil?.id, 'the signup returned no profile').toBeDefined()
  })

  it('creates exactly one account for the address that was submitted', async () => {
    const contas = await payload.find({
      collection: 'users',
      where: { email: { equals: EMAIL } },
      depth: 0,
      overrideAccess: true,
    })
    expect(contas.totalDocs, 'signup did not create the account').toBe(1)
    expect(
      (await perfilPersistido()).usuario,
      'the profile is attached to a different account than the one signup created',
    ).toBe(contas.docs[0]!.id)
  })

  it('derives the handle from the name, folded to ASCII (FR-010)', async () => {
    const guardado = await perfilPersistido()
    expect(guardado.nome).toBe(NOME)
    expect(guardado.handle, '`Teodora Ávila Gonçalves` must fold to letters only').toBe(
      foldToHandle(NOME),
    )
  })

  it('persists the avatar the visitor built, as a configuration a preview can read', async () => {
    const guardado = await perfilPersistido()

    // The one assertion this whole file exists for. `avatarConfig` is a `json` column holding
    // `AvatarConfig`; the form can only carry text, so **something on the way in has to turn the
    // draft back into the structure**. Storing the text itself passes every other test in the
    // feature and loses the avatar for good: `AvatarPreview` reads `config.base` and `config.itens`
    // off a string and finds `undefined`, so the maker's account renders an empty body — with the
    // configuration sitting in the database, intact and unreadable.
    expect(
      typeof guardado.avatarConfig,
      `avatarConfig came back as ${typeof guardado.avatarConfig}: ` +
        `${JSON.stringify(guardado.avatarConfig)?.slice(0, 120)}. The step-2 form submits the ` +
        'draft as text and nothing parsed it, so the column holds a JSON string rather than the ' +
        'object `perfilMaker.avatarConfig` is declared to hold.',
    ).toBe('object')
    // `typeof null === 'object'`, so the check above alone would accept a column nobody wrote.
    expect(guardado.avatarConfig, 'no avatar reached the profile at all').not.toBeNull()
    expect(guardado.avatarConfig, 'the avatar persisted is not the avatar that was built').toEqual(
      AVATAR,
    )
  })

  it('stamps the consent with the version the form displayed (FR-012)', async () => {
    const guardado = await perfilPersistido()
    expect(guardado.aceiteTermosVersao).toBe(TERMS_VERSION)
    const quando = new Date(guardado.aceiteTermosEm ?? '')
    expect(Number.isNaN(quando.getTime()), 'no acceptance timestamp was stamped').toBe(false)
  })

  it('keeps every answer step 2 collected (FR-008)', async () => {
    const guardado = await perfilPersistido()
    expect(guardado.curso).toBe(DADOS.curso)
    expect(guardado.vinculoUnesp).toBe(DADOS.vinculoUnesp)
    expect(guardado.escolaridade).toBe(DADOS.escolaridade)
  })

  it('enters every active skill of the lab at level 0, and no retired one (FR-013)', async () => {
    const guardado = await perfilPersistido()
    const ids = (guardado.skills ?? []).map((linha) => Number(linha.skill)).sort()

    expect(ids, 'the profile did not start with this lab`s active catalogue').toEqual(
      [...skillsAtivas].sort(),
    )
    expect(ids, 'a retired skill reached the profile').not.toContain(skillRetirada)
    for (const linha of guardado.skills ?? []) {
      expect(linha.nivel, 'a skill was not created at level 0').toBe(NIVEL_INICIAL)
      expect(linha.xp, 'a skill was created with XP already granted').toBe(XP_INICIAL)
    }
  })
})

describe('§3 — and the visitor is signed in (SC-001)', () => {
  it('signs in with the credentials the form submitted, and writes the session cookie', async () => {
    const jar = new FakeCookieJar()
    mocks.cookies.mockResolvedValue(jar)
    mocks.headers.mockResolvedValue(new Headers())

    // The product's own `signIn`, not `payload.login`: SC-001 says the visitor *is signed in*,
    // and what makes that true is the session cookie Payload's own config decides the shape of.
    await signIn({ email: EMAIL, senha: SENHA })

    expect(jar.escritos, 'signing in wrote no cookie; there is no session').toHaveLength(1)
    expect(jar.escritos[0]!.value, 'the session cookie carries no token').toBeTruthy()
  })

  it('does not sign in with a password the visitor never chose', async () => {
    mocks.cookies.mockResolvedValue(new FakeCookieJar())
    // Non-vacuity: an account that accepted anything would make the test above meaningless.
    await expect(signIn({ email: EMAIL, senha: `${SENHA}-errada` })).rejects.toThrow()
  })
})
