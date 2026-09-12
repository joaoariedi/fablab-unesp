import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { PayloadRequest, RelationshipField } from 'payload'
import { describe, expect, it } from 'vitest'

import { MEDIA_SLUGS } from '../../collections/Media'
import { PerfilMaker } from '../../collections/content/PerfilMaker'
import {
  anexarAvatarRender,
  recusaDoArquivo,
  AVATAR_ASSET_CAP_BYTES,
  AVATAR_ASSET_COLLECTION,
  AVATAR_ASSET_EXTENSIONS,
  type AvatarAssetStore,
} from '../../lib/accounts/avatar-asset'
import type { ByIDArgs, UpdateArgs } from '../../lib/tenancy'
import { ALLOWED_EXTENSIONS, UPLOAD_CAP_BYTES } from '../../lib/uploads/limits'

/**
 * T035b / FR-033, US6 — **the avatar asset has one path, and it is feature 002's**.
 *
 * ── What is actually at risk here ───────────────────────────────────────────────────────────
 *
 * `perfilMaker.avatarRender` is the only column in this feature that names a *file*, and
 * T035 shipped the half that clears it: a changed configuration drops the stale PNG in the same
 * write. Nothing composes the replacement yet, and that is exactly when the second path gets
 * invented — a compositor has bytes, the choke-point client's `create` takes `data` and no file,
 * and the shortest way out of that corner is to write the storage key the compositor already
 * knows into a text column and serve it directly. That shortcut is what decision D3 was revised
 * to forbid *for every file in the product*, and what FR-033 states for this one: the asset goes
 * through `midiaImagem` and the upload limits 002 fixed, **never a raw key, never a second
 * path**.
 *
 * So this suite is about the *path*, not about the PNG:
 *
 *  - §1 the policy the avatar asset is held to **is** the image group's, by identity rather than
 *    by two numbers that agree today. A cap retyped here is a cap that stops moving when
 *    `tech-stack.md` moves it, and `limits.ts` says in its own docblock that it is the one place
 *    those numbers are written.
 *  - §2 the column and the module cannot drift: whatever collection the attach writes into is
 *    the collection `avatarRender` points at.
 *  - §3 the write is the **document's id**, obtained by reading that document through the choke
 *    point — which is what makes it a relationship the database constrains.
 *  - §4 a storage key, a URL, or anything else that is not a `midiaImagem` row is refused, and
 *    refused **without a write**. This is the whole of "never a raw key": a string is a perfectly
 *    good value for a relationship column right up to the moment somebody dereferences it.
 *  - §5 the limits are applied to the asset itself, so an image that could never have been
 *    uploaded cannot be attached either.
 *  - §6 no other module in the app sets this column. Clearing it is anyone's (T035 does), setting
 *    it is this module's — which is the difference between one path and two.
 *
 * ── Why a named fake and not Postgres ───────────────────────────────────────────────────────
 *
 * Every claim above is about what the module *asks the store for* and *hands it back*: the read
 * it makes, and the value it writes. A real database would answer the happy case and refuse the
 * rest with its own errors, which proves Postgres works rather than that this module refuses.
 * `curtir.test.ts` splits it the same way for the same reason.
 */

/** One `midiaImagem` row, in the three columns this path reads: the id it writes, and the two
 *  the upload policy is measured against. */
type MidiaDoc = { id: number; filename: string; filesize: number }

const PERFIL_ID = 42

/** A composed avatar as `midiaImagem` holds it: a PNG, comfortably inside the image cap. */
const RENDER: MidiaDoc = { id: 77, filename: 'avatar-42.png', filesize: 24_576 }

const REQ = { id: 'req-1', user: { id: 7 } } as unknown as PayloadRequest

/**
 * The choke-point client, recorded rather than stubbed inline.
 *
 * It answers **only** for {@link AVATAR_ASSET_COLLECTION}: a module that went looking for the
 * render in some other collection would get `null` here and be refused by its own guard, rather
 * than passing on a fake that answers whatever it is asked.
 */
class FakeMidiaStore implements AvatarAssetStore {
  readonly leituras: ByIDArgs[] = []
  readonly escritas: UpdateArgs[] = []

  constructor(private readonly linhas: readonly MidiaDoc[] = [RENDER]) {}

