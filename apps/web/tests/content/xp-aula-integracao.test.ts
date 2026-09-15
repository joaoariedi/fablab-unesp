import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'

/**
 * T023 / T025, FR-025, FR-027, SC-011, US2 — **the class completion, driven through Payload.**
 *
 * The three sibling files (`xp-aula.test.ts`, `xp-aula-conclusao.test.ts`,
 * `xp-aula-sem-perfil.test.ts`) drive `creditarConclusao` with `lib/content/xp` mocked. That is
 * the right shape for what they assert — *"`creditXp` was called zero times"* is a statement a
 * database cannot make — but it is strictly weaker than the requirement, and this repo already
 * ruled on the difference: `xp-credit.test.ts` says of its own mocked sibling that *"a credit
 * reaching the ledger from anywhere else is invisible to it"*. With only the mocked half,
 * nothing in the tree proves a completion credits XP **at all** — only that a hook calls a stub.
 *
 * SC-011 asks for *"an integration test driving two completions"*, so here it is: a real
 * `progressoAula`, a real stamp, a real `xpLedger` row counted.
 *
 * **§2 is the half that matters most.** FR-027 — *"a completion claim for a class with no
 * progress row belonging to the requesting maker is refused, and writes no entry"* — is
 * verb-agnostic, and the collection's own attribution hook is `create`-only. The attack it
 * leaves open is not hypothetical and is not read off the source: a signed-in maker who holds
 * no row for a class PATCHes a lab-mate's row, naming themselves, and the credit follows the
 * name. `update: scopedAccess()` scopes to the **lab**, not to the row, so the PATCH is
 * permitted; the unique `(usuario, aula)` index cannot object, because the premise of the
 * attack is that the attacker has no row for that class and the pair is free.
 *
 * The world is a sentinel organization of this file's own, torn down in `afterAll`, rather than
 * `buildWorld` — which resets the whole database and seeds an `xpLedger` row of its own that
 * every count here would have to subtract. `counters.test.ts` reconciles the WHOLE database, so
 * a row left behind fails somebody else's file (measured in 004 phase 6).
 */

const SLUG_SENTINELA = 't023-aula'
const HOST = `${SLUG_SENTINELA}.localhost`
const SENHA = 'fixture-password-123'

type Linha = { id: string | number }
type Documento = Record<string, unknown>

let payload: Payload
let tenant: string | number
/** The maker who watches: the row and the credit are theirs. */
let quemAssiste: Linha
let perfilDeQuemAssiste: Linha
/** The maker who holds NO row for this class — §2's attacker. */
let oOutro: Linha
let perfilDoOutro: Linha
let aula: Linha
let progresso: Linha

/**
 * A request carrying the two things the credit hook needs, exactly as `xp-credit.test.ts`
 * builds one: the **host**, because `creditXp` reaches Payload through the choke point and a
 * write with no host is skipped with a warning; the **user**, because that client reads with
 * `overrideAccess: false` and a hook acting for nobody is refused in `executeAccess`.
 */
const pedido = (user: Linha) =>
  ({ headers: new Headers({ 'x-tenant-host': HOST }), user }) as never

const criar = async (collection: string, data: Documento): Promise<Linha> =>
  (await payload.create({
    collection: collection as never,
    data: { ...data, tenant } as never,
    // Setting up the world is not the thing under test: forcing the setup through the guarded
    // path would make a broken guard look like a broken fixture (fixtures.ts, verbatim).
    overrideAccess: true,
    req: pedido(quemAssiste),
  })) as unknown as Linha

/** Every ledger entry of this lab, read past access control. */
const ledger = async (): Promise<Documento[]> => {
  const { docs } = await payload.find({
    collection: 'xpLedger',
    where: { tenant: { equals: tenant } },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })
  return docs as unknown as Documento[]
}

