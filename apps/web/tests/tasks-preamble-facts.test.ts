import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { mediaCollection } from '../collections/Media'
import configPromise, { s3StorageOptions } from '../payload.config'

/**
 * T037 — 002a acceptance: the task list's "Read before starting" preamble is **re-checked
 * against the tree**, not re-read.
 *
 * Every fact in that preamble was measured, and three of them were measured against an
 * architecture decision D1 then reversed. Facts 3 and 4 (`imageSizes` produces nothing;
 * collection-level `mimeTypes`/`filesize` never execute) are true of `clientUploads: true`
 * and false with it off — they are **scoped, not wrong**, and spike S1's measurement is why
 * D1 acted. Fact 5 (`sharp` absent from `apps/web` and from `buildConfig`) was closed by
 * T002. All three now describe a tree that no longer exists.
 *
 * Why a test guards a document. This preamble is the first thing every 002b agent reads —
 * twelve collections' worth of them, all instructed to treat it as measured fact. A stale
 * fact there does not fail: it is *followed*. Run 5 recorded the same defect one layer down,
 * in `verify.ts`'s docstring, and named the cost precisely — a green gate holding a wrong
 * claim in place is worse than no gate, because it is a reviewer's reason not to look.
 *
 * The assertions come in pairs, and the pairing is the whole design:
 *   - a **text** assertion, asking the fact for the correction in any wording; and
 *   - a **truth** assertion, driving the live config and the live collection for the state
 *     the corrected text claims.
 * Text alone is a word grep that a rephrase satisfies and a re-enabled `clientUploads`
 * silently invalidates. Truth alone leaves the document free to lie. Together, flipping
 * `clientUploads` back on turns this file red and the preamble has to be re-checked rather
 * than quietly becoming wrong again — which is exactly what T037 is for.
 *
 * Never a fixed wording: the words may be rephrased freely, but a fact that drops the
 * mechanism (`generateFileData`/`checkFileRestrictions`) loses the evidence that makes it
 * checkable, and one that drops the scope loses the reason it is not simply deleted.
 */

const TASKS = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '.specify',
  'specs',
  '002-cms-conteudo',
  'tasks.md',
)

const PREAMBLE_HEADING = '## Read before starting'

/** The environment shape `s3StorageOptions` reads — the compose stack's MinIO. */
const MINIO_ENV = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'fablab',
  S3_ACCESS_KEY_ID: 'fablab',
  S3_SECRET_ACCESS_KEY: 'fablab-dev-secret',
  S3_REGION: 'us-east-1',
}

/** The lines of one `## ` section, up to the next one. */
function section(source: string, heading: string): string {
  const lines = source.split('\n')
  const start = lines.indexOf(heading)
  expect(
    start,
    `"${heading}" is gone from ${TASKS}. The preamble every 002b agent is told to treat as ` +
      'measured fact cannot be re-checked if it has been renamed or removed.',
  ).toBeGreaterThan(-1)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  return rest.slice(0, end === -1 ? rest.length : end).join('\n')
}

/**
 * The numbered facts of the preamble, by their number. A fact runs from its `N. ` line to
 * the next one, so its indented continuation lines belong to it — the correction may well
 * be written on a line of its own.
 */
function numberedFacts(body: string): ReadonlyMap<number, string> {
  const facts = new Map<number, string>()
  let current: number | undefined
  let buffer: string[] = []

  const flush = () => {
    if (current !== undefined) facts.set(current, buffer.join(' ').replace(/\s+/g, ' ').trim())
  }

  for (const line of body.split('\n')) {
    const opener = /^(\d+)\.\s+(.*)$/.exec(line)
    if (opener) {
      flush()
      current = Number(opener[1])
      buffer = [opener[2] ?? '']
      continue
    }
    if (current !== undefined) buffer.push(line.trim())
  }
  flush()
  return facts
}

const facts = numberedFacts(section(readFileSync(TASKS, 'utf8'), PREAMBLE_HEADING))

/** One fact's text, or a hard failure naming the number that went missing. */
function fact(n: number): string {
  const text = facts.get(n)
  if (text === undefined) {
    throw new Error(
      `The preamble has no fact ${n} — it has ${[...facts.keys()].join(', ')}. This test ` +
        'asserts on facts by number because the task list refers to them by number; ' +
        'renumbering them requires updating T037 and this file together.',
    )
  }
  return text
}

const imageCollection = mediaCollection('image')

