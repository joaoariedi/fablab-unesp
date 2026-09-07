/**
 * Post-upload verification: **the content check happens after the bytes land, and the object
 * does not leave `quarantine/` until it passes** (FR-014, SC-006).
 *
 * With `clientUploads` the browser PUTs straight to the bucket against a presigned URL
 * (spike S1), so Node never sees the bytes on their way in — there is no `beforeValidate` in
 * which to look at them. The object therefore exists, unexamined, before anything can judge
 * it. The plan's answer (§ Sketch 4) is the sequence this module implements: land in a prefix
 * `infra/minio-init.sh` verifies is *not* publicly served, then `HeadObject` for the real
 * size, then a bounded read of the leading bytes, and only then a move into the served
 * prefix.
 *
 * ## ⚠ SUPERSEDED BY DECISION D1 (2026-09-06) — read this before trusting anything below
 *
 * This module was written for the **presigned direct-to-storage** path of plan § Sketch 4, and
 * that path no longer exists. `clientUploads` is off, so the bytes pass through Node and
 * Payload's own `checkFileRestrictions` **does** run: the collection-level `mimeTypes` on the
 * media collections are live, and `collections/Media.ts` carries the size guard and the
 * content sniff. `verifyUploaded` has **no production caller** — only `DERIVATIVE_WIDTHS` is
 * imported from here — so nothing in this file is enforcing anything today.
 *
 * The paragraph that used to sit here said the opposite: that collection-level `mimeTypes` and
 * `filesize` *never execute*, that this pass was therefore "the only defence", and that there
 * was "no field-level net underneath". Every one of those was true of the old path and false of
 * the current one, and a test was holding them in place — which is how a green gate ends up
 * defending a claim that has become wrong. The claim is corrected rather than deleted so the
 * reasoning survives: what changed is the architecture, not the measurement. Spike S1's finding
 * (`generateFileData` returning at `if (!file)` before `checkFileRestrictions`) remains exactly
 * right **about `clientUploads: true`**, and it is the reason D1 turned it off.
 *
 * What is still worth keeping here is the magic-byte table: Payload sniffs with `file-type`,
 * which does not recognise every 3D container this product accepts, so a signature check for
 * those formats is a genuine second layer rather than a duplicate. Rehoming it onto the media
 * collection's `beforeValidate` is follow-up work, not a claim this file may make today.
 *
 * **Verified as a container, never parsed as a model** (CLR-003). Every check here reads a
 * fixed-width header, an ASCII magic string, or a length field, and compares it with the size
 * storage reported. No *check* here decodes an image, walks a ZIP directory or loads a mesh —
 * the derivative pass described below is the single bounded exception, and only for raster
 * images, where a thumbnail cannot be produced any other way. That is
 * a deliberate trade: running a parser over hostile input has historically been a richer
 * source of vulnerabilities than the mislabelled-file problem it would solve, so a `.glb` is
 * confirmed to be a glTF *container* and its payload is never interpreted. Deep scanning — a
 * sandboxed parser, or ClamAV — is a named follow-up, not an unstated gap.
 *
 * **A refusal leaves the object exactly where it is.** Nothing is deleted here: the bytes stay
 * under `quarantine/`, where no anonymous reader can fetch them, and the bucket lifecycle rule
 * (T020) expires them. Deleting would need a destructive capability on the store for no gain,
 * and a store that cannot delete cannot be talked into deleting the wrong key.
 *
 * The store is **injected**, exactly as the presigner is in `presign.ts`: this module owns the
 * policy, not the AWS SDK, and a policy that can only be exercised against a live bucket is a
 * policy nobody tests. `QuarantineObjectStore` is the whole surface it needs — head, a ranged
 * read, and a move.
 *
 * **The image derivatives are generated here too, explicitly with `sharp`** (FR-011, T019).
 * They are not a convenience bolted onto this pass — this is the *only* pass that can make
 * them. Spike S1 measured that `imageSizes` never runs with `clientUploads`: `generateFileData`
 * returns at `if (!file)` before any resizing, and the storage plugins declare the size fields
 * without ever filling them. Left alone, `sizes.miniatura` and `sizes.card` would exist on
 * every document and stay empty forever, which reads as a working feature right up to the
 * first card that tries to render one.
 *
 * Two boundaries on that, both deliberate:
 *
 *  - **Only raster images are decoded, and `.svg` never is.** Rasterising an SVG means running
 *    librsvg over attacker-supplied XML — the parser-over-hostile-input trade CLR-003 refused
 *    for 3D containers, and refusing it for models while accepting it for images would be an
 *    accident rather than a decision. An SVG is released undecoded, with no derivatives; it is
 *    resolution-independent, so it needs none.
 *  - **Decoding a raster image is a real parse, and it is the one this feature accepts.** A
 *    thumbnail cannot exist without it. It is bounded on both sides: the object is already
 *    under the group's cap when it gets here (10 MB for images), and `limitInputPixels` caps
 *    the *decompressed* dimensions, which is the half a byte cap does not cover — a few
 *    hundred KB of PNG can declare tens of gigapixels.
 *
 * A source no decoder accepts is **refused, not released with empty sizes**: the signature
 * check proves the first bytes are a PNG, and this proves the rest of the file is one too.
 *
 * The writer is injected and **optional**, for the same reason the store is injected: a caller
 * that has nowhere to put derivatives (the verification-only tests, a dry run) still gets the
 * verification. Anything wiring this to a real bucket must pass one, and `verifyUploaded`
 * reports what it wrote so the caller can persist the keys rather than reconstruct them.
 *
 * Optional for the *writing*, never for the *checking*: a derivable object is decoded either
 * way, so the refusal above holds on both paths. Gating the decode on the writer would make
 * the guarantee this docstring states true only of callers that happened to want the bytes.
 */

