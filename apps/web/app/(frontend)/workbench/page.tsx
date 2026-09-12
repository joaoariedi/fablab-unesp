import { notFound } from 'next/navigation'
import type { CSSProperties, ReactElement, ReactNode } from 'react'

/**
 * SC-009 lives in this one import line.
 *
 * The workbench is the design system's first real consumer, and the criterion is that a page
 * can be built "using only @fablab/ui exports". The first draft reached in through
 * `../../../../../packages/ui/src/components/Button` — sixteen deep relative paths that
 * bypass the export map entirely, so it would have rendered perfectly while proving nothing:
 * five components were unreachable through the public surface at the time and the workbench
 * could not have noticed. Importing the way feature 003 will have to is what makes this page
 * evidence rather than a gallery.
 */
import {
  AvatarBuilder,
  type AvatarConfig,
  Button,
  CalendarDayPanel,
  Card,
  Chip,
  AvatarPreview,
  DIRECOES_AVATAR,
  Footer,
  HeaderNav,
  ISO_SHAPE_NAMES,
  IsoShape,
  LikeButton,
  LOGO_CHIP_COLOURS,
  LogoChip,
  CardProjeto,
  EmptyState,
  ListingGrid,
  MenuSheet,
  MobileTabBar,
  ModelViewer,
  Pagination,
  PALETTE,
  PixelImage,
  profileHref,
  ProgressBar,
  ProjectCarousel,
  SearchInput,
  SkillPips,
  Tabs,
} from '@fablab/ui'


/**
 * T037 / FR-016, US7 — the component workbench.
 *
 * Every component of `@fablab/ui`, in each of its states, at all three design targets. It is
 * how the designer and a reviewer see the library before feature 003 has built a single page,
 * and — because no test in this workspace renders anything (plan § CLR-003) — it is the only
 * place a visual defect can be caught at all.
 *
 * ── A route, not a private folder ───────────────────────────────────────────────────────────
 *
 * `_workbench/` was the first draft and it would never have rendered: Next 16.3.3's route
 * discovery filters every path part beginning with `_` (`ignorePartFilter` in
 * `dist/build/route-discovery.js`), in **every** environment — not just production. That is
 * why the guard below is an explicit `notFound()` on `NODE_ENV` instead: a real route, closed
 * in production (FR-016, revised in review round 2).
 *
 * ── Why the three targets are iframes rather than three fixed-width boxes ───────────────────
 *
 * Which tabs the header shows, whether the footer pillars run in a row, whether the bottom bar
 * exists — all three are `@media (min-width: …)` queries (see `HEADER_NAV_CSS`, `FOOTER_CSS`,
 * `MOBILE_TAB_BAR_CSS`). A media query answers to the **viewport**, never to the width of the
 * box a component is placed in, so rendering the shell inside three `width: 390px` divs would
 * show the reviewer's own desktop layout three times over and satisfy "at all three
 * breakpoints" in wording only. An `<iframe>` has a viewport of its own, so the workbench is an
 * index of three frames *of itself*: `?bp=` selects the specimen gallery, its absence the
 * index.
 *
 * ── Why the imports reach into `packages/ui/src` ────────────────────────────────────────────
 *
 * The public surface is assembled once, by T039: `@fablab/ui`'s root barrel is still the
 * placeholder `export {}`, the export map holds exactly four documented subpaths
 * (`tests/package-exports.test.ts` asserts *exactly*, so no `./shell` may be added here), and
 * the shell and shape barrels are not on it yet. `shapes/index.ts` names this file as one of
 * the two consumers importing it directly in the meantime. **T040 rewrites these imports to
 * the public exports** — that rewrite is what proves SC-009, and it is a task, not an
 * afterthought.
 */

/** The route this page is served at. The frames below load it, so it is written once. */
export const WORKBENCH_ROUTE = '/workbench'

/** The query parameter that selects a single frame's gallery over the frame index. */
export const WORKBENCH_FRAME_PARAM = 'bp'

/** One design target: a frame of the workbench, at the width the mockups were drawn for. */
export interface WorkbenchTarget {
  readonly name: string
  readonly width: number
}