describe('the preamble facts D1 overtook are scoped, not left standing (T037)', () => {
  it('fact 3 keeps spike S1 mechanism, so a scoped finding is not mistaken for a wrong one', () => {
    // S1 is not wrong: `generateFileData` really does return at `if (!file)` before any
    // resizing, on `clientUploads: true`. That measurement is *why* D1 acted, so deleting it
    // with the claim would delete the reason the decision was taken.
    expect(
      fact(3),
      'Fact 3 no longer names generateFileData or imageSizes. Spike S1 measured that ' +
        'mechanism, and without it a reader cannot tell a finding that was scoped by a ' +
        'later decision from one that was simply wrong.',
    ).toMatch(/generateFileData|imageSizes/)
  })

  it('fact 3 records that D1 turned clientUploads off and the derivatives now run', () => {
    expect(
      fact(3),
      'Fact 3 still states flatly that imageSizes produces nothing. That is true of ' +
        'clientUploads: true only; D1 turned it off, the bytes pass through Node and ' +
        'Payload resizes. A 002b agent reading this builds a hand-rolled derivative pass ' +
        'for a collection the framework already resizes.',
    ).toMatch(/D1/)
    expect(
      fact(3),
      'Fact 3 names D1 but never says what is true now. Naming the superseding decision ' +
        'without its consequence leaves the old claim as the only actionable sentence.',
    ).toMatch(/now|passa|pass through Node|Payload (?:generates|resizes|produces)/i)
  })

  it('fact 4 keeps the checkFileRestrictions mechanism for the same reason', () => {
    expect(
      fact(4),
      'Fact 4 no longer names checkFileRestrictions. It is the ordering S1 measured and the ' +
        'evidence for both the old scope and the new behaviour.',
    ).toMatch(/checkFileRestrictions/)
  })

  it('fact 4 records that collection-level mimeTypes now executes', () => {
    expect(
      fact(4),
      'Fact 4 still states that collection-level mimeTypes and filesize never execute. With ' +
        'clientUploads off Payload runs checkFileRestrictions, and the media collections ' +
        'declare mimeTypes — the claim inverted when D1 landed.',
    ).toMatch(/D1/)
  })

  it('fact 4 no longer enforces the cap at a presign step that D1 deleted', () => {
    // The old sentence ended "size is enforced at **presign**". There is no presign: the
    // signed-URL route is not registered, and the cap is a beforeOperation hook on each media
    // collection. A 002b agent following the old sentence looks for a step that is not there.
    const stale = /size is enforced at \*\*presign\*\*|enforced at presign/i
    expect(
      fact(4),
      'Fact 4 still points the size cap at presign. D1 removed the presigned path entirely, ' +
        'so this names a step that does not exist for the twelve collections 002b writes.',
    ).not.toMatch(stale)
  })

  it('fact 5 no longer claims sharp is absent, which T002 closed', () => {
    expect(
      fact(5),
      'Fact 5 still says sharp is not declared in apps/web and not wired into buildConfig. ' +
        'T002 did both. Left standing, it reads as a live blocker on every image collection ' +
        'in 002b and invites a second attempt at work already on disk.',
    ).not.toMatch(/is not wired into|is not declared in/)
    expect(
      fact(5),
      'Fact 5 drops the correction. The measurement should stay readable — it is why T002 ' +
        'exists — but it must be marked as closed rather than deleted or left in the present ' +
        'tense.',
    ).toMatch(/T002|now (?:declared|wired|passed)|no longer/i)
  })
})

describe('the corrected facts are true of this tree, not just written down (T037)', () => {
  it('clientUploads is off in the adapter the config actually builds', () => {
    // The anchor under facts 3 and 4. If this ever flips back to true, the corrected text
    // becomes wrong in the other direction and this file goes red — which is the point:
    // the preamble is re-checked by the same act that changes the behaviour.
    expect(
      s3StorageOptions(MINIO_ENV, []).clientUploads,
      'clientUploads is on again. Facts 3 and 4 now assert the post-D1 behaviour, and with ' +
        'the bytes bypassing Node they are wrong again — spike S1 measured exactly that. ' +
        'Re-check the preamble with this change, do not just fix the test.',
    ).toBe(false)
  })

  it('the image collection declares the imageSizes fact 3 says Payload now generates', () => {
    expect(
      imageCollection.upload && typeof imageCollection.upload === 'object'
        ? imageCollection.upload.imageSizes
        : undefined,
      'The image media collection declares no imageSizes. Fact 3 now tells 002b that Payload ' +
        'generates the derivatives itself; with none declared there is nothing to generate.',
    ).toBeTruthy()
  })

  it('the image collection declares the mimeTypes fact 4 says now executes', () => {
    expect(
      imageCollection.upload && typeof imageCollection.upload === 'object'
        ? imageCollection.upload.mimeTypes
        : undefined,
      'The image media collection declares no mimeTypes. Fact 4 now tells 002b that ' +
        'checkFileRestrictions enforces it; with none declared it enforces nothing.',
    ).toBeTruthy()
  })

  it('sharp is handed to buildConfig, which is what fact 5 stops warning about', () => {
    // Asserted on the built config rather than on the import: an imported module nobody
    // passes to buildConfig leaves Payload with no image pipeline, which is the exact state
    // fact 5 was written about.
    return configPromise.then((config) => {
      expect(
        config.sharp,
        'buildConfig received no sharp. Fact 5 has been marked closed while the condition it ' +
          'described is back — imageSizes is a no-op again on every path.',
      ).toBeTruthy()
    })
  })
})