import sharp from 'sharp'

import { QUARANTINE_PREFIX } from './keys'
import { ALLOWED_EXTENSIONS, MEDIA_GROUPS, UPLOAD_CAP_BYTES, type MediaGroup } from './limits'

/**
 * The prefix a verified object is moved into. Everything outside `quarantine/` may be served;
 * that is the entire difference between the two, and the move *is* the release.
 */
export const SERVED_PREFIX = 'media'

/**
 * How many leading bytes are fetched to decide. One KB covers every signature in the table
 * below with room to spare, and the bound is the point: a 100 MB mesh must not be downloaded
 * to be verified, or verification becomes the cost the caps existed to avoid.
 */
export const SIGNATURE_WINDOW_BYTES = 1024

/**
 * The derivative widths in pixels, written once, here.
 *
 * `miniatura` serves the list and ranking rows, `card` the grid cards — both at 2x the slot
 * the mockups measure (~160 px and ~384 px), because a card image on a retina screen is the
 * only place a too-small derivative is visible and a too-large one costs bytes nobody sees.
 * Two sizes, not five: every additional one is a resize on every upload and a key to reap.
 * Height is never named — the aspect ratio of the source decides it (see `renderDerivatives`).
 */
export const DERIVATIVE_WIDTHS = Object.freeze({ miniatura: 320, card: 768 })

export type DerivativeName = keyof typeof DERIVATIVE_WIDTHS

/** Every derivative is a WebP, whatever the source was: one output format, one decoder path. */
export const DERIVATIVE_CONTENT_TYPE = 'image/webp'

const DERIVATIVE_EXTENSION = '.webp'

/** WebP quality. 82 is where libwebp's own curve flattens; above it bytes grow, detail does not. */
const DERIVATIVE_QUALITY = 82

/**
 * The extensions a derivative is generated for — raster only.
 *
 * `.svg` is in `ALLOWED_EXTENSIONS.image` and deliberately not here (see the module docstring):
 * it would be rasterised by librsvg from hostile XML, and it does not need resizing anyway.
 */
const DERIVABLE_EXTENSIONS: readonly string[] = Object.freeze(['.jpg', '.jpeg', '.png', '.webp'])

