import { describe, expect, it } from 'vitest'

import {
  ISO_SHAPE_NAMES,
  ISO_SHAPES,
  ISO_VIEWBOX,
  projectIso,
  type IsoPrimitive,
  type IsoShapeName,
} from '../src/shapes/geometry'

/**
 * T035 / FR-015 — the isometric shape vocabulary.
 *
 * FR-015 names nine assets: "cube filled/wireframe, slab, tetrahedra, circles, 4-point
 * sparkles, extruded F, double chevrons, grid lines". This suite asserts the vocabulary as
 * **geometry data**, never as a rendered component: CLR-003 keeps the stack at Vitest with no
 * DOM, so `src/shapes/IsoShape.tsx` cannot be imported here (a `.tsx` import would need a JSX
 * transform, which is the dependency that clarification forbids). The component is a thin
 * `<svg>` writer over this data — everything that can be wrong about a *shape* is wrong in the
 * numbers, and the numbers are what this file reads.
 *
 * ── Why containment is the load-bearing check ───────────────────────────────────────────────
 *
 * Every shape shares one `0 0 32 32` viewBox so the vocabulary composes on a common grid (the
 * footer composition, FR-010, stacks several). SVG does not clip to its viewBox by default and
 * does not warn: a coordinate outside it renders off-canvas or bleeds over a neighbour, with no
 * error anywhere in the toolchain. A shape that is silently the wrong size is exactly the
 * defect a test can see and a reviewer cannot.
 *
 * ── Why paint is opacity and never a colour ─────────────────────────────────────────────────
 *
 * A filled cube needs three differently-lit faces. Three colour values would be three identity
 * decisions living outside `tokens/` — the thing FR-002 forbids and the colour fence catches.
 * Faces are therefore `currentColor` at different `shade` (opacity), so the whole vocabulary
 * inherits whatever token the call site sets and no shape can introduce a colour at all. The
 * shade-range assertion below is what keeps that true.
 */

/** Every coordinate a primitive occupies, as flat [x, y] pairs. */
function pointsOf(primitive: IsoPrimitive): ReadonlyArray<readonly [number, number]> {
  if (primitive.kind === 'circle') {
    const [cx, cy] = primitive.center
    const r = primitive.radius
    // The bounding box, not the centre: a circle centred inside the box can still overflow it.
    return [
      [cx - r, cy - r],
      [cx + r, cy + r],
    ]
  }
  return primitive.points
}

const EXPECTED_NAMES: readonly IsoShapeName[] = [
  'cubeFilled',
  'cubeWireframe',
  'slab',
  'tetrahedron',
  'circle',
  'sparkle',
  'extrudedF',
  'doubleChevron',
  'gridLines',
]

describe('the isometric shape vocabulary (FR-015)', () => {
  it('ships every shape FR-015 names, and nothing undeclared', () => {
    expect([...ISO_SHAPE_NAMES].sort()).toEqual([...EXPECTED_NAMES].sort())
    expect(Object.keys(ISO_SHAPES).sort()).toEqual([...EXPECTED_NAMES].sort())
  })

  it('gives every shape at least one primitive — an empty asset renders nothing', () => {
    for (const name of ISO_SHAPE_NAMES) {
      expect(ISO_SHAPES[name].length, `${name} has no geometry`).toBeGreaterThan(0)
    }
  })

  it('keeps every coordinate inside the shared viewBox — SVG does not clip and does not warn', () => {
    const escaping: string[] = []
    for (const name of ISO_SHAPE_NAMES) {
      for (const primitive of ISO_SHAPES[name]) {
        for (const [x, y] of pointsOf(primitive)) {
          expect(Number.isFinite(x) && Number.isFinite(y), `${name} has a non-finite coordinate`).toBe(true)
          if (x < 0 || x > ISO_VIEWBOX || y < 0 || y > ISO_VIEWBOX) {
            escaping.push(`${name}: (${x}, ${y}) outside 0…${ISO_VIEWBOX}`)
          }
        }
      }
    }
    expect(escaping, `coordinates outside the shared viewBox:\n${escaping.join('\n')}`).toEqual([])
  })

  it('paints only through currentColor opacity — no shape may carry a colour', () => {
    for (const name of ISO_SHAPE_NAMES) {
      for (const primitive of ISO_SHAPES[name]) {
        // `shade` is an alpha applied to currentColor. 0 would be an invisible face drawn for
        // nothing; above 1 is not a valid opacity and clamps silently in the browser.
        expect(primitive.shade, `${name} has an out-of-range shade`).toBeGreaterThan(0)
        expect(primitive.shade, `${name} has an out-of-range shade`).toBeLessThanOrEqual(1)
        expect(primitive, `${name} carries a colour — shapes inherit currentColor`).not.toHaveProperty('color')
        expect(primitive, `${name} carries a colour — shapes inherit currentColor`).not.toHaveProperty('fill')
      }
    }
  })
})

