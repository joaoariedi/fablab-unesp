import { randomFillSync } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALLOWED_EXTENSIONS, UPLOAD_CAP_BYTES } from '../../lib/uploads/limits'
import { DERIVATIVE_WIDTHS } from '../../lib/uploads/verify'

/**
 * T034 / FR-011, FR-014, SC-006 — the upload path **driven**, not described.
 *
 * Every other file in `tests/uploads/` reads the config or calls one function: they assert
 * that `mimeTypes` is declared, that `imageSizes` is declared, that `refuseOffPolicyUpload`
 * throws when called by hand. All of them stay green on a product where no upload works at
 * all — a collection whose hook is never registered, a `sharp` that was never handed to
 * `buildConfig` (spike S1's finding), an adapter that stores nothing. This file is the one
 * that runs `payload.create` with real bytes and looks at what came out.
 *
 * **Why an in-process bucket rather than the compose stack's MinIO.** `clientUploads` is off
 * (D1), so the bytes go through Node and out to the S3 adapter — which means the create
 * *fails* with no object store reachable, and CI runs Postgres and no MinIO. Pointing the
 * five `S3_*` variables at a fake bucket that speaks the same protocol is exactly the swap
 * FR-019 says must be configuration-only (`storage-adapter.test.ts` asserts the swap; this
 * file performs one), and it makes the derivatives *observable as bytes* rather than as
 * fields Payload filled in. Nothing else about the path is stood in for: the config is the
 * app's own, the collection is the app's own, the hooks and `sharp` are the app's own.
 *
 * The three claims, one per describe:
 *
 *  1. Payload generated the derivatives **itself**. Not "the document has a `sizes` object" —
 *     the bucket holds bytes that decode, at the declared width, with the source's aspect.
 *  2. A disallowed type is refused **by the collection's `mimeTypes`**, which is Payload's
 *     `checkFileRestrictions` sniffing the leading bytes (FR-014). The file is named `.png`
 *     on purpose: an extension the group allows, so our own extension gate lets it past and
 *     the refusal can only have come from the framework's byte check.
 *  3. An over-cap file is refused **by the size hook**, which is ours, because payload 3.88
 *     has no per-collection `filesize` at all.
 *
 * Both refusals are asserted to leave the bucket *and* the collection empty. A refusal that
 * happens after the object is stored has already paid the disk cost it existed to prevent.
 */

const ORG_SLUG = 'upload-nativo'
const BUCKET = 'fablab-test-t034'
const IMAGE_SLUG = 'midiaImagem'

/** 16:9, and larger than every derivative width, so each size is a real downscale. */
const SOURCE = { width: 1600, height: 900 } as const

type Doc = Record<string, unknown>
type SizeEntry = { filename?: null | string; width?: null | number; height?: null | number }

/**
 * The object store, in process, speaking enough S3 for `putObject`/`deleteObject`.
 *
 * A named fake rather than an inline stub for the reason the rules give: it is greppable and
 * reusable, and — the point here — it *records*, so "the refused upload wrote nothing" is an
 * assertion about observed calls rather than about an absence nobody looked for.
 */
class FakeBucket {
  readonly objects = new Map<string, Buffer>()
  private server?: Server

