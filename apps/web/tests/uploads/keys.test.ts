import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  QUARANTINE_PREFIX,
  UnroutableMediaGroupError,
  generateObjectKey,
} from '../../lib/uploads/keys'
import { ALLOWED_EXTENSIONS, MEDIA_GROUPS, type MediaGroup } from '../../lib/uploads/limits'

/**
 * T017 — FR-013 / SC-008: the stored object key is **generated**. The filename the browser
 * sent is metadata and nothing else, so no part of it — a traversal, a double extension, a
 * separator, a percent-encoded dot — can reach the key that names the object in the bucket.
 *
 * Why this is load-bearing rather than hygiene: with `clientUploads` the browser PUTs
 * straight to the bucket against a presigned URL (spike S1), and the key on that URL *is*
 * the write location. A caller that derives it from `file.name` turns `../../etc/passwd`
 * into an authorisation to write outside `quarantine/` — past the one prefix that is not
 * publicly served (T005) and past the verification pass that is the only defence on this
 * path (plan § Sketch 4). Sanitising the name would leave the same class of bug one escape
 * away; generating the key removes the attacker's input from the decision entirely.
 *
 * The hostile inputs are SC-008's two, by name, plus the neighbours that break a *sanitiser*
 * rather than a generator — a backslash, a percent-encoded traversal, a trailing space, an
 * absolute path. A generated key is indifferent to all of them, and that indifference is
 * what these assert. The extension is the one thing that may be echoed, and only when the
 * group's own allowlist (FR-011) contains it — so `a.png.svg` can contribute `.svg` and can
 * never contribute `a.png`.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const COMPOSE_FILE = join(REPO_ROOT, 'infra', 'docker-compose.yml')

/**
 * A generated key: the provisioned prefix, the declared group, one opaque identifier, and at
 * most one extension. Anchored at both ends — a key that merely *starts* with the quarantine
 * prefix would accept `quarantine/image/../../etc/passwd`, which is the whole attack.
 */
const GENERATED_KEY = /^quarantine\/(image|model3d|document)\/[0-9a-f-]{36}(\.[a-z0-9]{1,5})?$/

/**
 * SC-008's two names first, then the inputs that distinguish a generator from a sanitiser:
 * a Windows separator, a percent-encoded traversal (decoded by whatever sits in front of
 * storage), a trailing-space double extension, an absolute path, a nested path.
 */
const HOSTILE_FILENAMES = [
  '../../etc/passwd',
  'a.png.svg',
  '..\\..\\windows\\win.ini',
  '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
  'harmless.png .svg',
  '/etc/shadow',
  './../.././secret.png',
  'nested/dir/photo.png',
] as const

/** The `QUARANTINE_PREFIX:` value the compose stack provisions and refuses to serve. */
function provisionedQuarantinePrefix(): string {
  const compose = readFileSync(COMPOSE_FILE, 'utf8')
  const match = /^\s*QUARANTINE_PREFIX:\s*(\S+)\s*$/m.exec(compose)
  const prefix = match?.[1]
  if (prefix === undefined) {
    throw new Error(
      `QUARANTINE_PREFIX is gone from ${COMPOSE_FILE} — the prefix this module writes into ` +
        'is no longer provisioned by the stack',
    )
  }
  return prefix
}

