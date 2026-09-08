import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { notFound } from 'next/navigation'

import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

import { Chip, formatHandle } from '@fablab/ui'

import { TenantUnresolvedError } from '../../../../lib/tenancy/errors'
// Deep import, exactly as `layout.tsx` and the listings do it and for the same reason: the
// anonymous read path is not re-exported from `lib/tenancy`'s index, because it runs with
// `overrideAccess: true` and that unexported-ness is one of the two locks the module keeps.
import { getPublicScopedPayloadForRSC } from '../../../../lib/tenancy/public-payload'
import { dataCurta } from '../data-publicacao'

/**
 * T019 / FR-030, FR-012, US10 — the `artigo` detail page, and the destination the card's arrow
 * points at.
 *
 * `spec.md` FR-030: *"`projeto`, `modelo3d` and `artigo` each have a detail page rendering the
 * long text, gallery and attachments feature 002 stores (CLR-001)"*. For an article those are
 * `corpo` — the Lexical body no listing renders — and **`anexos`**, which is the whole reason
 * this page is not a copy of `projetos/[slug]`: `Artigo.ts` registers
 * `downloadEndpoint('artigo', 'anexos')` where `Projeto.ts` registers `arquivos`, and a page
 * that built its links against the wrong field name would 404 every attachment while looking
 * entirely correct. `artigo` has no gallery at all, so there is no gallery section here.
 *
 * ── The 404 is a consequence, not a branch ──────────────────────────────────────────────────
 *
 * US10's error case: *"an unpublished or foreign slug is a 404, the same answer as an unknown
 * one … it must not distinguish 'exists but is a draft' from 'does not exist'"*. Nothing below
 * implements that rule, and that is the design (plan § Sketch 3): the published-only filter
 * lives in `getPublicScopedPayload` and the tenant constraint in `buildTenantClient`, so a
 * draft and another organization's article both arrive here as an empty result — the same value
 * an unknown slug produces. There is no state to tell apart, so there is no way to leak the
 * difference, and `grep`ping this file for the review states finds nothing on purpose.
 *
 * `TenantUnresolvedError` is the one caught failure, and it is a 404 too. **Every other failure
 * is rethrown** — dressing an outage as a missing article tells the visitor a lie, tells a
 * crawler to drop the URL, and tells the team nothing.
 *
 * ── Downloads are linked, never re-implemented ──────────────────────────────────────────────
 *
 * `plan.md` § "API contracts": *"No new endpoints. Downloads already have one … Detail pages
 * link to it; they do not re-implement it."* The open-access rule (`artigos.md`: *"download
 * **aberto**, sem conta; downloads anônimos são contados"*, PO 2026-08-24) and the counted write
 * both live behind that route. This page contributes an anchor and nothing else — a page that
 * touched the counter would count every visit that downloaded nothing.
 */

/** One media document as `depth: 1` populates it. The article's cover carries `sizes`; the
 *  attachment collections carry none. */
type MidiaDoc = {
  readonly id?: string | number
  readonly url?: string | null
  readonly filename?: string | null
  readonly filesize?: number | null
}

/** The envelope a **polymorphic** relationship arrives in — `anexos` spans `midiaModelo3d` and
 *  `midiaDocumento`, so each entry names its collection beside the row. */
type AnexoRef = { readonly relationTo?: string; readonly value?: MidiaDoc | string | number }

/** The author profile as `depth: 1` populates it. */
type PerfilDoc = { readonly nome?: string; readonly handle?: string }

/**
 * One article as the public read returns it, populated one level.
 *
 * Structural rather than imported from `payload-types.ts`: that file is **gitignored**, so CI
 * type-checks without it (tasks.md § "Read before starting", item 6). A page that imported a
 * generated type would compile locally and fail the pipeline.
 */