  /** Starts on an ephemeral port and returns the endpoint the S3 client should use. */
  async listen(): Promise<string> {
    const server = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    this.server = server
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  async close(): Promise<void> {
    if (!this.server) return
    // Keep-alive sockets from the SDK's agent hold `close()` open forever otherwise.
    this.server.closeAllConnections()
    await new Promise<void>((resolve) => this.server?.close(() => resolve()))
  }

  /** Keys under a filename's stem — the original plus whatever derivatives were written. */
  keysLike(stem: string): string[] {
    return [...this.objects.keys()].filter((key) => key.startsWith(stem)).sort()
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const key = decodeURIComponent(new URL(req.url ?? '/', 'http://bucket').pathname).replace(
      `/${BUCKET}/`,
      '',
    )
    if (req.method === 'PUT') {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      this.objects.set(key, Buffer.concat(chunks))
      res.writeHead(200, { ETag: '"fake"' }).end()
      return
    }
    if (req.method === 'DELETE') {
      this.objects.delete(key)
      res.writeHead(204).end()
      return
    }
    const body = this.objects.get(key)
    if (!body) {
      res.writeHead(404, { 'Content-Type': 'application/xml' }).end('<Error><Code>NoSuchKey</Code></Error>')
      return
    }
    res.writeHead(200, { 'Content-Length': String(body.length) }).end(req.method === 'HEAD' ? undefined : body)
  }
}

const bucket = new FakeBucket()
let payload: Payload
let org: number
let uploaded: Doc

/** A real PNG, so `sharp` has something to decode on the way in and on the way out. */
const pngSource = async (): Promise<Buffer> =>
  sharp({
    create: { ...SOURCE, channels: 3, background: { r: 20, g: 80, b: 160 } },
  })
    .png()
    .toBuffer()

/**
 * A **valid** PNG larger than the image cap.
 *
 * Incompressible on purpose: random pixels, so the encoder cannot shrink 11 MB of noise back
 * under the limit. It matters that this decodes — `Buffer.alloc(cap + 1)` is refused by the
 * byte check whether or not a size guard exists, which would let this file report FR-012 as
 * held while the hook that holds it was gone. Watched: with `beforeOperation` emptied, the
 * upload of these bytes *succeeds* and three assertions go red.
 */
const oversizedPng = async (): Promise<Buffer> => {
  const [width, height] = [2200, 1800]
  const pixels = Buffer.allocUnsafe(width * height * 3)
  for (let offset = 0; offset < pixels.length; offset += 65_536) {
    randomFillSync(pixels, offset, Math.min(65_536, pixels.length - offset))
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer()
}

/** A minimal but genuine PDF — `file-type` reports `application/pdf` for these bytes. */
const pdfBytes = (): Buffer =>
  Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n')

const upload = async (name: string, data: Buffer): Promise<Doc> =>
  (await payload.create({
    collection: IMAGE_SLUG as never,
    data: { tenant: org } as never,
    file: { data, mimetype: 'image/png', name, size: data.length },
    overrideAccess: true,
  })) as unknown as Doc

/**
 * Every message a refusal carries. Payload's `ValidationError` puts the reason in
 * `data.errors[].message` and leaves the top-level message generic, so asserting on
 * `error.message` alone would pass against a refusal for any reason at all.
 */
const refusalOf = async (attempt: Promise<unknown>): Promise<string> => {
  try {
    await attempt
  } catch (error) {
    const { message, data } = error as { message: string; data?: { errors?: { message: string }[] } }
    return [message, ...(data?.errors ?? []).map((e) => e.message)].join(' | ')
  }
  throw new Error('Expected the upload to be refused, but it succeeded.')
}

const rowCount = async (): Promise<number> =>
  (await payload.count({ collection: IMAGE_SLUG as never, overrideAccess: true })).totalDocs

beforeAll(async () => {
  // Set before the config module is evaluated: `readEnv()` runs at import time, and the
  // adapter is a pure function of what it read. This is the FR-019 swap, performed.
  const endpoint = await bucket.listen()
  process.env.S3_ENDPOINT = endpoint
  process.env.S3_BUCKET = BUCKET
  process.env.S3_ACCESS_KEY_ID = 'fake-key'
  process.env.S3_SECRET_ACCESS_KEY = 'fake-secret'
  process.env.S3_REGION = 'us-east-1'

  const [{ default: config }, { getPayload }] = await Promise.all([
    import('../../payload.config'),
    import('payload'),
  ])
  payload = await getPayload({ config, key: 'native-upload-t034' })

  // Re-runnable: an interrupted run must not fail the next one on a unique slug.
  await payload.delete({ collection: IMAGE_SLUG as never, where: { id: { exists: true } }, overrideAccess: true })
  await payload.delete({
    collection: 'organizations',
    where: { slug: { equals: ORG_SLUG } },
    overrideAccess: true,
  })
  const created = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab do Upload Nativo', slug: ORG_SLUG, status: 'active' },
    overrideAccess: true,
  })
  org = created.id as number

  uploaded = await upload('foto-projeto.png', await pngSource())
}, 120_000)

