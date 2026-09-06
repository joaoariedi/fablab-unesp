import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { QUARANTINE_PREFIX } from '../../lib/uploads/keys'
import { UPLOAD_CAP_BYTES, type MediaGroup } from '../../lib/uploads/limits'
import {
  SERVED_PREFIX,
  verifyUploaded,
  type DerivativeWriter,
  type ObjectHead,
  type QuarantineObjectStore,
} from '../../lib/uploads/verify'

/**
 * T019 — FR-011: the derivatives are produced **in this pass, by `sharp`**, or they are never
 * produced at all.
 *
 * Spike S1 measured that `imageSizes` runs on no path with `clientUploads`: `generateFileData`
 * returns at `if (!file)` before any resizing, and the storage plugins declare the size fields
 * without ever filling them. So the failure this file exists to catch is not a crash — it is a
 * document that carries `sizes.miniatura` and `sizes.card` forever empty, which looks exactly
 * like a working feature until a card tries to render one.
 *
 * The four claims a weaker test would miss:
 *
 *  1. **The bytes are real and `sharp` really ran.** Every assertion decodes what was written
 *     and reads its true metadata. A fake resizer injected here would prove the plumbing and
 *     nothing about the one library the task names.
 *  2. **A derivative is smaller, and it is not a stretched copy.** Width alone is satisfiable
 *     by any resize; the aspect ratio is what proves the source was scaled rather than cropped
 *     or squashed, and `withoutEnlargement` is what stops a 64 px avatar being blown up to
 *     768 px of blur that costs more bytes than the original.
 *  3. **SVG is never rasterised** (CLR-003). Turning an `.svg` into a raster derivative means
 *     running librsvg over attacker-supplied XML — a parser over hostile input, which is the
 *     exact trade the spec refused for 3D containers. It is released, undecoded, with no
 *     derivatives.
 *  4. **A refused object produces nothing.** Derivative generation happens before the release
 *     and must not leave objects behind under the served prefix for bytes that never passed.
 */

type StoredObject = {
  readonly body: Uint8Array
  /** What `HeadObject` reports; defaults to the body length. */
  readonly reportedSize?: number
}

/** Stands in for the bucket. Records calls so "nothing was written" is observable. */
class FakeObjectStore implements QuarantineObjectStore {
  readonly ranges: { key: string; start: number; end: number }[] = []
  readonly moves: { from: string; to: string }[] = []

  constructor(private readonly objects: Map<string, StoredObject>) {}

  head = async (key: string): Promise<ObjectHead> => {
    const object = this.objects.get(key)
    if (!object) throw new Error(`FakeObjectStore: no object at ${key}`)
    return { contentLength: object.reportedSize ?? object.body.length }
  }

  readRange = async (key: string, start: number, end: number): Promise<Uint8Array> => {
    this.ranges.push({ key, start, end })
    const object = this.objects.get(key)
    if (!object) throw new Error(`FakeObjectStore: no object at ${key}`)
    return object.body.slice(start, end + 1)
  }

  move = async (from: string, to: string): Promise<void> => {
    this.moves.push({ from, to })
    const object = this.objects.get(from)
    if (!object) throw new Error(`FakeObjectStore: no object at ${from}`)
    this.objects.set(to, object)
    this.objects.delete(from)
  }
}

/** Collects the derivatives instead of writing them, so their bytes can be decoded here. */
class FakeDerivativeWriter implements DerivativeWriter {
  readonly puts: { key: string; body: Uint8Array; contentType: string }[] = []

  put = async (key: string, body: Uint8Array, contentType: string): Promise<void> => {
    this.puts.push({ key, body, contentType })
  }
}

const UUID = '6f1cbb4e-9e2a-4d0f-8a3e-1c2b7d5a9f10'

function quarantineKey(group: MediaGroup, extension: string): string {
  return `${QUARANTINE_PREFIX}/${group}/${UUID}${extension}`
}

function storeWith(key: string, body: Uint8Array, reportedSize?: number): FakeObjectStore {
  return new FakeObjectStore(new Map([[key, { body, reportedSize }]]))
}

/** A genuine PNG, built by the same library that will be asked to resize it. */
async function png(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 18, g: 52, b: 176 } },
  })
    .png()
    .toBuffer()
  return new Uint8Array(buffer)
}

/**
 * A JPEG whose stored pixels are `width` x `height` but which carries EXIF orientation 6 —
 * "rotate 90 degrees clockwise to display". This is what almost every portrait photograph taken
 * on a phone actually is: the sensor writes landscape and tags the rotation.
 *
 * Synthesised rather than committed as a binary so the fixture's one load-bearing property —
 * the orientation tag — is visible in this file instead of hidden in a blob.
 */
async function jpegWithOrientation(
  width: number,
  height: number,
  orientation: number,
): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 18, g: 52, b: 176 } },
  })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer()
  return new Uint8Array(buffer)
}

/** What the derivative actually is, read back from the bytes that were written. */
async function decoded(body: Uint8Array): Promise<{ format?: string; width?: number; height?: number }> {
  const { format, width, height } = await sharp(Buffer.from(body)).metadata()
  return { format, width, height }
}

