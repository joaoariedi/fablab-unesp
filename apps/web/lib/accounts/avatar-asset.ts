import { extname } from 'node:path'

import type { PayloadRequest } from 'payload'

import { MEDIA_SLUGS } from '../../collections/Media'
import { getTenantScopedPayload, type TenantScopedPayload } from '../tenancy'
import { ALLOWED_EXTENSIONS, UPLOAD_CAP_BYTES, type MediaGroup } from '../uploads/limits'

/**
 * T035b / FR-033, US6 — **the one path an avatar asset takes into a profile**.
 *
 * ── Why this module exists at all ───────────────────────────────────────────────────────────
 *
 * `perfilMaker.avatarRender` is the only column this feature adds that names a *file*. T035
 * shipped the half that clears it — a changed configuration drops the stale PNG in the same
 * write — and nothing composes the replacement yet. That gap is precisely when a second path
 * gets invented: whatever composes the render has bytes and a storage key in hand, the
 * choke-point client's `create` takes `data` and no file, and the shortest way out of that
 * corner is to write the key into the column and serve it directly.
 *
 * Decision D3, as revised on 2026-09-07, forbids that for **every file in the product**, and
 * FR-033 states it for this one: the asset goes through the media collections and the upload
 * limits feature 002 fixed. A text key would be a foreign key with no constraint — the database
 * could not tell you the object exists, nothing would prove the upload rules ever ran on it, and
 * moving the object would leave a column pointing at nothing with no way to find out.
 *
 * So attaching a render is *not* "set a field". It is: resolve the id in {@link
 * AVATAR_ASSET_COLLECTION} through the choke point, hold the resolved document to the image
 * group's own policy, and write **its id**. Anything that is not a row in that collection —
 * a key, a URL, a bare filename, a populated object — is refused here, before the write.
 *
 * ── Why the limits are re-checked on a document that already passed them ────────────────────
 *
 * `collections/Media.ts` refuses an off-policy upload inside Payload's own operation, which is
 * the enforcement surface for bytes arriving through the app. This check is not a copy of that
 * one and does not replace it: it is the guard on the *attach*, where the id may name a row
 * created by a seed, a migration, an admin, or a future compositor that skipped the collection.
 * The policy itself is imported rather than restated — `limits.ts` is where those numbers are
 * written once, and `limits.test.ts` holds them against `docs/tech-stack.md`.
 *
 * **FR-028 holds**: no `payload.*` call: the store is the request-scoped choke point, injectable
 * so the suite can drive it, exactly as `curtir.ts` and `deletion.ts` take theirs.
 */

/** The media group an avatar render belongs to. It is a raster image and nothing else, so the
 *  image group's allowlist and cap are its policy in full. */
export const AVATAR_ASSET_GROUP: MediaGroup = 'image'

/** The collection every avatar asset is stored in — `midiaImagem`, from the map that names it
 *  once. A second slug here would be a fourth media collection nobody declared. */
export const AVATAR_ASSET_COLLECTION: string = MEDIA_SLUGS[AVATAR_ASSET_GROUP]

/** The image group's cap, imported. Retyping it would create a limit that stops moving when
 *  `tech-stack.md` moves, with nothing reporting the divergence. */
export const AVATAR_ASSET_CAP_BYTES: number = UPLOAD_CAP_BYTES[AVATAR_ASSET_GROUP]

/** FR-011's image extensions, imported for the same reason. */
export const AVATAR_ASSET_EXTENSIONS: readonly string[] = ALLOWED_EXTENSIONS[AVATAR_ASSET_GROUP]

/** The column this module owns the *setting* of. Clearing it is anyone's — T035 does it beside
 *  the configuration the old render depicted. */
export const CAMPO_AVATAR_RENDER = 'avatarRender'

/** The slice of the choke-point client this needs: resolve the media row, write the profile. */
export type AvatarAssetStore = Pick<TenantScopedPayload, 'findByID' | 'update'>

export type AnexarAvatarInput = {
  /** The request the attach runs under. Its transaction is the one the write joins. */
  req: PayloadRequest
  perfilId: string | number
  /** What the caller believes is the render. Typed `unknown` on purpose: the whole point of
   *  this module is that a key and an id are the same TypeScript type and opposite values. */
  midiaId: unknown
}

export type AnexarAvatarDeps = {
  /** Defaults to the request-scoped choke point. Injected by tests. */
  getStore?: (req: PayloadRequest) => Promise<AvatarAssetStore>
}

