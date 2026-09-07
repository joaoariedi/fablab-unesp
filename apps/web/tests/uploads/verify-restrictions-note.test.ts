import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T022 — FR-011 / CHK039: `lib/uploads/verify.ts` must record, **in its module docstring**,
 * that the collection-level `mimeTypes` and `filesize` options never execute on this upload
 * path.
 *
 * Why a test guards a comment. Spike S1 measured that `generateFileData` returns at
 * `if (!file)` — before `checkFileRestrictions` — whenever `clientUploads` is on, so the
 * per-field allowlist and cap Payload advertises are decorative here. The failure that costs
 * something is not the missing sentence: it is the reader who later adds `mimeTypes: [...]`
 * to a collection, sees two layers of upload validation, and relaxes this pass because it
 * looks redundant. Nothing in the type system or in `verify.test.ts` catches that, because
 * the code still behaves identically — the only thing that would have stopped it is a note
 * where that reader is already looking, and a note nobody asserts on is a note that gets
 * dropped by the next refactor of this docstring.
 *
 * It is asserted on the **module** docstring specifically, not on the file's text: a
 * `// mimeTypes never run` buried beside a signature matcher satisfies a naive `grep` and is
 * read by nobody deciding where upload validation lives.
 *
 * The assertions ask for the claim, its evidence, and its consequence, never for a fixed
 * wording — the words may be rephrased, but a docstring that drops the mechanism
 * (`checkFileRestrictions`/`generateFileData`) leaves the claim unverifiable, and one that
 * drops "this is the only defence" leaves exactly the wrong conclusion available.
 */

const VERIFY_SOURCE = join(import.meta.dirname, '..', '..', 'lib', 'uploads', 'verify.ts')

const source = readFileSync(VERIFY_SOURCE, 'utf8')

/**
 * The leading block comment of the module — the one a reader meets before any code.
 *
 * Deliberately anchored at the start of the file rather than found anywhere in it: a comment
 * that has drifted below the imports is no longer the module docstring T022 asks for.
 */
function moduleDocstring(text: string): string {
  const body = /^\s*\/\*\*([\s\S]*?)\*\//.exec(text)?.[1]
  if (body === undefined) return ''
  return body
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, ''))
    .join('\n')
}

/** The paragraphs of the docstring — blank comment lines are what separates a claim here. */
function paragraphs(docstring: string): readonly string[] {
  return docstring
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const docstring = moduleDocstring(source)
const restrictionParagraphs = paragraphs(docstring).filter((paragraph) =>
  /mimeTypes|filesize/i.test(paragraph),
)
const note = restrictionParagraphs.join('\n')

describe('verify.ts records that the collection-level upload restrictions never run', () => {
  it('has a module docstring at the top of the file', () => {
    expect(
      docstring,
      `${VERIFY_SOURCE} does not open with a /** */ block. T022's note has to live where a ` +
        'reader deciding about upload validation is already looking.',
    ).not.toBe('')
  })

  it('names both mimeTypes and filesize in the module docstring', () => {
    expect(
      note,
      'The module docstring of lib/uploads/verify.ts never mentions mimeTypes or filesize. ' +
        'A reader who adds either to a collection has no way to learn from this file that ' +
        'they are inert on the clientUploads path (spike S1, FR-011).',
    ).toMatch(/mimeTypes/)
    expect(
      note,
      'The module docstring names mimeTypes but not filesize. Both are skipped by the same ' +
        'early return in generateFileData; documenting one implies the other is enforced.',
    ).toMatch(/filesize/i)
  })

  it('records that D1 superseded the design this module was written for', () => {
    // Inverted, and the inversion is the point. The four assertions that used to sit here
    // demanded the docstring say collection-level mimeTypes/filesize "never execute" and that
    // this pass was "the only defence" with "no field-level net underneath". D1 turned
    // `clientUploads` off, so all three became false — and this file was holding them in place.
    // A green gate defending a claim that has gone wrong is worse than no gate: it is a
    // reviewer's reason not to look.
    expect(
      note,
      'The docstring does not record that D1 superseded the presigned path it describes. A ' +
        'reader will take its enforcement claims as current.',
    ).toMatch(/supersede|superseded|D1/i)
  })

  it('still names the mechanism, so the measurement survives the architecture change', () => {
    // Spike S1's finding is not wrong — it is scoped. `generateFileData` really does return at
    // `if (!file)` before `checkFileRestrictions`, on `clientUploads: true`. That measurement is
    // *why* D1 turned it off, so it must stay readable rather than being deleted with the claim.
    expect(
      note,
      'The docstring drops the measured mechanism. Cite generateFileData / ' +
        'checkFileRestrictions so a later reader can tell a scoped finding from a wrong one.',
    ).toMatch(/checkFileRestrictions|generateFileData/)
  })

  it('says plainly that nothing here is on a live path', () => {
    // The consequence a reader must not get wrong in the new direction: this module looks like
    // enforcement and is not wired to anything. `verifyUploaded` has no production caller —
    // only DERIVATIVE_WIDTHS is imported — and someone weakening the media collection because
    // "verify.ts covers it" would be making the same mistake the old note guarded against,
    // pointing the other way.
    expect(
      note,
      'The docstring does not say this module is uncalled. Its presence reads as a layer that ' +
        'is protecting something, and it is not.',
    ).toMatch(/no production caller|not (?:currently )?called|nothing (?:in this file )?is enforcing|uncalled/i)
  })
})