/**
 * Decompressed pixel ceiling, the guard the byte cap cannot give.
 *
 * The 10 MB image cap is measured on the *compressed* object; a decompression bomb is small on
 * disk and enormous in memory. 50 MP is roughly a 8600x5800 photograph — past anything this
 * platform displays, and far under the point where a resize exhausts the box.
 */
const MAX_DERIVATIVE_INPUT_PIXELS = 50_000_000

/** What `HeadObject` tells us. Named for what we need, not for the SDK's response shape. */
export type ObjectHead = {
  /** The size storage measured — **not** the size the client declared at presign. */
  readonly contentLength: number
}

/** The bucket, as this module needs it. No delete: a refusal is left for the reaper. */
export interface QuarantineObjectStore {
  head(key: string): Promise<ObjectHead>
  /** Inclusive on both ends, matching HTTP `Range`, so an off-by-one is not silent. */
  readRange(key: string, startInclusive: number, endInclusive: number): Promise<Uint8Array>
  move(fromKey: string, toKey: string): Promise<void>
}

/**
 * Where the generated derivatives are written. Separate from `QuarantineObjectStore` because
 * it is the one *write* capability in this module: verification needs no ability to create
 * objects, and a store that cannot write cannot be talked into writing the wrong key.
 */
export interface DerivativeWriter {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
}

/** One generated derivative, as reported to the caller. The bytes are already written. */
export type Derivative = {
  readonly name: DerivativeName
  /** Derived from the released key alone — the client's filename reaches no part of it. */
  readonly key: string
  /** What `sharp` actually produced, not what was asked for: a small source is not enlarged. */
  readonly width: number
  readonly height: number
  readonly bytes: number
}

/** Why an object was refused. A code, so a caller can branch without matching on prose. */
export type RejectionReason =
  | 'chave-invalida'
  | 'excede-o-limite'
  | 'tamanho-invalido'
  | 'extensao-nao-permitida'
  | 'assinatura-nao-confere'
  | 'imagem-ilegivel'

export type VerifyResult =
  | {
      readonly released: true
      /** Where the object now lives, under the served prefix. */
      readonly key: string
      /** Where it came from, so a caller can record the transition it just caused. */
      readonly quarantineKey: string
      readonly bytes: number
      /** Empty for a non-raster upload, and for a caller that passed no `DerivativeWriter`. */
      readonly derivatives: readonly Derivative[]
    }
  | {
      readonly released: false
      /** Still the quarantine key: a refused object is not moved and not deleted. */
      readonly key: string
      readonly reason: RejectionReason
      /** Names the evidence — the measured size, the extension — never a bare "invalid file". */
      readonly message: string
    }

/**
 * The key handed in was not under `quarantine/`.
 *
 * A hard throw rather than a rejection: releasing means rewriting the prefix, so a key from
 * anywhere else would have this module compute a destination out of a path it never
 * generated. Keys come from `generateObjectKey` (FR-013); one that does not is a bug here,
 * not a bad upload.
 */
export class NotQuarantinedError extends Error {
  constructor(key: string) {
    super(
      `Verificação recusada: a chave "${key}" não está sob "${QUARANTINE_PREFIX}/", portanto ` +
        'não há objeto em quarentena para liberar.',
    )
    this.name = 'NotQuarantinedError'
  }
}

/**
 * The declared group has no allowlist, so nothing could say which signatures are acceptable.
 * Refused rather than defaulted: an unknown group looks up to `undefined`, and treating that
 * as "no restrictions" would release whatever bytes arrived.
 */
export class UnverifiableMediaGroupError extends Error {
  constructor(group: string) {
    super(
      `Verificação recusada: "${group}" não é um grupo de mídia conhecido, portanto não há ` +
        `assinatura esperada para conferir. Grupos válidos: ${Object.keys(ALLOWED_EXTENSIONS).join(', ')}.`,
    )
    this.name = 'UnverifiableMediaGroupError'
  }
}

/** A trailing `.` plus alphanumerics — the shape `generateObjectKey` echoes into the key. */
const TRAILING_EXTENSION = /\.[A-Za-z0-9]+$/

/** Decides on a bounded header window plus the size storage reported. Never on the payload. */
type SignatureMatcher = (head: Uint8Array, sizeBytes: number) => boolean

