import { createRequire } from 'node:module'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { CollectionConfig, Field } from 'payload'
import { describe, expect, it } from 'vitest'

import configPromise, { s3StorageOptions } from '../payload.config'
import { mediaCollection } from '../collections/Media'
import { derivePublishable } from '../lib/tenancy/public-payload'
import { SEED_ON_CREATE } from '../lib/tenancy/seed-on-create'

/**
 * T049 — CHK001–CHK095 are **adjudicated**, and the ones left open are open for a reason
 * this tree still exhibits.
 *
 * The four checklists are requirement-*quality* checks, and T049 asks for them to be ticked
 * "against the implementation", leaving open anything not genuinely satisfied. Both halves of
 * that are failable, and neither is failable by reading the checklist alone:
 *
 *   - a row can be ticked without anyone looking (the rubber stamp), and
 *   - a row can be left blank without anyone saying why (the silent gap), which is
 *     indistinguishable from a row nobody reached.
 *
 * So this file asserts in pairs, the way `tasks-preamble-facts.test.ts` does:
 *
 *   1. **Adjudication** — every id from CHK001 to CHK095 exists exactly once, carries `[x]`
 *      or `[ ]`, and every `[ ]` carries an explicit `**OPEN` rationale. Feature 001's
 *      CHK011 set that precedent: an open box with the conflict written into the row.
 *   2. **Truth** — for each finding that put a row in the open set, the condition that made
 *      it open is re-measured here against the live config, the live source tree, or the
 *      framework's own code. Closing one of those conditions turns this file red, so the
 *      checklist is re-adjudicated by the same act that fixes the code rather than drifting
 *      into a claim nobody re-checked.
 *
 * The open set is pinned exactly, not by count. A row moved out of it without the paired
 * truth assertion changing is the rubber stamp this file exists to catch; a row moved into it
 * with no rationale is the silent gap.
 */

const CHECKLIST_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '.specify',
  'specs',
  '002-cms-conteudo',
  'checklists',
)

const CHECKLIST_FILES = ['requirements.md', 'api.md', 'security.md', 'ux.md'] as const

/** CHK001 … CHK095, the range T049 names. */
const FIRST_ID = 1
const LAST_ID = 95

const idOf = (n: number): string => `CHK${String(n).padStart(3, '0')}`

type Row = { id: string; file: string; status: string; body: string }

/**
 * One table row per `| CHKnnn | … | [x] |` line. The status is the **last** cell because the
 * four files do not share a column count — requirements.md has four, the other three have
 * five — and pinning a column index here would silently stop matching the day one gains a
 * `Ref` column.
 */
function parseRows(file: string): Row[] {
  const source = readFileSync(join(CHECKLIST_DIR, file), 'utf8')
  const rows: Row[] = []

  for (const line of source.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue
    const cells = line.split('|').map((cell) => cell.trim())
    const filled = cells.filter((cell) => cell.length > 0)
    const id = filled[0]
    if (!id || !/^CHK\d{3}$/.test(id)) continue
    rows.push({ id, file, status: filled[filled.length - 1] ?? '', body: line })
  }
  return rows
}

const allRows: Row[] = CHECKLIST_FILES.flatMap(parseRows)
const rowsById = new Map(allRows.map((row) => [row.id, row]))

/**
 * The rows T049 could not tick, each anchored below by an assertion that re-measures the
 * condition. Read the row itself for the finding; this list is the index, not the argument.
 */
const EXPECTED_OPEN = [
  // Ticked in the first adjudication and unticked on review. SC-006 names two refusals, and
  // post-D1 only one of them is ours: a `.exe` renamed `.png` is refused by our hook in PT-BR,
  // but a `.png` whose bytes are not an image is refused by Payload's own `checkFileRestrictions`
  // with an English message. Half the criterion is met, which is not the criterion.
  'CHK088',
  'CHK034', // cap is enforced at presign — D1 deleted the presign path
  'CHK035', // generated object keys — `generateObjectKey` has no production caller
  'CHK039', // "mimeTypes never runs" — D1 inverted it
  'CHK040', // "the only defence" — D1 made it two layers
  'CHK042', // the reaper's lifecycle rule guards a prefix nothing writes to
  'CHK063', // the two named hand-written endpoints are not the ones that shipped
  'CHK065', // presign inputs
  'CHK066', // presign response
  'CHK067', // presign enforces the cap on the signed URL
  'CHK068', // presign authorization
  'CHK076', // relationship population on the public path
  'CHK077', // field names are PT-BR, not English
  'CHK079', // derived counters are admin-cosmetic read-only only
  'CHK080', // additive vs breaking is stated nowhere
  'CHK087', // a denied publish is discarded, not refused
  'CHK092', // empty states for a new organization
] as const

