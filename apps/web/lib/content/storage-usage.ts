import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionAfterDeleteHook,
  type CollectionBeforeValidateHook,
  type PayloadRequest,
} from 'payload'

import { isMaster, tenantIdsOf } from '../tenancy/access'
import { getOrganizationUsageStore } from '../tenancy/organization-usage'
import { MEGABYTE } from '../uploads/limits'

/** One generated size of an upload, as Payload stores it under `sizes.<name>`. */
type TamanhoGerado = { filesize?: number | null } | null | undefined

/**
 * The slice of an upload document the storage figure reads. Structural, not imported from the
 * gitignored `payload-types.ts`, which CI compiles without.
 */
export type MediaDoc = {
  filesize?: number | null
  sizes?: Record<string, TamanhoGerado> | null
  tenant?: unknown
}

/**
 * **The bytes one upload occupies: the original AND every size Payload generated from it**
 * (007 — FR-029, CLR-006, SC-015b).
 *
 * `sizes` is NESTED — `sizes.miniatura.filesize`, `sizes.card.filesize` — which is the whole reason
 * `syncCounter`'s `sum` could not express this: it reads `doc[field]`, a flat key, and so counts
 * originals only (plan § D4, round 1's blocker). A figure that counted originals would let a lab
 * sit at "80 % of quota" with a full disk, which is the quota failing at the one job it has.
 *
 * Quarantine is not considered: no live upload is ever written under the quarantine prefix, since
 * `generateObjectKey` has no production caller (checklist CHK003).
 *
 * @example bytesOf({ filesize: 2_000_000, sizes: { card: { filesize: 90_000 } } }) // 2_090_000
 */
export const bytesOf = (doc: MediaDoc | null | undefined): number => {
  if (!doc) return 0
  const original = typeof doc.filesize === 'number' ? doc.filesize : 0
  const gerados = Object.values(doc.sizes ?? {}).reduce(
    (total, tamanho) => total + (typeof tamanho?.filesize === 'number' ? tamanho.filesize : 0),
    0,
  )
  return original + gerados
}

/** The organization a document is stored under — from the DOCUMENT, never the host (T005). */
export const tenantIdOf = (doc: MediaDoc | null | undefined): string | null => {
  const tenant = doc?.tenant
  if (tenant === null || tenant === undefined) return null
  if (typeof tenant === 'object' && 'id' in tenant) return String((tenant as { id: unknown }).id)
  return String(tenant)
}

const aplicar = async (tenantId: string, bytes: number, req: PayloadRequest): Promise<void> => {
  if (bytes === 0) return
  const store = await getOrganizationUsageStore(tenantId, { req })
  await store.applyDelta(bytes)
}

/**
 * Keeps `storageUsedMb` true as uploads are created and changed (FR-028, FR-029).
 *
 * **One rule for create and update: the figure moves by `bytesOf(doc) − bytesOf(previousDoc)`.**
 * On a create `previousDoc` is `{}` (measured in feature 005), so the whole upload is added. On an
 * update it is whatever changed — a replaced file and its regenerated derivatives (checklist
 * CHK004), or nothing at all for a metadata edit and for the follow-up update the storage plugin
 * performs after an upload (measured in T005), which then cost no write.
 *
 * A document moved between organizations — only a master can — releases its bytes at the old one
 * and charges them at the new one, rather than charging the difference to whichever it landed in.
 *
 * **It runs BEFORE the storage plugin's own `afterChange`**, which appends itself after the
 * collection's hooks and is where the S3 upload happens (measured in T005). The delta is written
 * inside the upload's transaction (`req`), so if the upload then fails, the figure is rolled back
 * with the row rather than counting bytes that were never stored (CHK008).
 */
export const storageUsageAfterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const agora = tenantIdOf(doc as MediaDoc)
  const antes = tenantIdOf(previousDoc as MediaDoc)
  const bytesAgora = bytesOf(doc as MediaDoc)
  const bytesAntes = bytesOf(previousDoc as MediaDoc)

  if (antes !== null && agora !== null && antes !== agora) {
    await aplicar(antes, -bytesAntes, req)
    await aplicar(agora, bytesAgora, req)
  } else if (agora !== null) {
    await aplicar(agora, bytesAgora - bytesAntes, req)
  }
  return doc
}

/** Deleting an upload releases its bytes, derivatives included (FR-030, SC-017). */
export const storageUsageAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const tenant = tenantIdOf(doc as MediaDoc)
  if (tenant !== null) await aplicar(tenant, -bytesOf(doc as MediaDoc), req)
  return doc
}

