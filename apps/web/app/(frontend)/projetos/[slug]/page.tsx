import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { notFound } from 'next/navigation'

import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

import { Chip } from '@fablab/ui'

import { TenantUnresolvedError } from '../../../../lib/tenancy/errors'
// Deep import, exactly as `layout.tsx` and the listing do it and for the same reason: the
// anonymous read path is not re-exported from `lib/tenancy`'s index, because it runs with
// `overrideAccess: true` and that unexported-ness is one of the two locks the module keeps.
import { getPublicScopedPayloadForRSC } from '../../../../lib/tenancy/public-payload'

/**
 * T013 / FR-030, US10 — the `projeto` detail page, and the destination the card's arrow has
 * been pointing at since T012.
 *
 * `spec.md` FR-030: *"`projeto`, `modelo3d` and `artigo` each have a detail page rendering the
 * long text, gallery and attachments feature 002 stores (CLR-001)"*. Those three fields —
 * `descricaoCompleta`, `galeria` and `arquivos` — are stored by `Projeto.ts` and rendered by
 * nothing else in the product; this page is the only surface any of them has.
 *
 * ── The 404 is a consequence, not a branch ──────────────────────────────────────────────────
 *
 * US10's error case: *"an unpublished or foreign slug is a 404, the same answer as an unknown
 * one … it must not distinguish 'exists but is a draft' from 'does not exist'"*. Nothing below
 * implements that rule, and that is the design (plan § Sketch 3): the published-only filter
 * lives in `getPublicScopedPayload` and the tenant constraint in `buildTenantClient`, so a
 * draft and another organization's project both arrive here as an empty result — the same
 * value an unknown slug produces. There is no state to tell apart, so there is no way to leak
 * the difference, and `grep`ping this file for `status` finds nothing on purpose.
 *
 * `TenantUnresolvedError` is the one caught failure, and it is a 404 too: a host no
 * organization claims is *"no such site"*, the answer `layout.tsx` and the listing already
 * give. **Every other failure is rethrown** — dressing an outage as a missing project tells the
 * visitor a lie, tells a crawler to drop the URL, and tells the team nothing.
 *
 * ── Downloads are linked, never re-implemented ──────────────────────────────────────────────
 *
 * `plan.md` § "API contracts": *"No new endpoints. Downloads already have one …  Detail pages
 * link to it; they do not re-implement it."* `Projeto.ts` registers
 * `downloadEndpoint('projeto', 'arquivos')`, so every attachment is a plain anchor at
 * {@link downloadHref}. The open-access rule (FR-012, PO 2026-08-24) and the counted write both
 * live behind that route; this page contributes nothing to either and must not try to.
 */

/** One media document as `depth: 1` populates it. `sizes.card` is the derivative `midiaImagem`
 *  generates; the other media collections carry no `sizes` at all. */
type MidiaDoc = {
  readonly id?: string | number
  readonly url?: string | null
  readonly filename?: string | null
  readonly filesize?: number | null
  readonly sizes?: { readonly card?: { readonly url?: string | null } }
}

/** The envelope a **polymorphic** relationship arrives in — `arquivos` spans `midiaModelo3d`
 *  and `midiaDocumento`, so each entry names its collection beside the row. */
type ArquivoRef = { readonly relationTo?: string; readonly value?: MidiaDoc | string | number }

/**
 * One project as the public read returns it, populated one level.
 *
 * Structural rather than imported from `payload-types.ts`: that file is **gitignored**, so CI
 * type-checks without it (tasks.md § "Read before starting", item 6). A page that imported a
 * generated type would compile locally and fail the pipeline.
 */
type ProjetoDoc = {
  readonly id?: string | number
  readonly titulo?: string
  readonly slug?: string
  readonly descricaoCurta?: string
  readonly categoria?: { readonly nome?: string } | string | number | null
  readonly imagemCapa?: MidiaDoc | string | number | null
  readonly descricaoCompleta?: SerializedEditorState | null
  readonly galeria?: readonly (MidiaDoc | string | number)[] | null
  readonly arquivos?: readonly (ArquivoRef | string | number)[] | null
}

/** The listing this page came from, and the only way back for a visitor who arrived on a
 *  shared URL. Kept in step with `PROJETOS_PATH` on the listing itself. */
const LISTAGEM = '/projetos'

/** Payload's REST mount (`routes.api` is left at its default), where the collection's own
 *  `downloadEndpoint` is served. */
const API = '/api'

/** Bytes per megabyte, for the size beside a filename. Binary, because that is what every
 *  file manager the visitor will compare against reports. */
const MB = 1024 * 1024

/** `GET /api/projeto/:id/download/:midiaId` — the route `Projeto.ts` registers. Both ids come
 *  from the document just read, so a visitor can name neither. */
const downloadHref = (projetoId: ProjetoDoc['id'], midiaId: MidiaDoc['id']): string =>
  `${API}/projeto/${String(projetoId)}/download/${String(midiaId)}`

const asDoc = <T,>(value: T | string | number | null | undefined): T | null =>
  typeof value === 'object' && value !== null ? value : null

/**
 * The project this slug names, or `null` for every reason a visitor may not have it.
 *
 * One query, `limit: 1`, and no ordering: a slug is unique within an organization, and the two
 * constraints that make it so — the tenant and the published status — are the client's.
 * `depth: 1` populates the category, the cover, the gallery and the attachments in that same
 * query, which is what lets a detail page read media *through* a published document rather
 * than needing any media collection to be publicly listable (plan § Sketch 1).
 */
