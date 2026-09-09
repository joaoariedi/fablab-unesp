import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { notFound } from 'next/navigation'

import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

import { Chip, formatHandle, ModelViewer } from '@fablab/ui'

import { TenantUnresolvedError } from '../../../../lib/tenancy/errors'
// Deep import, exactly as `layout.tsx` and every listing does it, and for the same reason: the
// anonymous read path is not re-exported from `lib/tenancy`'s index, because it runs with
// `overrideAccess: true` and that unexported-ness is one of the two locks the module keeps.
import { getPublicScopedPayloadForRSC } from '../../../../lib/tenancy/public-payload'

/**
 * T021 / FR-014, FR-030, US6, US10, CLR-002 — the `modelo3d` detail page, and the only place in
 * the product where 3D code runs.
 *
 * FR-030 puts a detail page on `projeto`, `modelo3d` and `artigo` alike, and `biblioteca-3d.md`
 * already links here: the listing card's title and its arrow both point at
 * `/biblioteca-3d/{slug}`. Until this file existed those were links to a 404 — and
 * `ModelViewer`'s only consumers were its own test and the workbench, which is the shape the
 * task preamble names outright: *"a module or endpoint with tests and no caller is not a
 * feature."*
 *
 * ── Why the viewer is here and nowhere else (CLR-002) ───────────────────────────────────────
 *
 * CLR-002 keeps the preview off every listing card, and the reason is measured rather than
 * stylistic: *"preview-per-card means twelve WebGL contexts competing with the 2.5s LCP
 * budget"*. One page, one context, and only when the model actually carries a web-readable
 * preview — `ModelViewer` imports its element from an effect, so a model with no `.glb` fetches
 * no 3D code at all. FR-014 says the same thing from the other side: *"a listing card shows the
 * stored thumbnail and loads no 3D code."*
 *
 * `arquivoPreview3d` is optional on the collection, which is why the fallback is not an error
 * path: a model published with only `.stl` and `.3mf` is ordinary and complete, and US6's edge
 * case says it *"shows its thumbnail instead — never a broken or empty canvas"*. `thumbnail` is
 * `required: true`, so that fallback always has something to show.
 *
 * ── The 404 is a consequence, not a branch ──────────────────────────────────────────────────
 *
 * US10's error case: *"an unpublished or foreign slug is a 404, the same answer as an unknown
 * one … it must not distinguish 'exists but is a draft' from 'does not exist'"*. Nothing below
 * implements that rule, and that is the design (plan § Sketch 3): the published-only filter
 * lives in `getPublicScopedPayload` and the tenant constraint in `buildTenantClient`, so a
 * draft and another organization's model both arrive here as an empty result — the same value
 * an unknown slug produces. There is no state to tell apart, so there is no way to leak the
 * difference, and grepping this file for the review states finds nothing on purpose.
 *
 * `TenantUnresolvedError` is the one caught failure, and it is a 404 too. **Every other failure
 * is rethrown** — dressing an outage as a missing model tells the visitor a lie, tells a crawler
 * to drop the URL, and tells the team nothing.
 *
 * ── Downloads are linked, never re-implemented ──────────────────────────────────────────────
 *
 * `Modelo3d.ts` registers `downloadEndpoint('modelo3d', 'arquivosModelo')`, and the field name
 * is the whole reason this page is not a copy of `artigos/[slug]`: that collection names its
 * attachments `anexos`, `projeto` names them `arquivos`, and a page built against the wrong one
 * would 404 every file while looking entirely correct. The open-access rule and the counted
 * write both live behind that route; this page contributes an anchor and nothing else.
 */

/** One media document as `depth: 1` populates it. */
type MidiaDoc = {
  readonly id?: string | number
  readonly url?: string | null
  readonly filename?: string | null
  readonly filesize?: number | null
}

/** The envelope a **polymorphic** relationship arrives in — `arquivosModelo` spans
 *  `midiaModelo3d` and `midiaDocumento`, so each entry names its collection beside the row. */
type ArquivoRef = { readonly relationTo?: string; readonly value?: MidiaDoc | string | number }

/** The author profile as `depth: 1` populates it. */
type PerfilDoc = { readonly nome?: string; readonly handle?: string }

