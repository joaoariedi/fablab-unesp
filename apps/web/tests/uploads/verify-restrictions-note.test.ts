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

  it('states that they do not execute, rather than merely mentioning them', () => {
    expect(
      note,
      'The docstring mentions mimeTypes/filesize without saying they never execute on this ' +
        'path. A mention that reads as "these also apply" is worse than silence.',
    ).toMatch(/\b(never|not|no)\b[^.]{0,80}\b(execute|executed|run|runs|reached|reach)\b|\b(execute|executed|run|runs|reached|reach)\w*\b[^.]{0,40}\bnever\b/i)
  })

  it('names the mechanism, so the claim can be checked rather than believed', () => {
    expect(
      note,
      'The docstring asserts the restrictions do not run but names nothing a reader can go ' +
        'and read. Cite the measured mechanism — generateFileData returning at `if (!file)` ' +
        'before checkFileRestrictions (spike S1).',
    ).toMatch(/checkFileRestrictions|generateFileData/)
  })

  it('spells out the consequence: this pass is the only defence, not one of two layers', () => {
    expect(
      note,
      'The docstring records that the collection options are inert but not what follows from ' +
        'it. The whole point of T022 is that a later reader must not weaken this pass, or add ' +
        'field-level restrictions, believing a second layer covers the surface.',
    ).toMatch(/only defence|only defense|not defence in depth|not defense in depth|not one layer of two|whole enforcement surface|no field-level net/i)
  })
})