describe('generateObjectKey', () => {
  it('writes into the quarantine prefix the compose stack actually provisions', () => {
    // A prefix renamed in the stack and not here writes unverified objects into a location
    // nobody made private — the leak T005's own test exists to prevent, reached from the
    // other side.
    expect(QUARANTINE_PREFIX).toBe(provisionedQuarantinePrefix())
  })

  it.each(HOSTILE_FILENAMES)('generates a key untouched by the filename %j', (originalFilename) => {
    const { key } = generateObjectKey({ group: 'image', originalFilename })

    expect(key).toMatch(GENERATED_KEY)
    expect(key.startsWith(`${QUARANTINE_PREFIX}/`)).toBe(true)
    expect(key).not.toContain('..')
    expect(key).not.toContain('\\')
    expect(key).not.toContain(' ')
    expect(key).not.toContain('%')
    // The stem is the half an attacker fully controls; only an allowlisted extension may
    // survive, so no part of the stem may appear anywhere in the key.
    const stem = originalFilename.replace(/\.[^.]*$/, '')
    expect(key).not.toContain(stem)
    expect(key.split('/')).toHaveLength(3)
  })

  it('keeps SC-008 traversal out of the key whichever group is asked for one', () => {
    for (const group of MEDIA_GROUPS) {
      const { key } = generateObjectKey({ group, originalFilename: '../../etc/passwd' })
      const segments = key.split('/')

      expect(segments).toHaveLength(3)
      expect(segments[0]).toBe(QUARANTINE_PREFIX)
      expect(segments[1]).toBe(group)
      expect(key).not.toContain('etc')
      expect(key).not.toContain('passwd')
    }
  })

  it('carries the original filename as metadata, verbatim and unsanitised', () => {
    // FR-013 calls it metadata, so it is preserved exactly — a *changed* name is a lie about
    // what the user uploaded. It is safe to keep precisely because it names nothing.
    const originalFilename = '../../etc/passwd'
    const result = generateObjectKey({ group: 'document', originalFilename })

    expect(result.originalFilename).toBe(originalFilename)
    expect(result.key).not.toContain(result.originalFilename)
  })

  it('echoes only an extension the declared group allows, lowercased', () => {
    expect(generateObjectKey({ group: 'image', originalFilename: 'a.png.svg' }).key).toMatch(
      /\.svg$/,
    )
    expect(generateObjectKey({ group: 'image', originalFilename: 'PHOTO.PNG' }).key).toMatch(
      /\.png$/,
    )
    expect(generateObjectKey({ group: 'model3d', originalFilename: 'part.STL' }).key).toMatch(
      /\.stl$/,
    )
  })

  it('drops an extension the group does not allow rather than carrying it into the key', () => {
    // `.exe` is refused elsewhere (FR-011); the point here is narrower — an extension that is
    // not on the group's list never becomes part of a key, so nothing attacker-chosen is
    // stored even in the case that is about to be rejected anyway.
    for (const originalFilename of ['payload.exe', 'run.sh', 'model.stl', 'archive.tar.gz']) {
      const { key } = generateObjectKey({ group: 'image', originalFilename })
      expect(key, `${originalFilename} shaped the key`).toMatch(
        /^quarantine\/image\/[0-9a-f-]{36}$/,
      )
    }
  })

  it('accepts every extension its group declares and none from another group', () => {
    for (const group of MEDIA_GROUPS) {
      for (const extension of ALLOWED_EXTENSIONS[group]) {
        const { key } = generateObjectKey({ group, originalFilename: `file${extension}` })
        expect(key.endsWith(extension), `${group} rejected its own ${extension}`).toBe(true)
      }
    }
    // `.stl` belongs to model3d alone: asking for it under `document` must not widen the list.
    expect(generateObjectKey({ group: 'document', originalFilename: 'x.stl' }).key).not.toContain(
      '.stl',
    )
  })

  it('never repeats a key, even for the same file uploaded twice', () => {
    const keys = new Set(
      Array.from(
        { length: 500 },
        () => generateObjectKey({ group: 'image', originalFilename: 'photo.png' }).key,
      ),
    )
    // A collision overwrites somebody else's object — the same damage as a traversal, reached
    // by a different route.
    expect(keys.size).toBe(500)
  })

  it('refuses a group it does not know instead of routing it into the key path', () => {
    // The group arrives from the client too. An unrecognised one interpolated into the key
    // hands the attacker back the path segment this module exists to take away.
    const request = { group: '../public' as unknown as MediaGroup, originalFilename: 'a.png' }

    expect(() => generateObjectKey(request)).toThrow(UnroutableMediaGroupError)
    expect(() => generateObjectKey(request)).toThrow(/\.\.\/public/)
  })

  it('refuses a filename that is not a string', () => {
    expect(() =>
      generateObjectKey({ group: 'image', originalFilename: null as unknown as string }),
    ).toThrow(/null/)
  })
})