/**
 * The three design targets, in `packages/ui/src/tokens/layout.css`'s order.
 *
 * These widths mirror `--bp-mobile` / `--bp-tablet` / `--bp-desktop`, and the stylesheet is the
 * source of truth: `tests/workbench.test.ts` parses it and holds this list to it, so a
 * breakpoint that moves cannot leave the workbench reviewing a width nothing switches at. The
 * copy is unavoidable — a custom property is a value in the cascade, and an `<iframe>` needs a
 * number in the markup.
 */
export const WORKBENCH_TARGETS: readonly WorkbenchTarget[] = [
  { name: 'mobile', width: 390 },
  { name: 'tablet', width: 834 },
  { name: 'desktop', width: 1440 },
]

/** Tall enough that the header, the content and the footer are all in one screenshot. */
const FRAME_HEIGHT = 900

/**
 * A 16×16 sprite, inline.
 *
 * `PixelImage` needs a real bitmap to show what integer scaling does, and this repo ships no
 * sprite yet — the art arrives with feature 003. A data URI keeps the workbench from depending
 * on an asset nobody has drawn, and keeps a broken image out of the one surface whose entire
 * job is to look right.
 */
const SPRITE_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAM0lEQVR4nGOQlDH/TwlmABF3nj8mCw9SA97NPYIXDyEDQOLY2EPICwNnwMCnRLIMoAQDAFzHBhD+O/umAAAAAElFTkSuQmCC'

const PAGE_STYLE: CSSProperties = {
  background: 'var(--color-navy)',
  color: 'var(--color-claro)',
  fontFamily: 'var(--font-body)',
  minHeight: '100vh',
  margin: 0,
  padding: 'var(--space-6)',
}

const HEADING_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  color: 'var(--color-primary)',
  margin: 0,
}

const SPECIMEN_STYLE: CSSProperties = {
  borderTop: '1px solid var(--color-teal)',
  paddingTop: 'var(--space-4)',
  marginTop: 'var(--space-6)',
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-4)',
  alignItems: 'flex-end',
  marginTop: 'var(--space-4)',
}

/**
 * A frame carries no relative width constraint, and that omission is the whole point.
 *
 * `max-width: 100%` was the first draft and it quietly undid the iframe: a clamped frame does
 * not merely *look* narrower — the clamped CSS width becomes the frame's own **viewport**, so
 * `HeaderNav`'s `@media (min-width: 1440px)` stops matching and the frame labelled "desktop"
 * shows the tablet header. Three frames side by side come to 2664px, which is wider than any
 * reviewer's window, so the clamp fired on every visit rather than in some edge case.
 */
const FRAME_STYLE: CSSProperties = {
  border: '1px solid var(--color-teal)',
  background: 'var(--color-navy)',
  display: 'block',
}

/** The frames overflow the window by design (see `FRAME_STYLE`), so the row scrolls: a scrollbar
 *  is the only way to fit 2664px into a laptop that does not lie about a viewport. `nowrap`
 *  because a wrapped row would put the 1440 frame on a line of its own and shrink it to fit —
 *  the clamp again, by another route. */
const FRAME_ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'nowrap',
  gap: 'var(--space-4)',
  alignItems: 'flex-start',
  marginTop: 'var(--space-4)',
  overflowX: 'auto',
}

/** Flex shrinks the `<figure>` but never the fixed-width `<iframe>` inside it, so a shrinkable
 *  wrapper makes the frames overlap each other instead of scrolling. */
const FRAME_FIGURE_STYLE: CSSProperties = { margin: 0, flexShrink: 0 }

/** One labelled group of specimens. The label is what a reviewer reports a defect against. */
function Specimen({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section style={SPECIMEN_STYLE}>
      <h2 style={{ ...HEADING_STYLE, fontSize: 'var(--text-base)' }}>{title}</h2>
      <div style={ROW_STYLE}>{children}</div>
    </section>
  )
}

