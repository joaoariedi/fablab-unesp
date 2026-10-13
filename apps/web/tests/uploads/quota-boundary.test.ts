import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_STORAGE_QUOTA_MB } from '../../collections/Organizations'
import { FakeBucket, bootWithFakeBucket } from './fake-bucket'
import { bytesDoPng, bytesUsados, criarOrganizacao, definirCota, limpar, mbDe, subirPng } from './quota-fixture'

/**
 * T009 / FR-027, FR-033b, SC-011, SC-011b, SC-014 — the quota's boundary, BOTH sides in one fixture.
 *
 * A fixture holding only the over-limit case passes a guard written as `>=`; one holding only the
 * exact case passes a guard with no limit at all. So the room is set to EXACTLY what one upload
 * occupies — learned by uploading that PNG once, since sharp's output is deterministic — and the
 * same upload is then tried against one byte less. Compared in whole bytes throughout (CHK013).
 */

const PREFIXO = 't009-'
const bucket = new FakeBucket('fablab-test-t009')
let payload: Payload
let org: string | number
let tamanho: number

beforeAll(async () => {
  payload = await bootWithFakeBucket(bucket, 'quota-boundary-t009')
  await limpar(payload, PREFIXO)
  org = await criarOrganizacao(payload, `${PREFIXO}org`, DEFAULT_STORAGE_QUOTA_MB)
  tamanho = await bytesDoPng(payload, org, `${PREFIXO}medida`)
}, 180_000)

afterAll(async () => {
  if (payload) await limpar(payload, PREFIXO)
  await bucket.close()
})

describe('the boundary (FR-027)', () => {
  it('accepts an upload that exactly reaches the quota', async () => {
    const usado = await bytesUsados(payload, org)
    await definirCota(payload, org, mbDe(usado + tamanho))

    const r = await subirPng(payload, { org, nome: `${PREFIXO}exato` })

    expect(r.aceito, `refused an upload that exactly fills the room: ${r.aceito ? '' : r.mensagem}`).toBe(true)
    expect(await bytesUsados(payload, org)).toBe(usado + tamanho)
  })

  it('refuses the same upload when the room is one byte smaller, and stores nothing', async () => {
    const usado = await bytesUsados(payload, org)
    await definirCota(payload, org, mbDe(usado + tamanho - 1))
    const putsAntes = bucket.puts.length

    const r = await subirPng(payload, { org, nome: `${PREFIXO}um-byte-a-mais` })

    expect(r.aceito, 'accepted an upload one byte past the quota').toBe(false)
    if (!r.aceito) expect(r.status, `refused, but not as 507: ${r.mensagem}`).toBe(507)
    expect(await bytesUsados(payload, org), 'the refused upload was charged').toBe(usado)
    expect(bucket.puts.length, 'the refused upload still wrote to the bucket').toBe(putsAntes)
  })
})

describe('zero is suspension, never unlimited (FR-033b)', () => {
  it('refuses even the smallest upload when the quota is 0', async () => {
    await definirCota(payload, org, 0)

    const r = await subirPng(payload, { org, nome: `${PREFIXO}minusculo`, largura: 1, altura: 1 })

    expect(r.aceito, 'a quota of 0 admitted an upload — zero was read as "unlimited"').toBe(false)
    if (!r.aceito) expect(r.status).toBe(507)
  })
})
