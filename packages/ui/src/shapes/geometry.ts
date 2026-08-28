/**
 * T035 / FR-015 — the isometric shape vocabulary, as geometry.
 *
 * FR-015 names nine reusable assets: *"cube filled/wireframe, slab, tetrahedra, circles,
 * 4-point sparkles, extruded F, double chevrons, grid lines"*. They are data here and a thin
 * `<svg>` writer in `IsoShape.tsx`, rather than nine hand-drawn SVG files, for three reasons
 * this package can actually enforce:
 *
 * 1. **Nothing here can carry a colour.** An `.svg` asset would ship `fill="#..."` inside a
 *    binary-ish blob the colour fence never reads (`scripts/check-colour-tokens.sh` scans
 *    `.css`, the ESLint half scans `.ts`/`.tsx`). Faces are `currentColor` at different
 *    `shade`, so a shape inherits whatever token the call site sets and FR-002 holds by
 *    construction — see the `shade` doc below.
 * 2. **The projection is asserted, not eyeballed.** Every solid below is built by
 *    `projectIso`, so "isometric" is one function with a test rather than nine sets of
 *    literals that can each drift a degree off and still look plausible alone.
 * 3. **Vitest can read it.** CLR-003 locks the stack to Vitest with no DOM and no JSX
 *    transform, so a test can never render a component or parse an `.svg`. Geometry as a
 *    plain `.ts` module is the only form of this asset the suite can hold to anything — the
 *    same extraction, and the same reason, as `shell/tabs.ts` (T027b) and `clampScale()`.
 *
 * ── The shared viewBox ──────────────────────────────────────────────────────────────────────
 *
 * Every shape is drawn in one `0 0 32 32` box so the vocabulary composes on a common grid (the
 * footer composition, FR-010, stacks several at once) and so a call site sizes a shape with a
 * single CSS length. SVG does not clip to its viewBox and issues no warning when a coordinate
 * falls outside it, so containment is a test (`tests/shapes.test.ts`), not a convention.
 */

/** The width and height of the shared square viewBox: `0 0 32 32`. */
export const ISO_VIEWBOX = 32

/**
 * Half the width of one projected ground cell. The 2:1 relationship between the horizontal and
 * vertical step is what makes the projection isometric in the pixel-art sense the mockups use;
 * `6` is the largest value that keeps a unit cube (24 wide, 24 tall) inside the 32-unit box
 * with a margin on every side.
 */
const CELL = 6

/** The projected position of the model origin — the centre of the box. */
const ORIGIN = ISO_VIEWBOX / 2

/** A point in the flat viewBox, `[x, y]`, y growing downwards as SVG does. */
export type IsoPoint = readonly [number, number]

/**
 * Project a point of the unit-cube model space onto the viewBox.
 *
 * `x` runs right-and-down, `y` runs left-and-down — the two ground axes — and `z` is height,
 * which is drawn straight up. A one-unit step along either ground axis moves twice as far
 * horizontally as vertically; that ratio is the projection.
 *
 * @example projectIso(0, 0, 1) // [16, 4] — one unit above the origin
 */
export function projectIso(x: number, y: number, z: number): IsoPoint {
  return [ORIGIN + (x - y) * 2 * CELL, ORIGIN + (x + y) * CELL - z * 2 * CELL]
}

/** The name of a shape in the vocabulary. Narrow on purpose: a typo is a compile error. */
export type IsoShapeName =
  | 'cubeFilled'
  | 'cubeWireframe'
  | 'slab'
  | 'tetrahedron'
  | 'circle'
  | 'sparkle'
  | 'extrudedF'
  | 'doubleChevron'
  | 'gridLines'

/** How a primitive is painted. Both resolve to `currentColor`; only the SVG attribute differs. */
export type IsoPaint = 'fill' | 'stroke'

interface IsoPaintable {
  readonly paint: IsoPaint
  /**
   * The alpha applied to `currentColor`, in `(0, 1]`.
   *
   * This is the whole lighting model, and it exists so that a lit solid needs **no colour**: a
   * cube's three faces are one inherited colour at three opacities. Three colour values would
   * be three identity decisions living outside `tokens/`, which is exactly what FR-002 forbids
   * and what the colour fence catches — a shape that could not be caught is worse than one
   * that is, so the vocabulary is built where the question cannot arise.
   */
  readonly shade: number
}

/** A closed outline (`polygon`) or an open one (`polyline`). */
export interface IsoPath extends IsoPaintable {
  readonly kind: 'polygon' | 'polyline'
  readonly points: readonly IsoPoint[]
}