describe('every checklist row is adjudicated (T049)', () => {
  it('has every id from CHK001 to CHK095, exactly once', () => {
    const missing: string[] = []
    for (let n = FIRST_ID; n <= LAST_ID; n += 1) {
      if (!rowsById.has(idOf(n))) missing.push(idOf(n))
    }
    expect(
      missing,
      `Checklist ids absent from ${CHECKLIST_FILES.join(', ')}: ${missing.join(', ')}. T049 ` +
        'ticks a range; an id that is not in any of the four files cannot be ticked or ' +
        'left open, and its absence is invisible in a per-file read.',
    ).toEqual([])

    const seen = new Map<string, number>()
    for (const row of allRows) seen.set(row.id, (seen.get(row.id) ?? 0) + 1)
    const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id)
    expect(
      duplicated,
      `Duplicated checklist ids: ${duplicated.join(', ')}. Two rows with one id means one of ` +
        'them is ticked and the other is not read.',
    ).toEqual([])
  })

  it('leaves no row in the un-adjudicated state — every status is [x] or [ ]', () => {
    const odd = allRows.filter((row) => row.status !== '[x]' && row.status !== '[ ]')
    expect(
      odd.map((row) => `${row.file}:${row.id} → "${row.status}"`),
      'A status cell that is neither [x] nor [ ] cannot be counted either way.',
    ).toEqual([])
  })

  it('gives every open row a written reason, the way feature 001 CHK011 did', () => {
    const silent = allRows
      .filter((row) => row.status === '[ ]')
      .filter((row) => !row.body.includes('**OPEN'))
      .map((row) => `${row.file}:${row.id}`)
    expect(
      silent,
      `Open with no rationale: ${silent.join(', ')}. T049 says "leave open anything not ` +
        'genuinely satisfied" — an empty box with no reason is indistinguishable from a row ' +
        'nobody reached, which is the state the whole file started in.',
    ).toEqual([])
  })

  it('opens exactly the rows whose finding is re-measured below', () => {
    const open = allRows.filter((row) => row.status === '[ ]').map((row) => row.id).sort()
    expect(
      open,
      'The open set moved. Each id in it is anchored by an assertion in this file that ' +
        're-measures the condition that put it there: closing one means the paired ' +
        'assertion changes in the same commit. Ticking one without that is the rubber ' +
        'stamp T049 exists to prevent.',
    ).toEqual([...EXPECTED_OPEN].sort())
  })
})

/** Every `.ts`/`.tsx` file of the app that is not a test and not a build artefact. */
function productionSources(root: string, found: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'tests') continue
    const path = join(root, entry)
    if (statSync(path).isDirectory()) productionSources(path, found)
    else if (/\.tsx?$/.test(entry)) found.push(path)
  }
  return found
}

const APP_ROOT = join(import.meta.dirname, '..')

/** Non-comment lines only: a docstring naming a symbol is not a caller of it. */
function callSites(symbol: string): string[] {
  const pattern = new RegExp(`\\b${symbol}\\s*\\(`)
  return productionSources(APP_ROOT).filter((path) => {
    if (path.includes(`${join('lib', 'uploads')}`)) return false
    return readFileSync(path, 'utf8')
      .split('\n')
      .some((line) => !line.trimStart().startsWith('*') && pattern.test(line))
  })
}

describe('the presign design CHK034/035/042/063/065-068 check is not the one that shipped', () => {
  it('has clientUploads off, which is the decision that removed the presigned path (D1)', () => {
    expect(
      s3StorageOptions(
        {
          S3_ENDPOINT: 'http://localhost:9000',
          S3_BUCKET: 'fablab',
          S3_ACCESS_KEY_ID: 'fablab',
          S3_SECRET_ACCESS_KEY: 'fablab-dev-secret',
          S3_REGION: 'us-east-1',
        },
        [],
      ).clientUploads,
      'clientUploads is on again. The eight presign rows were left open because D1 turned it ' +
        'off and deleted the path they describe; with it back on, re-read them rather than ' +
        'editing this assertion.',
    ).toBe(false)
  })

  it('has no production caller for presignUpload — the endpoint CHK065-068 describes', () => {
    expect(
      callSites('presignUpload'),
      'Something outside lib/uploads calls presignUpload. A presign endpoint now exists, so ' +
        'CHK065-CHK068 have a subject again and must be re-adjudicated.',
    ).toEqual([])
  })

  it('has no production caller for generateObjectKey — CHK035', () => {
    expect(
      callSites('generateObjectKey'),
      'Something outside lib/uploads calls generateObjectKey. CHK035 was left open because ' +
        'the shipped path stores under the filename Payload derives, not a generated key.',
    ).toEqual([])
  })
})

describe('the framework rules CHK039/040 say never run are the ones enforcing uploads', () => {
  it('declares mimeTypes on the image media collection, which D1 made live again', () => {
    const upload = mediaCollection('image').upload
    expect(
      upload && typeof upload === 'object' ? upload.mimeTypes : undefined,
      'The image collection declares no mimeTypes. CHK039 and CHK040 were left open because ' +
        'the opposite is true post-D1 — the collection-level check runs and is a second ' +
        'layer beside our own hook. With it gone, the rows are worth re-reading as written.',
    ).toBeTruthy()
  })
})

const collectionNamed = async (slug: string): Promise<CollectionConfig> => {
  const config = await configPromise
  const found = config.collections.find((collection) => collection.slug === slug)
  if (!found) throw new Error(`No collection "${slug}" in the config; this gate has no subject`)
  return found as unknown as CollectionConfig
}

