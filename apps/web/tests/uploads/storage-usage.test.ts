import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_STORAGE_QUOTA_MB } from '../../collections/Organizations'
import { MEDIA_SLUGS } from '../../collections/Media'
import { bytesOf, type MediaDoc } from '../../lib/content/storage-usage'
import { MEGABYTE } from '../../lib/uploads/limits'
import { FakeBucket, bootWithFakeBucket, pngDe } from './fake-bucket'

/**
 * T006 / FR-028, FR-029, FR-030, CLR-006, SC-015b, SC-017 — the used-storage figure, maintained by
 * a delta on every upload, change and deletion, measured against a real Postgres with real
 * derivative files.
 *
 * Every figure is compared in WHOLE BYTES (`usedMb × MEGABYTE`, rounded), never in fractional MB,
 * so "exactly" means exactly (checklist CHK013).
 *
 * §2 is the case `syncCounter`'s `sum` could not express, and the one a flat-key fake would pass:
 * a raster upload must move the figure by MORE than its own file, because Payload generated
 * smaller sizes beside it and stored them in a nested `sizes` object (plan § D4).
 */

const BUCKET = 'fablab-test-t006'
const SLUG = MEDIA_SLUGS.image
const ORGS = ['t006-org-x', 't006-org-y'] as const

const bucket = new FakeBucket(BUCKET)
let payload: Payload
let orgX: string | number
let orgY: string | number

const bytesUsados = async (org: string | number): Promise<number> => {
  const doc = (await payload.findByID({ collection: 'organizations', id: org, depth: 0, overrideAccess: true })) as {
    storageUsedMb?: number | null
  }
  return Math.round(Number(doc.storageUsedMb ?? 0) * MEGABYTE)
}

const subir = async (org: string | number, nome: string, largura = 1600, altura = 900): Promise<MediaDoc & { id: string | number }> => {
  const data = await pngDe(largura, altura)
  return (await payload.create({
    collection: SLUG as never,
    data: { tenant: org } as never,
    file: { data, mimetype: 'image/png', name: `t006-${nome}.png`, size: data.length },
    overrideAccess: true,
  })) as unknown as MediaDoc & { id: string | number }
}

const limpar = async () => {
  await payload.delete({ collection: SLUG as never, where: { filename: { like: 't006-' } } as never, overrideAccess: true })
  for (const slug of ORGS) {
    await payload.delete({ collection: 'organizations', where: { slug: { equals: slug } }, overrideAccess: true })
  }
}

beforeAll(async () => {
  payload = await bootWithFakeBucket(bucket, 'storage-usage-t006')
  await limpar()
  const criar = async (slug: string) =>
    (
      await payload.create({
        collection: 'organizations',
        data: { name: slug, slug, status: 'active', storageQuotaMb: DEFAULT_STORAGE_QUOTA_MB },
        overrideAccess: true,
      })
    ).id
  orgX = await criar(ORGS[0])
  orgY = await criar(ORGS[1])
}, 180_000)

afterAll(async () => {
  bucket.recusarPuts = false
  if (payload) await limpar()
  await bucket.close()
})

describe('§1 — bytesOf: the original and every generated size (CLR-006)', () => {
  it('counts the original alone when nothing was generated', () => {
    expect(bytesOf({ filesize: 2_000_000 })).toBe(2_000_000)
  })

  it('adds every NESTED size — the read a flat-key sum cannot make', () => {
    expect(bytesOf({ filesize: 2_000_000, sizes: { miniatura: { filesize: 12_000 }, card: { filesize: 90_000 } } })).toBe(
      2_102_000,
    )
  })

  it('ignores a size Payload did not generate, and a document that is not there', () => {
    expect(bytesOf({ filesize: 500, sizes: { miniatura: null, card: { filesize: null } } })).toBe(500)
    expect(bytesOf(null)).toBe(0)
  })
})

describe('§2 — an upload moves the figure by what it occupies (FR-028, FR-029, SC-015b)', () => {
  it('charges a raster upload MORE than its own file — the derivatives are counted', async () => {
    const antes = await bytesUsados(orgX)
    const doc = await subir(orgX, 'raster')

    const ocupado = bytesOf(doc)
    expect(Object.keys(doc.sizes ?? {}).length, 'Payload generated no derivatives — the case is vacuous').toBeGreaterThan(0)
    expect(ocupado, 'the derivatives added nothing').toBeGreaterThan(doc.filesize ?? 0)
    expect(await bytesUsados(orgX)).toBe(antes + ocupado)
  })

  it('moves nothing at the neighbouring organization', async () => {
    const vizinhoAntes = await bytesUsados(orgY)
    await subir(orgX, 'nao-move-vizinho')
    expect(await bytesUsados(orgY)).toBe(vizinhoAntes)
  })
})

describe('§3 — replacing and deleting (FR-030, SC-017, checklist CHK004)', () => {
  it('replacing the file moves the figure by the difference, derivatives regenerated', async () => {
    const original = await subir(orgX, 'substituida')
    const comOriginal = await bytesUsados(orgX)

    const novo = await pngDe(400, 300)
    const trocado = (await payload.update({
      collection: SLUG as never,
      id: original.id,
      data: {} as never,
      file: { data: novo, mimetype: 'image/png', name: 't006-substituida-nova.png', size: novo.length },
      overrideAccess: true,
    })) as unknown as MediaDoc

    expect(bytesOf(trocado), 'the replacement occupies the same bytes — the case cannot tell').not.toBe(bytesOf(original))
    expect(await bytesUsados(orgX)).toBe(comOriginal - bytesOf(original) + bytesOf(trocado))
  })

  it('deleting releases exactly what the upload was charged', async () => {
    const antes = await bytesUsados(orgX)
    const doc = await subir(orgX, 'apagada')
    expect(await bytesUsados(orgX)).toBe(antes + bytesOf(doc))

    await payload.delete({ collection: SLUG as never, id: doc.id, overrideAccess: true })
    expect(await bytesUsados(orgX)).toBe(antes)
  })
})

describe('§4 — a failed upload leaves the figure where it was (checklist CHK008)', () => {
  it('rolls the delta back with the row when the storage refuses the bytes', async () => {
    const antes = await bytesUsados(orgX)
    bucket.recusarPuts = true
    const resultado = await subir(orgX, 'falhou').then(
      () => 'aceito',
      () => 'recusado',
    )
    bucket.recusarPuts = false

    expect(resultado, 'the storage refused every PUT, yet the upload succeeded').toBe('recusado')
    expect(
      await bytesUsados(orgX),
      'the figure counts bytes the storage never accepted. The delta runs in an afterChange BEFORE ' +
        "the storage plugin's upload hook, so it must share the upload's transaction (req) to roll back.",
    ).toBe(antes)
  })
})