function startsWith(head: Uint8Array, pattern: readonly number[]): boolean {
  return pattern.every((byte, index) => head[index] === byte)
}

/** The bytes at `[offset, offset + length)` read as Latin-1 — magic strings are all ASCII. */
function asciiAt(head: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...head.subarray(offset, offset + length))
}

/**
 * Little-endian uint32, or `undefined` when the window is too short to hold one.
 *
 * Read through a `DataView` rather than by shifting four indexed bytes: both the glTF and the
 * binary-STL length fields are unsigned, and `|` in JavaScript is a *signed* 32-bit operator —
 * a length above 2 GB would come back negative and compare false against a size that is
 * perfectly legitimate.
 */
function uint32At(head: Uint8Array, offset: number): number | undefined {
  if (head.length < offset + 4) return undefined
  return new DataView(head.buffer, head.byteOffset + offset, 4).getUint32(0, true)
}

/**
 * Whether the window is plausibly text.
 *
 * This is the honest answer for `.obj`, `.dxf` and `.gltf`, which are **text formats with no
 * magic number** — there is no signature to match, so claiming one would be theatre. What it
 * does refuse is every binary that matters here: `MZ`, `ELF`, Mach-O and the compressed
 * containers all carry NUL or other C0 control bytes in their first KB, and a text format
 * carries none.
 */
function looksTextual(head: Uint8Array): boolean {
  return head.every((byte) => byte >= 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x0c)
}

const ZIP_SIGNATURES: readonly (readonly number[])[] = [
  [0x50, 0x4b, 0x03, 0x04], // a local file entry: an ordinary archive
  [0x50, 0x4b, 0x05, 0x06], // end-of-central-directory: a legitimately empty archive
  [0x50, 0x4b, 0x07, 0x08], // spanned/split marker
]

const isZipContainer: SignatureMatcher = (head) =>
  ZIP_SIGNATURES.some((signature) => startsWith(head, signature))

/**
 * A glTF **container**: the magic, a version this decade knows, and a declared total length
 * that agrees with what storage measured. The last of the three is what catches a truncated
 * or padded file, and it costs no parser — CLR-003's whole point.
 */
const isGlbContainer: SignatureMatcher = (head, sizeBytes) => {
  if (asciiAt(head, 0, 4) !== 'glTF') return false
  const version = uint32At(head, 4)
  return (version === 1 || version === 2) && uint32At(head, 8) === sizeBytes
}

/**
 * STL comes in two shapes and neither has a magic number. ASCII STL opens with `solid`;
 * binary STL is an 80-byte header, a uint32 triangle count, then exactly 50 bytes per
 * triangle — an arithmetic identity against the measured size, checked without reading a
 * single triangle.
 */
const isStlContainer: SignatureMatcher = (head, sizeBytes) => {
  if (/^\s*solid/i.test(asciiAt(head, 0, 16))) return true
  const triangles = uint32At(head, 80)
  return triangles !== undefined && 84 + triangles * 50 === sizeBytes
}

/** First non-whitespace character of a JSON document, without decoding the document. */
const isJsonText: SignatureMatcher = (head) =>
  looksTextual(head) && /^\s*\{/.test(asciiAt(head, 0, 64))

const isSvgText: SignatureMatcher = (head) =>
  looksTextual(head) && /<\?xml|<svg[\s/>]/i.test(asciiAt(head, 0, SIGNATURE_WINDOW_BYTES))

/**
 * The expected leading bytes per extension — the one place a format's signature is written.
 *
 * Keyed by extension rather than by group because a group holds several formats and `.svg` is
 * legitimately in two groups (FR-011). The group decides *which* extensions are acceptable;
 * this table decides what each of them must look like.
 */
const SIGNATURE: Readonly<Record<string, SignatureMatcher>> = Object.freeze({
  '.jpg': (head) => startsWith(head, [0xff, 0xd8, 0xff]),
  '.jpeg': (head) => startsWith(head, [0xff, 0xd8, 0xff]),
  '.png': (head) => startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  '.webp': (head) => asciiAt(head, 0, 4) === 'RIFF' && asciiAt(head, 8, 4) === 'WEBP',
  '.svg': isSvgText,
  '.pdf': (head) => startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d]), // '%PDF-'
  '.zip': isZipContainer,
  '.3mf': isZipContainer, // a 3MF is a ZIP with an OPC layout we deliberately do not open
  '.glb': isGlbContainer,
  '.gltf': isJsonText,
  '.stl': isStlContainer,
  // Wavefront OBJ is plain text with no signature at all; a DXF is either plain text or opens
  // with AutoCAD's sentinel. Both are stated here rather than pretended about.
  '.obj': (head) => looksTextual(head),
  '.dxf': (head) => startsWith(head, [...'AutoCAD Binary DXF'].map((c) => c.charCodeAt(0))) || looksTextual(head),
})

