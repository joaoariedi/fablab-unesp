import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_STORAGE_QUOTA_MB } from '../../collections/Organizations'
import { MEDIA_SLUGS } from '../../collections/Media'
import { MEGABYTE } from '../../lib/uploads/limits'
import { up } from '../../migrations/20261013_141340_espaco_usado'
import config from '../../payload.config'

/**
 * T007 / FR-028, FR-031 — the one-time backfill of `storageUsedMb` for uploads that predate the
 * delta, measured against a real Postgres.
 *
 * The state it repairs — uploads stored, figure still 0 — cannot be produced through the app any
 * more, because the delta now runs on every upload. So it is recreated inside a transaction the test
 * rolls back: the upload row is given its byte columns directly, as a pre-007 database holds them.
 * Test files run serially here (`fileParallelism: false`), so nothing else sees the state.
 *
 * Both directions are in the fixture, because a backfill that only ever ADDS would pass a fixture
 * holding only an organization with uploads: one lab has uploads and a figure of 0; the other has
 * no uploads and a stale figure, which must come back to 0.
 */

const ROLLBACK = new Error('rollback — storage-used-backfill')
const ORGS = ['t007-com-uploads', 't007-sem-uploads'] as const

let payload: Payload
let comUploads: string | number
let semUploads: string | number
let upload: string | number

beforeAll(async () => {
  payload = await getPayload({ config })
  await limpar()
  const criar = async (slug: string) =>
    (
      await payload.create({
        collection: 'organizations',
        data: { name: slug, slug, status: 'active', storageQuotaMb: DEFAULT_STORAGE_QUOTA_MB },
        overrideAccess: true,
      })
    ).id
  comUploads = await criar(ORGS[0])
  semUploads = await criar(ORGS[1])
  // No file: upload collections accept a row without one, and the byte columns are set inside
  // the transaction below, as a database written before the delta existed would hold them.
  upload = (
    (await payload.create({
      collection: MEDIA_SLUGS.image as never,
      data: { tenant: comUploads } as never,
      overrideAccess: true,
    })) as unknown as { id: string | number }
  ).id
}, 180_000)

async function limpar(): Promise<void> {
  for (const slug of ORGS) {
    const { docs } = await payload.find({ collection: 'organizations', where: { slug: { equals: slug } }, depth: 0, overrideAccess: true })
    for (const org of docs) {
      await payload.delete({ collection: MEDIA_SLUGS.image as never, where: { tenant: { equals: org.id } } as never, overrideAccess: true })
      await payload.delete({ collection: 'organizations', id: org.id, overrideAccess: true })
    }
  }
}

afterAll(async () => {
  if (payload) await limpar()
})

const linhas = (resultado: unknown): Record<string, unknown>[] =>
  ((resultado as { rows?: unknown[] }).rows ?? resultado) as Record<string, unknown>[]

describe('the backfill sets every organization to what its uploads occupy (T007)', () => {
  it('counts the original and both generated sizes, and resets a stale figure to 0', async () => {
    const lidos: Record<string, number> = {}

    await payload.db.drizzle
      .transaction(async (tx) => {
        await tx.execute(
          `update midia_imagem set filesize = 1000, sizes_miniatura_filesize = 300,
             sizes_card_filesize = 200 where id = ${Number(upload)}`,
        )
        await tx.execute(`update organizations set storage_used_mb = 0 where id = ${Number(comUploads)}`)
        await tx.execute(`update organizations set storage_used_mb = 999 where id = ${Number(semUploads)}`)

        await up({ db: tx as never, payload, req: {} as never })

        for (const [nome, id] of [['com', comUploads], ['sem', semUploads]] as const) {
          const [linha] = linhas(await tx.execute(`select storage_used_mb from organizations where id = ${Number(id)}`))
          lidos[nome] = Math.round(Number(linha?.storage_used_mb) * MEGABYTE)
        }
        throw ROLLBACK
      })
      .catch((erro: unknown) => {
        if (erro !== ROLLBACK) throw erro
      })

    expect(lidos.com, 'the original and its two generated sizes, 1000 + 300 + 200 bytes').toBe(1500)
    expect(lidos.sem, 'an organization with no uploads kept its stale figure').toBe(0)
  })
})