describe('the 2:1 isometric projection', () => {
  /**
   * The whole vocabulary is "isometric" only because one projection built it. A shape drawn by
   * hand at the wrong slope looks *almost* right beside a correct one, which is why the
   * projection is exported and asserted rather than left as literals in each shape.
   */
  it('moves twice as far horizontally as vertically along a ground axis (2:1)', () => {
    const origin = projectIso(0, 0, 0)
    const alongX = projectIso(1, 0, 0)
    const alongY = projectIso(0, 1, 0)

    expect(Math.abs(alongX[0] - origin[0])).toBe(2 * Math.abs(alongX[1] - origin[1]))
    expect(Math.abs(alongY[0] - origin[0])).toBe(2 * Math.abs(alongY[1] - origin[1]))
  })

  it('mirrors the two ground axes — x goes right and down, y goes left and down', () => {
    const origin = projectIso(0, 0, 0)
    const alongX = projectIso(1, 0, 0)
    const alongY = projectIso(0, 1, 0)

    expect(alongX[0]).toBeGreaterThan(origin[0])
    expect(alongY[0]).toBeLessThan(origin[0])
    expect(alongX[1]).toBeGreaterThan(origin[1])
    expect(alongY[1]).toBeGreaterThan(origin[1])
  })

  it('raises height straight up — a vertical edge has no horizontal component', () => {
    const ground = projectIso(0, 0, 0)
    const raised = projectIso(0, 0, 1)
    expect(raised[0]).toBe(ground[0])
    expect(raised[1]).toBeLessThan(ground[1])
  })
})