/** A derivative plus the bytes to write. The bytes never leave this module. */
type RenderedDerivative = Derivative & { readonly body: Uint8Array }

/** Either the derivatives to write, or the refusal that stops the release. */
type DerivationOutcome =
  | { readonly ok: true; readonly rendered: readonly RenderedDerivative[] }
  | { readonly ok: false; readonly refusal: VerifyResult }

/**
 * `media/image/<uuid>.png` → `media/image/<uuid>-card.webp`.
 *
 * Built from the released key, which `generateObjectKey` produced (FR-013), so the client's
 * filename contributes nothing here either — a derivative key cannot traverse where the
 * original could not.
 */
function derivativeKeyFor(releaseKey: string, name: DerivativeName): string {
  return `${releaseKey.replace(TRAILING_EXTENSION, '')}-${name}${DERIVATIVE_EXTENSION}`
}

/**
 * Resizes one source into every declared width. Widths only: `fit: 'inside'` keeps the source's
 * aspect ratio, and `withoutEnlargement` means a 64 px avatar stays 64 px rather than becoming
 * 768 px of blur that costs more bytes than the original did.
 *
 * Throws whatever `sharp` throws — an undecodable source is the caller's decision, not this
 * function's, and it is handled in `deriveImages`.
 */
async function renderDerivatives(
  source: Uint8Array,
  releaseKey: string,
): Promise<readonly RenderedDerivative[]> {
  const sizes = Object.entries(DERIVATIVE_WIDTHS) as readonly [DerivativeName, number][]
  const rendered: RenderedDerivative[] = []

  for (const [name, width] of sizes) {
    const { data, info } = await sharp(source, {
      animated: false,
      limitInputPixels: MAX_DERIVATIVE_INPUT_PIXELS,
    })
      // Applies the EXIF orientation tag, then drops it. sharp does NOT auto-orient without
      // this, and it strips metadata by default — so a portrait phone photo (orientation 6,
      // which is what almost every portrait JPEG carries) would produce a thumbnail rotated a
      // quarter turn, with the tag gone so nothing downstream could recover it, and with
      // width/height reported transposed. That is the same class of failure this task exists
      // to prevent: a card that renders wrong because the derivative was never really made.
      // Must precede `.resize()` — the fit box applies to the oriented image, not the stored one.
      .rotate()
      .resize({ width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: DERIVATIVE_QUALITY })
      .toBuffer({ resolveWithObject: true })

    rendered.push({
      name,
      key: derivativeKeyFor(releaseKey, name),
      width: info.width,
      height: info.height,
      bytes: info.size,
      body: new Uint8Array(data),
    })
  }

  return rendered
}

/**
 * Generates the derivatives for a verified object, **before** it is released, so a source no
 * decoder accepts is refused rather than published with empty size fields.
 *
 * Reads the whole object — bounded by the group's cap, which was already enforced at presign
 * and re-checked from `HeadObject` above, and only for the raster extensions.
 */