/** Button and chip: the two components whose states are a different paint, not a different shape. */
function controlSpecimens(): ReactElement[] {
  return [
    <Specimen key="button" title="Button — enabled / disabled">
      <Button>ENVIAR PROJETO</Button>
      <Button disabled>ENVIAR PROJETO</Button>
    </Specimen>,
    <Specimen key="chip" title="Chip — filter (selected and not) / status">
      <Chip variant="filter" active>
        IMPRESSÃO 3D
      </Chip>
      <Chip variant="filter">CORTE A LASER</Chip>
      <Chip variant="status">EM ANDAMENTO</Chip>
    </Specimen>,
  ]
}

/** The identity pieces: every logo colour, and the category bar with and without a selection. */
function identitySpecimens(): ReactElement[] {
  return [
    <Specimen key="logo" title="LogoChip — every colour, and as a link Home">
      {LOGO_CHIP_COLOURS.map((colour) => (
        <LogoChip key={colour} colour={colour} />
      ))}
      <LogoChip href="/" />
    </Specimen>,
    <Specimen key="tabs" title="Tabs — with an active filter, and with none">
      <Tabs
        label="Categorias"
        items={CATEGORY_TABS}
        activeHref={CATEGORY_TABS[0]?.href ?? '/projetos'}
      />
      <Tabs label="Categorias (nenhuma ativa)" items={CATEGORY_TABS} />
    </Specimen>,
  ]
}

/** The category filter bar's specimen data — CMS content in the product, literals here. */
const CATEGORY_TABS = [
  { label: 'Todos', href: '/projetos' },
  { label: 'Impressão 3D', href: '/projetos?categoria=impressao-3d' },
  { label: 'Marcenaria', href: '/projetos?categoria=marcenaria' },
]

/** Cards in both outlines, and the sprite on its own so the scaling is visible without a card. */
function contentSpecimens(): ReactElement[] {
  const author = {
    avatar: <PixelImage src={SPRITE_SRC} baseWidth={16} targetWidth={32} alt="Avatar de ariedi" />,
    handle: 'ariedi',
    level: 7,
  }
  return [
    <Specimen key="card" title="Card — outline claro / primary">
      <Card title="Braço robótico" category="PROJETOS" author={author} likes={42}>
        Um braço de 5 eixos impresso em PLA.
      </Card>
      <Card title="Luminária paramétrica" category="PROJETOS" author={author} likes={7} outline="primary">
        Corte a laser em MDF de 3 mm.
      </Card>
    </Specimen>,
    <Specimen key="pixel" title="PixelImage — 16 px sprite at 1× and 4×">
      <PixelImage src={SPRITE_SRC} baseWidth={16} targetWidth={16} alt="Sprite a 1x" />
      <PixelImage src={SPRITE_SRC} baseWidth={16} targetWidth={64} alt="Sprite a 4x" />
    </Specimen>,
    <Specimen key="avatar" title="AvatarPreview — as quatro direções, em ordem de camadaZ">
      {/* The avatar sheets arrive with the catalogue's art, so the only bitmap this repo ships
          stands in for one: the 16x16 sprite is read as a sheet of four 4x16 frames, which is a
          real demonstration of the frame selection rather than four copies of one picture. The
          two layers are stacked out of order on purpose — `camadaZ` 20 is listed first. */}
      {DIRECOES_AVATAR.map((direcao) => (
        <AvatarPreview
          key={direcao}
          direcao={direcao}
          larguraBase={4}
          alturaBase={16}
          larguraAlvo={16}
          alt={`Avatar de ariedi, virado para ${direcao}`}
          camadas={[
            { slot: 'chapeu', camadaZ: 20, spriteFolhas: SPRITE_SRC },
            { slot: 'corpo', camadaZ: 10, spriteFolhas: SPRITE_SRC },
          ]}
        />
      ))}
    </Specimen>,
  ]
}

/** A light box, so the `light` specimens are looked at on the surface they were drawn for.
 *  The gallery's own background is `--surface-page` (navy), where navy ink is invisible — a
 *  specimen nobody can see reviews nothing, which is the failure the workbench exists to catch. */