/**
 * One model as the public read returns it, populated one level.
 *
 * Structural rather than imported from `payload-types.ts`: that file is **gitignored**, so CI
 * type-checks without it (tasks.md § "Read before starting", item 6). A page that imported a
 * generated type would compile locally and fail the pipeline.
 */
type Modelo3dDoc = {
  readonly id?: string | number
  readonly titulo?: string
  readonly slug?: string
  readonly descricaoCurta?: string
  readonly descricaoCompleta?: SerializedEditorState | null
  readonly thumbnail?: MidiaDoc | string | number | null
  readonly galeria?: readonly (MidiaDoc | string | number)[] | null
  readonly arquivosModelo?: readonly (ArquivoRef | string | number)[] | null
  readonly arquivoPreview3d?: MidiaDoc | string | number | null
  readonly formatos?: readonly string[] | null
  readonly nivelDificuldade?: string | null
  readonly categoria?: { readonly nome?: string } | string | number | null
  readonly autor?: PerfilDoc | string | number | null
  readonly downloads?: number | null
}

/** The listing this page came from, and the only way back for a visitor who arrived on a
 *  shared URL. Kept in step with `BIBLIOTECA_PATH` on the listing itself. */
const LISTAGEM = '/biblioteca-3d'

/** Payload's REST mount (`routes.api` is left at its default), where the collection's own
 *  `downloadEndpoint` is served. */
const API = '/api'

/** Bytes per megabyte. Binary, because that is what every file manager the visitor will compare
 *  against reports — and what the other two detail pages print, so no two of them disagree
 *  about the size of the same file. */
const MB = 1024 * 1024

/** The difficulty labels, in the collection's own vocabulary (`Modelo3d.nivelDificuldade`).
 *  A value outside it renders nothing rather than the raw slug, which would leak a schema
 *  identifier into the page. */
const NIVEIS: Readonly<Record<string, string>> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
}

/** `GET /api/modelo3d/:id/download/:midiaId` — the route `Modelo3d.ts` registers over
 *  `arquivosModelo`. Both ids come from the document just read, so a visitor can name neither. */
const downloadHref = (modeloId: Modelo3dDoc['id'], midiaId: MidiaDoc['id']): string =>
  `${API}/modelo3d/${String(modeloId)}/download/${String(midiaId)}`

const asDoc = <T,>(value: T | string | number | null | undefined): T | null =>
  typeof value === 'object' && value !== null ? value : null

/**
 * The model this slug names, or `null` for every reason a visitor may not have it.
 *
 * One query, `limit: 1`, and no ordering: a slug is unique within an organization, and the two
 * constraints that make it so — the tenant and the published status — are the client's.
 * `depth: 1` populates the category, the author, the thumbnail, the gallery, the preview file
 * and the model files in that same query, which is what lets a detail page read media *through*
 * a published document rather than needing any media collection to be publicly listable
 * (plan § Sketch 1).
 */
async function lerModelo(slug: string): Promise<Modelo3dDoc | null> {
  const db = await getPublicScopedPayloadForRSC()
  const { docs } = await db.find<Modelo3dDoc>({
    collection: 'modelo3d',
    where: { slug: { equals: slug } },
    depth: 1,
    limit: 1,
  })
  return docs[0] ?? null
}

/** The author line: the maker the model credits, or nothing when the profile did not arrive.
 *  Not a link — the public maker profile is a future spec (004/005), and an anchor to a route
 *  this feature does not create is a 404 the mockup did not ask for. */
function autoria(modelo: Modelo3dDoc): ReactNode {
  const perfil = asDoc<PerfilDoc>(modelo.autor)
  if (!perfil?.nome) return null
  return (
    <span style={ESTILO.autor}>
      <span>{perfil.nome}</span>
      {perfil.handle === undefined ? null : <span>{formatHandle(perfil.handle)}</span>}
    </span>
  )
}

/** The header band: the way back, the title, the category chip, the byline and the summary. */
function cabecalho(modelo: Modelo3dDoc): ReactElement {
  const categoria = asDoc<{ nome?: string }>(modelo.categoria)?.nome ?? ''
  const nivel = NIVEIS[modelo.nivelDificuldade ?? ''] ?? ''
  return (
    <section style={ESTILO.cabecalho}>
      <a href={LISTAGEM} style={ESTILO.voltar}>
        ← BIBLIOTECA 3D
      </a>
      <h1 style={ESTILO.titulo}>{modelo.titulo ?? ''}</h1>
      <p style={ESTILO.chips}>
        {categoria === '' ? null : <Chip variant="status">{categoria}</Chip>}
        {/* The difficulty is a status the visitor reads, not a filter they can press here —
            the listing owns that control (FR-007, CLR-006). */}
        {nivel === '' ? null : <Chip variant="status">{nivel}</Chip>}
      </p>
      <p style={ESTILO.meta}>{autoria(modelo)}</p>
      <p style={ESTILO.resumo}>{modelo.descricaoCurta ?? ''}</p>
    </section>
  )
}

