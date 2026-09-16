import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ORDENACAO_DO_RANKING } from '../../app/(frontend)/ranking/page'
import config from '../../payload.config'

/**
 * T043 / FR-013, SC-013 — **the ranking's order, asked of the database rather than of a fake.**
 *
 * `ranking-page.test.ts` proves the board renders what it is handed, and its `FakeLabClient`
 * sorts by splitting the declared string on commas. That is the page's *intent*; it is not what
 * the stack does. Payload's **local** API — the one an RSC reaches through the choke point —
 * calls `sanitizeSortQuery`, which does not split on `,`; the only function in payload that does
 * (`sanitizeSortParams`) is wired into the REST layer alone. `@payloadcms/drizzle`'s
 * `buildOrderBy` then wraps a string in an array WITHOUT splitting it, fails to resolve a column
 * called `xpTotal,handle`, and swallows the failure in a bare `catch (_) { // continue }` —
 * leaving the unconditional `-createdAt` fallback it pushed before the loop.
 *
 * So a comma-joined sort does not order by XP at all: it orders by **newest profile first**, and
 * the determinism SC-013 asks for is an accident of `createdAt` rather than the declared
 * tie-break. A unit fake cannot see that, because the fake is where the comma split lives.
 *
 * This file asks the real client, on a real Postgres, with a fixture whose creation order is
 * deliberately the REVERSE of its XP order — so a run that falls back to `-createdAt` returns
 * the exact opposite of the right answer rather than something that might pass by luck.
 */

const SLUG = 't043-ranking'
const HOST = `${SLUG}.localhost`
const SENHA = 'fixture-password-123'

type Linha = { id: string | number }
type Documento = Record<string, unknown>

let payload: Payload
let tenant: string | number
let equipe: Linha

/**
 * **Created oldest-first in the ranking's own order, which is what makes the fixture bite.**
 *
 * The fallback `buildOrderBy` pushes when a sort resolves to no column is `-createdAt` — newest
 * first — so a fixture created in the reverse of the ranking would have the broken sort return
 * the RIGHT answer by coincidence. I wrote it that way first and the case passed against the
 * defect. Created in this order, `-createdAt` returns `[ivo, ana, zoe]`: the exact opposite.
 *
 * The two on 5 XP are what makes the tie-break observable, and their creation order is the
 * opposite of their alphabetical one for the same reason.
 */
const ELENCO = [
  { handle: '@zoet043', nome: 'Zoe', xpTotal: 9, nivel: 1 },
  { handle: '@anat043', nome: 'Ana', xpTotal: 5, nivel: 1 },
  { handle: '@ivot043', nome: 'Ivo', xpTotal: 5, nivel: 1 },
]

/** What FR-013 asks for: XP descending, then handle ascending among equals. */
const ESPERADO = ['@zoet043', '@anat043', '@ivot043']

const pedido = () => ({ headers: new Headers({ 'x-tenant-host': HOST }), user: equipe }) as never

const criar = async (collection: string, data: Documento): Promise<Linha> =>
  (await payload.create({
    collection: collection as never,
    data: { ...data, tenant } as never,
    overrideAccess: true,
    req: pedido(),
  })) as unknown as Linha

const limpar = async () => {
  const { docs } = await payload.find({
    collection: 'organizations',
    where: { slug: { equals: SLUG } },
    depth: 0,
    limit: 10,
    overrideAccess: true,
  })
  for (const org of docs) {
    for (const collection of ['perfilMaker', 'regrasXp']) {
      await payload.delete({
        collection: collection as never,
        where: { tenant: { equals: org.id } } as never,
        overrideAccess: true,
      })
    }
  }
  await payload.delete({
    collection: 'users',
    where: { email: { like: `${SLUG}-%` } },
    overrideAccess: true,
  })
  for (const org of docs) {
    await payload.delete({ collection: 'organizations', id: org.id, overrideAccess: true })
  }
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await limpar()

  const organizacao = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab T043', slug: SLUG, status: 'active' },
    overrideAccess: true,
  })
  tenant = organizacao.id

  equipe = (await payload.create({
    collection: 'users',
    data: {
      email: `${SLUG}-equipe@example.com`,
      password: SENHA,
      role: 'user',
      // `as never`: `tenant` is `string | number` because a database need not use integers,
      // while the generated `User` narrows it to this database's own `number`.
      orgs: [{ organization: tenant, role: 'admin' }],
    } as never,
    overrideAccess: true,
  })) as unknown as Linha

  for (const membro of ELENCO) {
    const usuario = (await payload.create({
      collection: 'users',
      data: {
        email: `${SLUG}-${membro.handle.slice(1)}@example.com`,
        password: SENHA,
        role: 'user',
        orgs: [{ organization: tenant, role: 'maker' }],
      } as never,
      overrideAccess: true,
    })) as unknown as Linha
    await criar('perfilMaker', { ...membro, usuario: usuario.id })
  }
}, 120_000)

afterAll(limpar)

/** The read the page performs, through the same Payload the page's client reaches. */
const rankear = async (sort: unknown): Promise<string[]> => {
  const { docs } = await payload.find({
    collection: 'perfilMaker',
    where: { tenant: { equals: tenant } },
    sort: sort as never,
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return (docs as unknown as Documento[]).map((linha) => String(linha.handle))
}

describe('the ranking is ordered by the database, not by the fake (T043, FR-013, SC-013)', () => {
  it('the fixture is non-trivial: the -createdAt fallback is the WRONG answer', async () => {
    // The guard that makes every case below mean something. `buildOrderBy` pushes `-createdAt`
    // unconditionally before it resolves anything, so a sort naming no column leaves exactly
    // this order — and a fixture where the two agreed would pass against the defect.
    expect(
      await rankear('-createdAt'),
      'the fallback order IS the ranking order for this fixture, so a sort that resolved to no ' +
        'column at all would return the right answer by accident and the cases below would ' +
        'prove nothing',
    ).not.toEqual(ESPERADO)
  })

  it('orders by XP descending, with the handle breaking every tie', async () => {
    expect(
      await rankear(ORDENACAO_DO_RANKING),
      'the declared ranking order did not order by XP. A comma-joined string is not a ' +
        'multi-key sort on the LOCAL api: sanitizeSortQuery does not split it, drizzle wraps ' +
        'it whole, fails to resolve a column of that name, swallows the failure in a bare ' +
        'catch, and leaves the -createdAt fallback it pushed before the loop. The board then ' +
        'lists the newest profile first and FR-013 is met in no part at all',
    ).toEqual(ESPERADO)
  })

  it('the tie-break is what orders the two makers on equal XP', async () => {
    // Not a restatement of the case above: it is the half a single `-xpTotal` would also pass,
    // and SC-013 is about exactly this pair being stable rather than in whatever order Postgres
    // happens to return.
    const posicoes = await rankear(ORDENACAO_DO_RANKING)
    expect(
      posicoes.indexOf('@anat043'),
      'two makers on the same XP came back in an order the declared sort does not fix',
    ).toBeLessThan(posicoes.indexOf('@ivot043'))
  })
})