const LIGHT_SURFACE_STYLE: CSSProperties = {
  background: 'var(--surface-light)',
  padding: 'var(--space-4)',
  width: '100%',
}

/**
 * The pagination bar (T010 / FR-029, CLR-003).
 *
 * Three specimens, because the three things a reviewer has to look at never appear in the same
 * bar. Only a long listing prints a `…` and both arrows. Only page 1 shows the bar with `‹`
 * **absent** — the ends omit the step rather than disabling it, so the row is one target
 * narrower there and that asymmetry is a design decision someone should see rather than read.
 * And the light surface changes the current page in kind, not in value: underlined pink ink on
 * navy becomes the mockup's *"chip rosa"* — a pink fill with navy ink — because pink small text
 * on white is the pair FR-028 forbids and `contrast.test.ts` will not certify.
 *
 * The hrefs are the real listing URLs rather than `#`: the control's whole contract is that a
 * page is a link, and a specimen wired to `#` would look identical while proving nothing.
 */
function paginationSpecimen(): ReactElement {
  const pageHref = (base: string) => (n: number) => `${base}?pagina=${n}`
  return (
    <Specimen key="pagination" title="Pagination — long listing / first page / on a white content area">
      <Pagination
        page={60}
        totalPages={124}
        hrefFor={pageHref('/biblioteca-3d')}
        label="Paginação — 124 páginas, no meio"
      />
      <Pagination
        page={1}
        totalPages={3}
        hrefFor={pageHref('/projetos')}
        label="Paginação — primeira página, sem ‹"
      />
      <div style={LIGHT_SURFACE_STYLE}>
        <Pagination
          page={60}
          totalPages={124}
          surface="light"
          hrefFor={pageHref('/artigos')}
          label="Paginação — sobre área clara"
        />
      </div>
    </Specimen>
  )
}

/** The meters and the field: components whose whole subject is a value at the ends of a range. */
function meterSpecimens(): ReactElement[] {
  return [
    <Specimen key="progress" title="ProgressBar — empty, part-way, full">
      <ProgressBar value={0} label="Missão iniciada" />
      <ProgressBar value={45} label="Missão em curso" />
      <ProgressBar value={5} max={5} label="Missão concluída" />
    </Specimen>,
    <Specimen key="pips" title="SkillPips — level 0, 5 and 10">
      <SkillPips level={0} label="Impressão 3D" />
      <SkillPips level={5} label="Corte a laser" />
      <SkillPips level={10} label="Marcenaria" />
    </Specimen>,
    <Specimen key="search" title="SearchInput — on navy, and on a white content area">
      <SearchInput label="Buscar projetos" placeholder="Buscar projetos..." />
      <SearchInput label="Buscar artigos" placeholder="Buscar artigos..." surface="light" />
    </Specimen>,
    <Specimen key="grid" title="ListingGrid + CardProjeto — 3/2/1 across the breakpoints">
      <ListingGrid label="Projetos">
        <CardProjeto
          titulo="Luminária paramétrica"
          descricao="Luminária decorativa impressa em 3D com design paramétrico e encaixes precisos."
          categoria="Impressão 3D"
          href="/projetos/luminaria-parametrica"
          capa={null}
          autor={{ nome: 'Maria Silva', handle: 'mariasilva', nivel: 7 }}
          curtidas={32}
        />
        <CardProjeto
          titulo="Cadeira encaixe"
          descricao="Cadeira produzida em MDF cortado a laser, com design minimalista e modular."
          categoria="Móveis"
          href="/projetos/cadeira-encaixe"
          capa={null}
          autor={{ nome: 'João Pereira', handle: 'joaopereira', nivel: 6 }}
          curtidas={28}
        />
      </ListingGrid>
    </Specimen>,
    <Specimen
      key="carousel"
      title="ProjectCarousel — the Home's ÚLTIMOS PROJETOS, one screenful per arrow"
    >
      <ProjectCarousel label="Últimos projetos">
        <CardProjeto
          titulo="Luminária paramétrica"
          descricao="Luminária decorativa impressa em 3D com design paramétrico e encaixes precisos."
          categoria="Impressão 3D"
          href="/projetos/luminaria-parametrica"
          capa={null}
          autor={{ nome: 'Maria Silva', handle: 'mariasilva', nivel: 7 }}
          curtidas={32}
        />
        <CardProjeto
          titulo="Cadeira encaixe"
          descricao="Cadeira produzida em MDF cortado a laser, com design minimalista e modular."
          categoria="Móveis"
          href="/projetos/cadeira-encaixe"
          capa={null}
          autor={{ nome: 'João Pereira', handle: 'joaopereira', nivel: 6 }}
          curtidas={28}
        />
        <CardProjeto
          titulo="Vaso serigrafado"
          descricao="Vaso de cerâmica com padrão geométrico aplicado em serigrafia manual."
          categoria="Serigrafia"
          href="/projetos/vaso-serigrafado"
          capa={null}
          autor={{ nome: 'Ana Souza', handle: 'anasouza', nivel: 4 }}
          curtidas={11}
        />
      </ProjectCarousel>
    </Specimen>,
    <Specimen key="empty" title="EmptyState — the two states a listing can end in">
      <EmptyState
        variant="vazio"
        titulo="Nenhum projeto encontrado."
        descricao="Tente outra categoria ou limpe a busca."
        acao={{ label: 'Limpar filtros', href: '/projetos' }}
      />
      <EmptyState
        variant="erro"
        titulo="Não foi possível carregar os projetos."
        acao={{ label: 'Tentar novamente', href: '/projetos' }}
      />
    </Specimen>,
  ]
}