const limpar = async () => {
  // Reverse dependency order: deleting forwards removes a row while its referrer still points
  // at it, and Postgres refuses on the foreign key (fixtures.ts § resetWorld).
  for (const collection of [
    'xpLedger',
    'progressoAula',
    'aula',
    'perfilMaker',
    'midiaImagem',
    'regrasXp',
  ]) {
    await payload.delete({
      collection: collection as never,
      where: { tenant: { equals: tenant } } as never,
      overrideAccess: true,
    })
  }
  await payload.delete({
    collection: 'users',
    where: { email: { in: [`${SLUG_SENTINELA}-a@example.com`, `${SLUG_SENTINELA}-b@example.com`] } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'organizations',
    where: { slug: { equals: SLUG_SENTINELA } },
    overrideAccess: true,
  })
}

const conta = async (sufixo: string): Promise<Linha> =>
  (await payload.create({
    collection: 'users',
    data: {
      email: `${SLUG_SENTINELA}-${sufixo}@example.com`,
      password: SENHA,
      role: 'user',
      // `as never` for `criar`'s reason: `tenant` is `string | number` because a database need
      // not use integers, while the generated `User` narrows it to this database's own `number`.
      orgs: [{ organization: tenant, role: 'maker' }],
    } as never,
    overrideAccess: true,
  })) as unknown as Linha

beforeAll(async () => {
  payload = await getPayload({ config })

  const organizacao = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab T023', slug: SLUG_SENTINELA, status: 'active' },
    overrideAccess: true,
  })
  tenant = organizacao.id

  quemAssiste = await conta('a')
  oOutro = await conta('b')

  const imagem = await criar('midiaImagem', {})
  perfilDeQuemAssiste = await criar('perfilMaker', {
    nome: 'Maker T023 A',
    handle: '@makert023a',
    usuario: quemAssiste.id,
  })
  perfilDoOutro = await criar('perfilMaker', {
    nome: 'Maker T023 B',
    handle: '@makert023b',
    usuario: oOutro.id,
  })

  aula = await criar('aula', {
    titulo: 'Aula T023',
    slug: 'aula-t023',
    descricao: 'Aula de fixture T023.',
    thumbnail: imagem.id,
    videoUrl: 'https://example.test/aula-t023',
    duracaoMin: 10,
    ordem: 1,
    autor: perfilDeQuemAssiste.id,
  })

  // In progress, deliberately: §1's act is the TRANSITION into complete, and a row created
  // already stamped would credit inside `beforeAll` where no assertion can see which write did.
  progresso = await criar('progressoAula', {
    usuario: quemAssiste.id,
    aula: aula.id,
    percentualAssistido: 40,
  })
}, 120_000)

afterAll(limpar)

/** One write of the progress row, as the account named. */
const escrever = async (data: Documento, como: Linha, overrideAccess = true): Promise<void> => {
  await payload.update({
    collection: 'progressoAula',
    id: progresso.id,
    data: data as never,
    overrideAccess,
    req: pedido(como),
  })
}

describe('§1 — a class completion credits XP, in the ledger (T023, FR-025, SC-011)', () => {
  it('writes exactly one entry on the stamp, and none on the rewatches after it', async () => {
    expect(
      await ledger(),
      'the lab already held a ledger entry before the completion, so the count below would ' +
        'measure the fixture rather than the act',
    ).toEqual([])

    await escrever({ percentualAssistido: 100, concluidaEm: new Date().toISOString() }, quemAssiste)

    const aposConcluir = await ledger()
    expect(
      aposConcluir,
      'a class was watched to 100% and the ledger is empty. The mocked siblings prove the hook ' +
        'calls creditXp; only this proves an entry reaches the ledger — a missing regrasXp row, ' +
        'an unregistered hook or a swallowed error all read as green there and as this here',
    ).toHaveLength(1)
    expect(aposConcluir[0]).toMatchObject({
      perfil: perfilDeQuemAssiste.id,
      acao: 'assistir_aula',
      refTipo: 'aula',
      // The id, not the progress row's: the idempotency key is per CLASS, which is what makes
      // rewatching free however many rows a migration ever gives the same pair.
      refId: Number(aula.id),
      quantidade: 1,
    })

    // Two more writes of a row that is already complete — the player heartbeat. `concluidaEm`
    // stays set, so this is the state the transition guard exists to ignore.
    await escrever({ percentualAssistido: 100, posicaoReproducao: 120 }, quemAssiste)
    await escrever({ percentualAssistido: 100, posicaoReproducao: 240 }, quemAssiste)

    expect(
      await ledger(),
      'rewatching a finished class credited again. FR-025 caps the gain at 1 XP per class ' +
        'forever, and it is the whole anti-farm posture CLR-008 rests on',
    ).toHaveLength(1)
  })
})

describe('§2 — a maker with no row for the class earns nothing from it (T025, FR-027)', () => {
  it("refuses to move a lab-mate's progress row onto the requester", async () => {
    const antes = await ledger()
    expect(
      antes.map((entrada) => entrada.perfil),
      'the attacker already holds an entry, so the assertion below cannot tell a refusal from ' +
        'a duplicate the idempotency key swallowed',
    ).not.toContain(perfilDoOutro.id)

    // The attack, through the guarded path — `overrideAccess: false`, signed in as the other
    // maker. They hold no `progressoAula` row for this class; they PATCH the one that exists,
    // naming themselves and stamping it complete. `update: scopedAccess()` permits the write
    // because it scopes to the lab, so the only thing that can refuse the ATTRIBUTION is the
    // field itself.
    await escrever(
      { usuario: oOutro.id, percentualAssistido: 100, concluidaEm: new Date().toISOString() },
      oOutro,
      false,
    )

    const linha = (await payload.findByID({
      collection: 'progressoAula',
      id: progresso.id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Documento
    expect(
      linha.usuario,
      "a signed-in maker rewrote whose progress row it is. `usuario` is the account the credit " +
        'is resolved from, so a writable one makes FR-027 unenforceable on the update verb no ' +
        'matter what the create path does',
    ).toBe(quemAssiste.id)

    expect(
      (await ledger()).map((entrada) => entrada.perfil),
      'a maker who holds no progress row for this class earned XP from it, by PATCHing a ' +
        "lab-mate's row onto their own name. FR-027 is verb-agnostic and this is the verb it " +
        'does not cover',
    ).not.toContain(perfilDoOutro.id)
  })
})