afterAll(async () => {
  if (payload) {
    await payload.delete({ collection: IMAGE_SLUG as never, where: { id: { exists: true } }, overrideAccess: true })
    await payload.delete({
      collection: 'organizations',
      where: { slug: { equals: ORG_SLUG } },
      overrideAccess: true,
    })
  }
  await bucket.close()
})

describe('Payload generates the derivatives itself, on the native path (FR-011)', () => {
  it('stores the original in the bucket', () => {
    expect(uploaded.filename).toBe('foto-projeto.png')
    expect(bucket.objects.get('foto-projeto.png')?.length).toBeGreaterThan(0)
  })

  it.each(Object.entries(DERIVATIVE_WIDTHS))(
    'records the %s derivative on the document at width %i',
    (name, width) => {
      const size = (uploaded.sizes as Record<string, SizeEntry | undefined> | undefined)?.[name]
      expect(size, `the document carries no sizes.${name} — imageSizes did not run`).toBeTruthy()
      expect(size?.width).toBe(width)
      expect(size?.filename).toBeTruthy()
    },
  )

  it.each(Object.entries(DERIVATIVE_WIDTHS))(
    'writes %s bytes that decode at width %i, with the source aspect ratio',
    async (name, width) => {
      const size = (uploaded.sizes as Record<string, SizeEntry | undefined>)?.[name]
      const stored = bucket.objects.get(String(size?.filename))
      expect(stored, `nothing was stored for sizes.${name} — the size field is a promise nobody kept`).toBeTruthy()

      const meta = await sharp(stored!).metadata()
      expect(meta.width).toBe(width)
      // Scaled, not cropped or squashed: a width assertion alone passes on either.
      expect(meta.height).toBe(Math.round((width * SOURCE.height) / SOURCE.width))
      expect(stored!.length).toBeLessThan(bucket.objects.get('foto-projeto.png')!.length)
    },
  )

  it('writes the original and every derivative, and nothing else', () => {
    expect(bucket.keysLike('foto-projeto')).toHaveLength(1 + Object.keys(DERIVATIVE_WIDTHS).length)
  })
})

describe("a disallowed type is refused by the collection's mimeTypes (FR-014, SC-006)", () => {
  const NAME = 'disfarce.png'

  it('lets our own extension gate pass it, so only the byte check can refuse it', () => {
    expect(ALLOWED_EXTENSIONS.image).toContain('.png')
  })

  it('refuses a PDF renamed .png, naming the type it detected', async () => {
    const before = bucket.objects.size
    const message = await refusalOf(upload(NAME, pdfBytes()))

    // Payload's wording, not ours: `checkFileRestrictions` sniffed the bytes and compared
    // them against `upload.mimeTypes`. Our hook's refusal reads "Upload recusado: …", so
    // this assertion cannot be satisfied by the extension gate.
    expect(message).toMatch(/Invalid MIME type: application\/pdf/)
    expect(bucket.objects.size, 'the refused bytes reached the bucket').toBe(before)
  })

  it('creates no row for the refused upload', async () => {
    expect(await rowCount()).toBe(1)
  })
})

describe('an over-cap file is refused by the size hook (FR-012, SC-007)', () => {
  it('refuses a decodable image over the group cap, naming the size and the limit', async () => {
    const before = bucket.objects.size
    const oversized = await oversizedPng()
    // Self-check: a source the encoder managed to squeeze under the cap would make the
    // refusal below prove nothing at all.
    expect(oversized.length).toBeGreaterThan(UPLOAD_CAP_BYTES.image)

    const message = await refusalOf(upload('enorme.png', oversized))

    expect(message).toContain(String(oversized.length))
    expect(message).toContain(String(UPLOAD_CAP_BYTES.image))
    expect(bucket.objects.size, 'an over-cap file was stored before being refused').toBe(before)
  })

  it('creates no row for the refused upload', async () => {
    expect(await rowCount()).toBe(1)
  })
})
