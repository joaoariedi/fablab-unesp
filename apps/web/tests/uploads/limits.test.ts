import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ALLOWED_EXTENSIONS,
  MEDIA_GROUPS,
  UPLOAD_CAP_BYTES,
  type MediaGroup,
} from '../../lib/uploads/limits'

/**
 * T015 — FR-011 / FR-012: the three caps and the three extension allowlists, as named
 * constants, carrying `tech-stack.md` § Storage's numbers rather than this plan's.
 *
 * The assertions are **parsed from the two documents that own these values**, not retyped
 * here. Retyping them produces a test that agrees with the code and with nothing else: the
 * day someone raises the mesh cap in `tech-stack.md` (or the lab adds a format to FR-011),
 * a hand-copied expectation stays green while the platform and its documented limits have
 * silently diverged. Parsing makes that divergence a failure, which is the only reason
 * "values are tech-stack.md's, not this plan's" can be enforced at all.
 *
 * Caps are read from `tech-stack.md` § Storage because the task names it as the source;
 * allowlists from FR-011 in `spec.md`, which is the requirement that enumerates them.
 * `data-model.md` § Upload fields repeats both, and deliberately is *not* consulted — a copy
 * is not a second source.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const TECH_STACK = join(REPO_ROOT, 'docs', 'tech-stack.md')
const SPEC = join(
  REPO_ROOT,
  '.specify',
  'specs',
  '002-cms-conteudo',
  'spec.md',
)

/**
 * The document order of the three groups — images, then 3D meshes, then documents/archives —
 * which is the order both `tech-stack.md` § Storage and FR-011 list them in. The test maps
 * that order onto the module's own group keys here, once, so the module is free to name its
 * groups without the parsing having to guess.
 */
const GROUPS_IN_DOCUMENT_ORDER = ['image', 'model3d', 'document'] as const

/**
 * The value at a parsed position, or a hard failure naming what went missing. `strict` +
 * `noUncheckedIndexedAccess` make every parse result optional, and the honest answer to a
 * document that no longer parses is to stop, not to substitute a default that would let the
 * comparison below pass against nothing.
 */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`${what} is missing — the document this test parses has changed shape`)
  }
  return value
}

/** The lines of one `## ` section of a markdown document. */
function section(source: string, heading: string): string {
  const lines = source.split('\n')
  const start = lines.findIndex((line) => line.startsWith(heading))
  expect(start, `${heading} is gone from the document`).toBeGreaterThan(-1)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  return rest.slice(0, end === -1 ? rest.length : end).join('\n')
}

/** The three caps, in megabytes, as `tech-stack.md` § Storage states them. */
function capsFromTechStack(): number[] {
  const storage = section(readFileSync(TECH_STACK, 'utf8'), '## Storage')
  const line = storage.split('\n').find((candidate) => /Limites:/.test(candidate))
  expect(
    line,
    'tech-stack.md § Storage no longer states the upload limits, so this test cannot ' +
      'check the constants against their source. Restore the line or repoint the test.',
  ).toBeDefined()
  const caps = [...(line ?? '').matchAll(/(\d+)\s*MB/g)].map((match) => Number(match[1]))
  expect(caps, `expected three caps in: ${line}`).toHaveLength(3)
  return caps
}

/** The three extension groups, in FR-011's order, as FR-011 enumerates them. */
function allowlistsFromSpec(): string[][] {
  const row = readFileSync(SPEC, 'utf8')
    .split('\n')
    .find((line) => line.startsWith('| FR-011'))
  expect(row, 'FR-011 is gone from spec.md — the allowlists have no source to check against').toBeDefined()
  const groups = [...(row ?? '').matchAll(/`((?:\.[a-z0-9]+\s*)+)`/g)].map((match) =>
    required(match[1], 'an FR-011 extension group').trim().split(/\s+/),
  )
  expect(groups, `expected three extension groups in FR-011: ${row}`).toHaveLength(3)
  return groups
}

/**
 * Megabyte as everything downstream of this constant counts it: Caddy's
 * `client_max_body_size`, MinIO and S3 all report binary megabytes, so 10 MB here has to be
 * 10 * 1024 * 1024 or the presigned policy and the proxy limit disagree by 5% — and a file
 * that passes the signature is refused by the proxy, which is the least debuggable of the
 * two failures.
 */
