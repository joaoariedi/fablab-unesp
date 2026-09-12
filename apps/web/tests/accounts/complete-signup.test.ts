import type { PayloadRequest } from 'payload'
import { ValidationError } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  completeSignup,
  type SignupDeps,
  type SignupInput,
  type SignupStore,
} from '../../lib/accounts/signup'
import { foldToHandle } from '../../lib/accounts/handle'
import type { CreateArgs, FindArgs } from '../../lib/tenancy'
import { PERFIL_MAKER_HANDLE_UNIQUE_VIOLATION } from '../../lib/tenancy/handle-unique-index'

/**
 * T027 / FR-011, FR-013, US1 — **`completeSignup`: the account, the profile, the skills at
 * level 0 and the consent stamp, in one transaction**.
 *
 * plan.md § *Sketch 3* fixes the shape; this file pins the four claims that shape makes, and
 * each of them can be broken without any other test in the suite noticing:
 *
 *   1. the profile carries the person's `nome` and nothing that asks for a second one (FR-011);
 *   2. **every active** skill of the organization enters at level 0 — not the first ten of
 *      them, and not the inactive ones (FR-013);
 *   3. the handle comes from `createWithHandle`, so a collision is adjudicated by the unique
 *      index and there is no `SELECT` beside the insert (FR-010, T020's contract);
 *   4. every write joins **one** store, obtained once from the caller's `req` — which is what
 *      "one transaction" is made of in this codebase (`lib/content/counters.ts` § syncCounter).
 *
 * ── Why a named fake and not Postgres ──────────────────────────────────────────────────────
 *
 * Three of the four claims are about *the operations issued*, and a real database answers each
 * one only with its end state: a truncated skill catalogue looks like a lab with ten skills, a
 * `SELECT` before the insert looks exactly like no `SELECT` at all, and a second client looks
 * like a successful signup right up until a later write fails and the account stays behind.
 * The fake records the calls, so the assertions can be about them. It is the split
 * `handle-create.test.ts` (fake) and `handle-race.test.ts` (Postgres) already make for the
 * insert this builds on; T028 drives the whole flow end to end against a real database.
 */

/** Payload's own page size when a `find` names no limit — measured, not assumed:
 *  `payload/dist/collections/operations/find.js:72`, `limit ?? (usePagination ? 10 : 0)`. */
const PAGINA_PADRAO_DO_PAYLOAD = 10

const USER_ID = 99
const PERFIL_ID = 7

const NOME = 'Maria Silva'
const BASE = foldToHandle(NOME) // 'mariasilva'
const VERSAO_DOS_TERMOS = '0-iss-002'

/** The request the signup runs under. Nothing in this module reads it — it is the transaction
 *  handle, and the assertion is that it reaches the store factory unchanged. */
const REQ = { id: 'req-1' } as unknown as PayloadRequest

const AGORA = new Date('2026-09-12T14:03:00.000Z')

const entrada = (over: Partial<SignupInput> = {}): SignupInput => ({
  req: REQ,
  nome: NOME,
  email: 'maria@example.com',
  senha: 'uma-senha-bem-comprida',
  dataNascimento: '2001-04-03',
  vinculoUnesp: 'aluno',
  escolaridade: 'superior',
  curso: 'Engenharia de Produção',
  avatarConfig: { base: 'f', tomDePele: 3 },
  aceiteTermosVersao: VERSAO_DOS_TERMOS,
  aceiteTermos: true,
  ...over,
})

type SkillRow = { id: number; slug: string; ativa: boolean }

const skill = (id: number, ativa = true): SkillRow => ({ id, slug: `skill-${id}`, ativa })

/** The collision as the Local API actually raises it — built from the constant T019 exported
 *  after measuring `@payloadcms/drizzle`'s rethrow, exactly as `handle-create.test.ts` does. */
const colisaoDeHandle = (): Error =>
  new ValidationError({
    collection: 'perfilMaker',
    errors: [{ message: 'Value must be unique', ...PERFIL_MAKER_HANDLE_UNIQUE_VIOLATION }],
  })

/**
 * A named fake for the choke-point client (`.claude/rules/code-quality.md`), recording every
 * operation and **behaving like Payload where the behaviour is the trap**:
 *
 *   - `find` applies the `ativa` clause only when the caller sends one, so an implementation
 *     that filters in JavaScript instead of in the query is handed the inactive rows too;
 *   - `find` paginates at ten when no limit is named, which is what Payload does and what
 *     silently truncates a catalogue of twelve skills into a profile carrying ten.
 */
class FakeSignupStore implements SignupStore {
  readonly finds: FindArgs[] = []
  readonly creates: CreateArgs[] = []
  /** Every account this fake was asked to open. `criarConta`, not `create({users})`: the real
   *  door writes the lab membership with the account, and an account without one is refused
   *  everything that follows it — so the two cannot be the same operation even in a fake. */
  readonly contas: { email: string; senha: string }[] = []