/** The attach either happened, naming the row it points at, or it did not, saying why. */
export type AnexoDoAvatar =
  | { readonly ok: true; readonly midiaId: string | number }
  | { readonly ok: false; readonly motivo: string }

/** A media row in the three columns this path reads. Structural rather than imported from
 *  `payload-types.ts`, which is gitignored (tasks.md preamble item 6). */
type MidiaDoc = {
  readonly id?: string | number
  readonly filename?: string | null
  readonly filesize?: number | null
}

const recusa = (motivo: string): AnexoDoAvatar => ({ ok: false, motivo })

/**
 * Is this file one the avatar path may carry? — `null` when it is, the reason when it is not.
 *
 * Exported so whatever composes a render can ask **before** it uploads: the alternative is
 * discovering the cap after the bytes are already in the bucket, which is the cost
 * `limits.ts` says the presign check exists to avoid.
 *
 * @example recusaDoArquivo('avatar-42.png', 24_576) // null
 * @example recusaDoArquivo('avatar-42.gif', 24_576) // 'o avatar "avatar-42.gif" …'
 */
export function recusaDoArquivo(nome: string, bytes: number): string | null {
  const extensao = extname(nome).toLowerCase()
  if (!AVATAR_ASSET_EXTENSIONS.includes(extensao)) {
    return (
      `o avatar "${nome}" tem extensão "${extensao}", fora da lista de imagens aceitas ` +
      `(${AVATAR_ASSET_EXTENSIONS.join(', ')}) — FR-011.`
    )
  }
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return `o avatar "${nome}" chegou com ${String(bytes)} bytes: não há arquivo nenhum aí.`
  }
  if (bytes > AVATAR_ASSET_CAP_BYTES) {
    return `o avatar "${nome}" tem ${bytes} bytes, acima do limite de ${AVATAR_ASSET_CAP_BYTES} (FR-012).`
  }
  return null
}

/** An id is a string or a number and nothing else. A populated relationship (`{ id, url }`) is
 *  refused rather than unwrapped: unwrapping it is how a `url` reaches the column. */
const ehIdentificador = (valor: unknown): valor is string | number =>
  typeof valor === 'number' || typeof valor === 'string'

/**
 * Point a profile's `avatarRender` at a stored image (FR-033).
 *
 * The id is resolved in {@link AVATAR_ASSET_COLLECTION} first, so what lands in the column is
 * the id of a document that exists and passed the image group's policy — never a storage key,
 * a URL or a filename, each of which is a perfectly valid string right up to the moment
 * somebody dereferences it.
 *
 * @returns the id written, or the refusal with the offending value quoted. Nothing is written
 * on a refusal.
 *
 * @example
 * // Once a render has been stored as a midiaImagem document:
 * await anexarAvatarRender({ req, perfilId: perfil.id, midiaId: midia.id })
 */
export async function anexarAvatarRender(
  input: AnexarAvatarInput,
  deps: AnexarAvatarDeps = {},
): Promise<AnexoDoAvatar> {
  if (!ehIdentificador(input.midiaId)) {
    return recusa(
      `avatarRender recebeu ${JSON.stringify(input.midiaId)}, que não é o id de um documento ` +
        `de ${AVATAR_ASSET_COLLECTION}. A coluna é um relacionamento (D3): só o id entra nela.`,
    )
  }

  const getStore = deps.getStore ?? ((req: PayloadRequest) => getTenantScopedPayload(req))
  const store = await getStore(input.req)
  const midia = await store.findByID<MidiaDoc>({
    collection: AVATAR_ASSET_COLLECTION,
    id: input.midiaId,
    depth: 0,
  })

  if (!midia || midia.id === undefined || midia.id === null) {
    return recusa(
      `"${String(input.midiaId)}" não é um documento de ${AVATAR_ASSET_COLLECTION}. Uma chave ` +
        `de objeto, uma URL ou um nome de arquivo nunca entram em avatarRender (FR-033).`,
    )
  }

  const impedimento = recusaDoArquivo(midia.filename ?? '', midia.filesize ?? 0)
  if (impedimento !== null) return recusa(impedimento)

  await store.update({
    collection: 'perfilMaker',
    id: input.perfilId,
    // The document's own id, and never the value the caller handed in: the two are the same
    // type, and only one of them is a row the database can constrain.
    data: { avatarRender: midia.id },
  })

  return { ok: true, midiaId: midia.id }
}
