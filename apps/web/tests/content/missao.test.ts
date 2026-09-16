import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'

/**
 * T030 / SC-012, FR-022, US3 — **two team members approving the same submission credit once**,
 * driven through Payload against a real database.
 *
 * `missao-credito.test.ts` drives `creditarAprovacao` with `lib/content/xp` mocked. That is the
 * right shape for what it asserts — *"`creditXp` was called with `concluir_missao` and the
 * skill the mission names"* is a statement about arguments, and only a mock can see arguments —
 * but it is strictly weaker than SC-012, which names **an integration test**, and this repo has
 * already ruled on the difference twice: `xp-credit.test.ts` says of its own mocked sibling
 * that *"a credit reaching the ledger from anywhere else is invisible to it"*, and
 * `xp-aula-integracao.test.ts` exists because with only the mocked half nothing in the tree
 * proved a completion credits XP **at all**.
 *
 * The same hole is open here for missions: nothing proves an approval puts a row in `xpLedger`,
 * and nothing proves the maker's `xpTotal` and skill panel move because of it. A missing
 * `regrasXp`, an unregistered hook, an unreadable mission, a projection write refused by
 * access control — every one of those reads green in the mocked file and red here.
 *
 * Three sections, in the order US3's edge is lived:
 *
 *   1. **The first approval credits, in the ledger** — one row, naming the maker (never the
 *      reviewer), the mission's skill, `concluir_missao`, and the mission's own id, with the
 *      projections recomputed from it.
 *   2. **The second team member approves the same submission and credits NOTHING** — SC-012
 *      itself. Two *different* reviewers, both on the team, exactly as the title says: one
 *      reviewer clicking twice would be answered by the `previousDoc` guard alone, while two
 *      accounts also exercise the scoped read each of them makes.
 *   3. **Approving concurrently still credits once** — both reviewers write before either
 *      commits, which is the one ordering the `previousDoc` guard cannot answer and which
 *      `creditXp`'s docblock hands to the unique index. Asserted as an outcome (one entry, the
 *      row approved), never as a schedule.
 *
 * The world is a sentinel organization of this file's own, torn down in `afterAll`, rather than
 * `buildWorld` — which resets the whole database and seeds an `xpLedger` row of its own that
 * every count here would have to subtract (`xp-aula-integracao.test.ts`, verbatim, and
 * `counters.test.ts` reconciles the WHOLE database so a row left behind fails somebody else's
 * file).
 */

const SLUG_SENTINELA = 't030-missao'
const HOST = `${SLUG_SENTINELA}.localhost`
const SENHA = 'fixture-password-123'

type Linha = { id: string | number }
type Documento = Record<string, unknown>

let payload: Payload
let tenant: string | number
/** Two DIFFERENT team members: SC-012 is about two people, not one person twice. */
let revisorA: Linha
let revisorB: Linha
/** The maker the XP belongs to. Never a reviewer — §1 asserts that explicitly. */
let oMaker: Linha
let perfilDoMaker: Linha
let skill: Linha
let missao: Linha
let submissao: Linha

/**
 * A request carrying the two things the credit path needs, exactly as the sibling integration
 * file builds one: the **host**, because `creditXp` and `skillDaMissao` both reach Payload
 * through the choke point and a write with no host is skipped with a warning; the **user**,
 * because that client reads with `overrideAccess: false` and a hook acting for nobody is
 * refused in `executeAccess`.
 */
const pedido = (user: Linha) =>
  ({ headers: new Headers({ 'x-tenant-host': HOST }), user }) as never

/**
 * One seeded row, as the account named.
 *
 * `como` defaults to the reviewer because most of this world is editorial setup — but a
 * `missaoSubmissao` must be seeded as the **maker**, and that is not fixture taste: T027 binds
 * `maker` to the requester in `beforeValidate`, and hooks run whatever `overrideAccess` says.
 * A submission created as the reviewer is a state the application cannot produce, and it is now
 * refused outright, because a team member holds no `perfilMaker` to attribute it to.
 */
