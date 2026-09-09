import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { RichText } from '@payloadcms/richtext-lexical/react'
import { ModelViewer } from '@fablab/ui'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { FindArgs } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T021 / FR-014, FR-030, US6, US10, CLR-002 — the `modelo3d` detail page.
 *
 * This page is the one place in the product where 3D code runs, and until it existed FR-014's
 * positive half — *"the 3D preview renders `.glb`/`.gltf` on the detail page"* — was realised
 * nowhere: `ModelViewer` had a component, eighteen tests and no consumer outside the workbench,
 * while the Biblioteca 3D listing's cards already linked at `/biblioteca-3d/{slug}`. Those were
 * links to a 404, and the task preamble names the shape exactly: *"a module or endpoint with
 * tests and no caller is not a feature."*
 *
 * Two things distinguish it from `artigos/[slug]` and are therefore what this file spends its
 * assertions on:
 *
 *   1. **`arquivosModelo`.** `Modelo3d.ts` registers `downloadEndpoint('modelo3d',
 *      'arquivosModelo')` where `Artigo.ts` registers `anexos` and `Projeto.ts` registers
 *      `arquivos`. A page built against the wrong name 404s every file while looking correct.
 *   2. **The preview branch.** `arquivoPreview3d` is optional, so a model with only `.stl` is
 *      ordinary rather than broken, and US6's edge says it *"shows its thumbnail instead —
 *      never a broken or empty canvas"*.
 *
 * ── The instrument, and its one deliberate limit ────────────────────────────────────────────
 *
 * Same as the other two detail suites: no DOM at `node`, so the page is a plain async function
 * returning a plain object and awaiting it asserts the markup it actually builds. What it
 * cannot prove is the byte-identity of the three 404s across a *live* request — `detalhe.test.ts`
 * does that against a real database. The claim here is the one that lives in this module: one
 * slug query through the anonymous choke point, and no branch anywhere that could tell a draft
 * from a stranger.
 */

const PAGE_SOURCE = join(
  import.meta.dirname,
  '..',
  '..',
  'app',
  '(frontend)',
  'biblioteca-3d',
  '[slug]',
  'page.tsx',
)

/** The smallest Lexical document Payload stores for a `richText` field, written out rather than
 *  built through the editor — importing the editor to make one paragraph would drag the whole
 *  package into this file. */
const lexicalParagraph = (text: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        textFormat: 0,
        children: [
          { type: 'text', text, format: 0, style: '', mode: 'normal', detail: 0, version: 1 },
        ],
      },
    ],
  },
})

const DESCRICAO = lexicalParagraph('Impresso em PLA, 0,2 mm de camada, sem suportes.')

/** One published model as the public read returns it, populated one level: the category and the
 *  author are objects, and `arquivosModelo` arrives in Payload's `{ relationTo, value }`
 *  envelope because it is polymorphic over `midiaModelo3d` and `midiaDocumento`. */
const MODELO = {
  id: 30,
  titulo: 'Mini Lobo Guará',
  slug: 'mini-lobo-guara',
  descricaoCurta: 'Miniatura articulada do lobo-guará, pronta para impressão.',
  descricaoCompleta: DESCRICAO,
  thumbnail: { id: 4, url: '/media/lobo.png' },
  galeria: [{ id: 11, url: '/media/lobo-render-2.png' }],
  arquivoPreview3d: { id: 6, url: '/media/lobo.glb', filename: 'lobo.glb' },
  arquivosModelo: [
    { relationTo: 'midiaModelo3d', value: { id: 7, filename: 'lobo.stl', filesize: 2_400_000 } },
    { relationTo: 'midiaDocumento', value: { id: 8, filename: 'montagem.pdf', filesize: 512_000 } },
  ],
  formatos: ['.stl', '.glb'],
  nivelDificuldade: 'intermediario',
  categoria: { id: 1, nome: 'Animais', slug: 'animais' },
  autor: { id: 9, nome: 'Maria Silva', handle: 'mariasilva' },
  downloads: 87,
}

/** The anonymous client, recorded rather than stubbed inline: §1 reads its `calls` to prove
 *  which query the page issued, and that it issued exactly one. */
class FakePublicClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(private readonly docs: readonly Record<string, unknown>[]) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    return { docs: this.docs as T[], totalDocs: this.docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

const mocks = vi.hoisted(() => {
  /** What the real `notFound()` does: it throws and never returns. Modelling that is
   *  load-bearing — a mock that returns lets execution fall through to a render the runtime
   *  would never reach. */
  const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    NOT_FOUND,
    notFound: vi.fn((): never => {
      throw NOT_FOUND
    }),
    getPublicScopedPayloadForRSC: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

const { default: ModeloDetalhe } = await import('../../app/(frontend)/biblioteca-3d/[slug]/page')

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

const findOne = (node: ReactNode, type: unknown): AnyElement | undefined => findAll(node, type)[0]

/** Every string in the tree, joined — what a reader would see, ignoring the markup around it. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (!isElement(node)) return ''
  return textOf((node.props.children ?? null) as ReactNode)
}

type Rendered = { tree: ReactNode; client: FakePublicClient }

/** Renders the detail page for a slug, with the document the read should find. `null` is the
 *  answer the public client gives for a draft, a foreign row and an unknown slug alike. */
async function render(
  slug = MODELO.slug,
  doc: Record<string, unknown> | null = MODELO,
): Promise<Rendered> {
  const client = new FakePublicClient(doc === null ? [] : [doc])
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(client)
  const tree = (await ModeloDetalhe({ params: Promise.resolve({ slug }) })) as unknown as ReactNode
  return { tree, client }
}

/** The document with one optional part removed — US10's "renders without them" edge. */
const sem = (parte: keyof typeof MODELO): Record<string, unknown> => {
  const doc: Record<string, unknown> = { ...MODELO }
  delete doc[parte]
  return doc
}

describe('§1 — one slug query, through the anonymous choke point (US10, SC-002)', () => {
  it('reads the model by slug at depth 1, and asks for nothing else', async () => {
    const { client } = await render()

    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]).toMatchObject({
      collection: 'modelo3d',
      where: { slug: { equals: MODELO.slug } },
      limit: 1,
      // `depth: 1` is what lets a detail page reach the thumbnail, the gallery, the preview
      // file and the model files THROUGH the published document — which is why none of the
      // media collections is publicly listable (plan § Sketch 1).
      depth: 1,
    })
  })

  it('names no status and no tenant of its own', async () => {
    // Both constraints belong to `getPublicScopedPayload`; a second opinion here is a place
    // the two can disagree, and the page would be the copy nobody updates.
    const { client } = await render()
    const where = JSON.stringify(client.calls[0]?.where ?? {})

    expect(where).not.toContain('status')
    expect(where).not.toContain('tenant')
  })

  it('mentions none of the review states anywhere in its source', () => {
    // US10's rule is satisfied by having no branch at all, so the check is over the SOURCE:
    // a page that names `rascunho` has grown a branch that can tell a draft from a stranger.
    const source = readFileSync(PAGE_SOURCE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
    for (const estado of ['rascunho', 'em_revisao']) {
      expect(source, `the page names ${estado}, so it can tell a draft from a missing model`)
        .not.toContain(estado)
    }
  })
})

describe('§2 — the 404 that tells nothing (US10 error case)', () => {
  it('404s a slug the public read did not return', async () => {
    await expect(render('nao-existe', null)).rejects.toThrow(mocks.NOT_FOUND.message)
    expect(mocks.notFound).toHaveBeenCalled()
  })

  it('404s an unresolved host rather than rendering an error state', async () => {
    mocks.getPublicScopedPayloadForRSC.mockRejectedValueOnce(new TenantUnresolvedError('nope.test'))

    await expect(
      ModeloDetalhe({ params: Promise.resolve({ slug: MODELO.slug }) }),
    ).rejects.toThrow(mocks.NOT_FOUND.message)
  })

  it('rethrows any other failure instead of dressing an outage as a missing model', async () => {
    // A 404 for a database that fell over tells the visitor a lie, tells a crawler to drop the
    // URL, and tells the team nothing.
    const outage = new Error('connection refused')
    mocks.getPublicScopedPayloadForRSC.mockRejectedValueOnce(outage)

    await expect(
      ModeloDetalhe({ params: Promise.resolve({ slug: MODELO.slug }) }),
    ).rejects.toThrow('connection refused')
  })
})

describe('§3 — the 3D preview, and the thumbnail behind it (FR-014, US6, CLR-002)', () => {
  it('renders the shared island, not a viewer of its own', async () => {
    // Identity, not shape: this file imports the same module instance the page does, so a
    // local look-alike — or a raw `<model-viewer>` written here — fails.
    const viewer = findOne((await render()).tree, ModelViewer)

    expect(viewer, 'the detail page renders no <ModelViewer> at all').toBeDefined()
  })

  it('hands it the .glb and the stored thumbnail as the poster', async () => {
    const viewer = findOne((await render()).tree, ModelViewer)

    expect(viewer?.props.src).toBe('/media/lobo.glb')
    // The poster is what the visitor sees while the mesh streams, and what remains if it never
    // does. `Modelo3d.thumbnail` is `required: true`, so it always exists.
    expect(viewer?.props.poster).toBe('/media/lobo.png')
  })

  it('names the model in the alt, because for a visitor who cannot see it this IS the model', async () => {
    const viewer = findOne((await render()).tree, ModelViewer)

    expect(String(viewer?.props.alt)).toContain(MODELO.titulo)
  })

  it('still renders the island for a model with no web-ready preview (US6 edge)', async () => {
    // The fallback is the COMPONENT's branch, not the page's, so the page hands over an empty
    // `src` and lets one rule in one place decide. A page that chose an `<img>` here would be a
    // second implementation of the same decision, free to disagree with the first.
    const viewer = findOne((await render(MODELO.slug, sem('arquivoPreview3d'))).tree, ModelViewer)

    expect(viewer, 'a mesh-only model rendered no preview element at all').toBeDefined()
    expect(viewer?.props.src).toBeUndefined()
    expect(viewer?.props.poster).toBe('/media/lobo.png')
  })

  it('renders nothing at all when even the thumbnail is missing', async () => {
    // `thumbnail` is required on the collection, so this is a document that should not exist —
    // and a `<ModelViewer>` with an empty poster is a broken image, which US6 forbids by name.
    const { tree } = await render(MODELO.slug, sem('thumbnail'))

    expect(findOne(tree, ModelViewer)).toBeUndefined()
  })
})

describe('§4 — the model files link at the collection’s own route (FR-030, FR-012, FR-016)', () => {
  const linksDe = async (doc: Record<string, unknown> | null = MODELO): Promise<string[]> => {
    const { tree } = await render(MODELO.slug, doc)
    const secao = findAll(tree, 'section').find(
      (node) => node.props['aria-label'] === 'Arquivos do modelo',
    )
    return findAll(secao ?? null, 'a').map((anchor) => String(anchor.props.href))
  }

  it('builds every href against arquivosModelo, the field THIS collection registers', async () => {
    // The distinguishing assertion of this file. `Modelo3d.ts` registers
    // `downloadEndpoint('modelo3d', 'arquivosModelo')`; `artigo` names the same idea `anexos`
    // and `projeto` names it `arquivos`. Copying either page's link builder would 404 every
    // file here while the page looked entirely correct.
    expect(await linksDe()).toEqual([
      `/api/modelo3d/${MODELO.id}/download/7`,
      `/api/modelo3d/${MODELO.id}/download/8`,
    ])
  })

  it('links both halves of the polymorphic relationship, mesh and document alike', async () => {
    // `arquivosModelo` spans `midiaModelo3d` and `midiaDocumento` because `.zip` sits on the
    // document group's allowlist. A page that unwrapped only one `relationTo` would silently
    // drop the other, and a model whose only file is a `.zip` would offer nothing.
    const { tree } = await render()
    const nomes = textOf(
      findAll(tree, 'section').find((node) => node.props['aria-label'] === 'Arquivos do modelo') ??
        null,
    )

    expect(nomes).toContain('lobo.stl')
    expect(nomes).toContain('montagem.pdf')
  })

  it('prints each size beside the filename, so a download can be judged before it starts', async () => {
    const { tree } = await render()
    const texto = textOf(
      findAll(tree, 'section').find((node) => node.props['aria-label'] === 'Arquivos do modelo') ??
        null,
    )

    // Binary MB and a comma, matching what the other two detail pages print — two pages
    // disagreeing about the size of the same file is worse than neither printing one.
    expect(texto).toContain('2,3 MB')
  })

  it('skips an entry that arrived as a bare id rather than linking a nameless file', async () => {
    const doc = { ...MODELO, arquivosModelo: [MODELO.arquivosModelo[0], 99] }

    expect(await linksDe(doc)).toEqual([`/api/modelo3d/${MODELO.id}/download/7`])
  })

  it('renders no file section at all for a model with none', async () => {
    expect(await linksDe(sem('arquivosModelo'))).toEqual([])
  })

  it('invites nobody to create an account in order to download', async () => {
    // FR-012 and `biblioteca-3d.md` both make the download open, and the count is the
    // endpoint's business. A gate here would be a product decision this page does not own.
    const texto = textOf((await render()).tree).toLowerCase()

    for (const palavra of ['criar conta', 'entrar', 'login', 'fazer login']) {
      expect(texto, `the page asks the visitor to ${palavra} before downloading`).not.toContain(
        palavra,
      )
    }
  })
})

describe('§5 — the rest of what FR-030 puts on the page', () => {
  it('renders the long description through Payload’s own Lexical converter', async () => {
    const rich = findOne((await render()).tree, RichText)

    expect(rich, 'the Lexical body is not rendered at all').toBeDefined()
    expect(rich?.props.data).toBe(MODELO.descricaoCompleta)
  })

  it('renders the gallery lazily, so it does not compete with the preview for LCP', async () => {
    const { tree } = await render()
    const secao = findAll(tree, 'section').find((node) => node.props['aria-label'] === 'Galeria')
    const imagens = findAll(secao ?? null, 'img')

    expect(imagens).toHaveLength(1)
    expect(imagens[0]?.props.src).toBe('/media/lobo-render-2.png')
    expect(
      imagens[0]?.props.loading,
      'a gallery image loaded eagerly competes with the preview, which is this page’s LCP ' +
        'candidate (SC-006)',
    ).toBe('lazy')
    // No invented alt: the title sits above, and an alt built from it makes a screen reader
    // read the same words once per image.
    expect(imagens[0]?.props.alt).toBe('')
  })

  it('shows the category and the difficulty as chips, in the collection’s vocabulary', async () => {
    const texto = textOf((await render()).tree)

    expect(texto).toContain('Animais')
    // `intermediario` is a schema identifier; `Intermediário` is what a visitor reads.
    expect(texto).toContain('Intermediário')
    expect(texto, 'the raw enum value reached the page').not.toContain('intermediario')
  })

  it('shows no difficulty at all for a value outside the collection’s three', async () => {
    // `nivelDificuldade` is optional and its scale is marked **(proposta)** — a model saved
    // before a scale change would otherwise print a slug into the design.
    const texto = textOf((await render(MODELO.slug, { ...MODELO, nivelDificuldade: 'lendario' })).tree)

    expect(texto).not.toContain('lendario')
  })

  it('credits the maker without linking to a profile route this feature does not create', async () => {
    const { tree } = await render()
    const texto = textOf(tree)

    expect(texto).toContain('Maria Silva')
    expect(texto).toContain('@mariasilva')
    expect(
      findAll(tree, 'a').map((anchor) => String(anchor.props.href)),
      'the byline links at a maker profile, which is feature 004/005 — today that is a 404',
    ).not.toContain('/makers/mariasilva')
  })

  it('offers the way back to the listing it came from', async () => {
    const voltar = findAll((await render()).tree, 'a').find(
      (anchor) => anchor.props.href === '/biblioteca-3d',
    )

    expect(
      voltar,
      'a visitor who arrived on a shared URL has no way back to the library',
    ).toBeDefined()
  })

  it('renders without every optional part, one at a time (US10 edge)', async () => {
    for (const parte of ['descricaoCompleta', 'galeria', 'autor', 'categoria'] as const) {
      const { tree } = await render(MODELO.slug, sem(parte))
      expect(textOf(tree), `the page broke without ${parte}`).toContain(MODELO.titulo)
    }
  })
})
