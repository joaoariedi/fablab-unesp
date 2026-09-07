import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { beforeAll, describe, expect, it, vi } from 'vitest'

// Next's own mapping from a thrown `notFound()` to an HTTP status, imported rather than
// re-derived. The digest is a string format (`NEXT_HTTP_ERROR_FALLBACK;404`) that this file
// could parse itself — and a parser of our own would be a second opinion about what the
// runtime does, green on the day the two disagree. Deep import because `next` publishes no
// `exports` map; it ships the `.d.ts` beside it, so this type-checks like any other module.
import {
  getAccessFallbackHTTPStatus,
  isHTTPAccessFallbackError,
} from 'next/dist/client/components/http-access-fallback/http-access-fallback.js'

import { buildWorld, type Fixture } from '../tenancy/fixtures'

/**
 * T014 / US10, SC-002, SC-007 — **the 404 that tells nothing**, against a real database.
 *
 * US10's error case: *"an unpublished or foreign slug is a 404, the same answer as an unknown
 * one — the detail route is a public read and inherits the deny-by-default path, so it must
 * not distinguish 'exists but is a draft' from 'does not exist'"*.
 *
 * ── Why this file exists beside `projeto-detalhe.test.ts` ───────────────────────────────────
 *
 * That file drives the same page against a **fake** client and proves the claim that lives in
 * the module: one slug query through the anonymous choke point, and no branch that could tell
 * a draft from a stranger. It says so itself, and names the gap it cannot close — a fake
 * returns `[]` because the test told it to, so it cannot show that the real read path returns
 * `[]` for a draft that genuinely exists, for another organization's row that genuinely
 * exists, and for a slug that does not.
 *
 * This file closes that gap the only way it can be closed: three rows really in Postgres, the
 * real tenancy client, the real published-only filter, the real `notFound()`. **Nothing is
 * stubbed except the host header** — `next/headers` throws outside a Next request scope
 * (feature 000, spike S8) and it is the page's sole input, exactly as `public-theme.test.ts`
 * argues for the same one-line mock.
 *
 * ── What stands in for "the same status and body" ───────────────────────────────────────────
 *
 * A visitor gets an HTTP response; this suite runs in-process, so a response is reconstructed
 * from the two things the page actually produces:
 *
 *   - **status** — from the error `notFound()` throws, through Next's own
 *     `getAccessFallbackHTTPStatus`. A page that returned normally is a 200.
 *   - **body** — for a rendered page, the real markup, via `renderToStaticMarkup`. For a 404,
 *     the serialised error: the page contributes **nothing else** downstream, so the error is
 *     the whole of the case-specific material the not-found response could ever be built from.
 *     A future "helpful" 404 that attached the reason — a message, an extra property, a
 *     distinct digest — would land in that serialisation and separate the three answers, which
 *     is precisely the regression this file is here to catch.
 *
 * The reference answer is the **unknown slug**: the one case that leaks nothing by
 * construction, because there is no document behind it. Every other case must be byte-identical
 * to it. Stated that way round, the assertion cannot be satisfied by all four answers drifting
 * together into something that mentions a draft.
 *
 * §2 is the non-vacuity half, and it is not optional. A page that 404-ed *everything* — a
 * broken host mock, an empty database, a fixture that never seeded — would satisfy every
 * assertion in §1 while proving nothing at all.
 */

/** The mocked request. Mutated per call by {@link pedir}, read at call time by the mock. */
const request = vi.hoisted(() => ({ host: '' }))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: request.host }),
}))

const { default: ProjetoDetalhe } = await import('../../app/(frontend)/projetos/[slug]/page')

/** Every slug this file asks for. The three the task names, plus `em_revisao` — the second
 *  review state, which US10 covers under "unpublished" and which a status filter written as
 *  `!== 'rascunho'` would serve. */
const SLUG = {
  publicado: 't014-publicado',
  rascunho: 't014-rascunho',
  emRevisao: 't014-em-revisao',
  outraOrg: 't014-outra-organizacao',
  inexistente: 't014-nunca-existiu',
} as const