/**
 * `MobileTabBar` pins itself with `position: fixed; bottom: 0` and an opaque navy fill. Two of
 * them in one gallery therefore resolve against the same viewport and land on IDENTICAL
 * pixels — same edges, same z-index, same five labels — so the later one in the DOM wins and
 * the other is invisible and unclickable beneath it. The workbench would show one bar while
 * claiming to show two states, which is worse than showing one: it reads as coverage.
 *
 * `contain: layout paint` makes each wrapper a containing block for fixed descendants, so
 * every bar pins inside its own labelled box. `position: relative` alone does NOT do this —
 * a fixed element ignores it.
 *
 * The destination is printed beside each bar because the two states differ ONLY by an href.
 * Nothing rendered distinguishes them — PERFIL is the label in both — so a reviewer looking
 * at two identical bars cannot tell which is which without opening devtools, and FR-009's
 * branch stays unreviewable however correctly it is wired.
 */
function tabBarSpecimen(isSignedIn: boolean): ReactElement {
  const state = isSignedIn ? 'logado' : 'deslogado'
  return (
    <Specimen key={`tabbar-${state}`} title={`MobileTabBar — PERFIL ${state} → ${profileHref(isSignedIn)}`}>
      <div style={{ width: '100%', height: '4.5rem', contain: 'layout paint' }}>
        <MobileTabBar isSignedIn={isSignedIn} />
      </div>
    </Specimen>
  )
}

/**
 * The islands: the two feature 003 added (T021, T023), and the heart feature 004 opens with.
 *
 * Both are `'use client'`, and a workbench frame is a server render — so what a reviewer sees
 * here is each island's **server-rendered first paint**, which is the state that matters most
 * and the one that is otherwise never looked at: it is what a crawler indexes, what a visitor
 * on a slow connection reads first, and what remains for good if the bundle never arrives.
 *
 * `ModelViewer` is shown on both branches of FR-014 because they are different components in
 * practice: with a `src` it renders `<model-viewer>` (inert until the chunk loads), and with
 * none it renders the poster as a plain image. CLR-002 puts it on detail pages only, so the
 * gallery is where the two branches sit side by side at all.
 *
 * `LikeButton` gets the same treatment for the same reason, and one more: `isSignedIn`
 * DEFAULTS to the visitor, so a gallery with one specimen would review the branch a page
 * renders when it forgets to pass anything and never look at the other. The two are not one
 * control in two tints — signed out, a press opens the account invitation and the number
 * stays put (FR-025); signed in, the press is a like and the number follows the server
 * (FR-026). The signed-in pair also differs by `curtido`, which is the pressed state and the
 * verb in the label, so both sit here rather than one arbitrary half.
 *
 * No `onCurtir` on any specimen, deliberately: the workbench page is a server component, and
 * a plain function handed across that boundary is not serialisable — Next refuses it at
 * render rather than at review. What the gallery is for is the first paint, which is exactly
 * what the props below produce.
 */
