import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'
import { getPublicScopedPayload } from '../../lib/tenancy/public-payload'

/**
 * **The consented fields must not cross the anonymous door on a populated relationship.**
 *
 * `select` bounds the columns of the collection being read. It says nothing about the rows Payload
 * fetches to POPULATE a relationship on it — and every public listing runs at `depth: 1`, because
 * an author's name and handle have to arrive as art rather than as an id.
 *
 * Measured before the fix, on this tree: an anonymous read of `artigo` returned the whole
 * `perfilMaker` row — `dataNascimento`, `vinculoUnesp`, `escolaridade`, `curso`, `usuario`,
 * `aceiteTermosEm`, `aceiteTermosVersao` — the consented fields of 004's signup step 2, through
 * `/artigos`, `/projetos`, `/aulas`, `/biblioteca-3d` and `evento.responsavel`.
 *
 * **It predated feature 006.** `perfilMaker.read` is `scopedAccess()`, which keeps the collection
 * off the REST surface, so it never reached a browser: it was fetched into the server's memory on
 * every anonymous page view and discarded unrendered. A data-minimisation failure, and one client
 * component away from a disclosure.
 *
 * `POPULACAO_PUBLICA` closes it at the door rather than at six call sites. This file is what stops
 * it reopening — by a seventh page, by a new field on `perfilMaker`, or by somebody removing the
 * `populate` because nothing appeared to need it.
 *
 * The fixture's maker carries **real values** in every one of those fields. A fixture that left
 * them null would pass on a row with nothing to leak, which is the failure this repository has
 * paid for seven times.
 */

const SLUG = 'populate-guard'
const HOST = `${SLUG}.localhost`
const SENHA = 'fixture-password-123'

/** Every consented field on `perfilMaker`, populated — the list the assertion is about. */
const PESSOAIS = [
  'dataNascimento',
  'vinculoUnesp',
  'escolaridade',
  'curso',
  'usuario',
  'aceiteTermosEm',
  'aceiteTermosVersao',
] as const

/** What an author strip actually renders, and therefore the whole of what may cross. */
const PUBLICOS = ['id', 'nome', 'handle', 'nivel', 'avatarRender'] as const

type Linha = { id: string | number }

let payload: Payload
let tenant: string | number
let usuario: Linha
let autorPopulado: Record<string, unknown>

const pedido = () => ({ headers: new Headers({ 'x-tenant-host': HOST }), user: usuario }) as never

const criar = async (collection: string, data: Record<string, unknown>): Promise<Linha> =>
  (await payload.create({
    collection: collection as never,
    data: { ...data, tenant } as never,
    overrideAccess: true,
    req: pedido(),
  })) as unknown as Linha

const paragrafo = {
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        textFormat: 0,
        children: [
          { type: 'text', text: 'Corpo.', format: 0, style: '', mode: 'normal', detail: 0, version: 1 },
        ],
      },
    ],
  },
}

const limpar = async () => {
  const { docs } = await payload.find({
    collection: 'organizations',
    where: { slug: { equals: SLUG } },
    depth: 0,
    limit: 5,
    overrideAccess: true,
  })
  for (const org of docs) {
    // Reverse dependency order: deleting forwards removes a row while its referrer still points
    // at it, and Postgres refuses on the foreign key (fixtures.ts § resetWorld).
    for (const collection of ['artigo', 'perfilMaker', 'categoriaArtigo', 'midiaImagem', 'regrasXp']) {
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
    data: {
      name: 'Lab populate',
      slug: SLUG,
      status: 'active',
      // Its own domain, so the anonymous door resolves without depending on the seeded host —
      // which the suite is documented to destroy (`scripts/lcp-budget.sh` § seeding).
      domains: [{ domain: HOST }],
    } as never,
    overrideAccess: true,
  })
  tenant = organizacao.id

  usuario = (await payload.create({
    collection: 'users',
    data: {
      email: `${SLUG}-a@example.test`,
      password: SENHA,
      role: 'user',
      orgs: [{ organization: tenant, role: 'maker' }],
    } as never,
    overrideAccess: true,
  })) as unknown as Linha

  const imagem = await criar('midiaImagem', {})
  const categoria = await criar('categoriaArtigo', { nome: 'Eixo', slug: 'eixo-pg', ordem: 1 })

  // **Every consented field populated.** Without this the assertions below pass on a row that had
  // nothing to disclose — the seventh occurrence of a guard written against its own fixture.
  const perfil = await criar('perfilMaker', {
    nome: 'Maker Guarda',
    handle: '@makerguarda',
    usuario: usuario.id,
    dataNascimento: '1999-03-04',
    vinculoUnesp: 'aluno',
    escolaridade: 'superior',
    curso: 'Engenharia de Controle e Automação',
  })

  const artigo = await criar('artigo', {
    titulo: 'Artigo da guarda',
    slug: 'artigo-pg',
    resumo: 'Resumo.',
    corpo: paragrafo,
    capa: imagem.id,
    categoria: categoria.id,
    autor: perfil.id,
  })
  await payload.update({
    collection: 'artigo',
    id: artigo.id,
    data: { status: 'publicado' } as never,
    overrideAccess: true,
    req: pedido(),
  })

  // The read a visitor with no account causes, exactly as every public listing issues it.
  const db = await getPublicScopedPayload(HOST)
  const { docs } = await db.find<{ autor?: unknown }>({ collection: 'artigo', depth: 1, limit: 1 })
  autorPopulado = (docs[0]?.autor ?? {}) as Record<string, unknown>
}, 120_000)

afterAll(limpar)

describe('a populated author never carries the consented fields (FR-030, CHK025)', () => {
  it('populated the author at all, so the assertions below are about a real row', () => {
    expect(
      Object.keys(autorPopulado),
      'the anonymous read returned no populated author, so every assertion below passes by ' +
        'inspecting an empty object — the read is at depth 1 and the fixture has an author',
    ).not.toEqual([])
    expect(autorPopulado.nome, 'the populated author is not the fixture maker').toBe('Maker Guarda')
  })

  it.each(PESSOAIS)('does not carry %s', (campo) => {
    expect(
      Object.prototype.hasOwnProperty.call(autorPopulado, campo),
      `\`${campo}\` crossed the anonymous door on a populated relationship. It is consented ` +
        'personal data from signup step 2 (004), and `select` does not bound a populated row — ' +
        'only `POPULACAO_PUBLICA` does. Every public listing runs at depth 1, so this reaches ' +
        '/artigos, /projetos, /aulas and /biblioteca-3d at once.',
    ).toBe(false)
  })

  it('carries exactly what an author strip renders, and nothing more', () => {
    expect(
      Object.keys(autorPopulado).sort(),
      'the populated author carries fields no byline renders. A field added to `perfilMaker` ' +
        'must be added to POPULACAO_PUBLICA deliberately, not arrive by being declared.',
    ).toEqual([...PUBLICOS].sort())
  })
})