  findByID = async <T = Record<string, unknown>>(args: ByIDArgs): Promise<T | null> => {
    this.leituras.push(args)
    if (args.collection !== AVATAR_ASSET_COLLECTION) return null
    const linha = this.linhas.find((doc) => String(doc.id) === String(args.id))
    return (linha ?? null) as T | null
  }

  update = async <T = Record<string, unknown>>(args: UpdateArgs): Promise<T | null> => {
    this.escritas.push(args)
    return null
  }
}

/** Drives the attach against a fresh store and reports both. */
async function anexar(
  midiaId: unknown,
  linhas: readonly MidiaDoc[] = [RENDER],
): Promise<{ store: FakeMidiaStore; resultado: Awaited<ReturnType<typeof anexarAvatarRender>> }> {
  const store = new FakeMidiaStore(linhas)
  const resultado = await anexarAvatarRender(
    { req: REQ, perfilId: PERFIL_ID, midiaId },
    { getStore: async () => store },
  )
  return { store, resultado }
}

const MODULO = join(import.meta.dirname, '..', '..', 'lib', 'accounts', 'avatar-asset.ts')
const FONTE = readFileSync(MODULO, 'utf8')

const RAIZ = join(import.meta.dirname, '..', '..')

/** Every `.ts`/`.tsx` module under a directory, recursively. */
function* modulosDe(dir: string): Generator<string> {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name !== 'node_modules') yield* modulosDe(caminho)
    } else if (/\.tsx?$/.test(entrada.name)) {
      yield caminho
    }
  }
}

/** Every `avatarRender: <value>` an application module writes, with the file it is in. The
 *  module under test is excluded: it is the path, not a second one. */
function escritasDoRender(): { caminho: string; valor: string }[] {
  const encontradas: { caminho: string; valor: string }[] = []
  for (const raiz of ['app', 'lib']) {
    for (const caminho of modulosDe(join(RAIZ, raiz))) {
      if (caminho === MODULO) continue
      for (const achado of readFileSync(caminho, 'utf8').matchAll(
        /avatarRender\s*:\s*([^,\n}]+)/g,
      )) {
        encontradas.push({ caminho: caminho.slice(RAIZ.length + 1), valor: (achado[1] ?? '').trim() })
      }
    }
  }
  return encontradas
}

describe('§1 — the avatar asset is held to the IMAGE group’s policy, not to a copy of it', () => {
  it('stores into the image media collection', () => {
    expect(
      AVATAR_ASSET_COLLECTION,
      'the avatar asset names a collection of its own. FR-033: it goes through the media ' +
        'collections feature 002 built, whose per-group allowlist and cap are the whole of the ' +
        'upload policy — a fourth collection would be a fourth policy nobody wrote.',
    ).toBe(MEDIA_SLUGS.image)
  })

  it('takes the cap and the allowlist from `lib/uploads/limits`, by identity', () => {
    expect(
      AVATAR_ASSET_CAP_BYTES,
      'the avatar cap is a number of its own. `limits.ts` is where the caps are written once ' +
        '(and `limits.test.ts` holds them against tech-stack.md); a second one drifts the day ' +
        'the first moves and nothing reports it.',
    ).toBe(UPLOAD_CAP_BYTES.image)
    expect(
      AVATAR_ASSET_EXTENSIONS,
      'the avatar allowlist is a second list. FR-011 enumerates the image extensions in one ' +
        'place, and two lists is how `.svg` ends up accepted by one path and refused by the other.',
    ).toBe(ALLOWED_EXTENSIONS.image)
  })

  it('retypes neither the cap nor the extensions in its own source', () => {
    expect(
      /from '\.\.\/uploads\/limits'/.test(FONTE),
      'the module does not import the upload limits at all, so whatever it enforces is its own ' +
        'opinion of what an image is.',
    ).toBe(true)
    expect(
      /'\.(?:png|jpe?g|webp|svg)'/.test(FONTE),
      'an image extension is written as a literal in this module. It is then a second ' +
        'allowlist, agreeing with FR-011’s only until one of them is edited.',
    ).toBe(false)
    expect(
      /1024|1_024|\bMEGABYTE\b/.test(FONTE),
      'a megabyte is computed in this module, which means a cap is being derived here rather ' +
        'than imported from the file that owns it.',
    ).toBe(false)
  })
})