describe('the shapes FR-015 distinguishes by name', () => {
  it('draws the filled cube as three shaded faces and the wireframe as strokes only', () => {
    const filled = ISO_SHAPES.cubeFilled
    const wireframe = ISO_SHAPES.cubeWireframe

    // Top, left and right: two faces read as a folded sheet, not a solid.
    expect(filled.filter((primitive) => primitive.paint === 'fill')).toHaveLength(3)
    expect(filled.every((primitive) => primitive.paint === 'fill')).toBe(true)

    expect(wireframe.some((primitive) => primitive.paint === 'fill')).toBe(false)
    expect(wireframe.every((primitive) => primitive.paint === 'stroke')).toBe(true)
  })

  it('gives the two cubes the same silhouette — they are one form, filled or not', () => {
    const extent = (name: IsoShapeName) => {
      const xs = ISO_SHAPES[name].flatMap((primitive) => pointsOf(primitive).map(([x]) => x))
      const ys = ISO_SHAPES[name].flatMap((primitive) => pointsOf(primitive).map(([, y]) => y))
      return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    }
    expect(extent('cubeWireframe')).toEqual(extent('cubeFilled'))
  })

  it('flattens the slab — the same footprint as the cube, but shorter', () => {
    const height = (name: IsoShapeName) => {
      const ys = ISO_SHAPES[name].flatMap((primitive) => pointsOf(primitive).map(([, y]) => y))
      return Math.max(...ys) - Math.min(...ys)
    }
    const width = (name: IsoShapeName) => {
      const xs = ISO_SHAPES[name].flatMap((primitive) => pointsOf(primitive).map(([x]) => x))
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(width('slab')).toBe(width('cubeFilled'))
    expect(height('slab')).toBeLessThan(height('cubeFilled'))
  })

  it('closes the tetrahedron on triangles — four points, three to a face', () => {
    const faces = ISO_SHAPES.tetrahedron.filter((primitive) => primitive.kind === 'polygon')
    expect(faces.length).toBeGreaterThanOrEqual(2)
    for (const face of faces) {
      expect(pointsOf(face)).toHaveLength(3)
    }
  })

  it('draws the circle as a circle primitive, not a many-sided polygon', () => {
    const [only, ...rest] = ISO_SHAPES.circle
    expect(rest).toHaveLength(0)
    expect(only?.kind).toBe('circle')
  })

  it('gives the sparkle four points — eight alternating vertices, tip then waist', () => {
    const [star, ...rest] = ISO_SHAPES.sparkle
    expect(rest).toHaveLength(0)
    expect(star?.kind).toBe('polygon')

    const vertices = pointsOf(star as IsoPrimitive)
    expect(vertices).toHaveLength(8)

    const centre = ISO_VIEWBOX / 2
    const radii = vertices.map(([x, y]) => Math.hypot(x - centre, y - centre))
    // A four-point sparkle is a star, not an octagon: every tip must reach further than both
    // waists beside it. An even-radius polygon would satisfy "eight vertices" and look wrong.
    for (let index = 0; index < radii.length; index += 2) {
      const tip = radii[index] as number
      const before = radii[(index + radii.length - 1) % radii.length] as number
      const after = radii[index + 1] as number
      expect(tip).toBeGreaterThan(before)
      expect(tip).toBeGreaterThan(after)
    }
  })

  it('extrudes the F — a face and an offset copy on the projection slope', () => {
    const parts = ISO_SHAPES.extrudedF.filter((primitive) => primitive.kind === 'polygon')
    expect(parts).toHaveLength(2)

    // Back copy first, face second: SVG paints in document order, so the offset copy has to
    // be behind. The assertion is on the vector between them, which is the same either way.
    const [first, second] = parts as [IsoPrimitive, IsoPrimitive]
    const back = pointsOf(first)
    const front = pointsOf(second)
    expect(front).toHaveLength(back.length)

    // Every vertex shifts by the same vector, and that vector rides the 2:1 slope — an
    // extrusion at any other angle is not the same solid as the cubes beside it.
    const offsets = back.map(([x, y], index) => {
      const [fx, fy] = front[index] as readonly [number, number]
      return [fx - x, fy - y] as const
    })
    const [dx, dy] = offsets[0] as readonly [number, number]
    for (const offset of offsets) expect(offset).toEqual([dx, dy])
    expect(Math.abs(dx)).toBe(2 * Math.abs(dy))
    expect(dx).not.toBe(0)
  })

  it('draws two chevrons, open polylines of the same size', () => {
    const chevrons = ISO_SHAPES.doubleChevron
    expect(chevrons).toHaveLength(2)
    for (const chevron of chevrons) {
      expect(chevron.kind).toBe('polyline')
      expect(chevron.paint).toBe('stroke')
      expect(pointsOf(chevron)).toHaveLength(3)
    }
    const [first, second] = chevrons as [IsoPrimitive, IsoPrimitive]
    const span = (primitive: IsoPrimitive) => {
      const xs = pointsOf(primitive).map(([x]) => x)
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(span(first)).toBe(span(second))
    // Two chevrons at the same x would render as one.
    expect(pointsOf(first)[0]?.[0]).not.toBe(pointsOf(second)[0]?.[0])
  })

  it('rules the grid on the projection slope only — every line is ±1:2', () => {
    const lines = ISO_SHAPES.gridLines
    expect(lines.length).toBeGreaterThanOrEqual(4)
    const slopes = new Set<number>()
    for (const line of lines) {
      expect(line.kind).toBe('polyline')
      const points = pointsOf(line)
      expect(points).toHaveLength(2)
      const [from, to] = points as [readonly [number, number], readonly [number, number]]
      const slope = (to[1] - from[1]) / (to[0] - from[0])
      expect(Math.abs(slope), `a grid line at slope ${slope} is not isometric`).toBe(0.5)
      slopes.add(Math.sign(slope))
    }
    // Both diagonals, or it is a set of parallel rules rather than a grid.
    expect([...slopes].sort()).toEqual([-1, 1])
  })
})