const MEGABYTE = 1024 * 1024

describe('upload caps carry tech-stack.md § Storage numbers (FR-012)', () => {
  it('caps every group the module declares, and declares exactly three', () => {
    expect(MEDIA_GROUPS).toEqual(GROUPS_IN_DOCUMENT_ORDER)
    for (const group of MEDIA_GROUPS) {
      expect(UPLOAD_CAP_BYTES[group], `no cap for '${group}'`).toBeGreaterThan(0)
    }
    expect(Object.keys(UPLOAD_CAP_BYTES).sort()).toEqual([...MEDIA_GROUPS].sort())
  })

  it('matches the documented megabytes, in bytes', () => {
    const documented = capsFromTechStack()
    GROUPS_IN_DOCUMENT_ORDER.forEach((group, index) => {
      const megabytes = required(documented[index], `the cap for '${group}'`)
      const expected = megabytes * MEGABYTE
      expect(
        UPLOAD_CAP_BYTES[group],
        `'${group}' is capped at ${UPLOAD_CAP_BYTES[group]} B; tech-stack.md § Storage ` +
          `says ${megabytes} MB (${expected} B). The documents own this number.`,
      ).toBe(expected)
    })
  })
})

describe('extension allowlists are FR-011 enumerated, per group (FR-011)', () => {
  it('lists exactly the extensions FR-011 names, per group', () => {
    const documented = allowlistsFromSpec()
    GROUPS_IN_DOCUMENT_ORDER.forEach((group, index) => {
      const enumerated = required(documented[index], `FR-011's extensions for '${group}'`)
      expect(
        [...ALLOWED_EXTENSIONS[group]].sort(),
        `'${group}' allows ${JSON.stringify(ALLOWED_EXTENSIONS[group])}; FR-011 names ` +
          `${JSON.stringify(enumerated)}. An extension present here and absent there ` +
          'is an undeclared format; the reverse is a field nobody can upload to.',
      ).toEqual([...enumerated].sort())
    })
  })

  it('stores extensions in one comparable shape — lowercase, dot-led, no duplicates', () => {
    for (const group of MEDIA_GROUPS) {
      const extensions = ALLOWED_EXTENSIONS[group]
      for (const extension of extensions) {
        expect(extension, `'${extension}' in '${group}' is not dot-led`).toMatch(/^\.[a-z0-9]+$/)
      }
      expect(new Set(extensions).size, `'${group}' repeats an extension`).toBe(extensions.length)
    }
  })

  it('allows an extension in more than one group, because .svg genuinely is in two', () => {
    // Not a curiosity: FR-011 puts `.svg` under images *and* under documents. A module that
    // assumed extension -> group was a function would have to drop one of them, so the
    // lookup is per declared group and this pins that shape.
    expect(ALLOWED_EXTENSIONS.image).toContain('.svg')
    expect(ALLOWED_EXTENSIONS.document).toContain('.svg')
  })
})

describe('the allowlist cannot be widened at runtime (FR-011)', () => {
  it('freezes the tables and every group array', () => {
    // An allowlist a caller can `push` onto is not an allowlist. These constants are read on
    // the presign path (T016) and the verification path (T018); a module that hands out a
    // live array lets any imported code widen what the platform accepts, from anywhere.
    expect(Object.isFrozen(ALLOWED_EXTENSIONS), 'ALLOWED_EXTENSIONS is mutable').toBe(true)
    expect(Object.isFrozen(UPLOAD_CAP_BYTES), 'UPLOAD_CAP_BYTES is mutable').toBe(true)
    for (const group of MEDIA_GROUPS) {
      expect(
        Object.isFrozen(ALLOWED_EXTENSIONS[group]),
        `ALLOWED_EXTENSIONS['${group}'] is a live array a caller can push onto`,
      ).toBe(true)
    }
  })

  it('refuses a widening write instead of accepting it silently', () => {
    const group: MediaGroup = 'image'
    const before = [...ALLOWED_EXTENSIONS[group]]
    expect(() => {
      ;(ALLOWED_EXTENSIONS[group] as string[]).push('.exe')
    }).toThrow()
    expect(ALLOWED_EXTENSIONS[group]).toEqual(before)
  })
})