describe('§2 — the column and the path name the same collection (D3)', () => {
  const campo = PerfilMaker.fields.find(
    (field) => 'name' in field && field.name === 'avatarRender',
  ) as RelationshipField | undefined

  it('is a relationship, never a text column holding a key', () => {
    expect(campo, 'perfilMaker declares no avatarRender at all (FR-024)').toBeDefined()
    expect(
      campo?.type,
      'the render is stored as something other than a relationship. D3, as revised: every file ' +
        'in the product is a relationship, so the database knows the row exists and the upload ' +
        'rules of its collection applied to it. A text key is a foreign key with no constraint.',
    ).toBe('relationship')
  })

  it('points at the collection the attach writes into', () => {
    expect(
      campo?.relationTo,
      'the column points at one collection and this module stores into another, so every attach ' +
        'writes an id that resolves in neither place.',
    ).toBe(AVATAR_ASSET_COLLECTION)
  })
})

describe('§3 — attaching writes the document’s id, read through the choke point', () => {
  it('resolves the media document in `midiaImagem` before writing anything', async () => {
    const { store } = await anexar(RENDER.id)

    expect(store.leituras, 'the attach wrote without ever reading the document it names').toHaveLength(1)
    expect(
      store.leituras[0]?.collection,
      'the render was looked for somewhere other than the image media collection, so nothing ' +
        'proved the id belongs to a document the upload rules ever ran on.',
    ).toBe(AVATAR_ASSET_COLLECTION)
    expect(store.leituras[0]?.id).toBe(RENDER.id)
    // `depth: 0`, asserted: § 4 exists to keep a populated `{ id, url }` shape out of the
    // column, and a populated read is the one way such a shape reaches this code at all.
    expect(
      store.leituras[0]?.depth,
      'the media document is read populated. Nothing then stops a `{ id, url }` object being ' +
        'written where the relationship wants an id.',
    ).toBe(0)
  })

  /**
   * Driven with the id **as a string**, which is what makes the assertion mean anything.
   *
   * The first version passed `RENDER.id` — a number — and asserted the write equalled
   * `RENDER.id`. Input and expectation were the same value, so "writes the resolved document's
   * id, never the caller's value" was untestable by construction: rewriting the module to
   * `data: { avatarRender: input.midiaId }` left the suite 16/16 green. A form field, a URL
   * segment and a JSON body all arrive as strings, so the string is also the realistic input.
   *
   * The fake resolves by `String()` comparison, so `'77'` finds the document; the write must
   * then be the **document's** numeric id, and the two values are finally distinguishable.
   */
  it('updates the profile with the resolved document’s id, not the caller’s value', async () => {
    const { store, resultado } = await anexar(String(RENDER.id))

    expect(resultado.ok, `the attach refused a valid render: ${JSON.stringify(resultado)}`).toBe(true)
    expect(store.escritas, 'the render was never attached to the profile').toHaveLength(1)
    expect(store.escritas[0]?.collection).toBe('perfilMaker')
    expect(
      store.escritas[0]?.id,
      'the attach wrote a profile other than the one it was given.',
    ).toBe(PERFIL_ID)
    expect(
      store.escritas[0]?.data.avatarRender,
      'the profile was updated with the caller’s value rather than the resolved document’s id. ' +
        'Passed `"77"` and written `"77"`, this column holds a string where a relationship ' +
        'wants a number — and the resolution step it went through proved nothing.',
    ).toBe(RENDER.id)
    expect(
      typeof store.escritas[0]?.data.avatarRender,
      'the id was written as a string. The document’s own id is a number, so a string here is ' +
        'the input echoed back rather than the lookup’s answer.',
    ).toBe('number')
  })
})

