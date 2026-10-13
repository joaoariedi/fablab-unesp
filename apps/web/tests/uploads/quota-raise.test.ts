import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_STORAGE_QUOTA_MB } from '../../collections/Organizations'
import { FakeBucket, bootWithFakeBucket } from './fake-bucket'
import { bytesDoPng, bytesUsados, criarOrganizacao, definirCota, limpar, mbDe, subirPng } from './quota-fixture'

/**
 * T012 / FR-032, FR-032b, SC-018 — the quota is data, so changing it takes effect on the very next
 * upload, with no restart and no deploy; and LOWERING it below what is already stored is a state
 * with its own words, never a negative allowance (checklist CHK014, CHK015).
 */

const PREFIXO = 't012-'
const bucket = new FakeBucket('fablab-test-t012')
let payload: Payload
let org: string | number
let tamanho: number

beforeAll(async () => {
  payload = await bootWithFakeBucket(bucket, 'quota-raise-t012')
  await limpar(payload, PREFIXO)
  org = await criarOrganizacao(payload, `${PREFIXO}org`, DEFAULT_STORAGE_QUOTA_MB)
  tamanho = await bytesDoPng(payload, org, `${PREFIXO}medida`)
}, 180_000)

afterAll(async () => {
  if (payload) await limpar(payload, PREFIXO)
  await bucket.close()
})

describe('raising the quota (FR-032, SC-018)', () => {
  it('admits an upload refused a moment earlier — no restart in between', async () => {
    const usado = await bytesUsados(payload, org)
    await definirCota(payload, org, mbDe(usado + tamanho - 1))
    const recusado = await subirPng(payload, { org, nome: `${PREFIXO}antes` })
    expect(recusado.aceito, 'the upload was admitted before the quota was raised').toBe(false)

    await definirCota(payload, org, mbDe(usado + tamanho))
    const aceito = await subirPng(payload, { org, nome: `${PREFIXO}depois` })
    expect(aceito.aceito, `still refused after the quota was raised: ${aceito.aceito ? '' : aceito.mensagem}`).toBe(true)
  })
})

describe('lowering the quota below what is stored (FR-032b, CHK014, CHK015)', () => {
  it('leaves the stored uploads alone and refuses the next one, saying the lab is ABOVE its quota', async () => {
    const usado = await bytesUsados(payload, org)
    expect(usado, 'nothing is stored, so there is nothing to be above').toBeGreaterThan(0)
    await definirCota(payload, org, mbDe(Math.floor(usado / 2)))

    const r = await subirPng(payload, { org, nome: `${PREFIXO}acima` })

    expect(r.aceito).toBe(false)
    if (!r.aceito) {
      expect(r.status).toBe(507)
      expect(r.mensagem, 'the over-quota state has no words of its own').toContain('acima da cota')
      expect(r.mensagem, 'the refusal printed a negative allowance').not.toMatch(/restam -/)
    }
    expect(await bytesUsados(payload, org), 'lowering the quota changed what was stored').toBe(usado)
  })
})