function islandSpecimens(): ReactElement[] {
  return [
    <Specimen key="viewer" title="ModelViewer — a model to load, and the thumbnail fallback">
      <div style={{ width: '100%', maxWidth: '320px' }}>
        <ModelViewer
          src="/modelos/luminaria.glb"
          poster="/modelos/luminaria-poster.png"
          alt="Pré-visualização 3D da luminária paramétrica"
        />
      </div>
      <div style={{ width: '100%', maxWidth: '320px' }}>
        <ModelViewer
          src={null}
          poster="/modelos/cadeira-poster.png"
          alt="Miniatura da cadeira de encaixe"
        />
      </div>
    </Specimen>,
    <Specimen key="like" title="LikeButton — o convite do visitante, e a curtida de quem entrou">
      <LikeButton curtidas={32} />
      <LikeButton curtidas={32} isSignedIn={true} />
      <LikeButton curtidas={33} curtido={true} isSignedIn={true} />
      {/* The light surface, on a white patch — because that is the only place its defect is
          visible. The accent ink the three above wear measures about 1.8:1 on #FFFFFF, and a
          light specimen reviewed on this navy gallery would look correct precisely when it is
          not. `/aulas` and `/biblioteca-3d` are the two pages that pass `surface="light"`. */}
      <span style={{ background: 'var(--surface-inverted)', padding: 'var(--space-2)' }}>
        <LikeButton curtidas={32} surface="light" />
      </span>
    </Specimen>,
    <Specimen key="daypanel" title="CalendarDayPanel — the drawer a ?dia= link opens">
      <CalendarDayPanel titulo="SÁBADO, 22 DE AGOSTO" fecharHref="/calendario?mes=2026-08">
        <Card
          title="OFICINA DE IMPRESSÃO 3D"
          category="OFICINA"
          author={{ handle: 'fablabcite', level: 1 }}
          likes={4}
          outline="primary"
        >
          14h00 — Sala Maker
        </Card>
      </CalendarDayPanel>
    </Specimen>,
  ]
}

/**
 * T025 / FR-003, FR-032, SC-012 — the builder, in the two states it opens in.
 *
 * Its own function rather than a fourth entry in {@link islandSpecimens}: the catalogue is five
 * literals wide and inlining it would take that function past the length limit, which is the
 * same reason `paginationSpecimen` stands alone.
 *
 * **Two specimens, because `inicial` is two screens.** Signup step 1 mounts the builder with
 * nothing chosen — the base selector is the only control showing a selection and every
 * thumbnail is unmarked — and FR-023's editor mounts the same island on an avatar that already
 * exists, where a swatch and one thumbnail per slot wear the `--escolhida` outline. A gallery
 * with one of them reviews whichever the author happened to write.
 *
 * The catalogue is three slots rather than the product's nine, and that is deliberate: the
 * workbench reviews the *paint* — the picker grid, the 44px targets, the selected outline, the
 * rotation control — and ninety-three thumbnails of the same 16px sprite would review it no
 * better while making the 390px frame unreadable. The real nine come from the collection, and
 * `/criar-conta` is where that breadth is looked at.
 *
 * No `onChange`, for the reason `islandSpecimens` records for `onCurtir`: this page is a server
 * component and a function is not serialisable across that boundary. The first paint is what the
 * gallery is for.
 */
const BUILDER_SLOTS = [
  { slot: 'cabelo', titulo: 'CABELO' },
  { slot: 'roupaCima', titulo: 'PARTE DE CIMA' },
  { slot: 'chapeu', titulo: 'CHAPÉU' },
]

