import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'
import { stampApproval } from '../../lib/content/review'

/**
 * T033 / SC-004, SC-005 — the review queue driven through **real rows**, not through the
 * decision function.
 *
 * `stamp-approval.test.ts` proves the rule (`publicado → rascunho → publicado` yields one
 * record) against the pure hook, and `projeto-status-access.test.ts` proves the field guard is
 * wired and refuses the publish hop. Both are config-and-function tests, and both stay green on
 * a collection that never runs either one: a hook that is written but not registered decides
 * nothing, and a stamp that no field stores is discarded on the way to the database. That gap
 * is precisely what SC-004 and SC-005 are worded to close — "yields one approval record" is a
 * claim about a row, so it is asserted here against a row.
 *
 * ## What this file adds over the two unit files
 *
 *   - the hook is **registered** on the collection, so an update actually runs it
 *   - the stamp is **persisted**: `aprovacaoRegistrada` and `aprovadoEm` are declared fields, so
 *     what the hook returns survives the write and can be read back by feature 005 (CLR-001)
 *   - the maker's refusal is asserted on the **stored document**, because Payload's field
 *     access does not throw — `beforeValidate/promise.js:217-229` deletes the denied field from
 *     the incoming data and falls back to the stored value. A test that expected a rejection
 *     would pass on a collection with no guard at all, since neither raises.
 *
 * Every read-back is a fresh `findByID`, never the value the write returned: the point is what
 * the database holds after the operation, and an in-memory result can agree with a hook whose
 * output was dropped at the schema.
 */

const ORG_SLUG = 'fila-de-revisao'
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

type Doc = Record<string, unknown>

let payload: Payload
let seeded: { org: number; categoria: number; maker: Doc; staff: Doc }
const createdProjetos: number[] = []

/** A signed-in member of this lab, as the Local API receives one from a session. */
const member = async (email: string, role: 'maker' | 'staff', org: number): Promise<Doc> => {
  const user = await payload.create({
    collection: 'users',
    data: {
      email,
      password: 'fila-de-revisao-123',
      role: 'user',
      orgs: [{ organization: org, role }],
    },
    overrideAccess: true,
  })
  return { ...user, collection: 'users' } as Doc
}

/**
 * A draft to run through the queue. Created with `overrideAccess: true` for the reason
 * `fixtures.ts` states: setting up the world is not the thing under test, and a broken guard
 * would otherwise look like a broken fixture.
 */
const draft = async (slug: string): Promise<number> => {
  const doc = await payload.create({
    collection: 'projeto',
    data: {
      titulo: 'Prensa de bancada',
      slug,
      descricaoCurta: 'Uma prensa feita no lab.',
      // Required (obrigatório in projetos.md): a storage key, generated, never a filename.
      imagemCapa: 'media/image/00000000-0000-4000-8000-000000000001.png',
      downloads: 0,
      categoria: seeded.categoria,
      tenant: seeded.org,
      // Required on the collection, and its absence is not a lint-level detail: Payload types
      // `create` as a union, so a `data` missing any required field stops matching the full
      // create and falls through to the draft branch, which demands `draft: true`. The
      // typecheck error names `draft`, never `curtidas`.
      curtidas: 0,
      status: 'rascunho',
    },
    overrideAccess: true,
  })
  createdProjetos.push(doc.id as number)
  return doc.id as number
}

/** One write as a real user, through collection access and field access. */
const writeAs = async (user: Doc, id: number, data: Doc): Promise<void> => {
  await payload.update({
    collection: 'projeto',
    id,
    data: data as never,
    depth: 0,
    overrideAccess: false,
    user: user as never,
  })
}