/** The titles the seeds carry, so §1 can assert no fragment of one reached a 404 body. */
const TITULO = (slug: string, marker: Marker): string => `Projeto ${slug} (${marker})`

type Marker = 'A' | 'B'
type Status = 'rascunho' | 'em_revisao' | 'publicado'

let world: Fixture

/**
 * One project, seeded straight through the Local API.
 *
 * `overrideAccess: true` for the reason `fixtures.ts` gives — building the world is not the
 * subject, and it also side-steps `canPublishField`, which is another task's subject and would
 * otherwise fail this suite for someone else's reason. The category and the cover come from
 * the row seeded into the **same** organization, because `sameTenant` refuses anything else.
 */
async function seedProjeto(marker: Marker, slug: string, status: Status): Promise<string> {
  const org = marker === 'A' ? world.orgA : world.orgB
  const categoria = world.rows.categoriaProjeto?.[marker]
  if (!categoria) {
    throw new Error(
      'fixtures seeded no `categoriaProjeto` row — this suite cannot create a project ' +
        'without a category from the same tenant',
    )
  }
  const created = await world.payload.create({
    collection: 'projeto',
    overrideAccess: true,
    data: {
      titulo: TITULO(slug, marker),
      slug,
      descricaoCurta: `Conteúdo de ${marker} para o T014.`,
      imagemCapa: world.rows.midiaImagem?.[marker],
      categoria,
      tenant: org.id,
      downloads: 0,
      curtidas: 0,
      status,
    } as never,
  })
  return String((created as { id: string | number }).id)
}

/** A response as a visitor would receive it: a status, and the bytes underneath it. */
type Resposta = { readonly status: number; readonly body: string }

/**
 * Everything a 404 carries out of this page.
 *
 * `message` and `name` are non-enumerable on an `Error`, so they are named; the spread picks
 * up every own enumerable property — `digest` today, and anything a later change attaches.
 */
const corpoDoErro = (erro: unknown): string => {
  const { name, message } = erro as Error
  return JSON.stringify({ name, message, propriedades: { ...(erro as object) } })
}

/**
 * One request for `slug` on `host`, reduced to `{ status, body }`.
 *
 * `notFound()` is the real one: it throws, and the throw *is* the response, which is why the
 * page is called without any error handling of this file's own beyond recognising it.
 */
async function pedir(host: string, slug: string): Promise<Resposta> {
  request.host = host
  try {
    const tree = await ProjetoDetalhe({ params: Promise.resolve({ slug }) })
    return { status: 200, body: renderToStaticMarkup(tree as ReactElement) }
  } catch (erro) {
    // Anything that is not a `notFound()` is rethrown: an outage dressed as a 404 is the very
    // confusion the page's own docstring refuses to make, and this harness must not make it
    // either — a database that fell over would otherwise read as "the 404 tells nothing".
    if (!isHTTPAccessFallbackError(erro)) throw erro
    return { status: getAccessFallbackHTTPStatus(erro), body: corpoDoErro(erro) }
  }
}

beforeAll(async () => {
  world = await buildWorld()
  await seedProjeto('A', SLUG.publicado, 'publicado')
  await seedProjeto('A', SLUG.rascunho, 'rascunho')
  await seedProjeto('A', SLUG.emRevisao, 'em_revisao')
  await seedProjeto('B', SLUG.outraOrg, 'publicado')
  // The same slug in **both** organizations, so §2's "A's host serves A's project" cannot pass
  // by luck: with only one row in the world, a dropped tenant constraint would still return the
  // right document.
  await seedProjeto('B', SLUG.publicado, 'publicado')
}, 180_000)

