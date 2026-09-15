import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'

/**
 * T027 / FR-021, FR-023, FR-022 — **the submission belongs to whoever sent it.**
 *
 * FR-021 is *"**a maker** submits a completion for a mission"*: the row IS the record of who
 * submitted, it is what the credit resolves from (FR-022), and it is half of the pair FR-023
 * makes unique. So `maker` cannot be a value the client chooses — and freezing it on `update`
 * is only half the story, because a forged CREATE never needs to update anything.
 *
 * The consequence is not cosmetic, and it is worse here than on the collections that carry the
 * same shape, because this one deliberately makes the pair permanent: the `(missao, maker)`
 * index refuses a second row, `maker` cannot be re-pointed, and `delete` is `teamOnly()`. A
 * forged create therefore occupies another maker's one-row-forever slot for that mission,
 * populates the team's queue with work attributed to somebody who did nothing, and — since
 * `creditarAprovacao` resolves from the row's own `maker` — hands them the XP on approval,
 * feeding the ranking CLR-007 publishes.
 *
 * Driven against the real collection with `overrideAccess: false`, because that is the only
 * place the claim is falsifiable: the guard under test is access control plus a hook, and both
 * are inert when the Local API is told to skip them. `tests/content/xp-aula-integracao.test.ts`
 * § 2 is the worked example, written for FR-027 — the same defect on the update verb one
 * collection over.
 *
 * The world is a sentinel organization of this file's own, torn down in `afterAll`:
 * `counters.test.ts` reconciles the WHOLE database, so a row left behind fails somebody else's
 * file (measured in 004 phase 6).
 */

const SLUG_SENTINELA = 't027-missao'
const HOST = `${SLUG_SENTINELA}.localhost`
const SENHA = 'fixture-password-123'

type Linha = { id: string | number }
type Documento = Record<string, unknown>

let payload: Payload
let tenant: string | number
/** The maker who submits nothing — and whose name §1 tries to submit under. */
let vitima: Linha
let perfilDaVitima: Linha
/** The maker who sends the request. */
let quemEnvia: Linha
let perfilDeQuemEnvia: Linha
let missao: Linha
let imagem: Linha

const pedido = (user: Linha) =>
  ({ headers: new Headers({ 'x-tenant-host': HOST }), user }) as never

const criar = async (collection: string, data: Documento): Promise<Linha> =>
  (await payload.create({
    collection: collection as never,
    data: { ...data, tenant } as never,
    // Setting up the world is not the thing under test: forcing the setup through the guarded
    // path would make a broken guard look like a broken fixture (fixtures.ts, verbatim).
    overrideAccess: true,
    req: pedido(quemEnvia),
  })) as unknown as Linha

const conta = async (sufixo: string): Promise<Linha> =>
  (await payload.create({
    collection: 'users',
    data: {
      email: `${SLUG_SENTINELA}-${sufixo}@example.com`,
      password: SENHA,
      role: 'user',
      // `as never`: `tenant` is `string | number` because a database need not use integers,
      // while the generated `User` narrows it to this database's own `number`.
      orgs: [{ organization: tenant, role: 'maker' }],
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
      email: { in: [`${SLUG_SENTINELA}-a@example.com`, `${SLUG_SENTINELA}-b@example.com`] },
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

  const organizacao = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab T027', slug: SLUG_SENTINELA, status: 'active' },
    overrideAccess: true,
  })
  tenant = organizacao.id

  quemEnvia = await conta('a')
  vitima = await conta('b')

  imagem = await criar('midiaImagem', {})
  perfilDeQuemEnvia = await criar('perfilMaker', {
    nome: 'Maker T027 A',
    handle: '@makert027a',
    usuario: quemEnvia.id,
  })
  perfilDaVitima = await criar('perfilMaker', {
    nome: 'Maker T027 B',
    handle: '@makert027b',
    usuario: vitima.id,
  })
  const skill = await criar('skill', {
    nome: 'Skill T027',
    slug: 'skill-t027',
    ativa: true,
  })
  missao = await criar('missao', {
    titulo: 'Missão T027',
    descricao: 'Missão de fixture T027.',
    icone: imagem.id,
    skill: skill.id,
    status: 'publicado',
  })
}, 120_000)

afterAll(limpar)

/** A relationship as a create returns it: populated by default, an id at `depth: 0`. */
const idDe = (ref: unknown): unknown =>
  ref !== null && typeof ref === 'object' ? (ref as { id?: unknown }).id : ref

/** One submission, sent through the guarded path as the account named. */
const enviar = async (maker: Linha, como: Linha): Promise<Documento> =>
  (await payload.create({
    collection: 'missaoSubmissao',
    data: {
      missao: missao.id,
      maker: maker.id,
      comprovante: imagem.id,
      status: 'enviada',
      // Named explicitly: the plugin resolves the assigned tenant from the request for a
      // guarded write, and a Local API call carries no cookie for it to read.
      tenant,
    } as never,
    overrideAccess: false,
    req: pedido(como),
  })) as unknown as Documento

describe('a submission is attributed to the requester, never to the name it carries (T027)', () => {
  it("refuses to submit under a lab-mate's profile", async () => {
    // The forgery: signed in as A, naming B. Both profiles are in the same lab, so `sameTenant`
    // is satisfied and lab-wide `create: scopedAccess()` permits the write — the only thing
    // that can refuse the ATTRIBUTION is the collection binding the field to the requester.
    const enviada = await enviar(perfilDaVitima, quemEnvia)

    expect(
      idDe(enviada.maker),
      'a signed-in maker filed a submission under a lab-mate\'s name. FR-021 makes the row the ' +
        'record of WHO submitted; with maker client-supplied on create, the forged row ' +
        'permanently occupies the victim\'s one-row-forever slot for this mission (FR-023), ' +
        'fills the review queue with work they did not do, and credits them on approval (FR-022)',
    ).toBe(perfilDeQuemEnvia.id)
  })

  it('still attributes an honest submission to the maker who sent it', async () => {
    // The positive control, and it is not decoration: a hook that refused *every* create, or
    // one that wrote a null, would satisfy the case above while making the feature unusable.
    // A different mission, because the pair is unique and the row above already exists.
    const outra = await criar('missao', {
      titulo: 'Missão T027 bis',
      descricao: 'Segunda missão de fixture T027.',
      icone: imagem.id,
      skill: (
        await payload.find({
          collection: 'skill',
          where: { tenant: { equals: tenant } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
      ).docs[0]?.id,
      status: 'publicado',
    })

    const enviada = (await payload.create({
      collection: 'missaoSubmissao',
      data: {
        missao: outra.id,
        maker: perfilDaVitima.id,
        comprovante: imagem.id,
        status: 'enviada',
        tenant,
      } as never,
      overrideAccess: false,
      req: pedido(vitima),
    })) as unknown as Documento

    expect(
      idDe(enviada.maker),
      'the maker who sent an honest submission was not the one recorded on it, so the ' +
        'attribution refuses the forgery by refusing everybody',
    ).toBe(perfilDaVitima.id)
  })
})