/**
 * A size a maker can read: bytes, KB, MB or GB, one decimal, binary throughout (1 KB = 1024
 * bytes, CHK009). A single unit was tried first and measured useless: at one decimal of MB a 28 KB
 * photo against a 10 KB room read "ocupa 0.0 MB e restam 0.0 MB da cota de 0.0 MB" — true, and
 * nothing anyone could act on.
 */
export const tamanhoLegivel = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < MEGABYTE) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * MEGABYTE) return `${(bytes / MEGABYTE).toFixed(1)} MB`
  return `${(bytes / (1024 * MEGABYTE)).toFixed(1)} GB`
}

/** Who can act on a refusal — the uploader is usually not the person who can (FR-024). */
const QUEM_PODE = 'Um master pode alterar a cota em Organizações › Cota de storage.'

/** The refusal's words, for the three states a full organization can be in (FR-023, CHK014). */
const motivoDaRecusa = (nome: string, entrando: number, usado: number, cota: number): string => {
  if (cota === 0) {
    return `Upload recusado: os uploads desta organização estão suspensos (cota de 0 MB). ${QUEM_PODE}`
  }
  if (usado > cota) {
    return (
      `Upload recusado: esta organização já está acima da cota de storage — usa ${tamanhoLegivel(usado)} ` +
      `de ${tamanhoLegivel(cota)}, e "${nome}" ocuparia mais ${tamanhoLegivel(entrando)}. ${QUEM_PODE}`
    )
  }
  return (
    `Upload recusado: "${nome}" ocupa ${tamanhoLegivel(entrando)} e restam ${tamanhoLegivel(cota - usado)} ` +
    `da cota de ${tamanhoLegivel(cota)} desta organização. ${QUEM_PODE}`
  )
}

/**
 * **Refuses an upload that would carry its organization past the storage quota** — before a single
 * byte is stored (007 — T008, FR-022–FR-027, FR-032b, FR-033b, D5, D6b).
 *
 * ── Where, measured rather than reasoned (T005) ─────────────────────────────────────────────
 *
 * `beforeValidate`. By then the tenant is final however it arrived — explicit, or the plugin's
 * cookie default, applied in the field pass just before — and Payload has already generated the
 * derivatives, so `data` carries the original's `filesize` AND every `sizes.*.filesize`. That makes
 * `bytesOf(data)` exactly what the delta will charge, so "exactly at the quota" means one thing in
 * both places (FR-027). And the storage plugin uploads in its `afterChange`, after this has run.
 *
 * ── It reads a tenant the writer may write to, or none at all ───────────────────────────────
 *
 * Field validation — the `tenant` field's own guard, `tenantMustBeAMembership` — runs AFTER the
 * collection's `before*` hooks. So this runs before the tenant is validated, and reading a foreign
 * organization's figures here would put them in the refusal: a maker of A learning B's usage, and
 * an oracle for whether B is full (checklist CHK024, CHK025). A writer naming a tenant they do not
 * belong to is therefore passed through untouched, and the `tenant` field refuses the write in
 * words that disclose nothing. A request with no user is server code that chose its tenant itself.
 *
 * ── What it compares ─────────────────────────────────────────────────────────────────────────
 *
 * The STORED figure plus what this write adds, in whole bytes: one read, never a recompute (D6b).
 * What this write adds is the whole upload on a create, and the difference on an update that
 * replaces the file — a smaller replacement never needs room. A write without a file (a metadata
 * edit, or the storage plugin's own follow-up update, measured fileless in T005) is not checked.
 *
 * `507 Insufficient Storage`, distinct from the per-file cap's `413`, so a client can tell "this
 * file is too big" from "this lab is full" (FR-025).
 */
export const refuseOverQuota: CollectionBeforeValidateHook = async ({ data, operation, originalDoc, req }) => {
  if (!req.file || !data) return data
  const tenant = tenantIdOf(data as MediaDoc)
  if (tenant === null) return data

  const user = req.user as Parameters<typeof isMaster>[0]
  const podeEscrever = !user || isMaster(user) || tenantIdsOf(user).some((id) => String(id) === tenant)
  if (!podeEscrever) return data

  const entrando = bytesOf(data as MediaDoc) - (operation === 'update' ? bytesOf(originalDoc as MediaDoc) : 0)
  if (entrando <= 0) return data

  const { quotaMb, usedMb } = await (await getOrganizationUsageStore(tenant, { req })).read()
  const cota = Math.round(quotaMb * MEGABYTE)
  const usado = Math.round(usedMb * MEGABYTE)
  if (cota > 0 && usado + entrando <= cota) return data

  const nome = String((data as { filename?: unknown }).filename ?? req.file.name ?? 'arquivo')
  throw new APIError(motivoDaRecusa(nome, entrando, usado, cota), 507, null, true)
}
