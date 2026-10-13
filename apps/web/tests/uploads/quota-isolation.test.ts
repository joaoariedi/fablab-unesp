import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FakeBucket, bootWithFakeBucket } from './fake-bucket'
import { criarMaker, criarOrganizacao, limpar, subirPng } from './quota-fixture'

/**
 * T013 / FR-034, checklist CHK024, CHK025 — a maker is never shown another organization's usage or
 * quota, and cannot charge one.
 *
 * The case that distinguishes is in the fixture: organization B's quota is ZERO. If the quota hook
 * ever read B's figures on behalf of a maker of A, it would answer 507 with B's numbers in the
 * message — B's usage disclosed, and an oracle for whether B is full. The right answer is the
 * `tenant` field's refusal, which names nothing about B. With B merely roomy, a hook that read B's
 * figures would pass silently and this test would prove nothing.
 */

const PREFIXO = 't013-'
const bucket = new FakeBucket('fablab-test-t013')
let payload: Payload
let orgA: string | number
let orgB: string | number
let makerDeA: Record<string, unknown>

beforeAll(async () => {
  payload = await bootWithFakeBucket(bucket, 'quota-isolation-t013')
  await limpar(payload, PREFIXO)
  orgA = await criarOrganizacao(payload, `${PREFIXO}org-a`, 0.01)
  orgB = await criarOrganizacao(payload, `${PREFIXO}org-b`, 0)
  makerDeA = await criarMaker(payload, `${PREFIXO}maker-a@example.com`, orgA)
}, 180_000)

afterAll(async () => {
  if (payload) await limpar(payload, PREFIXO)
  await bucket.close()
})

describe('a maker of A, naming organization B (CHK024, CHK025)', () => {
  it('is refused by the tenant field — not by B\'s quota, which would disclose it', async () => {
    const r = await subirPng(payload, { org: orgB, nome: `${PREFIXO}em-b`, user: makerDeA })

    expect(r.aceito, 'a maker of A uploaded into organization B').toBe(false)
    if (r.aceito) return
    expect(r.status, 'refused with 507 — the quota hook read organization B on behalf of A').not.toBe(507)
    const campos = (r.erro as { data?: { errors?: { path?: string }[] } }).data?.errors ?? []
    expect(campos.some((c) => c.path === 'tenant'), `refused, but not by the tenant field: ${r.mensagem}`).toBe(true)
    const texto = JSON.stringify((r.erro as { data?: unknown }).data ?? {}) + r.mensagem
    expect(texto, "the refusal speaks of B's quota").not.toMatch(/cota|MB|KB|acima/i)
  })
})

describe('a maker of A, over A\'s own quota (FR-034)', () => {
  it('sees A\'s figures and nothing of B', async () => {
    const r = await subirPng(payload, { org: orgA, nome: `${PREFIXO}em-a`, user: makerDeA })

    expect(r.aceito).toBe(false)
    if (r.aceito) return
    expect(r.status).toBe(507)
    expect(r.mensagem).toMatch(/cota de \d+\.\d KB/)
    expect(r.mensagem, 'the refusal names the neighbouring organization').not.toContain(`${PREFIXO}org-b`)
  })
})