  constructor(
    private readonly mundo: {
      skills?: readonly SkillRow[]
      /** Handles already held by another maker of this organization. */
      handlesOcupados?: ReadonlySet<string>
    } = {},
  ) {}

  /** `[{ collection, handle }]` for every insert — the sequence the claims are about. */
  get inseridos(): { collection: string; handle?: unknown }[] {
    return this.creates.map((c) => ({ collection: c.collection, handle: c.data.handle }))
  }

  get perfil(): Record<string, unknown> | undefined {
    return this.creates.find((c) => c.collection === 'perfilMaker')?.data
  }

  find = async <R = Record<string, unknown>>(
    args: FindArgs,
  ): Promise<{ docs: R[]; totalDocs: number }> => {
    this.finds.push(args)
    const where = args.where as { ativa?: { equals?: unknown } } | undefined
    const todas = this.mundo.skills ?? []
    const filtradas =
      where?.ativa === undefined ? todas : todas.filter((s) => s.ativa === where.ativa?.equals)
    const limite = args.limit ?? PAGINA_PADRAO_DO_PAYLOAD
    const pagina = limite === 0 ? filtradas : filtradas.slice(0, limite)
    return { docs: pagina as unknown as R[], totalDocs: filtradas.length }
  }

  criarConta = async (dados: { email: string; senha: string }): Promise<{ id: string | number }> => {
    this.contas.push(dados)
    return { id: USER_ID }
  }

  create = async <R = Record<string, unknown>>(args: CreateArgs): Promise<R> => {
    this.creates.push(args)
    if (args.collection === 'users') return { id: USER_ID, ...args.data } as R
    if (this.mundo.handlesOcupados?.has(String(args.data.handle))) throw colisaoDeHandle()
    return { id: PERFIL_ID, ...args.data } as R
  }
}

/** Counts how often the client was built: "one transaction" means exactly once. */
class ContadorDeClientes {
  readonly pedidos: PayloadRequest[] = []

  constructor(private readonly store: SignupStore) {}

  get deps(): SignupDeps {
    return {
      getStore: async (req) => {
        this.pedidos.push(req)
        return this.store
      },
      agora: () => AGORA,
    }
  }
}

const assinar = async (db: FakeSignupStore, over: Partial<SignupInput> = {}) => {
  const clientes = new ContadorDeClientes(db)
  const perfil = await completeSignup(entrada(over), clientes.deps)
  return { perfil, clientes }
}

describe('§1 — one account, one profile, and the name is not asked for twice (FR-011)', () => {
  it('creates the account with the submitted e-mail and password, and links the profile to it', async () => {
    const db = new FakeSignupStore({ skills: [skill(1)] })

    await assinar(db)

    // `criarConta`, not a `create({ collection: 'users' })`. The door writes the lab membership
    // with the account, and without it `scopedAccess()` refuses this person their own profile
    // and their own skill catalogue — which is what the first draft did against the real stack
    // while this suite, whose fake has no access control, stayed green.
    expect(db.contas).toEqual([{ email: 'maria@example.com', senha: 'uma-senha-bem-comprida' }])
    expect(
      db.creates.filter((c) => c.collection === 'users'),
      'the account was opened with a bare `create`, which bypasses the membership write',
    ).toEqual([])
    expect(
      db.perfil?.usuario,
      'the profile is the lab-scoped half of an identity that is global: without `usuario` ' +
        'the person can sign in and own nothing.',
    ).toBe(USER_ID)
  })

  it('writes `nome` once and asks for no second name — the avatar carries the same one (FR-011)', async () => {
    const db = new FakeSignupStore({ skills: [skill(1)] })

    await assinar(db)

    expect(db.perfil?.nome).toBe(NOME)
    // FR-011: "`nome_avatar` is the same value as `nome`; it is not a second field the person
    // fills". A second column here is the shape that requirement forbids — and the day one is
    // written, the two can disagree.
    const nomes = Object.keys(db.perfil ?? {}).filter((k) => /nome/i.test(k))
    expect(nomes).toEqual(['nome'])
  })

  it('forwards step 2 verbatim and never puts the password on the profile', async () => {
    const db = new FakeSignupStore({ skills: [skill(1)] })

    await assinar(db)

    expect(db.perfil).toMatchObject({
      dataNascimento: '2001-04-03',
      vinculoUnesp: 'aluno',
      escolaridade: 'superior',
      curso: 'Engenharia de Produção',
      avatarConfig: { base: 'f', tomDePele: 3 },
    })
    expect(
      Object.keys(db.perfil ?? {}).filter((k) => /senha|password/i.test(k)),
      'the credential lives on `users`, hashed by Payload. A copy on the profile is a ' +
        'plaintext password in a row every member of the lab may read (FR-020).',
    ).toEqual([])
  })

  it('stamps the consent with the moment AND the version the person was shown (FR-012)', async () => {
    const db = new FakeSignupStore({ skills: [skill(1)] })

    await assinar(db)

    expect(db.perfil?.aceiteTermosEm).toBe(AGORA.toISOString())
    expect(
      db.perfil?.aceiteTermosVersao,
      'the version is what makes a re-consent demandable; a timestamp alone can only be ' +
        'compared against a release date somebody remembers.',
    ).toBe(VERSAO_DOS_TERMOS)
  })

  it('returns the created profile', async () => {
    const db = new FakeSignupStore({ skills: [skill(1)] })

    const { perfil } = await assinar(db)

    expect(perfil).toMatchObject({ id: PERFIL_ID, handle: BASE, nome: NOME })
  })

  it('refuses before writing anything when no terms version was submitted', async () => {
    const db = new FakeSignupStore({ skills: [skill(1)] })

    await expect(assinar(db, { aceiteTermosVersao: '' })).rejects.toThrow(/termos/i)
    expect(
      db.creates,
      'consent is a signup gate: an account created without the stamp is one no record ' +
        'shows ever accepted anything, and LGPD asks precisely that question.',
    ).toEqual([])
  })
})