type ArtigoDoc = {
  readonly id?: string | number
  readonly titulo?: string
  readonly slug?: string
  readonly resumo?: string
  readonly categoria?: { readonly nome?: string } | string | number | null
  readonly capa?: MidiaDoc | string | number | null
  readonly autor?: PerfilDoc | string | number | null
  readonly dataPublicacao?: string | null
  readonly corpo?: SerializedEditorState | null
  readonly anexos?: readonly (AnexoRef | string | number)[] | null
}

/** The listing this page came from, and the only way back for a visitor who arrived on a
 *  shared URL. Kept in step with `ARTIGOS_PATH` on the listing itself. */
const LISTAGEM = '/artigos'

/** Payload's REST mount (`routes.api` is left at its default), where the collection's own
 *  `downloadEndpoint` is served. */
const API = '/api'

/** Bytes per megabyte, for the size beside a filename. Binary, because that is what every
 *  file manager the visitor will compare against reports — and what `projetos/[slug]` prints,
 *  so two detail pages never disagree about the size of the same file. */
const MB = 1024 * 1024

/** `GET /api/artigo/:id/download/:midiaId` — the route `Artigo.ts` registers over `anexos`.
 *  Both ids come from the document just read, so a visitor can name neither. */
const downloadHref = (artigoId: ArtigoDoc['id'], midiaId: MidiaDoc['id']): string =>
  `${API}/artigo/${String(artigoId)}/download/${String(midiaId)}`

const asDoc = <T,>(value: T | string | number | null | undefined): T | null =>
  typeof value === 'object' && value !== null ? value : null

/**
 * The article this slug names, or `null` for every reason a visitor may not have it.
 *
 * One query, `limit: 1`, and no ordering: a slug is unique within an organization, and the two
 * constraints that make it so — the tenant and the published status — are the client's.
 * `depth: 1` populates the category, the author, the cover and the attachments in that same
 * query, which is what lets a detail page read media *through* a published document rather than
 * needing any media collection to be publicly listable (plan § Sketch 1).
 */
async function lerArtigo(slug: string): Promise<ArtigoDoc | null> {
  const db = await getPublicScopedPayloadForRSC()
  const { docs } = await db.find<ArtigoDoc>({
    collection: 'artigo',
    where: { slug: { equals: slug } },
    depth: 1,
    limit: 1,
  })
  return docs[0] ?? null
}

/** The author line: the person the article credits, or nothing when the profile did not
 *  arrive. Not a link — the public maker profile is a future spec (004/005), and an anchor to
 *  a route this feature does not create is a 404 the mockup did not ask for. */
function autoria(artigo: ArtigoDoc): ReactNode {
  const perfil = asDoc<PerfilDoc>(artigo.autor)
  if (!perfil?.nome) return null
  return (
    <span style={ESTILO.autor}>
      <span>{perfil.nome}</span>
      {perfil.handle === undefined ? null : <span>{formatHandle(perfil.handle)}</span>}
    </span>
  )
}

/** The publication date, or nothing. `dataPublicacao` is optional on the collection — a
 *  `rascunho` has none — and an empty `<time>` is an artefact, not a date. */
function data(artigo: ArtigoDoc): ReactNode {
  const texto = dataCurta(artigo.dataPublicacao)
  if (texto === '') return null
  // `dateTime` carries the instant a machine can read; the visible string is abbreviated.
  return (
    <time dateTime={artigo.dataPublicacao ?? undefined} style={ESTILO.data}>
      {texto}
    </time>
  )
}

/** The header band: the way back, the title, the category, the byline and the summary. */
function cabecalho(artigo: ArtigoDoc): ReactElement {
  const categoria = asDoc<{ nome?: string }>(artigo.categoria)?.nome ?? ''
  return (
    <section style={ESTILO.cabecalho}>
      <a href={LISTAGEM} style={ESTILO.voltar}>
        ← ARTIGOS
      </a>
      <h1 style={ESTILO.titulo}>{artigo.titulo ?? ''}</h1>
      {/* CLR-009: `PUBLICAÇÃO` is a category record, so it reaches the chip like any other —
          nothing here special-cases it, and nothing may. */}
      {categoria === '' ? null : <Chip variant="status">{categoria}</Chip>}
      <p style={ESTILO.meta}>
        {autoria(artigo)}
        {data(artigo)}
      </p>
      <p style={ESTILO.resumo}>{artigo.resumo ?? ''}</p>
    </section>
  )
}