async function lerProjeto(slug: string): Promise<ProjetoDoc | null> {
  const db = await getPublicScopedPayloadForRSC()
  const { docs } = await db.find<ProjetoDoc>({
    collection: 'projeto',
    where: { slug: { equals: slug } },
    depth: 1,
    limit: 1,
  })
  return docs[0] ?? null
}

/** The cover, or nothing when the relationship arrived unpopulated. Full size, eagerly: it is
 *  the largest image on the page and the likeliest LCP element (SC-006). */
function capa(projeto: ProjetoDoc): ReactNode {
  const imagem = asDoc<MidiaDoc>(projeto.imagemCapa)
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

/** The header band: the way back, the title, the category and the short description. */
function cabecalho(projeto: ProjetoDoc): ReactElement {
  const categoria = asDoc<{ nome?: string }>(projeto.categoria)?.nome ?? ''
  return (
    <section style={ESTILO.cabecalho}>
      <a href={LISTAGEM} style={ESTILO.voltar}>
        ← PROJETOS
      </a>
      <h1 style={ESTILO.titulo}>{projeto.titulo ?? ''}</h1>
      {categoria === '' ? null : <Chip variant="status">{categoria}</Chip>}
      <p style={ESTILO.resumo}>{projeto.descricaoCurta ?? ''}</p>
    </section>
  )
}

/**
 * The long text, through Payload's own Lexical → JSX converter.
 *
 * `descricaoCompleta` is stored as a Lexical document, so the alternative to this converter is
 * a renderer of our own for a format we do not control — the exact "add an editor, a renderer
 * and a sanitiser" cost `spec.md` § Decisions weighed when it chose the framework's default.
 * A project with no body renders nothing at all, not an empty section (US10 edge).
 */
function corpo(projeto: ProjetoDoc): ReactNode {
  const data = projeto.descricaoCompleta
  if (!data) return null
  return (
    <section style={ESTILO.corpo}>
      <RichText data={data} />
    </section>
  )
}

/** The gallery strip, or nothing when the project has no extra images (US10 edge). */
function galeria(projeto: ProjetoDoc): ReactNode {
  const imagens = (projeto.galeria ?? [])
    .map((imagem) => asDoc<MidiaDoc>(imagem))
    .filter((imagem): imagem is MidiaDoc => imagem !== null)
  if (imagens.length === 0) return null
  return (
    <section aria-label="Galeria" style={ESTILO.galeria}>
      <h2 style={ESTILO.secaoTitulo}>GALERIA</h2>
      <div style={ESTILO.tiras}>
        {imagens.map((imagem, posicao) => (
          <img
            key={imagem.id ?? posicao}
            // The `card` derivative, falling back to the original when none was generated —
            // serving full-size originals in a thumbnail strip is bytes spent against the
            // budget SC-006 measures.
            src={imagem.sizes?.card?.url ?? imagem.url ?? ''}
            alt=""
            // Below the body copy by construction, so never the LCP element.
            loading="lazy"
            decoding="async"
            style={ESTILO.miniatura}
          />
        ))}
      </div>
    </section>
  )
}

/** `2,4 MB`, or nothing when the media document carries no size. */
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
function arquivos(projeto: ProjetoDoc): ReactNode {
  const midias = (projeto.arquivos ?? [])
    .map((arquivo) => asDoc<ArquivoRef>(arquivo))
    .map((arquivo) => asDoc<MidiaDoc>(arquivo?.value))
    .filter((midia): midia is MidiaDoc => Boolean(midia?.filename))
  if (midias.length === 0) return null
  return (
    <section aria-label="Arquivos" style={ESTILO.arquivos}>
      <h2 style={ESTILO.secaoTitulo}>ARQUIVOS</h2>
      <ul style={ESTILO.lista}>
        {midias.map((midia) => (
          <li key={midia.id}>
            <a href={downloadHref(projeto.id, midia.id)} style={ESTILO.arquivo}>
              {midia.filename} {tamanho(midia.filesize)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Next hands a dynamic segment to a page as a promise. */
type ProjetoDetalheProps = { readonly params: Promise<{ slug: string }> }

/**
 * `/projetos/{slug}` — one published project, in full.
 *
 * @example /projetos/luminaria-parametrica
 */
export default async function Page({ params }: ProjetoDetalheProps): Promise<ReactElement> {
  const { slug } = await params

  // `notFound()` throws, so it is called *outside* the catch: inside, it would be swallowed by
  // the very handler that is supposed to raise it.
  const projeto = await lerProjeto(slug).catch((erro: unknown) => {
    if (erro instanceof TenantUnresolvedError) return null
    throw erro
  })
  if (!projeto) notFound()

  return (
    <main style={ESTILO.pagina}>
      {cabecalho(projeto)}
      {capa(projeto)}
      {corpo(projeto)}
      {galeria(projeto)}
      {arquivos(projeto)}
    </main>
  )
}

/**
 * Every style this page declares, in one object.
 *
 * Style objects rather than a stylesheet, for the reason the listing and every component
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
  resumo: { margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', maxWidth: '60ch' },
  capa: { width: '100%', height: 'auto', display: 'block' },
  corpo: {
    padding: 'var(--space-8) var(--space-5)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    // Measured in characters so the line length holds at every breakpoint.
    maxWidth: '70ch',
  },
  galeria: { padding: '0 var(--space-5) var(--space-8)' },
  arquivos: { padding: '0 var(--space-5) var(--space-10)' },
  secaoTitulo: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xl)',
    marginTop: 0,
    marginBottom: 'var(--space-4)',
  },
  tiras: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' },
  miniatura: { width: 'var(--space-12)', height: 'auto', borderRadius: 'var(--radius-sm)' },
  lista: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  arquivo: {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-primary)',
    minHeight: '44px',
    display: 'inline-flex',
    alignItems: 'center',
  },
}