/** What the database holds — never the value an operation returned. */
const stored = async (id: number): Promise<Doc> =>
  (await payload.findByID({
    collection: 'projeto',
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Doc

beforeAll(async () => {
  payload = await getPayload({ config: configPromise })

  // Re-runnable: a run interrupted before cleanup must not fail the next one on a unique slug.
  await payload.delete({
    collection: 'projeto',
    where: { slug: { contains: ORG_SLUG } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'users',
    where: { email: { contains: '@fila-de-revisao.example' } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'categoriaProjeto',
    where: { slug: { equals: `categoria-${ORG_SLUG}` } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'organizations',
    where: { slug: { equals: ORG_SLUG } },
    overrideAccess: true,
  })

  const org = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab da Fila de Revisão', slug: ORG_SLUG, status: 'active' },
    overrideAccess: true,
  })
  const categoria = await payload.create({
    collection: 'categoriaProjeto',
    data: { nome: 'Marcenaria', slug: `categoria-${ORG_SLUG}`, tenant: org.id },
    overrideAccess: true,
  })

  seeded = {
    org: org.id as number,
    categoria: categoria.id as number,
    maker: await member(`maker@fila-de-revisao.example`, 'maker', org.id as number),
    staff: await member(`staff@fila-de-revisao.example`, 'staff', org.id as number),
  }
}, 120_000)

afterAll(async () => {
  if (!payload || !seeded) return
  for (const id of createdProjetos) {
    await payload.delete({ collection: 'projeto', id, overrideAccess: true })
  }
  await payload.delete({
    collection: 'users',
    where: { email: { contains: '@fila-de-revisao.example' } },
    overrideAccess: true,
  })
  await payload.delete({ collection: 'categoriaProjeto', id: seeded.categoria, overrideAccess: true })
  await payload.delete({ collection: 'organizations', id: seeded.org, overrideAccess: true })
})

describe('the approval stamp reaches the database at all (T033, FR-009)', () => {
  it('registers stampApproval as a beforeChange hook on projeto', async () => {
    const config = await configPromise
    const projeto = config.collections.find((c) => c.slug === 'projeto')

    expect(
      projeto?.hooks?.beforeChange ?? [],
      'projeto does not run stampApproval: the hook decides correctly and is never called, ' +
        'so every publication is unrecorded and feature 005 has nothing to credit (CLR-001)',
    ).toContain(stampApproval)
  })

  it.each(['aprovacaoRegistrada', 'aprovadoEm'])('stores %s as a field', async (name) => {
    const config = await configPromise
    const projeto = config.collections.find((c) => c.slug === 'projeto')
    const names = (projeto?.flattenedFields ?? []).map((f) => (f as { name?: string }).name)

    expect(
      names,
      `projeto declares no "${name}", so what the hook returns is dropped on the way to the ` +
        'database and the record SC-004 counts does not exist',
    ).toContain(name)
  })
})

describe('SC-004: publishing credits approval exactly once', () => {
  it('stamps the first publication by the team', async () => {
    const id = await draft(`prensa-primeira-${ORG_SLUG}`)

    await writeAs(seeded.staff, id, { status: 'publicado' })
    const doc = await stored(id)

    expect(doc.status).toBe('publicado')
    expect(doc.aprovacaoRegistrada).toBe(true)
    expect(String(doc.aprovadoEm)).toMatch(ISO_8601)
    expect(Math.abs(Date.parse(String(doc.aprovadoEm)) - Date.now())).toBeLessThan(60_000)
  })

  it('publicado → rascunho → publicado leaves the one record it started with', async () => {
    const id = await draft(`prensa-republicada-${ORG_SLUG}`)

    await writeAs(seeded.staff, id, { status: 'publicado' })
    const first = await stored(id)
    // Non-vacuity: the comparison below means nothing if nothing was stamped in the first
    // place — two `undefined`s are equal, and the assertion would pass on an unwired hook.
    expect(String(first.aprovadoEm)).toMatch(ISO_8601)

    await writeAs(seeded.staff, id, { status: 'rascunho' })
    const unpublished = await stored(id)
    expect(unpublished.status).toBe('rascunho')
    expect(
      unpublished.aprovacaoRegistrada,
      'the unpublish cleared the stamp, so the republish below is a first approval again',
    ).toBe(true)

    await writeAs(seeded.staff, id, { status: 'publicado' })
    const republished = await stored(id)

    expect(republished.status).toBe('publicado')
    expect(republished.aprovacaoRegistrada).toBe(true)
    expect(
      republished.aprovadoEm,
      're-dated on the republish: feature 005 reads this pair to decide whether a document ' +
        'has already been credited, and a moved date is a second approval record',
    ).toBe(first.aprovadoEm)
  })

  it('refuses a request body that asks to clear the stamp on the way out of publicado', async () => {
    const id = await draft(`prensa-hostil-${ORG_SLUG}`)

    await writeAs(seeded.staff, id, { status: 'publicado' })
    const first = await stored(id)
    expect(String(first.aprovadoEm)).toMatch(ISO_8601)

    // The whole document is sent back on an unpublish from the admin, so the cleared pair is
    // not exotic — and were it honoured, the next publish would find nothing and credit twice.
    await writeAs(seeded.staff, id, {
      status: 'rascunho',
      aprovacaoRegistrada: false,
      aprovadoEm: null,
    })
    await writeAs(seeded.staff, id, { status: 'publicado' })
    const doc = await stored(id)

    expect(doc.aprovacaoRegistrada).toBe(true)
    expect(doc.aprovadoEm).toBe(first.aprovadoEm)
  })
})

describe('SC-005: a maker cannot publish', () => {
  it('lets the maker submit for review, so the queue it guards is reachable', async () => {
    // The pair to the refusal below: a collection that simply refused every status write
    // would pass that test while making FR-008's middle state unwritable by the only role
    // that fills it.
    const id = await draft(`prensa-submetida-${ORG_SLUG}`)

    await writeAs(seeded.maker, id, { status: 'em_revisao' })

    expect((await stored(id)).status).toBe('em_revisao')
  })

  it('refuses the hop to publicado, leaving the document in the queue and unstamped', async () => {
    const id = await draft(`prensa-recusada-${ORG_SLUG}`)
    await writeAs(seeded.maker, id, { status: 'em_revisao' })

    await writeAs(seeded.maker, id, { status: 'publicado' })
    const doc = await stored(id)

    expect(
      doc.status,
      'a maker published their own project: the review queue is decoration (SC-005)',
    ).toBe('em_revisao')
    expect(
      doc.aprovacaoRegistrada,
      'nothing was approved, yet an approval record exists — feature 005 would credit it',
    ).toBeFalsy()
    expect(doc.aprovadoEm ?? null).toBeNull()
  })

  it('refuses a project posted already published, where there is no update to guard', async () => {
    const created = await payload.create({
      collection: 'projeto',
      data: {
        titulo: 'Prensa recém-criada',
        slug: `prensa-criada-${ORG_SLUG}`,
        descricaoCurta: 'Criada já publicada.',
        // Required (obrigatório in projetos.md): a storage key, generated, never a filename.
        imagemCapa: 'media/image/00000000-0000-4000-8000-000000000001.png',
        downloads: 0,
        categoria: seeded.categoria,
        tenant: seeded.org,
        status: 'publicado',
      } as never,
      depth: 0,
      overrideAccess: false,
      user: seeded.maker as never,
    })
    createdProjetos.push(created.id as number)
    const doc = await stored(created.id as number)

    expect(
      doc.status,
      'a maker posted a published project: the guard watches updates only, and POST is the ' +
        'shorter way round it',
    ).not.toBe('publicado')
    expect(doc.aprovacaoRegistrada).toBeFalsy()
  })
})

describe('the approval stamp cannot be written by a request (SC-004, SC-005)', () => {
  /**
   * The hole this block closes: `aprovacaoRegistrada` and `aprovadoEm` carried only
   * `admin: { readOnly: true }`, which is admin-UI cosmetics and stops nothing coming through
   * the API. `canPublishField` correctly refuses a maker `status: 'publicado'` — and left the
   * two fields that actually carry the credit wide open beside it.
   *
   * Measured before the fix: a maker POSTing `aprovacaoRegistrada: true` on a `rascunho` had it
   * persisted, `stampApproval` returned `data` untouched on that path because nothing was
   * entering `publicado`, and the "never cleared" rule then preserved the forgery — so the
   * team's genuine publication was never dated. Per CLR-001 that pair is exactly what feature
   * 005 reads to credit XP, so SC-005 was fenced around through the back door.
   */
  it('refuses a maker forging the stamp on a draft they create', async () => {
    const created = await payload.create({
      collection: 'projeto',
      data: {
        titulo: 'Prensa forjada',
        slug: 'prensa-forjada',
        descricaoCurta: 'Um rascunho que se autodeclara aprovado.',
        // Required (obrigatório in projetos.md): a storage key, generated, never a filename.
        imagemCapa: 'media/image/00000000-0000-4000-8000-000000000001.png',
        downloads: 0,
        categoria: seeded.categoria,
        tenant: seeded.org,
        curtidas: 0,
        status: 'rascunho',
        aprovacaoRegistrada: true,
        aprovadoEm: '2001-01-01T00:00:00.000Z',
      } as never,
      overrideAccess: false,
      user: seeded.maker as never,
    })
    createdProjetos.push(created.id as number)
    const doc = await stored(created.id as number)

    expect(
      doc.aprovacaoRegistrada,
      'a maker wrote their own approval record on a draft. That pair is what feature 005 ' +
        'credits XP from, so this is SC-005 bypassed through the field that carries the credit.',
    ).toBeFalsy()
    expect(doc.aprovadoEm, 'a forged approval date persisted').toBeFalsy()
  })

  it('refuses a maker forging the stamp on an update', async () => {
    // The create path and the update path are separate access decisions in Payload, and the
    // original defect was reachable through both.
    const id = await draft('prensa-forjada-update')
    await payload.update({
      collection: 'projeto',
      id,
      data: { aprovacaoRegistrada: true, aprovadoEm: '2001-01-01T00:00:00.000Z' } as never,
      overrideAccess: false,
      user: seeded.maker as never,
    })

    const doc = await stored(id)
    expect(doc.aprovacaoRegistrada, 'a maker stamped an existing draft').toBeFalsy()
    expect(doc.aprovadoEm).toBeFalsy()
  })

  it('still lets the team publish, so the guard did not seal the queue shut', async () => {
    // Non-vacuity. Both refusals above would also pass on a collection where the stamp can
    // never be written by anyone — including by the hook — which would break SC-004 instead.
    const id = await draft('prensa-publicada-de-verdade')
    await payload.update({
      collection: 'projeto',
      id,
      data: { status: 'publicado' } as never,
      overrideAccess: false,
      user: seeded.staff as never,
    })

    const doc = await stored(id)
    expect(doc.status).toBe('publicado')
    expect(
      doc.aprovacaoRegistrada,
      'the team published and no approval was recorded — the field access locked out the hook ' +
        'as well as the request, which breaks SC-004',
    ).toBe(true)
    expect(String(doc.aprovadoEm)).toMatch(ISO_8601)
  })
})