/** The cover, or nothing when the relationship arrived unpopulated. Full size, eagerly: it is
 *  the largest image on the page and the likeliest LCP element (SC-006). */
function capa(artigo: ArtigoDoc): ReactNode {
  const imagem = asDoc<MidiaDoc>(artigo.capa)
  const src = imagem?.url ?? ''
  if (!src) return null
  return (
    <img
      src={src}
      // The collection stores no alt text and the title sits directly above: an alt built from
      // the title makes a screen reader read the same words twice.
      alt=""
      loading="eager"
      decoding="async"
      style={ESTILO.capa}
    />
  )
}

/**
 * The article body, through Payload's own Lexical → JSX converter.
 *
 * `corpo` is stored as a Lexical document, so the alternative to this converter is a renderer
 * of our own for a format we do not control. An article with no body renders nothing at all,
 * not an empty section (US10 edge).
 */
function corpo(artigo: ArtigoDoc): ReactNode {
  const conteudo = artigo.corpo
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
 * The attachments, each an anchor at the collection's download route (FR-030, FR-012).
 *
 * An entry that arrived as a bare id is **skipped**: the id alone names no file, so the link
 * would be one a visitor cannot judge before clicking, and there is nothing to recover from.
 * Two named files beside one nameless row is worse than two named files.
 */
function anexos(artigo: ArtigoDoc): ReactNode {
  const midias = (artigo.anexos ?? [])
    .map((anexo) => asDoc<AnexoRef>(anexo))
    .map((anexo) => asDoc<MidiaDoc>(anexo?.value))
    .filter((midia): midia is MidiaDoc => Boolean(midia?.filename))
  if (midias.length === 0) return null
  return (
    <section aria-label="Anexos" style={ESTILO.anexos}>
      <h2 style={ESTILO.secaoTitulo}>ANEXOS</h2>
      <ul style={ESTILO.lista}>
        {midias.map((midia) => (
          <li key={midia.id}>
            <a href={downloadHref(artigo.id, midia.id)} style={ESTILO.anexo}>
              {midia.filename} {tamanho(midia.filesize)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Next hands a dynamic segment to a page as a promise. */
type ArtigoDetalheProps = { readonly params: Promise<{ slug: string }> }

/**
 * `/artigos/{slug}` — one published article, in full.
 *
 * @example /artigos/praticas-colaborativas
 */
export default async function Page({ params }: ArtigoDetalheProps): Promise<ReactElement> {
  const { slug } = await params

  // `notFound()` throws, so it is called *outside* the catch: inside, it would be swallowed by
  // the very handler that is supposed to raise it.
  const artigo = await lerArtigo(slug).catch((erro: unknown) => {
    if (erro instanceof TenantUnresolvedError) return null
    throw erro
  })
  if (!artigo) notFound()

  return (
    <main style={ESTILO.pagina}>
      {cabecalho(artigo)}
      {capa(artigo)}
      {corpo(artigo)}
      {anexos(artigo)}
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
 */
const ESTILO: Record<string, CSSProperties> = {
  pagina: { display: 'flex', flexDirection: 'column' },
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
  // Caps in the cascade, never in the data: the string is a formatted date and the design draws
  // it upper case (`12 MAI 2024`).
  data: { fontFamily: 'var(--font-display)', textTransform: 'uppercase' },
  resumo: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    maxWidth: '60ch',
  },
  capa: { width: '100%', height: 'auto', display: 'block' },
  corpo: {
    padding: 'var(--space-8) var(--space-5)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    // Measured in characters so the line length holds at every breakpoint.
    maxWidth: '70ch',
  },
  anexos: { padding: '0 var(--space-5) var(--space-10)' },
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
  anexo: {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-primary)',
    minHeight: '44px',
    display: 'inline-flex',
    alignItems: 'center',
  },
}