const BUILDER_ITENS = [
  { id: 'cabelo-curto', nome: 'Curto', slot: 'cabelo', camadaZ: 30, sprite: SPRITE_SRC },
  { id: 'cabelo-longo', nome: 'Longo', slot: 'cabelo', camadaZ: 30, sprite: SPRITE_SRC },
  { id: 'camiseta-f', nome: 'Camiseta', slot: 'roupaCima', camadaZ: 20, sprite: SPRITE_SRC, base: 'f' as const },
  { id: 'camiseta-m', nome: 'Camiseta', slot: 'roupaCima', camadaZ: 20, sprite: SPRITE_SRC, base: 'm' as const },
  // No `sprite` at all — FR-007's degraded slot, which the gallery is the only place to see.
  { id: 'bone', nome: 'Boné', slot: 'chapeu', camadaZ: 40 },
]

/**
 * The two palettes, painted from {@link PALETTE} rather than from skin-and-hair values.
 *
 * CLR-005 makes a real tom de pele **data** — a row in `tomDePele`, exempt from the colour fence
 * because `apps/web/seed/**` is — and this page is not the seed: a hex literal written here is
 * the literal-in-a-component the fence exists to stop, and widening it for a gallery would buy
 * two swatches at the price of every page in the app. What the workbench reviews about a
 * palette is the swatch grid — its targets, its focus ring, the outline on the selected one —
 * and that is answered by any two distinguishable colours. The thirty real ones are seeded, and
 * `/criar-conta` is where they are looked at.
 */
const BUILDER_PELES = [
  { id: 'pele-01', nome: 'Tom claro', hex: PALETTE.claro },
  { id: 'pele-02', nome: 'Tom escuro', hex: PALETTE.laranja },
]

const BUILDER_CABELOS = [
  { id: 'cabelo-preto', nome: 'Preto', hex: PALETTE.navy },
  { id: 'cabelo-amarelo', nome: 'Amarelo', hex: PALETTE.amarelo },
]

/** What FR-023 reopens the editor on: a base, both palettes and a chosen piece per slot. */
const BUILDER_CONFIG_CARREGADA: AvatarConfig = {
  base: 'm',
  pele: 'pele-02',
  // `cabelo-amarelo`, and it must resolve against BUILDER_CABELOS above. It read
  // `cabelo-rosa` — an id no swatch carries — so the hair palette in the one specimen that
  // exists to show the selected state rendered with NO outline on any swatch, which is
  // exactly what a reviewer opens this gallery to check. The one deliberately degraded entry
  // here (`bone`, no sprite) carries an FR-007 comment; this carried none, so it was an
  // oversight rather than a case.
  cabeloTom: 'cabelo-amarelo',
  itens: { cabelo: 'cabelo-longo', roupaCima: 'camiseta-m', chapeu: 'bone' },
  direcao: 'esquerda',
}

function avatarBuilderSpecimen(): ReactElement {
  return (
    <Specimen key="builder" title="AvatarBuilder — o passo 1 vazio, e o editor já preenchido">
      <AvatarBuilder
        slots={BUILDER_SLOTS}
        itens={BUILDER_ITENS}
        peles={BUILDER_PELES}
        cabelos={BUILDER_CABELOS}
        larguraBase={4}
        alturaBase={16}
        larguraAlvo={64}
        alt="Avatar em construção, nada escolhido ainda"
      />
      <AvatarBuilder
        slots={BUILDER_SLOTS}
        itens={BUILDER_ITENS}
        peles={BUILDER_PELES}
        cabelos={BUILDER_CABELOS}
        larguraBase={4}
        alturaBase={16}
        larguraAlvo={64}
        alt="Avatar de ariedi, aberto para edição"
        inicial={BUILDER_CONFIG_CARREGADA}
      />
    </Specimen>
  )
}

