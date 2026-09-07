import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { generateObjectKey, QUARANTINE_PREFIX } from '../../lib/uploads/keys'
import { UPLOAD_CAP_BYTES, type MediaGroup } from '../../lib/uploads/limits'
import {
  SERVED_PREFIX,
  SIGNATURE_WINDOW_BYTES,
  verifyUploaded,
  type ObjectHead,
  type QuarantineObjectStore,
} from '../../lib/uploads/verify'

/**
 * T018 — FR-014 / SC-006: the object is verified **after** it lands, by its leading bytes,
 * and only then does it leave `quarantine/`.
 *
 * Why after and not before: with `clientUploads` the browser PUTs straight to the bucket and
 * Node never sees the bytes (spike S1), so there is no `beforeValidate` that could look at
 * them. There is also no field-level net underneath — `generateFileData` returns before
 * `checkFileRestrictions` on this path, so the collection's `mimeTypes` never execute. What
 * this file exercises is the *whole* content check, not one layer of two.
 *
 * The three claims a weaker test would miss:
 *
 *  1. **Refused objects stay in quarantine.** Asserting that `verifyUploaded` returned a
 *     rejection proves nothing about reachability: the object is already in the bucket. The
 *     assertion that matters is that `move` was never called, so the bytes stay under the
 *     prefix `infra/minio-init.sh` verifies is not publicly served (T005). `FakeObjectStore`
 *     records every call precisely so that negative is observable.
 *  2. **Size comes from `HeadObject`, not from the client.** The declared size was already
 *     used at presign (T016) and a client that lied there is exactly the case this pass
 *     exists for, so the fake reports a length that is deliberately unrelated to the bytes
 *     it holds — a 200 MB refusal must be provable without allocating 200 MB.
 *  3. **The container is checked, the model is never parsed** (CLR-003). A `.glb` whose
 *     header declares a total length that disagrees with `HeadObject` is refused; a `.glb`
 *     whose container is coherent is released even though its payload is nonsense. Both
 *     directions are needed: only the second one proves nothing tried to read the mesh.
 */

/** Builds a byte string from ASCII fragments and raw byte values, as file headers mix both. */
function bytes(...parts: readonly (string | number | readonly number[])[]): Uint8Array {
  const out: number[] = []
  for (const part of parts) {
    if (typeof part === 'string') out.push(...[...part].map((c) => c.charCodeAt(0)))
    else if (typeof part === 'number') out.push(part)
    else out.push(...part)
  }
  return Uint8Array.from(out)
}

/** Little-endian uint32, the width both the glTF and the binary-STL containers declare. */
function uint32le(value: number): readonly number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
}

/** Pads a header out to `size` bytes with a payload nothing is allowed to interpret. */
function padTo(head: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size)
  out.set(head.subarray(0, size))
  return out
}

type StoredObject = {
  readonly body: Uint8Array
  /** What `HeadObject` reports. Defaults to the body length; set it apart to fake a big object. */
  readonly reportedSize?: number
}

/**
 * Stands in for the bucket. Records every call so "the object never moved" and "the whole
 * object was never read" are facts this test can assert rather than infer.
 */
class FakeObjectStore implements QuarantineObjectStore {
  readonly heads: string[] = []
  readonly ranges: { key: string; start: number; end: number }[] = []
  readonly moves: { from: string; to: string }[] = []

  constructor(private readonly objects: Map<string, StoredObject>) {}

