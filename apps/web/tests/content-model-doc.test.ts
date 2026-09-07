import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { Projeto } from './../collections/content/Projeto'

/**
 * T048 — `docs/content-model.md` describes a schema, so it can be wrong about one.
 *
 * It was: it stated that `projeto` stores **text keys, not upload relationships**, quoting
 * decision D3 — one commit after option ii had reversed exactly that and made the three file
 * fields relationships to the media collections. The doc's declared audience is feature 003, so
 * the sentence would have sent a 003 author to resolve storage keys against S3, which is the
 * `@aws-sdk/client-s3` dependency option that was rejected under Principle 1.
 *
 * Markdown lint and link integrity — the two gates that ran on it — cannot detect a false claim
 * about code. This file can, and it follows a pattern the repo already uses: `uploads/limits.
 * test.ts` parses `tech-stack.md`, `verify-restrictions-note.test.ts` asserts a docstring's
 * claim, `tasks-preamble-facts.test.ts` asserts facts written in prose.
 *
 * The assertion is deliberately about the **shape the doc commits to**, not its wording: it
 * reads the field types out of the collection and requires the prose to agree with them, so a
 * future schema change fails here rather than being discovered by a reader.
 */

const DOC = readFileSync(
  join(import.meta.dirname, '..', '..', '..', 'docs', 'content-model.md'),
  'utf8',
)

/** The declared type of a top-level field on a collection, or undefined when absent. */
const fieldType = (name: string): string | undefined => {
  const field = Projeto.fields.find((f) => 'name' in f && f.name === name)
  return field && 'type' in field ? (field.type as string) : undefined
}

const FILE_FIELDS = ['imagemCapa', 'galeria', 'arquivos'] as const

describe('docs/content-model.md agrees with the collections it documents', () => {
  it.each(FILE_FIELDS)('%s really is a relationship, which is what the doc claims', (name) => {
    expect(
      fieldType(name),
      `${name} is no longer a relationship, so the doc's § Mídia e upload paragraph is now ` +
        'false. Update both together.',
    ).toBe('relationship')
  })

  it('does not still claim the superseded text-key shape', () => {
    // The exact sentence that drifted. Matched loosely, because the failure mode is a
    // paragraph that survives a schema change rather than one that is reworded.
    expect(
      /guarda \*\*chaves de texto\*\*/.test(DOC),
      'the doc still says the content collections store text keys. Decision D3 was revised on ' +
        '2026-09-07 (option ii) and the fields are relationships to the media collections.',
    ).toBe(false)
  })

  it('records that media collections are not publicly readable, and why', () => {
    // The security property a 003 author most needs from this doc: a file is public exactly
    // when a published document lists it. Losing this sentence would invite someone to "fix"
    // the anonymous 404 by declaring the media collections readable, which would make every
    // draft's files enumerable.
    expect(
      DOC,
      'the doc no longer explains that media is reachable only through published content',
    ).toMatch(/não recebem declaração de leitura pública/)
  })
})