describe('§1 — a draft, a stranger and a stranger to everyone get one answer (US10, SC-002, SC-007)', () => {
  /** Ordered so the reference — the slug with no document at all — is computed first. */
  const CASOS: readonly (readonly [string, string])[] = [
    ['um slug que não existe em organização nenhuma', SLUG.inexistente],
    ['um rascunho desta organização', SLUG.rascunho],
    ['um documento em revisão desta organização', SLUG.emRevisao],
    ['um projeto publicado de outra organização', SLUG.outraOrg],
  ]

  let respostas: { caso: string; resposta: Resposta }[]

  beforeAll(async () => {
    respostas = []
    for (const [caso, slug] of CASOS) {
      respostas.push({ caso, resposta: await pedir(world.orgA.host, slug) })
    }
  }, 60_000)

  it('answers 404 to every one of them', () => {
    // A vacuous pass has a shape here: an empty list satisfies every loop below it.
    expect(respostas, 'the requests were never made').toHaveLength(CASOS.length)
    for (const { caso, resposta } of respostas) {
      expect(resposta.status, `${caso} did not come back as a 404`).toBe(404)
    }
  })

  it('answers all of them with the body of the slug that never existed', () => {
    const referencia = respostas[0]?.resposta
    for (const { caso, resposta } of respostas.slice(1)) {
      expect(
        resposta,
        `${caso} produced a different response than an unknown slug — the 404 tells a visitor ` +
          `which of the two it was, which is what US10 forbids`,
      ).toEqual(referencia)
    }
  })

  it('says nothing about the documents behind the three that exist', () => {
    // The vocabulary a leak would be made of: the slugs asked for, the titles of the rows that
    // really are in the database, and the review states themselves. None of it may travel.
    const proibido = [
      SLUG.rascunho,
      SLUG.emRevisao,
      SLUG.outraOrg,
      TITULO(SLUG.rascunho, 'A'),
      TITULO(SLUG.emRevisao, 'A'),
      TITULO(SLUG.outraOrg, 'B'),
      'rascunho',
      'em_revisao',
      'publicado',
      world.orgB.id,
    ]
    for (const { caso, resposta } of respostas) {
      for (const termo of proibido) {
        expect(resposta.body, `the 404 for ${caso} carries "${termo}"`).not.toContain(termo)
      }
    }
  })
})

describe('§2 — the instrument can tell a served page from a 404', () => {
  it('serves this host its own published project, in full', async () => {
    const resposta = await pedir(world.orgA.host, SLUG.publicado)

    // Without this, every assertion in §1 would also hold for a harness that 404s everything —
    // a broken host mock, an empty database, a fixture that never ran. It is also the exact
    // shape a leak would take: a draft served is a 200 with a title in it, so a comparison that
    // separates this response from a 404 is a comparison that would have caught one.
    expect(resposta.status, 'the published project on its own host did not render').toBe(200)
    expect(resposta.body).toContain(TITULO(SLUG.publicado, 'A'))
    expect(resposta.body, "organization B publishes the same slug and its project was served").not.toContain(
      TITULO(SLUG.publicado, 'B'),
    )
  })

  it('serves the other organization its own project on its own host', async () => {
    const resposta = await pedir(world.orgB.host, SLUG.outraOrg)

    // The foreign 404 in §1 has to be about the *host*, not about a row that was never created
    // or is unreadable for some unrelated reason. This is the same document, from the vantage
    // point where it is legitimately public.
    expect(
      resposta.status,
      "organization B's own published project 404s on B's own host — §1's cross-tenant case " +
        'proves nothing, because the document is unreadable everywhere',
    ).toBe(200)
    expect(resposta.body).toContain(TITULO(SLUG.outraOrg, 'B'))
  })

  it('has the two unpublished rows really sitting in the database', async () => {
    const { docs } = await world.payload.find({
      collection: 'projeto',
      where: { slug: { in: [SLUG.rascunho, SLUG.emRevisao] } },
      overrideAccess: true,
      depth: 0,
    })

    // "Not found" must mean "the read path refused it", never "nobody ever created it".
    expect(
      docs.map((doc) => (doc as { status?: unknown }).status).sort(),
      'the unpublished fixtures are missing, so §1 asserted 404s over documents that do not exist',
    ).toEqual(['em_revisao', 'rascunho'])
  })

  it('gives a rendered page and a 404 visibly different bodies', async () => {
    const servido = await pedir(world.orgA.host, SLUG.publicado)
    const negado = await pedir(world.orgA.host, SLUG.inexistente)

    expect(servido.body).not.toBe(negado.body)
    expect(servido.status).not.toBe(negado.status)
  })
})