async function deriveImages(args: {
  readonly key: string
  readonly releaseKey: string
  readonly extension: string
  readonly contentLength: number
  readonly store: QuarantineObjectStore
}): Promise<DerivationOutcome> {
  const { key, releaseKey, extension, contentLength, store } = args

  // Only the EXTENSION decides whether this object must decode. Gating on `writer` as well —
  // which is what this line used to do — made the `imagem-ilegivel` refusal conditional on a
  // *write* capability: with no writer an undecodable image was released, while the module
  // docstring stated the refusal unconditionally. Every test on the sibling path passes no
  // writer, so the gate was absent exactly where it was most claimed. Rendering with nobody to
  // write to costs a resize nobody keeps; a divergence between what is validated with and
  // without a writer costs a published file no decoder accepts.
  if (!DERIVABLE_EXTENSIONS.includes(extension)) return { ok: true, rendered: [] }

  const source = await store.readRange(key, 0, contentLength - 1)
  try {
    return { ok: true, rendered: await renderDerivatives(source, releaseKey) }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    return {
      ok: false,
      refusal: reject(
        key,
        'imagem-ilegivel',
        `Upload recusado: os bytes iniciais são de um arquivo "${extension}", mas a imagem não ` +
          `pôde ser decodificada para gerar as miniaturas (${detail}).`,
      ),
    }
  }
}

/**
 * Writes the derivatives, after the original has been released, and reports them without their
 * bytes. Takes the writer as possibly-absent so the caller has no branch of its own: with no
 * writer the rendered bytes are simply dropped here. `deriveImages` still rendered them, because
 * the decode is the gate and the gate does not depend on whether anyone wants the output.
 */
async function writeDerivatives(
  writer: DerivativeWriter | undefined,
  rendered: readonly RenderedDerivative[],
): Promise<readonly Derivative[]> {
  if (!writer) return []
  const written: Derivative[] = []
  for (const { body, ...derivative } of rendered) {
    await writer.put(derivative.key, body, DERIVATIVE_CONTENT_TYPE)
    written.push(derivative)
  }
  return written
}

function reject(key: string, reason: RejectionReason, message: string): VerifyResult {
  return { released: false, key, reason, message }
}

/** The destination key: same group, same generated name, a prefix that is served. */
function releaseKeyFor(quarantineKey: string): string {
  if (!quarantineKey.startsWith(`${QUARANTINE_PREFIX}/`)) throw new NotQuarantinedError(quarantineKey)
  return `${SERVED_PREFIX}/${quarantineKey.slice(QUARANTINE_PREFIX.length + 1)}`
}

/**
 * The exact shape `generateObjectKey` produces: the quarantine prefix, a known group, a UUID,
 * and at most one lowercase suffix (FR-013).
 *
 * **An allowlist, for the same reason `keys.ts` generates rather than sanitises.** The obvious
 * guard here is "reject a key containing `..`", and that is a blocklist — it has to anticipate
 * `..\`, `%2e%2e%2f`, a NUL-truncated segment, whatever the next decoder unescapes, and it
 * fails open the first time one is missed. Matching the one shape we emit has no such surface.
 */
const GENERATED_KEY = new RegExp(
  `^${QUARANTINE_PREFIX}/(?:${MEDIA_GROUPS.join('|')})/` +
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\\.[a-z0-9]+)?$',
)

/** The key's extension, lowercased, or `''` when it has none. */
function extensionOf(key: string): string {
  return TRAILING_EXTENSION.exec(key)?.[0].toLowerCase() ?? ''
}

/**
 * The key-shape check. `null` when it passes.
 *
 * Refused rather than thrown, because on this path the key is **client-supplied**: with
 * `clientUploads` the browser PUTs on its own and then reports the key it wrote, so this
 * parameter is as attacker-influenced as the filename is (SC-008). A key carrying `../..`
 * satisfied `releaseKeyFor`'s prefix test — that function rewrites only the prefix — so
 * `quarantine/image/../../etc/passwd.png` released to `media/image/../../etc/passwd.png`,
 * which normalises to the bucket root, outside the prefix `infra/minio-init.sh` provisions as
 * served. Watched failing in `tests/uploads/verify.test.ts` (T021) before this existed.
 */