/** A true circle — not a many-sided polygon, which would betray itself at large sizes. */
export interface IsoCircle extends IsoPaintable {
  readonly kind: 'circle'
  readonly center: IsoPoint
  readonly radius: number
}

/** One drawable part of a shape. Shapes are ordered back-to-front: SVG paints in document order. */
export type IsoPrimitive = IsoPath | IsoCircle

/** Lighting, brightest first: a lit top, then the two sides that catch progressively less. */
const SHADE_TOP = 1
const SHADE_RIGHT = 0.72
const SHADE_LEFT = 0.45

function face(points: readonly IsoPoint[], shade: number): IsoPath {
  return { kind: 'polygon', points, paint: 'fill', shade }
}

function outline(points: readonly IsoPoint[], shade = 1): IsoPath {
  return { kind: 'polygon', points, paint: 'stroke', shade }
}

function stroke(points: readonly IsoPoint[], shade = 1): IsoPath {
  return { kind: 'polyline', points, paint: 'stroke', shade }
}

/** A cube corner, by its unit coordinates. Named so the faces below read as the solid they are. */
const corner = projectIso

/** The unit cube's six silhouette corners, clockwise from the top vertex. */
const CUBE_SILHOUETTE: readonly IsoPoint[] = [
  corner(0, 0, 1),
  corner(1, 0, 1),
  corner(1, 0, 0),
  corner(1, 1, 0),
  corner(0, 1, 0),
  corner(0, 1, 1),
]

/** The near vertical edge's top end — where the three visible faces meet. */
const CUBE_CENTRE = corner(1, 1, 1)

const CUBE_FILLED: readonly IsoPrimitive[] = [
  face([corner(0, 0, 1), corner(1, 0, 1), CUBE_CENTRE, corner(0, 1, 1)], SHADE_TOP),
  face([corner(1, 0, 1), corner(1, 0, 0), corner(1, 1, 0), CUBE_CENTRE], SHADE_RIGHT),
  face([corner(0, 1, 1), CUBE_CENTRE, corner(1, 1, 0), corner(0, 1, 0)], SHADE_LEFT),
]

/**
 * The same solid as lines. The three spokes from the centre vertex are what make it read as a
 * cube rather than a hexagon — without them the silhouette is ambiguous at any size.
 */
const CUBE_WIREFRAME: readonly IsoPrimitive[] = [
  outline(CUBE_SILHOUETTE),
  stroke([CUBE_CENTRE, corner(0, 0, 1)]),
  stroke([CUBE_CENTRE, corner(1, 0, 1)]),
  stroke([CUBE_CENTRE, corner(0, 1, 1)]),
]

/** The slab is the cube's footprint at a quarter of its height — a platform, not a block. */
const SLAB_HEIGHT = 0.5
const slabCorner = (x: number, y: number, raised: boolean): IsoPoint =>
  projectIso(x, y, raised ? SLAB_HEIGHT : 0)

const SLAB: readonly IsoPrimitive[] = [
  face(
    [slabCorner(0, 0, true), slabCorner(1, 0, true), slabCorner(1, 1, true), slabCorner(0, 1, true)],
    SHADE_TOP,
  ),
  face(
    [slabCorner(1, 0, true), slabCorner(1, 0, false), slabCorner(1, 1, false), slabCorner(1, 1, true)],
    SHADE_RIGHT,
  ),
  face(
    [slabCorner(0, 1, true), slabCorner(1, 1, true), slabCorner(1, 1, false), slabCorner(0, 1, false)],
    SHADE_LEFT,
  ),
]

/** Apex height chosen so the tetrahedron fills the same 24-unit box the cube does. */
const TETRA_APEX = projectIso(0.5, 0.5, 1.5)

const TETRAHEDRON: readonly IsoPrimitive[] = [
  face([corner(1, 0, 0), corner(1, 1, 0), TETRA_APEX], SHADE_RIGHT),
  face([corner(0, 1, 0), corner(1, 1, 0), TETRA_APEX], SHADE_LEFT),
]

const CIRCLE: readonly IsoPrimitive[] = [
  { kind: 'circle', center: [ORIGIN, ORIGIN], radius: 10, paint: 'fill', shade: SHADE_TOP },
]

/**
 * The four-point sparkle: long tips on the axes, tight waists on the diagonals.
 *
 * The waist radius is what makes it a sparkle rather than a plus sign — pulled to roughly a
 * third of the tip so the arms taper. Vertices alternate tip, waist, tip, waist…, which the
 * suite asserts: eight evenly spaced vertices would be an octagon and would still satisfy a
 * naive "four points" check.
 */
