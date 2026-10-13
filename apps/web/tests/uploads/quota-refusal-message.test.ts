import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { UPLOAD_CAP_BYTES } from '../../lib/uploads/limits'
import { FakeBucket, bootWithFakeBucket, pngDe } from './fake-bucket'
import { DEFAULT_STORAGE_QUOTA_MB } from '../../collections/Organizations'
import { MEGABYTE } from '../../lib/uploads/limits'
import { bytesDoPng, criarMaker, criarOrganizacao, limpar } from './quota-fixture'

/**
 * T010 / FR-023, FR-024, FR-025, SC-012, SC-013, checklist CHK029 — the refusal as a CLIENT sees it.
 *
 * Driven through payload's real REST route handler with a real multipart `Request` and a real
 * session cookie, as a maker of the organization — not through the Local API, and not by
 * inspecting the thrown error. The existing refusals (413, 415) are thrown in `beforeOperation`;
 * this one is thrown in `beforeValidate`, after the multipart body has been parsed and the
 * derivatives generated, and an error from there could have been wrapped as 400 or 500 on the way
 * out. Only the status a client actually receives answers that.
 *
 * And the words are asserted, not the presence of a message: a bare "recusado" would pass any
 * check of existence and tell the maker nothing they could act on.
 */

const PREFIXO = 't010-'
const bucket = new FakeBucket('fablab-test-t010')
let payload: Payload
let org: string | number
let cookie: string
let config: unknown
/** What `pngDe()` occupies once uploaded — learned, not assumed, so the message can be checked. */
let tamanho: number
const COTA_MB = 0.01

beforeAll(async () => {
  payload = await bootWithFakeBucket(bucket, 'quota-refusal-t010')
  config = (await import('../../payload.config')).default
  await limpar(payload, PREFIXO)
  const medida = await criarOrganizacao(payload, `${PREFIXO}medida`, DEFAULT_STORAGE_QUOTA_MB)
  tamanho = await bytesDoPng(payload, medida, `${PREFIXO}medida`)
  // 0.01 MB of room — about 10 KB — so a ~28 KB PNG is refused with every figure below a megabyte:
  // exactly the scale at which a single-unit message read "0.0 MB" three times.
  org = await criarOrganizacao(payload, `${PREFIXO}org`, COTA_MB)
  await criarMaker(payload, `${PREFIXO}maker@example.com`, org)
  const { token } = await payload.login({
    collection: 'users',
    data: { email: `${PREFIXO}maker@example.com`, password: 'fixture-password-123' },
  })
  cookie = `payload-token=${String(token)}`
}, 180_000)

afterAll(async () => {
  if (payload) await limpar(payload, PREFIXO)
  await bucket.close()
})

const UNIDADES: Record<string, number> = { bytes: 1, KB: 1024, MB: MEGABYTE, GB: 1024 * MEGABYTE }

/** The figure after `rotulo` in the message, converted back to bytes (NaN when absent). */
const lerBytes = (mensagem: string, rotulo: string): number => {
  const achado = new RegExp(`${rotulo} ([\\d.]+) (bytes|KB|MB|GB)`).exec(mensagem)
  return achado ? Number(achado[1]) * UNIDADES[achado[2]!]! : Number.NaN
}

/**
 * True to within 5 % of the real figure. NOT "within the rounding of the unit shown": that was the
 * first version, and it passed "0.0 MB" for 28 KB because half a megabyte's rounding swallowed the
 * whole value. A figure is useful when it is close to the truth, whatever unit it chose.
 */
expect.extend({
  toBeCloseToBytes(recebido: number, esperado: number) {
    const erro = Math.abs(recebido - esperado) / esperado
    return {
      pass: Number.isFinite(recebido) && erro <= 0.05,
      message: () => `expected ~${esperado} bytes; the message says ${recebido} (${(erro * 100).toFixed(0)} % off)`,
    }
  },
})

declare module 'vitest' {
  interface Assertion {
    toBeCloseToBytes(esperado: number): void
  }
}

/** A multipart POST through the real REST handler, as the maker. */
const postar = async (arquivo: Buffer, nome: string): Promise<{ status: number; mensagem: string }> => {
  const { REST_POST } = await import('@payloadcms/next/routes')
  const corpo = new FormData()
  corpo.append('file', new Blob([new Uint8Array(arquivo)], { type: 'image/png' }), nome)
  corpo.append('_payload', JSON.stringify({ tenant: org }))
  const resposta = await REST_POST(config as never)(
    new Request(`http://org-a.localhost/api/midiaImagem`, { method: 'POST', body: corpo, headers: { Cookie: cookie } }),
    { params: Promise.resolve({ slug: ['midiaImagem'] }) },
  )
  const corpoResposta = (await resposta.json().catch(() => ({}))) as { errors?: { message?: string }[] }
  return { status: resposta.status, mensagem: corpoResposta.errors?.[0]?.message ?? '' }
}

describe('what the client receives (FR-025, CHK029)', () => {
  it('a full organization answers 507 over HTTP', async () => {
    const { status, mensagem } = await postar(await pngDe(), `${PREFIXO}cheia.png`)
    expect(status, `got ${status}: ${mensagem}`).toBe(507)
  })

  it('a file over the per-file cap still answers 413 — the two are told apart on the wire', async () => {
    const grande = Buffer.alloc(UPLOAD_CAP_BYTES.image + 1)
    const { status } = await postar(grande, `${PREFIXO}grande.png`)
    expect(status).toBe(413)
  })
})

describe('what the refusal says (FR-023, FR-024, SC-012)', () => {
  it('names the size, the room left and the quota — each the TRUE figure — and who can raise it', async () => {
    const { mensagem } = await postar(await pngDe(), `${PREFIXO}palavras.png`)
    const cota = Math.round(COTA_MB * MEGABYTE)

    // Parsed back to bytes and compared with the truth, within the rounding of the unit shown.
    // Matching a pattern like /\d+\.\d MB/ instead passed on "ocupa 0.0 MB e restam 0.0 MB da cota
    // de 0.0 MB" — the exact message this test was first green against (preamble item 3).
    expect(lerBytes(mensagem, 'ocupa'), mensagem).toBeCloseToBytes(tamanho)
    expect(lerBytes(mensagem, 'restam'), mensagem).toBeCloseToBytes(cota)
    expect(lerBytes(mensagem, 'cota de'), mensagem).toBeCloseToBytes(cota)
    expect(mensagem, 'the refusal does not say who can act').toContain('master')
  })

  it('carries no internal identifier', async () => {
    const { mensagem } = await postar(await pngDe(), `${PREFIXO}sem-id.png`)
    expect(mensagem).not.toMatch(new RegExp(`\\b${String(org)}\\b`))
  })
})
