import type { Payload } from 'payload'

import { MEDIA_SLUGS } from '../../collections/Media'
import { bytesOf, type MediaDoc } from '../../lib/content/storage-usage'
import { MEGABYTE } from '../../lib/uploads/limits'
import { pngDe } from './fake-bucket'

/**
 * The shared setup of feature 007's quota tests (T009–T013): organizations with a chosen quota, a
 * maker, real PNG uploads through the real pipeline, and the figure read back in WHOLE BYTES.
 *
 * Everything a test creates carries its `prefixo`, so `limpar` removes exactly that and nothing a
 * neighbouring file made — `tests/content/counters.test.ts` reconciles the whole database, and a
 * row left behind fails it (preamble item 5).
 */

export const SLUG_IMAGEM = MEDIA_SLUGS.image

export type Resultado =
  | { aceito: true; doc: MediaDoc & { id: string | number } }
  | { aceito: false; erro: unknown; status?: number; mensagem: string }

/** A quota in MB that is exactly `bytes` bytes — representable, since MEGABYTE is a power of 2. */
export const mbDe = (bytes: number): number => bytes / MEGABYTE

export async function criarOrganizacao(payload: Payload, slug: string, quotaMb: number): Promise<string | number> {
  return (
    await payload.create({
      collection: 'organizations',
      data: { name: slug, slug, status: 'active', storageQuotaMb: quotaMb },
      overrideAccess: true,
    })
  ).id
}

export async function criarMaker(payload: Payload, email: string, org: string | number): Promise<Record<string, unknown>> {
  return (await payload.create({
    collection: 'users',
    data: { email, password: 'fixture-password-123', role: 'user', orgs: [{ organization: org, role: 'maker' }] } as never,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>
}

export async function definirCota(payload: Payload, org: string | number, quotaMb: number): Promise<void> {
  await payload.update({ collection: 'organizations', id: org, data: { storageQuotaMb: quotaMb }, overrideAccess: true })
}

/** The organization's stored figure, in whole bytes — never compared as fractional MB (CHK013). */
export async function bytesUsados(payload: Payload, org: string | number): Promise<number> {
  const doc = (await payload.findByID({ collection: 'organizations', id: org, depth: 0, overrideAccess: true })) as {
    storageUsedMb?: number | null
  }
  return Math.round(Number(doc.storageUsedMb ?? 0) * MEGABYTE)
}

type Envio = {
  org: string | number
  nome: string
  largura?: number
  altura?: number
  user?: Record<string, unknown>
}

/**
 * One PNG through the real upload pipeline, as the given user (access enforced) or as the system.
 * Resolves to the outcome — never throws — so a test can assert a refusal's status and words.
 */
export async function subirPng(payload: Payload, envio: Envio): Promise<Resultado> {
  const data = await pngDe(envio.largura ?? 1600, envio.altura ?? 900)
  return payload
    .create({
      collection: SLUG_IMAGEM as never,
      data: { tenant: envio.org } as never,
      file: { data, mimetype: 'image/png', name: `${envio.nome}.png`, size: data.length },
      ...(envio.user ? { user: envio.user, overrideAccess: false } : { overrideAccess: true }),
    } as never)
    .then(
      (doc) => ({ aceito: true as const, doc: doc as unknown as MediaDoc & { id: string | number } }),
      (erro: unknown) => ({
        aceito: false as const,
        erro,
        status: (erro as { status?: number }).status,
        mensagem: String((erro as { message?: unknown }).message ?? erro),
      }),
    )
}

/**
 * What a PNG of this size occupies once uploaded — original plus derivatives — learned by uploading
 * it once and deleting it. Sharp's output is deterministic, so the same call yields the same bytes:
 * that is what lets a boundary test set a quota to EXACTLY the room one upload needs.
 */
export async function bytesDoPng(payload: Payload, org: string | number, nome: string, largura = 1600, altura = 900): Promise<number> {
  const r = await subirPng(payload, { org, nome, largura, altura })
  if (!r.aceito) throw new Error(`could not learn the size of a ${largura}×${altura} PNG: ${r.mensagem}`)
  const bytes = bytesOf(r.doc)
  await payload.delete({ collection: SLUG_IMAGEM as never, id: r.doc.id, overrideAccess: true })
  return bytes
}

/** Removes every upload, user and organization whose name starts with `prefixo`. */
export async function limpar(payload: Payload, prefixo: string): Promise<void> {
  const { docs } = await payload.find({
    collection: 'organizations',
    where: { slug: { like: prefixo } },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })
  for (const org of docs) {
    await payload.delete({ collection: SLUG_IMAGEM as never, where: { tenant: { equals: org.id } } as never, overrideAccess: true })
  }
  await payload.delete({ collection: 'users', where: { email: { like: prefixo } }, overrideAccess: true })
  for (const org of docs) await payload.delete({ collection: 'organizations', id: org.id, overrideAccess: true })
}