  head = async (key: string): Promise<ObjectHead> => {
    this.heads.push(key)
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

function quarantineKey(group: MediaGroup, extension: string): string {
  return `${QUARANTINE_PREFIX}/${group}/6f1cbb4e-9e2a-4d0f-8a3e-1c2b7d5a9f10${extension}`
}

/** One object in quarantine, with the size `HeadObject` should report for it. */
function storeWith(key: string, body: Uint8Array, reportedSize?: number): FakeObjectStore {
  return new FakeObjectStore(new Map([[key, { body, reportedSize }]]))
}

/**
 * A **decodable** PNG, not a signature with prose after it.
 *
 * It used to be `bytes([0x89], 'PNG', …, 'IHDR-and-then-whatever')` — enough to satisfy the
 * magic-byte table and nothing more — while three tests here called it "a real PNG" and a
 * comment below called it "a valid PNG". It was neither, and that only became visible when the
 * decode gate stopped being conditional on a derivative writer: sharp answered "Input buffer
 * has corrupt header". A fixture that cannot survive the check the module performs is a
 * fixture that can only ever test half of it.
 */
const PNG = new Uint8Array(
  await sharp({ create: { width: 8, height: 8, channels: 3, background: '#1234b0' } })
    .png()
    .toBuffer(),
)
/** MS-DOS `MZ` — a Windows executable, which is what a renamed `.exe` actually starts with. */
const WINDOWS_EXECUTABLE = bytes('MZ', [0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00])

/** A coherent glTF binary container: magic, version 2, and a total length that is the truth. */
function glbContainer(totalLength: number): Uint8Array {
  return padTo(bytes('glTF', uint32le(2), uint32le(totalLength)), totalLength)
}

describe('a verified object leaves quarantine (FR-014)', () => {
  it('releases a real PNG into the served prefix, keeping group and generated name', async () => {
    const key = quarantineKey('image', '.png')
    const store = storeWith(key, PNG)

    const result = await verifyUploaded(key, 'image', store)

    expect(result.released, `a valid PNG was refused: ${JSON.stringify(result)}`).toBe(true)
    expect(store.moves).toEqual([
      { from: key, to: key.replace(`${QUARANTINE_PREFIX}/`, `${SERVED_PREFIX}/`) },
    ])
    expect(result.key, 'the result does not report where the object now lives').toBe(
      `${SERVED_PREFIX}/image/6f1cbb4e-9e2a-4d0f-8a3e-1c2b7d5a9f10.png`,
    )
  })

  it.each([
    ['image', '.png', PNG],
    ['document', '.pdf', bytes('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj')],
    ['document', '.zip', bytes('PK', [0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00])],
    ['model3d', '.3mf', bytes('PK', [0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00])],
    ['model3d', '.stl', bytes('solid cube\n facet normal 0 0 1\n')],
  ] as const)('accepts a genuine %s upload named %s', async (group, extension, body) => {
    const key = quarantineKey(group, extension)
    const store = storeWith(key, body)

    const result = await verifyUploaded(key, group, store)

    expect(result.released, `${extension} refused: ${JSON.stringify(result)}`).toBe(true)
  })
})

describe('the leading bytes decide, not the extension (FR-014, SC-006)', () => {
  it('refuses a .exe renamed .png, and leaves it in quarantine', async () => {
    const key = quarantineKey('image', '.png')
    const store = storeWith(key, WINDOWS_EXECUTABLE)

    const result = await verifyUploaded(key, 'image', store)

    expect(result.released).toBe(false)
    expect(
      store.moves,
      'the object was released despite failing the signature check — it is now reachable ' +
        'under the served prefix, which is the one outcome quarantine exists to prevent',
    ).toEqual([])
  })

  it('names the reason it refused, so the uploader can act on it (SC-006)', async () => {
    const key = quarantineKey('image', '.png')
    const result = await verifyUploaded(key, 'image', storeWith(key, WINDOWS_EXECUTABLE))

    expect(result.released).toBe(false)
    if (result.released) return
    expect(result.reason, 'the rejection carries no machine-readable reason').toBe(
      'assinatura-nao-confere',
    )
    expect(
      result.message,
      `the refusal message names neither the extension nor the group: ${result.message}`,
    ).toMatch(/\.png/)
    expect(result.key, 'the rejection does not report the object still in quarantine').toBe(key)
  })

  it('refuses a .png whose bytes are not an image at all (SC-006)', async () => {
    const key = quarantineKey('image', '.png')
    const store = storeWith(key, bytes('this is just prose, saved with a .png suffix'))

    const result = await verifyUploaded(key, 'image', store)

    expect(result.released).toBe(false)
    expect(store.moves).toEqual([])
  })

  it('refuses an extension the declared group does not allow (FR-011)', async () => {
    // A PDF is allowlisted — for `document`. Declared as an image it is off-list, and the
    // group is what the field declared, so the mismatch is the client's, not the table's.
    const key = quarantineKey('image', '.pdf')
    const store = storeWith(key, bytes('%PDF-1.7\n'))

    const result = await verifyUploaded(key, 'image', store)

    expect(result.released).toBe(false)
    if (result.released) return
    expect(result.reason).toBe('extensao-nao-permitida')
    expect(store.ranges, 'bytes were fetched for an object that could never be accepted').toEqual(
      [],
    )
  })
})

describe('size is re-checked from HeadObject, not from the client (FR-012, FR-014)', () => {
  it('refuses an object past its cap without ever reading its bytes', async () => {
    const key = quarantineKey('image', '.png')
    const overCap = UPLOAD_CAP_BYTES.image + 1
    // The body is a valid PNG: only the reported length is over the cap, so a pass that
    // ignored HeadObject and judged by signature alone would release it.
    const store = storeWith(key, PNG, overCap)

    const result = await verifyUploaded(key, 'image', store)

    expect(result.released).toBe(false)
    if (result.released) return
    expect(result.reason).toBe('excede-o-limite')
    expect(
      result.message,
      `the refusal does not name the measured size: ${result.message}`,
    ).toContain(String(overCap))
    expect(store.heads).toEqual([key])
    expect(store.ranges, 'the oversized object was downloaded before being refused').toEqual([])
    expect(store.moves).toEqual([])
  })

  it('accepts an object exactly at the cap', async () => {
    const key = quarantineKey('image', '.png')
    const store = storeWith(key, PNG, UPLOAD_CAP_BYTES.image)

    const result = await verifyUploaded(key, 'image', store)

    expect(result.released, 'an upload exactly at the cap was refused').toBe(true)
  })

  it('refuses an empty object rather than treating a missing signature as absent', async () => {
    const key = quarantineKey('image', '.png')
    const store = storeWith(key, new Uint8Array(), 0)

    const result = await verifyUploaded(key, 'image', store)

    expect(result.released).toBe(false)
    expect(store.moves).toEqual([])
  })
})

describe('no attacker-supplied binary is parsed (CLR-003)', () => {
  it('reads a bounded window from the front, never the whole object', async () => {
    const key = quarantineKey('model3d', '.glb')
    const size = 50 * 1024 * 1024
    const store = storeWith(key, glbContainer(SIGNATURE_WINDOW_BYTES), size)

    await verifyUploaded(key, 'model3d', store)

    expect(store.ranges).toHaveLength(1)
    const range = store.ranges[0]!
    expect(range.start, 'the signature window does not start at the first byte').toBe(0)
    expect(
      range.end - range.start + 1,
      `the verifier fetched ${range.end - range.start + 1} bytes of a ${size}-byte object; the ` +
        'window must stay bounded or a 100 MB upload is downloaded on every verification',
    ).toBeLessThanOrEqual(SIGNATURE_WINDOW_BYTES)
  })

  it('releases a .glb whose container is coherent but whose payload is nonsense', async () => {
    // Proof that nothing parsed the mesh: past the 12-byte header this object is zeroes, so
    // any real glTF reader would fail on it. A *container* check cannot, and must not.
    const key = quarantineKey('model3d', '.glb')
    const container = glbContainer(4096)
    const store = storeWith(key, container, container.length)

    const result = await verifyUploaded(key, 'model3d', store)

    expect(result.released, `a well-formed glTF container was refused: ${JSON.stringify(result)}`)
      .toBe(true)
  })

  it('refuses a .glb whose declared total length disagrees with the stored object', async () => {
    // The cheap container check that costs no parser: a truncated or padded glb is not the
    // file its own header says it is.
    const key = quarantineKey('model3d', '.glb')
    const store = storeWith(key, glbContainer(4096), 9001)

    const result = await verifyUploaded(key, 'model3d', store)

    expect(result.released).toBe(false)
    expect(store.moves).toEqual([])
  })
})

/**
 * T021 — SC-006 / SC-007 / SC-008: five **planted** violations, each watched red before the
 * code that refuses it existed.
 *
 * The distinction from the cases above is what is asserted. Those prove the mechanism (the
 * object stays in quarantine, the window stays bounded); these prove the *contract the
 * uploader sees* — that every single refusal carries a machine-readable `reason` **and** a
 * message naming the offending value, in PT-BR (checklists CHK072, CHK088). A refusal that
 * says only "arquivo inválido" satisfies "rejected" and fails SC-006, which asks for the
 * reason by name.
 *
 * The two filename violations are run **through `generateObjectKey`**, not against a
 * hand-written key, because SC-008's claim spans both modules: the name contributes no bytes
 * to the key (`keys.ts`), *and* what arrives here is refused rather than released
 * (`verify.ts`). Testing either half alone leaves the join untested, and the join is where a
 * traversing key would have to be caught.
 *
 * The last case is the one that was red for a reason worth recording: with `clientUploads`
 * the browser PUTs on its own and then **tells the server which key it wrote**, so the key
 * reaching `verifyUploaded` is as client-supplied as the filename is. A key carrying `..`
 * was released, and `releaseKeyFor` rewrote only the prefix — so `quarantine/image/../../
 * etc/passwd.png` became `media/image/../../etc/passwd.png`, which normalises to the bucket
 * root, outside the prefix `infra/minio-init.sh` provisions as served. That is precisely the
 * escape SC-008 forbids, arriving through the parameter nobody had planted a violation in.
 */

/** The rejection branch, or a failure that says what was released instead. */
async function refusalFor(
  key: string,
  group: MediaGroup,
  store: FakeObjectStore,
): Promise<{ reason: string; message: string; key: string }> {
  const result = await verifyUploaded(key, group, store)
  if (result.released) {
    throw new Error(
      `expected a refusal; the object was released to "${result.key}" instead — a planted ` +
        'violation reached the served prefix',
    )
  }
  return { reason: result.reason, message: result.message, key: result.key }
}

/** The `.png` bytes are prose: a plausible mislabelled file, not a crafted one. */
const PROSE = bytes('Era uma vez um arquivo de texto salvo com o sufixo .png\n')

describe('planted violations are refused, each naming the reason (SC-006, SC-007, SC-008)', () => {
  it('refuses a .exe renamed .png and names the signature as the reason', async () => {
    const key = quarantineKey('image', '.png')
    const store = storeWith(key, WINDOWS_EXECUTABLE)

    const refusal = await refusalFor(key, 'image', store)

    expect(refusal.reason).toBe('assinatura-nao-confere')
    expect(refusal.message, `not actionable PT-BR: ${refusal.message}`).toMatch(/^Upload recusado:/)
    expect(refusal.message, 'the message does not name the extension it judged').toContain('.png')
    expect(store.moves).toEqual([])
  })

  it('refuses a .png whose bytes are not an image at all, and names the reason', async () => {
    const key = quarantineKey('image', '.png')
    const store = storeWith(key, PROSE)

    const refusal = await refusalFor(key, 'image', store)

    expect(refusal.reason).toBe('assinatura-nao-confere')
    expect(refusal.message).toMatch(/^Upload recusado:/)
    expect(refusal.message).toContain('.png')
    expect(store.moves).toEqual([])
  })

  it('refuses a file past the cap, naming the measured size and the cap (SC-007)', async () => {
    const key = quarantineKey('model3d', '.stl')
    const overCap = UPLOAD_CAP_BYTES.model3d + 1
    const store = storeWith(key, bytes('solid planted\n'), overCap)

    const refusal = await refusalFor(key, 'model3d', store)

    expect(refusal.reason).toBe('excede-o-limite')
    expect(refusal.message).toMatch(/^Upload recusado:/)
    expect(refusal.message, 'the measured size is missing from the refusal').toContain(
      String(overCap),
    )
    expect(refusal.message, 'the cap the uploader must respect is missing').toContain(
      String(UPLOAD_CAP_BYTES.model3d),
    )
    expect(store.moves).toEqual([])
  })

  it('gives ../../etc/passwd a generated key, then refuses what it names (SC-008)', async () => {
    const generated = generateObjectKey({ group: 'image', originalFilename: '../../etc/passwd' })

    expect(generated.key, 'the traversal reached the key').not.toContain('..')
    expect(generated.key).not.toContain('etc/passwd')
    expect(generated.key.startsWith(`${QUARANTINE_PREFIX}/image/`), generated.key).toBe(true)
    expect(generated.originalFilename, 'the original name is metadata and must survive').toBe(
      '../../etc/passwd',
    )

    // No allowlisted suffix survived, so the key has no extension — and an object whose
    // extension is nothing can match no signature. The refusal must say that, not throw.
    const store = storeWith(generated.key, bytes('root:x:0:0:root:/root:/bin/bash\n'))
    const refusal = await refusalFor(generated.key, 'image', store)

    expect(refusal.reason).toBe('extensao-nao-permitida')
    expect(refusal.message).toMatch(/^Upload recusado:/)
    expect(refusal.message, 'the message does not say which extensions were allowed').toContain(
      '.png',
    )
    expect(store.moves).toEqual([])
  })

  it('collapses a.png.svg to its last allowlisted suffix, then refuses the bytes (SC-008)', async () => {
    const generated = generateObjectKey({ group: 'image', originalFilename: 'a.png.svg' })

    expect(generated.extension, 'the double extension was not collapsed').toBe('.svg')
    expect(generated.key, 'the attacker-chosen stem reached the key').not.toContain('a.png')
    expect(generated.key.endsWith('.svg'), generated.key).toBe(true)

    // Declared `.svg`, carrying PNG bytes: the extension is allowlisted, so only the
    // signature can catch it — the exact case a `mimeTypes` list would have waved through.
    const store = storeWith(generated.key, PNG)
    const refusal = await refusalFor(generated.key, 'image', store)

    expect(refusal.reason).toBe('assinatura-nao-confere')
    expect(refusal.message).toMatch(/^Upload recusado:/)
    expect(refusal.message).toContain('.svg')
    expect(store.moves).toEqual([])
  })

  it('refuses a client-reported key carrying ../.., instead of releasing it out of media/', async () => {
    // The key arrives from the browser after its presigned PUT, so it is attacker-influenced
    // in exactly the way the filename is. Bytes are a genuine PNG: nothing but the key shape
    // can refuse this one.
    const traversing = `${QUARANTINE_PREFIX}/image/../../etc/passwd.png`
    const store = storeWith(traversing, PNG)

    const refusal = await refusalFor(traversing, 'image', store)

    expect(refusal.reason).toBe('chave-invalida')
    expect(refusal.message).toMatch(/^Upload recusado:/)
    expect(refusal.message, 'the refusal does not quote the key it rejected').toContain(traversing)
    expect(refusal.key, 'the object is reported somewhere other than where it still sits').toBe(
      traversing,
    )
    expect(
      store.moves,
      'the object was moved to a key that normalises outside the served prefix — the escape ' +
        'SC-008 exists to forbid',
    ).toEqual([])
    expect(store.heads, 'the store was touched before the key was judged').toEqual([])
  })
})