/** The shell. These are the specimens the three frame widths exist for. */
function shellSpecimens(): ReactElement[] {
  return [
    <Specimen key="header" title="HeaderNav — six tabs wide, four plus the menu compact">
      <div style={{ width: '100%' }}>
        <HeaderNav menu={<MenuSheet />} />
      </div>
    </Specimen>,
    // Both session states, because `isSignedIn` is not cosmetic: PERFIL resolves through
    // `profileHref`, so the fifth position points at /login for a visitor and at Minha Conta
    // for a signed-in maker. This bar is the only surface in the product where that branch
    // renders (MobileTabBar § PERFIL), so the state the workbench omits is a destination
    // nobody ever reviews.
    tabBarSpecimen(false),
    tabBarSpecimen(true),
    <Specimen key="footer" title="Footer — three pillars and the isometric composition">
      <div style={{ width: '100%' }}>
        <Footer />
      </div>
    </Specimen>,
  ]
}

/** Every member of the FR-015 vocabulary, at a size a reviewer can judge the geometry at. */
function shapeSpecimens(): ReactElement[] {
  return [
    <Specimen key="shapes" title="IsoShape — the whole vocabulary">
      {ISO_SHAPE_NAMES.map((name) => (
        <IsoShape key={name} name={name} size="var(--space-9)" title={name} />
      ))}
    </Specimen>,
  ]
}

/**
 * The gallery one frame shows: every component, every state, laid out by the cascade.
 *
 * A **builder called directly**, not a `<SpecimenGallery />` child component, and the
 * difference is not stylistic: React does not invoke a child component when its parent
 * returns, so a page that returned `<SpecimenGallery />` would hand `tests/workbench.test.ts`
 * a tree of exactly one element and every "is this component in the workbench?" assertion
 * would pass or fail on nothing. Building the tree here is what makes the gallery inspectable
 * without a DOM (plan § CLR-003).
 */
function specimenGallery(width: string): ReactElement {
  return (
    <main style={PAGE_STYLE}>
      <h1 style={{ ...HEADING_STYLE, fontSize: 'var(--text-xl)' }}>
        @fablab/ui — {width}px
      </h1>
      {controlSpecimens()}
      {identitySpecimens()}
      {contentSpecimens()}
      {meterSpecimens()}
      {paginationSpecimen()}
      {islandSpecimens()}
      {avatarBuilderSpecimen()}
      {shellSpecimens()}
      {shapeSpecimens()}
    </main>
  )
}

/** The index: the same gallery three times, each in a viewport of the width it is named for.
 *  A builder, for the reason `specimenGallery` gives above. */
function frameIndex(): ReactElement {
  return (
    <main style={PAGE_STYLE}>
      <h1 style={{ ...HEADING_STYLE, fontSize: 'var(--text-xl)' }}>Workbench @fablab/ui</h1>
      <div style={FRAME_ROW_STYLE}>
        {WORKBENCH_TARGETS.map((target) => (
          <figure key={target.name} style={FRAME_FIGURE_STYLE}>
            <figcaption style={{ ...HEADING_STYLE, fontSize: 'var(--text-sm)' }}>
              {target.name} — {target.width}px
            </figcaption>
            <iframe
              title={`${target.name} (${target.width}px)`}
              src={`${WORKBENCH_ROUTE}?${WORKBENCH_FRAME_PARAM}=${target.width}`}
              width={target.width}
              height={FRAME_HEIGHT}
              style={FRAME_STYLE}
            />
          </figure>
        ))}
      </div>
    </main>
  )
}

interface WorkbenchPageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The workbench: the frame index, or one frame's gallery when `?bp=` names a width.
 *
 * The production guard is first and unconditional. A guarded route still *ships* its module —
 * App Router has no build-time page exclusion — so FR-016 promises unreachable, not absent
 * (plan Sketch 9); `tests/workbench.test.ts` (T038) is what holds the guard to that.
 */
export default async function WorkbenchPage({
  searchParams,
}: WorkbenchPageProps = {}): Promise<ReactElement> {
  if (process.env.NODE_ENV === 'production') notFound()

  const frame = (await searchParams)?.[WORKBENCH_FRAME_PARAM]
  return typeof frame === 'string' ? specimenGallery(frame) : frameIndex()
}