async function releaseImage(
  source: Uint8Array,
  extension = '.png',
): Promise<{
  result: Awaited<ReturnType<typeof verifyUploaded>>
  store: FakeObjectStore
  writer: FakeDerivativeWriter
}> {
  const key = quarantineKey('image', extension)
  const store = storeWith(key, source)
  const writer = new FakeDerivativeWriter()
  const result = await verifyUploaded(key, 'image', store, writer)
  return { result, store, writer }
}

describe('a released image carries derivatives, generated here by sharp (FR-011)', () => {
  it('writes more than one size, each a real webp decoded from what was stored', async () => {
    const { result, writer } = await releaseImage(await png(1200, 800))

    expect(result.released, `a genuine PNG was refused: ${JSON.stringify(result)}`).toBe(true)
    expect(
      writer.puts.length,
      'no derivative was written: `imageSizes` runs on no path with clientUploads (spike S1), ' +
        'so a document with size fields and nothing in them is the expected failure here',
    ).toBeGreaterThan(1)

    for (const put of writer.puts) {
      const image = await decoded(put.body)
      expect(image.format, `${put.key} is not a webp: ${image.format}`).toBe('webp')
      expect(put.contentType).toBe('image/webp')
    }
  })

  it('scales rather than stretches, and every size is smaller than the source', async () => {
    const { writer } = await releaseImage(await png(1200, 800))

    // Without this the loop below is vacuous: zero derivatives satisfy every claim about them.
    expect(writer.puts.length, 'no derivative was written at all').toBeGreaterThan(1)

    const widths: number[] = []
    for (const put of writer.puts) {
      const { width, height } = await decoded(put.body)
      expect(width, `${put.key} has no width`).toBeDefined()
      expect(width!, `${put.key} is not smaller than the 1200px source`).toBeLessThan(1200)
      expect(
        width! / height!,
        `${put.key} is ${width}x${height}; the 3:2 source was squashed rather than scaled`,
      ).toBeCloseTo(1.5, 2)
      widths.push(width!)
    }

    expect(
      new Set(widths).size,
      `the derivatives are all the same width (${widths.join(', ')}) — one size is not a set of sizes`,
    ).toBe(widths.length)
  })

  it('never enlarges a source smaller than the target width', async () => {
    const { writer } = await releaseImage(await png(64, 64))

    expect(writer.puts.length, 'no derivative was written at all').toBeGreaterThan(1)

    for (const put of writer.puts) {
      const { width } = await decoded(put.body)
      expect(
        width!,
        `${put.key} is ${width}px wide from a 64px source: upscaling costs bytes and adds no detail`,
      ).toBeLessThanOrEqual(64)
    }
  })

  it('names each derivative in the result, keyed off the generated key alone (FR-013)', async () => {
    const { result, writer } = await releaseImage(await png(1200, 800))

    expect(result.released).toBe(true)
    if (!result.released) return
    expect(
      result.derivatives.map((derivative) => derivative.key).sort(),
      'the result does not report the derivatives that were written',
    ).toEqual(writer.puts.map((put) => put.key).sort())

    for (const derivative of result.derivatives) {
      expect(derivative.key.startsWith(`${SERVED_PREFIX}/image/${UUID}`), derivative.key).toBe(true)
      expect(derivative.key.endsWith('.webp'), derivative.key).toBe(true)
      const image = await decoded(writer.puts.find((put) => put.key === derivative.key)!.body)
      expect(derivative.width, `${derivative.key} reports a width it does not have`).toBe(image.width)
      expect(derivative.height, `${derivative.key} reports a height it does not have`).toBe(image.height)
    }
  })
})