describe('§4 — a raw key is refused, and refused before any write (FR-033)', () => {
  it.each([
    ['a storage key', 'orgs/1/perfil/42/avatar-42.png'],
    ['a URL', 'https://cdn.example.org/media/avatar-42.png'],
    ['a filename', 'avatar-42.png'],
  ])('refuses %s and leaves the profile untouched', async (_que, chave) => {
    const { store, resultado } = await anexar(chave)

    expect(
      resultado.ok,
      `"${chave}" was accepted as an avatar render. Nothing in the database connects it to a ` +
        'row, so the PNG it names is unconstrained by the upload rules and unfindable when the ' +
        'object moves.',
    ).toBe(false)
    expect(store.escritas, 'a refused attach still wrote to the profile').toHaveLength(0)
    expect(
      resultado.ok ? '' : resultado.motivo,
      'the refusal does not quote the value it refused, so the caller cannot tell which of its ' +
        'inputs was wrong.',
    ).toContain(chave)
  })

  it('refuses an id that names no document, without writing', async () => {
    const { store, resultado } = await anexar(999)

    expect(resultado.ok, 'an id that resolves to no document was attached anyway').toBe(false)
    expect(store.escritas).toHaveLength(0)
  })

  it('refuses a populated document object without even reading', async () => {
    const { store, resultado } = await anexar({ id: RENDER.id, url: '/media/avatar-42.png' })

    expect(
      resultado.ok,
      'an object was accepted as the value of the relationship. Payload stores a relationship ' +
        'as an id; writing the populated shape back is how a `url` ends up in the column.',
    ).toBe(false)
    expect(store.leituras, 'a value that cannot be an id was still taken to the database').toHaveLength(0)
    expect(store.escritas).toHaveLength(0)
  })
})

describe('§5 — feature 002’s upload limits apply to the asset, not only to the upload', () => {
  it('refuses a media document above the image cap', async () => {
    const gordo: MidiaDoc = { id: 78, filename: 'avatar.png', filesize: UPLOAD_CAP_BYTES.image + 1 }
    const { store, resultado } = await anexar(gordo.id, [gordo])

    expect(
      resultado.ok,
      'an image larger than the image cap was attached. The cap is the group’s, and a row that ' +
        'reached the database around it is exactly what this check exists to refuse.',
    ).toBe(false)
    expect(store.escritas).toHaveLength(0)
    expect(resultado.ok ? '' : resultado.motivo).toContain(String(UPLOAD_CAP_BYTES.image))
  })

  it('refuses a media document whose extension is not on the image allowlist', async () => {
    const gif: MidiaDoc = { id: 79, filename: 'avatar.gif', filesize: 1_000 }
    const { store, resultado } = await anexar(gif.id, [gif])

    expect(resultado.ok, '`avatar.gif` was attached as the composed avatar').toBe(false)
    expect(store.escritas).toHaveLength(0)
  })

  it('answers the file-policy question on its own, for a caller that has bytes and no row yet', () => {
    expect(
      recusaDoArquivo('avatar-42.png', UPLOAD_CAP_BYTES.image),
      'a PNG at exactly the cap was refused. The cap is inclusive everywhere else in this ' +
        'codebase, and an off-by-one here refuses the largest legal upload.',
    ).toBeNull()
    expect(
      recusaDoArquivo('avatar-42.png', UPLOAD_CAP_BYTES.image + 1),
      'one byte over the cap was accepted.',
    ).toContain(String(UPLOAD_CAP_BYTES.image))
    expect(
      recusaDoArquivo('avatar-42.gif', 1_000),
      'a format outside FR-011’s image allowlist was accepted.',
    ).toBeTruthy()
    expect(
      recusaDoArquivo('avatar-42', 1_000),
      'a file with no extension was accepted, so the allowlist is checked only when the caller ' +
        'volunteers something to check.',
    ).toBeTruthy()
    expect(
      recusaDoArquivo('avatar-42.png', 0),
      'an empty file was accepted as a composed avatar.',
    ).toBeTruthy()
  })
})

describe('§6 — one path: no other module SETS this column', () => {
  it('leaves every other avatarRender write as a clear', () => {
    const alheias = escritasDoRender().filter(({ valor }) => valor !== 'null')

    expect(
      alheias,
      `these modules set \`avatarRender\` themselves: ${alheias
        .map(({ caminho, valor }) => `${caminho} → ${valor}`)
        .join('; ')}. Clearing it is anyone’s — T035 drops the stale PNG in the same write as ` +
        'the configuration it belonged to. SETTING it is this module’s alone, because that is ' +
        'the write where a raw key gets in (FR-033).',
    ).toEqual([])
  })
})