describe('§2 — every active skill of the lab, at level 0 (FR-013)', () => {
  it('assigns one row per active skill, at nivel 0 and xp 0', async () => {
    const db = new FakeSignupStore({ skills: [skill(1), skill(2), skill(3)] })

    await assinar(db)

    expect(db.perfil?.skills).toEqual([
      { skill: 1, nivel: 0, xp: 0 },
      { skill: 2, nivel: 0, xp: 0 },
      { skill: 3, nivel: 0, xp: 0 },
    ])
  })

  it('leaves inactive skills off the profile — the filter is in the query, not in the caller', async () => {
    const db = new FakeSignupStore({ skills: [skill(1), skill(2, false), skill(3)] })

    await assinar(db)

    expect(db.finds).toHaveLength(1)
    expect(
      db.finds[0]?.where,
      'FR-013 says *active*. `Skill.ativa` is how a lab retires a skill without touching ' +
        "anyone's XP, and a new maker must not enter carrying the retired one.",
    ).toEqual({ ativa: { equals: true } })
    expect(db.perfil?.skills).toEqual([
      { skill: 1, nivel: 0, xp: 0 },
      { skill: 3, nivel: 0, xp: 0 },
    ])
  })

  it('assigns the WHOLE catalogue, not Payload\'s first page of ten', async () => {
    const doze = Array.from({ length: 12 }, (_, i) => skill(i + 1))
    const db = new FakeSignupStore({ skills: doze })

    await assinar(db)

    expect(
      db.perfil?.skills,
      'a `find` with no `limit` is capped at ten by Payload itself, and the eleventh and ' +
        'twelfth skills would simply be missing from the panel with nothing to show for it.',
    ).toHaveLength(12)
  })

  it('creates a profile with no skills at all in a lab whose catalogue is empty', async () => {
    const db = new FakeSignupStore({ skills: [] })

    const { perfil } = await assinar(db)

    expect(
      db.perfil?.skills,
      'a new organization has no skills until its team adds them — the first maker to sign ' +
        'up there must still get an account (PerfilMaker.ts § "No minRows").',
    ).toEqual([])
    expect(perfil).toBeDefined()
  })
})

describe('§3 — the handle is the index\'s to decide, never a read-then-write (FR-010)', () => {
  it('writes the folded name as the handle and issues no read against perfilMaker', async () => {
    const db = new FakeSignupStore({ skills: [skill(1)] })

    await assinar(db)

    expect(db.perfil?.handle).toBe(BASE)
    expect(
      db.finds.map((f) => f.collection),
      'a `find` on perfilMaker is the "is this handle taken?" read T020 exists to avoid: ' +
        'two homonyms signing up at once both read the same free handle and both write it.',
    ).toEqual(['skill'])
  })

  it('answers a taken handle with @mariasilva2, through createWithHandle', async () => {
    const db = new FakeSignupStore({ skills: [skill(1)], handlesOcupados: new Set([BASE]) })

    const { perfil } = await assinar(db)

    expect(db.inseridos.filter((i) => i.collection === 'perfilMaker').map((i) => i.handle)).toEqual(
      [BASE, `${BASE}2`],
    )
    expect((perfil as { handle?: string }).handle).toBe(`${BASE}2`)
  })
})

describe('§4 — one store, one transaction (plan.md: "one transaction")', () => {
  it('builds the client exactly once, from the caller\'s own req', async () => {
    const db = new FakeSignupStore({ skills: [skill(1)] })

    const { clientes } = await assinar(db)

    expect(
      clientes.pedidos,
      'a second client is a second connection and therefore a second transaction: the ' +
        'account commits, the profile fails, and a login exists with nothing behind it.',
    ).toEqual([REQ])
  })

  it('lets a failed profile insert reach the caller, so the transaction can roll back', async () => {
    const todosOcupados = new Set(
      [BASE, ...Array.from({ length: 40 }, (_, i) => `${BASE}${i + 2}`)],
    )
    const db = new FakeSignupStore({ skills: [skill(1)], handlesOcupados: todosOcupados })

    await expect(assinar(db)).rejects.toThrow(/handle/i)
  })
})