describe('what is deliberately not derived', () => {
  it('releases an SVG without rasterising it (CLR-003)', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
    const { result, writer } = await releaseImage(svg, '.svg')

    expect(result.released, `a valid SVG was refused: ${JSON.stringify(result)}`).toBe(true)
    expect(
      writer.puts,
      'an SVG was rasterised: that runs librsvg over attacker-supplied XML, the parser-over-' +
        'hostile-input trade CLR-003 refused for 3D containers',
    ).toEqual([])
  })

  it('derives nothing for a document upload', async () => {
    const key = quarantineKey('document', '.pdf')
    const store = storeWith(key, new TextEncoder().encode('%PDF-1.7\n1 0 obj'))
    const writer = new FakeDerivativeWriter()

    const result = await verifyUploaded(key, 'document', store, writer)

    expect(result.released).toBe(true)
    expect(writer.puts, 'a PDF was handed to an image resizer').toEqual([])
  })

  it('derives nothing when the object is refused, and does not release it', async () => {
    const key = quarantineKey('image', '.png')
    const store = storeWith(key, new TextEncoder().encode('MZ\x90 this is a windows executable'))
    const writer = new FakeDerivativeWriter()

    const result = await verifyUploaded(key, 'image', store, writer)

    expect(result.released).toBe(false)
    expect(writer.puts, 'derivatives were written for bytes that failed the signature check').toEqual([])
    expect(store.moves).toEqual([])
  })

  it('refuses a .png whose header is genuine but whose image cannot be decoded', async () => {
    // The signature check passes: these are the eight real PNG magic bytes. Nothing after them
    // is a PNG, so the resize is the first thing that can tell — and a file no decoder accepts
    // must not be released with two empty size fields beside it.
    const key = quarantineKey('image', '.png')
    const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    const store = storeWith(key, Uint8Array.from([...header, ...new Array(64).fill(0x41)]))
    const writer = new FakeDerivativeWriter()

    const result = await verifyUploaded(key, 'image', store, writer)

    expect(result.released).toBe(false)
    if (result.released) return
    expect(result.reason).toBe('imagem-ilegivel')
    expect(result.message, `the refusal does not name the extension: ${result.message}`).toMatch(/\.png/)
    expect(store.moves, 'an undecodable image was released into the served prefix').toEqual([])
    expect(writer.puts).toEqual([])
  })

  it('reads the whole image once and only within the image cap', async () => {
    const source = await png(300, 200)
    const { store } = await releaseImage(source)

    const fullReads = store.ranges.filter((range) => range.end - range.start + 1 > 1024)
    expect(fullReads).toHaveLength(1)
    expect(fullReads[0]!.start).toBe(0)
    expect(
      fullReads[0]!.end - fullReads[0]!.start + 1,
      'the resize fetched more than the image cap allows to exist',
    ).toBeLessThanOrEqual(UPLOAD_CAP_BYTES.image)
  })
})

describe('verification without a derivative writer still releases (T018 is unchanged)', () => {
  it('releases a genuine PNG and reports no derivatives', async () => {
    const key = quarantineKey('image', '.png')
    const store = storeWith(key, await png(120, 80))

    const result = await verifyUploaded(key, 'image', store)

    expect(result.released).toBe(true)
    if (!result.released) return
    expect(result.derivatives, 'derivatives appeared with nowhere to write them').toEqual([])
    expect(store.moves).toHaveLength(1)
  })
})

describe('EXIF orientation is applied, not ignored (regression)', () => {
  /**
   * The defect this block was written for: `renderDerivatives` piped
   * `sharp(source).resize().webp()` with no `.rotate()`. sharp does not auto-orient unless
   * asked and strips metadata by default, so a portrait phone photo produced a landscape
   * thumbnail rotated a quarter turn, with the orientation tag gone so nothing downstream
   * could recover it — and with `width`/`height` reported transposed.
   *
   * It survived the original suite because every fixture there is sharp-synthesised and
   * therefore EXIF-free. A test whose inputs cannot carry the tag cannot notice it is ignored.
   */
  it('produces a PORTRAIT derivative from a landscape-stored, orientation-6 source', async () => {
    const source = await jpegWithOrientation(1200, 800, 6)
    const { writer } = await releaseImage(source, '.jpg')

    const thumbnail = writer.puts.find((entry) => entry.key.endsWith('-miniatura.webp'))
    expect(thumbnail, 'no miniatura was written for a JPEG source').toBeDefined()

    const { width, height } = await decoded(thumbnail!.body)
    expect(
      (width ?? 0) < (height ?? 0),
      `orientation 6 means "rotate 90° to display", so a 1200x800 source displays as 800x1200 ` +
        `and its derivative must be taller than it is wide. Got ${width}x${height} — the EXIF ` +
        'tag was ignored, which is a thumbnail lying on its side.',
    ).toBe(true)
  })

  it('leaves an untagged source alone, so the fix is orientation and not a blanket rotate', async () => {
    // The pair. Without it, `.rotate(90)` — rotating everything unconditionally — would pass
    // the case above while breaking every photograph that was already upright.
    const source = await jpegWithOrientation(1200, 800, 1)
    const { writer } = await releaseImage(source, '.jpg')

    const thumbnail = writer.puts.find((entry) => entry.key.endsWith('-miniatura.webp'))
    const { width, height } = await decoded(thumbnail!.body)
    expect(
      (width ?? 0) > (height ?? 0),
      `an upright 1200x800 source must stay landscape; got ${width}x${height}`,
    ).toBe(true)
  })
})

describe('the decode gate does not depend on a writer (regression)', () => {
  it('refuses an undecodable image even when no derivative writer is passed', async () => {
    // `deriveImages` used to return early on `!writer`, which made the `imagem-ilegivel`
    // refusal conditional on a *write* capability while the module docstring stated it
    // unconditionally. Every test on the sibling verification path passes no writer, so the
    // gate was absent exactly where it was most claimed — an undecodable PNG was released.
    const header = (await png(8, 8)).slice(0, 64)
    const corrupt = new Uint8Array(4096)
    corrupt.set(header, 0)

    const key = quarantineKey('image', '.png')
    const store = storeWith(key, corrupt)
    const result = await verifyUploaded(key, 'image', store)

    expect(
      result.released,
      'an image whose bytes no decoder accepts was released because nobody asked for ' +
        'derivatives. The decode is the gate; the writer only decides who keeps the output.',
    ).toBe(false)
    expect(result.released ? undefined : result.reason).toBe('imagem-ilegivel')
  })
})