type NamedField = Field & { name?: string; relationTo?: unknown; required?: boolean }

const fieldNamed = async (slug: string, name: string): Promise<NamedField | undefined> => {
  const collection = await collectionNamed(slug)
  const flattened = (collection as { flattenedFields?: NamedField[] }).flattenedFields
  return (flattened ?? (collection.fields as NamedField[])).find((field) => field.name === name)
}

describe('the public read path can still populate an unpublished relation (CHK076)', () => {
  it('has evento and projeto both publishable, and evento pointing at projeto', async () => {
    const config = await configPromise
    const publishable = derivePublishable(config.collections)
    expect(
      publishable.has('evento') && publishable.has('projeto'),
      'evento or projeto stopped being publishable, so this particular population path is ' +
        'gone. CHK076 stays open only while a published row can populate an unpublished one.',
    ).toBe(true)

    const relation = ((await collectionNamed('evento')) as { flattenedFields?: NamedField[] })
      .flattenedFields?.filter((field) => field.relationTo === 'projeto')
    expect(
      relation?.length,
      'evento no longer relates to projeto. CHK076 was left open because getPublicScopedPayload ' +
        'forwards the caller depth under overrideAccess: true, so populating this relation ' +
        'reaches a projeto in rascunho with no status filter applied to it.',
    ).toBeGreaterThan(0)
  })
})

describe('field names are PT-BR, which is the half CHK077 asks about', () => {
  it('names the project title field titulo, not title', async () => {
    expect(
      await fieldNamed('projeto', 'titulo'),
      'projeto.titulo is gone. CHK077 was left open because the API contract is the field ' +
        'NAMES and they are PT-BR, while the row (and Principle 4) assume English.',
    ).toBeDefined()
  })
})

/**
 * The sanitized config gives EVERY field an `access` object, empty or not, so the presence of
 * the key proves nothing — `access.update` is the guard, and the contrast below is what keeps
 * this from asserting on a sanitizer default.
 */
const fieldUpdateAccess = async (slug: string, name: string): Promise<unknown> =>
  ((await fieldNamed(slug, name)) as { access?: { update?: unknown } } | undefined)?.access?.update

describe('derived counters are read-only in the admin only (CHK079)', () => {
  it.each(['downloads', 'curtidas'])('leaves %s writable through the API on projeto', async (name) => {
    expect(await fieldNamed('projeto', name), `projeto.${name} is gone; CHK079 subject with it`)
      .toBeDefined()
    expect(
      await fieldUpdateAccess('projeto', name),
      `projeto.${name} now carries field update access. CHK079 was left open because ` +
        'admin.readOnly is admin-UI cosmetics — the same lesson aprovacaoRegistrada records ' +
        'a few fields below, where the guard IS present. With access here, re-adjudicate.',
    ).toBeUndefined()
  })

  it('does carry that guard on aprovacaoRegistrada, so the absence above is a choice', async () => {
    expect(
      await fieldUpdateAccess('projeto', 'aprovacaoRegistrada'),
      'aprovacaoRegistrada lost its field access too. Without a field that HAS the guard, the ' +
        'assertions above would pass on a config where field access stopped being read at all.',
    ).toBeTypeOf('function')
  })
})

describe('a refused publish is discarded rather than refused (CHK087)', () => {
  it('deletes the denied value in payload own field-access step, measured not assumed', () => {
    const require_ = createRequire(import.meta.url)
    const promisePath = join(
      dirname(require_.resolve('payload')),
      'fields',
      'hooks',
      'beforeValidate',
      'promise.js',
    )
    expect(
      readFileSync(promisePath, 'utf8'),
      'payload no longer deletes the field when access denies it, or the step moved. CHK087 ' +
        'was left open on this exact line: a maker POSTing status: publicado gets 200 and a ' +
        'silently unchanged status, which is the "ignored" half SC-005 says must not happen.',
    ).toContain('delete siblingData[field.name]')
  })

  it('expresses the publish guard only at that layer, on projeto.status', async () => {
    const status = await fieldNamed('projeto', 'status')
    expect(
      (status as { access?: { update?: unknown } }).access?.update,
      'projeto.status lost its field access. If the guard moved to a hook that throws, the ' +
        'refusal is now visible and CHK087 can be re-adjudicated.',
    ).toBeDefined()
  })
})

describe('a new organization starts empty and nothing says so (CHK092)', () => {
  it('registers no seed, so the second lab has no categories on day one', () => {
    expect(
      SEED_ON_CREATE,
      'A seed was registered. CHK092 was left open because US8 second lab opens the admin to ' +
        'empty category lists and no requirement says what it sees.',
    ).toEqual([])
  })

  it('requires a category on projeto, which is what makes the empty list blocking', async () => {
    expect(
      (await fieldNamed('projeto', 'categoria'))?.required,
      'projeto.categoria is no longer required, so an empty category list stops blocking the ' +
        'first project. Re-read CHK092 before ticking it.',
    ).toBe(true)
  })
})
