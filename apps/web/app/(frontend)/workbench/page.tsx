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
  Button,
  Card,
  Chip,
  Footer,
  HeaderNav,
  ISO_SHAPE_NAMES,
  IsoShape,
  LOGO_CHIP_COLOURS,
  LogoChip,
  MenuSheet,
  MobileTabBar,
  PixelImage,
  profileHref,
  ProgressBar,
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
  ]
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