const SPARKLE_TIP = 14
const SPARKLE_WAIST = 3

const SPARKLE: readonly IsoPrimitive[] = [
  face(
    [
      [ORIGIN, ORIGIN - SPARKLE_TIP],
      [ORIGIN + SPARKLE_WAIST, ORIGIN - SPARKLE_WAIST],
      [ORIGIN + SPARKLE_TIP, ORIGIN],
      [ORIGIN + SPARKLE_WAIST, ORIGIN + SPARKLE_WAIST],
      [ORIGIN, ORIGIN + SPARKLE_TIP],
      [ORIGIN - SPARKLE_WAIST, ORIGIN + SPARKLE_WAIST],
      [ORIGIN - SPARKLE_TIP, ORIGIN],
      [ORIGIN - SPARKLE_WAIST, ORIGIN - SPARKLE_WAIST],
    ],
    SHADE_TOP,
  ),
]

/**
 * The extruded `F` of the Fab Lab lockup.
 *
 * The depth is a second copy of the glyph offset along the projection slope — `[4, -2]`, the
 * same 2:1 the solids use — rather than a bevel with modelled side walls. That is how the
 * logo chip's extrusion is drawn (FR-007), and at the sizes this vocabulary is used the two
 * are indistinguishable; a modelled version would be ten more polygons that can go out of
 * register with the cubes beside it.
 *
 * The back copy is listed **first**: SVG paints in document order, so the offset copy must be
 * behind the face, not over it.
 */
const F_GLYPH: readonly IsoPoint[] = [
  [6, 8],
  [22, 8],
  [22, 13],
  [11, 13],
  [11, 16],
  [19, 16],
  [19, 21],
  [11, 21],
  [11, 28],
  [6, 28],
]

const F_DEPTH: IsoPoint = [4, -2]

const EXTRUDED_F: readonly IsoPrimitive[] = [
  face(
    F_GLYPH.map(([x, y]) => [x + F_DEPTH[0], y + F_DEPTH[1]] as const),
    SHADE_LEFT,
  ),
  face(F_GLYPH, SHADE_TOP),
]

/** Two chevrons, the "more this way" marker of the mockups. Open polylines: a closed one fills. */
const DOUBLE_CHEVRON: readonly IsoPrimitive[] = [
  stroke([
    [7, 9],
    [15, 16],
    [7, 23],
  ]),
  stroke([
    [17, 9],
    [25, 16],
    [17, 23],
  ]),
]

/**
 * The isometric ground grid: both diagonals at the projection's own ±1:2 slope, edge to edge.
 *
 * Faint by default (`shade`), because this is a background texture the solids sit on — at full
 * strength it competes with whatever is drawn over it.
 */
const GRID_SHADE = 0.35
const GRID_LINES: readonly IsoPrimitive[] = [
  stroke([[0, 0], [ISO_VIEWBOX, ISO_VIEWBOX / 2]], GRID_SHADE),
  stroke([[0, 8], [ISO_VIEWBOX, ISO_VIEWBOX / 2 + 8]], GRID_SHADE),
  stroke([[0, ISO_VIEWBOX / 2], [ISO_VIEWBOX, ISO_VIEWBOX]], GRID_SHADE),
  stroke([[0, ISO_VIEWBOX / 2], [ISO_VIEWBOX, 0]], GRID_SHADE),
  stroke([[0, ISO_VIEWBOX / 2 + 8], [ISO_VIEWBOX, 8]], GRID_SHADE),
  stroke([[0, ISO_VIEWBOX], [ISO_VIEWBOX, ISO_VIEWBOX / 2]], GRID_SHADE),
]

/**
 * The vocabulary FR-015 requires, keyed by name.
 *
 * @example ISO_SHAPES.cubeWireframe // the cube as lines
 */
export const ISO_SHAPES: Record<IsoShapeName, readonly IsoPrimitive[]> = {
  cubeFilled: CUBE_FILLED,
  cubeWireframe: CUBE_WIREFRAME,
  slab: SLAB,
  tetrahedron: TETRAHEDRON,
  circle: CIRCLE,
  sparkle: SPARKLE,
  extrudedF: EXTRUDED_F,
  doubleChevron: DOUBLE_CHEVRON,
  gridLines: GRID_LINES,
}

/**
 * Every shape name, iterable — the workbench (T037) renders this list rather than restating it,
 * so a shape added here appears there with no second edit. `Object.keys` widens to `string[]`,
 * which would let an unknown name through.
 */
export const ISO_SHAPE_NAMES = Object.keys(ISO_SHAPES) as ReadonlyArray<IsoShapeName>