/**
 * The preview: the interactive model where one exists, the stored thumbnail otherwise (FR-014).
 *
 * The branch is `ModelViewer`'s own — this page hands it a `src` that may be empty and a poster
 * that never is, and the component decides. Keeping the decision there is what makes the
 * fallback one rule in one place rather than two pages agreeing about it; the same call renders
 * correctly on a model with no `.glb`, on one whose `.glb` fails to load, and on one that works.
 */
function previsualizacao(modelo: Modelo3dDoc): ReactNode {
  const poster = asDoc<MidiaDoc>(modelo.thumbnail)?.url ?? ''
  if (poster === '') return null
  const preview = asDoc<MidiaDoc>(modelo.arquivoPreview3d)?.url ?? undefined
  return (
    <section aria-label="Pré-visualização" style={ESTILO.previa}>
      <ModelViewer
        src={preview}
        poster={poster}
        // The alt names the model, because for a visitor who cannot see it this element IS the
        // model. An empty alt would be right for decoration and is wrong for the subject.
        alt={`Pré-visualização de ${modelo.titulo ?? 'modelo 3D'}`}
      />
    </section>
  )
}

/** The extra renders, after the preview. Lazy without exception: the preview above is the LCP
 *  candidate on this page, and a gallery loaded eagerly competes with it (SC-006). */
function galeria(modelo: Modelo3dDoc): ReactNode {
  const imagens = (modelo.galeria ?? [])
    .map((imagem) => asDoc<MidiaDoc>(imagem))
    .filter((imagem): imagem is MidiaDoc => Boolean(imagem?.url))
  if (imagens.length === 0) return null
  return (
    <section aria-label="Galeria" style={ESTILO.galeria}>
      {imagens.map((imagem) => (
        // The collection stores no alt text and the title sits above: an alt built from the
        // title makes a screen reader read the same words once per image.
        <img key={imagem.id} src={imagem.url ?? ''} alt="" loading="lazy" decoding="async" style={ESTILO.imagem} />
      ))}
    </section>
  )
}

/**
 * The long description, through Payload's own Lexical → JSX converter.
 *
 * `descricaoCompleta` is stored as a Lexical document, so the alternative to this converter is a
 * renderer of our own for a format we do not control. A model with no body renders nothing at
 * all, not an empty section (US10 edge).
 */
function corpo(modelo: Modelo3dDoc): ReactNode {
  const conteudo = modelo.descricaoCompleta
  if (!conteudo) return null
  return (
    <section style={ESTILO.corpo}>
      <RichText data={conteudo} />
    </section>
  )
}

/** `2,3 MB`, or nothing when the media document carries no size. */
function tamanho(bytes: MidiaDoc['filesize']): string {
  if (typeof bytes !== 'number' || bytes <= 0) return ''
  return `${(bytes / MB).toFixed(1).replace('.', ',')} MB`
}

/**
 * The model files, each an anchor at the collection's download route (FR-030, FR-012, FR-016).
 *
 * An entry that arrived as a bare id is **skipped**: the id alone names no file, so the link
 * would be one a visitor cannot judge before clicking, and there is nothing to recover from.
 * Two named files beside one nameless row is worse than two named files.
 *
 * No account, and no invitation to make one: `biblioteca-3d.md` and FR-012 both make the
 * download open, and the count is the endpoint's business.
 */