function keyRefusal(key: string): VerifyResult | null {
  if (GENERATED_KEY.test(key)) return null
  return reject(
    key,
    'chave-invalida',
    `Upload recusado: a chave "${key}" não tem a forma gerada por este sistema ` +
      `(${QUARANTINE_PREFIX}/<grupo>/<uuid>[.ext]), portanto não identifica um objeto em ` +
      'quarentena que possa ser liberado.',
  )
}

/** The size check, against the cap the group was presigned under. `null` when it passes. */
function sizeRefusal(key: string, group: MediaGroup, sizeBytes: number): VerifyResult | null {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    return reject(
      key,
      'tamanho-invalido',
      `Upload recusado: o objeto tem ${sizeBytes} bytes, portanto não carrega arquivo algum.`,
    )
  }
  const cap = UPLOAD_CAP_BYTES[group]
  if (sizeBytes > cap) {
    return reject(
      key,
      'excede-o-limite',
      `Upload recusado: o objeto armazenado tem ${sizeBytes} bytes e excede o limite de ` +
        `${cap} bytes para o grupo "${group}".`,
    )
  }
  return null
}

/**
 * Verifies one uploaded object and releases it from quarantine, or refuses it and leaves it
 * there (FR-014, SC-006).
 *
 * Runs **after** the browser has finished its presigned PUT — with `clientUploads` there is
 * no earlier point at which the bytes exist to be checked. Cheap checks come first: the size
 * from `HeadObject` and the extension against the group's allowlist are both settled before a
 * single byte of the object is fetched.
 *
 * @example
 * const result = await verifyUploaded(key, 'image', s3Quarantine, s3Derivatives)
 * if (!result.released) return badRequest(result.message) // the object stays quarantined
 * // result.derivatives is empty unless a writer was passed — the size fields depend on it
 * await payload.update({ ..., data: { url: result.key, sizes: result.derivatives } })
 */
export async function verifyUploaded(
  key: string,
  declared: MediaGroup,
  store: QuarantineObjectStore,
  derivativeWriter?: DerivativeWriter,
): Promise<VerifyResult> {
  const allowed = ALLOWED_EXTENSIONS[declared] as readonly string[] | undefined
  if (!allowed) throw new UnverifiableMediaGroupError(String(declared))
  const releaseKey = releaseKeyFor(key)

  // Before the store is touched: the key is client-supplied on this path (see `keyRefusal`).
  const refusedForKey = keyRefusal(key)
  if (refusedForKey) return refusedForKey

  const { contentLength } = await store.head(key)
  const refusedForSize = sizeRefusal(key, declared, contentLength)
  if (refusedForSize) return refusedForSize

  const extension = extensionOf(key)
  const matches = allowed.includes(extension) ? SIGNATURE[extension] : undefined
  if (!matches) {
    return reject(
      key,
      'extensao-nao-permitida',
      `Upload recusado: a extensão "${extension || '(nenhuma)'}" não está na lista do grupo ` +
        `"${declared}" (${allowed.join(' ')}), portanto não há assinatura a conferir.`,
    )
  }

  const window = Math.min(SIGNATURE_WINDOW_BYTES, contentLength)
  const head = await store.readRange(key, 0, window - 1)
  if (!matches(head, contentLength)) {
    return reject(
      key,
      'assinatura-nao-confere',
      `Upload recusado: os bytes iniciais do objeto não correspondem a um arquivo "${extension}" ` +
        `do grupo "${declared}". O conteúdo é conferido pela assinatura, não pela extensão.`,
    )
  }

  // Rendered before the move, deliberately: an image no decoder accepts must not reach the
  // served prefix, and derivatives for an object that never released would be orphans.
  // No `writer` here on purpose: the decode is the gate and runs regardless of who wants the
  // output. `writeDerivatives` below is the only thing the writer decides.
  const derived = await deriveImages({ key, releaseKey, extension, contentLength, store })
  if (!derived.ok) return derived.refusal

  await store.move(key, releaseKey)
  const derivatives = await writeDerivatives(derivativeWriter, derived.rendered)

  return { released: true, key: releaseKey, quarantineKey: key, bytes: contentLength, derivatives }
}