const criar = async (
  collection: string,
  data: Documento,
  como: Linha = revisorA,
): Promise<Linha> =>
  (await payload.create({
    collection: collection as never,
    data: { ...data, tenant } as never,
    // Setting up the world is not the thing under test: forcing the setup through the guarded
    // path would make a broken guard look like a broken fixture (fixtures.ts, verbatim).
    overrideAccess: true,
    req: pedido(como),
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

/** The maker's panel as the projections left it. */
const perfil = async (): Promise<Documento> =>
  (await payload.findByID({
    collection: 'perfilMaker',
    id: perfilDoMaker.id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Documento

const linhaDaSubmissao = async (): Promise<Documento> =>
  (await payload.findByID({
    collection: 'missaoSubmissao',
    id: submissao.id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Documento

/** One approval, through the guarded path, as the reviewer named. */
const aprovar = async (revisor: Linha): Promise<void> => {
  await payload.update({
    collection: 'missaoSubmissao',
    id: submissao.id,
    data: { status: 'aprovada' } as never,
    // The guarded path deliberately: `canReviewSubmissionStatus` is what makes this an
    // approval by a *team member*, and a fixture that overrode it would prove the credit on a
    // write no reviewer could have made.
    overrideAccess: false,
    req: pedido(revisor),
  })
}

const conta = async (sufixo: string, role: string): Promise<Linha> =>
  (await payload.create({
    collection: 'users',
    data: {
      email: `${SLUG_SENTINELA}-${sufixo}@example.com`,
      password: SENHA,
      role: 'user',
      // `as never`: `tenant` is `string | number` because a database need not use integers,
      // while the generated `User` narrows it to this database's own `number`.
      orgs: [{ organization: tenant, role }],
    } as never,
    overrideAccess: true,
  })) as unknown as Linha

const limpar = async () => {
  // Reverse dependency order: deleting forwards removes a row while its referrer still points
  // at it, and Postgres refuses on the foreign key (fixtures.ts § resetWorld).
  for (const collection of [
    'xpLedger',
    'missaoSubmissao',
    'missao',
    'perfilMaker',
    'skill',
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
    where: {
      email: {
        in: [
          `${SLUG_SENTINELA}-a@example.com`,
          `${SLUG_SENTINELA}-b@example.com`,
          `${SLUG_SENTINELA}-m@example.com`,
        ],
      },
    },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'organizations',
    where: { slug: { equals: SLUG_SENTINELA } },
    overrideAccess: true,
  })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await limpar().catch(() => undefined)

  const organizacao = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab T030', slug: SLUG_SENTINELA, status: 'active' },
    overrideAccess: true,
  })
  tenant = organizacao.id

  // `staff` is a TEAM role (`lib/tenancy/access.ts`), which is what makes both of these people
  // able to approve — SC-012's "two team members".
  revisorA = await conta('a', 'staff')
  revisorB = await conta('b', 'staff')
  oMaker = await conta('m', 'maker')

  const imagem = await criar('midiaImagem', {})
  perfilDoMaker = await criar('perfilMaker', {
    nome: 'Maker T030',
    handle: '@makert030',
    usuario: oMaker.id,
  })
  skill = await criar('skill', { nome: 'Corte a Laser T030', slug: 'corte-laser-t030', ativa: true })
  missao = await criar('missao', {
    titulo: 'Desafio T030',
    descricao: 'Crie um chaveiro personalizado com corte a laser.',
    icone: imagem.id,
    skill: skill.id,
    status: 'publicado',
  })
  // Born `enviada`, deliberately: the act under test is the TRANSITION into `aprovada`, and a
  // submission created already approved would credit inside `beforeAll`, where no assertion
  // can see which write did it.
  // Sent AS the maker: T027's `attributeSubmissionToRequester` binds `maker` to the requester's
  // own profile, and hooks run whatever `overrideAccess` says. `maker` is still written here
  // because it is what the assertions below are about — the hook agreeing with it is the point.
  submissao = await criar(
    'missaoSubmissao',
    { missao: missao.id, maker: perfilDoMaker.id, comprovante: imagem.id, status: 'enviada' },
    oMaker,
  )
}, 120_000)

afterAll(limpar)

describe('§1 — the first approval credits, in the ledger (T030, FR-022)', () => {
  it('writes exactly one entry, naming the maker and the skill the MISSION names', async () => {
    expect(
      await ledger(),
      'the lab already held a ledger entry before the approval, so every count below would ' +
        'measure the fixture rather than the act',
    ).toEqual([])

    await aprovar(revisorA)

    const entradas = await ledger()
    expect(
      entradas,
      'a team member approved a submission and the ledger is empty. The mocked sibling proves ' +
        'the hook calls creditXp; only this proves an entry reaches the ledger — a missing ' +
        'regrasXp row, an unregistered hook, an unreadable mission or a swallowed error all ' +
        'read as green there and as this here',
    ).toHaveLength(1)
    expect(entradas[0]).toMatchObject({
      // The maker, never the reviewer: the credit follows the row's `maker`, and a hook that
      // resolved it from `req.user` would pay the person who approved.
      perfil: perfilDoMaker.id,
      skill: skill.id,
      acao: 'concluir_missao',
      refTipo: 'missao',
      // The mission's id, not the submission's: keying on the mission is what makes a
      // deleted-and-resubmitted row cost nothing (T029's docstring).
      refId: Number(missao.id),
      quantidade: 1,
    })
  })

  it('moves the maker\'s xpTotal and skill panel, recomputed from that entry (FR-010)', async () => {
    const painel = await perfil()

    expect(painel.xpTotal).toBe(1)
    const linhas = (painel.skills ?? []) as { skill?: unknown; xp?: unknown }[]
    expect(
      linhas.map((linha) => [linha.skill, linha.xp]),
      'the entry exists and the panel does not show it. An unprojected ledger is FR-010 broken ' +
        "in the direction nothing notices: the maker's page keeps printing the old number",
    ).toContainEqual([skill.id, 1])
  })
})

describe('§2 — a second team member approving the same submission credits nothing (SC-012)', () => {
  it('leaves the ledger, the totals and the row exactly as the first approval left them', async () => {
    const antes = await ledger()
    const painelAntes = await perfil()
    expect(
      antes,
      'the first approval left no entry, so "the count did not change" below would be 0 === 0 ' +
        'and this section would pass on a collection that credits nothing at all',
    ).toHaveLength(1)

    await aprovar(revisorB)

    expect(
      await ledger(),
      'a second team member approved an already-approved submission and it credited again. ' +
        'SC-012 is the whole of US3\'s edge: XP is granted for the act, not for the number of ' +
        'reviewers who confirm it',
    ).toHaveLength(antes.length)
    expect((await perfil()).xpTotal).toBe(painelAntes.xpTotal)
    expect((await linhaDaSubmissao()).status).toBe('aprovada')
  })
})

describe('§3 — two reviewers approving at the same instant credit once', () => {
  it('credits once even when neither approval has committed when the other starts', async () => {
    // A fresh mission and a fresh submission: §1's credit already exists for the first one, so
    // running the race there would be answered by `creditXp`'s read and prove nothing about a
    // race at all.
    const outra = await criar('missao', {
      titulo: 'Desafio T030 simultâneo',
      descricao: 'A mesma skill, uma missão que ainda não creditou nada.',
      icone: ((await criar('midiaImagem', {})) as Linha).id,
      skill: skill.id,
      status: 'publicado',
    })
    const disputada = await criar(
      'missaoSubmissao',
      {
        missao: outra.id,
        maker: perfilDoMaker.id,
        comprovante: ((await criar('midiaImagem', {})) as Linha).id,
        status: 'enviada',
      },
      oMaker,
    )

    const aprovarDisputada = (revisor: Linha) =>
      payload.update({
        collection: 'missaoSubmissao',
        id: disputada.id,
        data: { status: 'aprovada' } as never,
        overrideAccess: false,
        req: pedido(revisor),
      })

    // `allSettled`, not `all`: `creditXp`'s docblock is explicit that the loser of a genuine
    // race fails loudly rather than pretending to have succeeded, so a rejection here is a
    // documented outcome. What is asserted is the state the two writes left behind.
    await Promise.allSettled([aprovarDisputada(revisorA), aprovarDisputada(revisorB)])

    const desta = (await ledger()).filter(
      (entrada) => entrada.refTipo === 'missao' && entrada.refId === Number(outra.id),
    )
    expect(
      desta,
      'two simultaneous approvals of one submission credited twice. The transition guard ' +
        'cannot see a write that has not committed, so this is the case the unique index on ' +
        'chaveIdempotencia is the arbiter of — and a ledger that can double-count under load ' +
        'makes every projection derived from it unreconcilable (FR-003, FR-011)',
    ).toHaveLength(1)
  })
})

/**
 * T030b / SC-022, FR-041, FR-023, CLR-015 — **reject → edit → approve credits once, and the row
 * is the same row throughout.**
 *
 * `missao-reabertura.test.ts` drives `reabrirRecusada` directly, with a hand-built `data` and
 * `originalDoc`. That proves the transition the hook computes; it cannot prove the maker is
 * *allowed to perform it*, and that is where CLR-015 actually lives. The reopen sits behind
 * three guards written by three different tasks — `update: scopedAccess()` on the collection
 * (deliberately not `teamOnly()`), `canReviewSubmissionStatus` on the `status` field, and the
 * frozen `missao`/`maker` pair — and a unit test that never reaches access control reads green
 * against every one of them being wrong. A `teamOnly()` update, a field guard that refused the
 * maker's write, or a `sameTenant` validator that rejected the new photo would each leave the
 * maker barred forever behind the unique index of FR-023: exactly the punitive review queue
 * CLR-015 was written to refuse, and exactly what SC-022 asks an **integration test** to drive.
 *
 * The three things asserted, in the order the cycle is lived:
 *
 *   1. **A rejection credits nothing.** The ledger for this mission stays empty. A hook that
 *      fired on the state rather than the transition, or on any review decision, would pay for
 *      a refusal.
 *   2. **The maker's edit reopens THE SAME ROW.** `status` returns to `enviada`, and the id is
 *      the one the submission was created with — never a replacement. FR-023 keeps one row per
 *      (mission, maker) forever, so a reopen that created a second row would be refused by the
 *      unique index; one that deleted and recreated would erase the review history the team
 *      reviews the next attempt against. The row count for the pair is asserted at the end.
 *   3. **The approval that follows credits exactly once.** One entry, naming the maker and the
 *      mission's skill, and `xpTotal` up by exactly 1 — not by the number of times the row
 *      passed through the queue. The credit keys on the **mission**, so a cycle that credited
 *      per review round would be a second entry here and an unreconcilable ledger everywhere
 *      else (FR-003, FR-011).
 */
describe('§4 — reject → edit → approve credits once, on one row (T030b, SC-022, FR-041)', () => {
  it('reopens the rejected row and credits it exactly once, end to end', async () => {
    const foto = async () => ((await criar('midiaImagem', {})) as Linha).id

    const missaoB = await criar('missao', {
      titulo: 'Desafio T030b',
      descricao: 'Uma missão cuja primeira tentativa a equipe recusa.',
      icone: await foto(),
      skill: skill.id,
      status: 'publicado',
    })
    const linha = await criar(
      'missaoSubmissao',
      {
        missao: missaoB.id,
        maker: perfilDoMaker.id,
        comprovante: await foto(),
        status: 'enviada',
      },
      oMaker,
    )
    const idOriginal = linha.id

    /** Every ledger entry keyed on THIS mission — §1–§3 left entries of their own behind. */
    const desta = async () =>
      (await ledger()).filter(
        (entrada) => entrada.refTipo === 'missao' && entrada.refId === Number(missaoB.id),
      )

    const ler = async (): Promise<Documento> =>
      (await payload.findByID({
        collection: 'missaoSubmissao',
        id: idOriginal,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Documento

    /**
     * Every write of the cycle goes through the guarded path as the person who really makes it:
     * the reviewer for the two decisions, the MAKER for the edit. Overriding access here would
     * prove the reopen on a write the maker could not have made, which is the only thing SC-022
     * adds to the unit test beside it.
     */
    const escrever = (data: Documento, autor: Linha) =>
      payload.update({
        collection: 'missaoSubmissao',
        id: idOriginal,
        data: data as never,
        overrideAccess: false,
        req: pedido(autor),
      })

    expect(
      await desta(),
      'this mission had already credited before the cycle began, so "exactly one entry" below ' +
        'would be measuring the fixture',
    ).toEqual([])

    // 1 — the team refuses it.
    await escrever({ status: 'recusada' }, revisorA)
    expect((await ler()).status).toBe('recusada')
    expect(
      await desta(),
      'a REFUSED submission credited XP. The credit fires on the transition into `aprovada`; ' +
        'paying for a rejection would mint XP for work the team just said was not done',
    ).toEqual([])

    // 2 — the maker edits the proof, which is the reopen (FR-041).
    const provaNova = await foto()
    await escrever({ comprovante: provaNova }, oMaker)

    const reaberta = await ler()
    expect(
      reaberta.status,
      'the maker replaced the photo on their rejected submission and the row did not return ' +
        'to `enviada`. With FR-023\'s unique index refusing a second row, `missao`/`maker` ' +
        'frozen and `delete` team-only, one rejection would bar this maker from this mission ' +
        'forever — the permanent exile CLR-015 exists to refuse',
    ).toBe('enviada')
    expect(
      reaberta.id,
      'the reopen produced a different row. FR-023 is one submission per mission per maker ' +
        'FOREVER: a replacement row loses the rejection the next reviewer needs to see, and ' +
        'is what the unique index refuses in the first place',
    ).toBe(idOriginal)
    expect(await desta(), 'reopening a submission credited XP; only an approval credits').toEqual(
      [],
    )

    // 3 — the team approves the second attempt.
    const xpAntes = (await perfil()).xpTotal
    await escrever({ status: 'aprovada' }, revisorB)

    const final = await ler()
    expect(final.status).toBe('aprovada')
    expect(final.id, 'the approval moved the credit onto a different row').toBe(idOriginal)

    const entradas = await desta()
    expect(
      entradas,
      'the full reject → edit → approve cycle did not credit exactly once. More than one entry ' +
        'means a review round is worth XP rather than the completion being worth XP; none ' +
        'means the reopened row approves without paying, and SC-022 is both halves',
    ).toHaveLength(1)
    expect(entradas[0]).toMatchObject({
      perfil: perfilDoMaker.id,
      skill: skill.id,
      acao: 'concluir_missao',
      refTipo: 'missao',
      refId: Number(missaoB.id),
      quantidade: 1,
    })
    expect(
      (await perfil()).xpTotal,
      "the maker's total did not rise by exactly one for the whole cycle (FR-010)",
    ).toBe((xpAntes as number) + 1)

    const { totalDocs } = await payload.find({
      collection: 'missaoSubmissao',
      where: { and: [{ missao: { equals: missaoB.id } }, { maker: { equals: perfilDoMaker.id } }] },
      depth: 0,
      limit: 10,
      overrideAccess: true,
    })
    expect(
      totalDocs,
      'the cycle left more than one submission row for this (mission, maker). "The row is the ' +
        'same row throughout" is FR-023 at the database, and a second row would have to have ' +
        'come past the unique index that exists to refuse it',
    ).toBe(1)
  })
})