function arquivos(modelo: Modelo3dDoc): ReactNode {
  const midias = (modelo.arquivosModelo ?? [])
    .map((arquivo) => asDoc<ArquivoRef>(arquivo))
    .map((arquivo) => asDoc<MidiaDoc>(arquivo?.value))
    .filter((midia): midia is MidiaDoc => Boolean(midia?.filename))
  if (midias.length === 0) return null
  return (
    <section aria-label="Arquivos do modelo" style={ESTILO.arquivos}>
      <h2 style={ESTILO.secaoTitulo}>ARQUIVOS</h2>
      <ul style={ESTILO.lista}>
        {midias.map((midia) => (
          <li key={midia.id}>
            <a href={downloadHref(modelo.id, midia.id)} style={ESTILO.arquivo}>
              {midia.filename} {tamanho(midia.filesize)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Next hands a dynamic segment to a page as a promise. */
type ModeloDetalheProps = { readonly params: Promise<{ slug: string }> }

/**
 * `/biblioteca-3d/{slug}` — one published model, in full.
 *
 * @example /biblioteca-3d/mini-lobo-guara
 */
export default async function Page({ params }: ModeloDetalheProps): Promise<ReactElement> {
  const { slug } = await params

  // `notFound()` throws, so it is called *outside* the catch: inside, it would be swallowed by
  // the very handler that is supposed to raise it.
  const modelo = await lerModelo(slug).catch((erro: unknown) => {
    if (erro instanceof TenantUnresolvedError) return null
    throw erro
  })
  if (!modelo) notFound()

  return (
    <main style={ESTILO.pagina}>
      {cabecalho(modelo)}
      {previsualizacao(modelo)}
      {galeria(modelo)}
      {corpo(modelo)}
      {arquivos(modelo)}
    </main>
  )
}

/**
 * Every style this page declares, in one object.
 *
 * Style objects rather than a stylesheet, for the reason the listings and every component
 * record: the suite runs at `node` with no DOM, so a class name would be assertable only as
 * text in two files — a check that stays green when the rule behind it is wrong. Every colour
 * is a token (FR-027); there is no hex here and there must never be one.
 *
 * The page is **light**, like the listing it came from: `--surface-inverted` with
 * `--text-on-light`, the pair `biblioteca-3d.md` draws and the one `contrast.test.ts` certifies.
 */
const ESTILO: Record<string, CSSProperties> = {
  pagina: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--surface-inverted)',
    color: 'var(--text-on-light)',
  },
  cabecalho: {
    background: 'var(--surface-band)',
    // The ring must follow the BAND, not only the page. `--focus-ring-color` resolves from
    // `:root` (or the page's own override) to the accent, and the accent on this teal scores
    // **1.13:1** — WCAG 1.4.11 asks 3:1 for a focus indicator, so the ring on every target
    // inside this band was invisible while the page-level override two rules away made the
    // rest of the page correct. Navy on teal is 7.18:1 and is the documented pair.
    '--focus-ring-color': 'var(--text-on-light)',
    // Navy on teal is the documented pair; the light-on-dark default would be unreadable here.
    color: 'var(--text-on-light)',
    padding: 'var(--space-8) var(--space-5)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
  } as CSSProperties,
  voltar: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
    color: 'inherit',
    textDecoration: 'none',
    // FR-022: at least 44px on the compact breakpoints, written unconditionally — a target that
    // is only large below 834 is a rule nobody can check on the device in their hand.
    minHeight: '44px',
    display: 'inline-flex',
    alignItems: 'center',
  },
  titulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    textTransform: 'uppercase',
  },
  chips: { margin: 0, display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' },
  meta: {
    margin: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--space-3)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
  },
  autor: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' },
  resumo: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    maxWidth: '60ch',
  },
  // Bounded, because the viewer fills the width it is given and a full-bleed square on a
  // desktop viewport is a preview taller than the window.
  previa: { padding: 'var(--space-8) var(--space-5) 0', maxWidth: '640px', width: '100%' },
  galeria: {
    padding: 'var(--space-6) var(--space-5) 0',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-3)',
  },
  imagem: { width: '160px', height: 'auto', display: 'block' },
  corpo: {
    padding: 'var(--space-8) var(--space-5)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    // Measured in characters so the line length holds at every breakpoint.
    maxWidth: '70ch',
  },
  arquivos: { padding: '0 var(--space-5) var(--space-10)' },
  secaoTitulo: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xl)',
    marginTop: 0,
    marginBottom: 'var(--space-4)',
  },
  lista: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  arquivo: {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    // `--color-azul`, not the pink accent: FR-028 forbids small pink text on white, and this is
    // a list of links at body size on the lightest surface in the product.
    color: 'var(--color-azul)',
    minHeight: '44px',
    display: 'inline-flex',
    alignItems: 'center',
  },
}
