/**
 * T035 / FR-015 — the isometric shape vocabulary's barrel.
 *
 * Not yet a subpath of the export map: `tests/package-exports.test.ts` asserts the map holds
 * *exactly* the four documented entries, and the public surface is assembled once, by T039,
 * through the root barrel. This file is what T039 re-exports, and what the footer composition
 * (T034) and the workbench (T037) import in the meantime.
 *
 * One line per export, types beside their value — `verbatimModuleSyntax` requires the
 * `export type` spelling.
 */
export { IsoShape } from './IsoShape'
export type { IsoShapeProps } from './IsoShape'
export {
  ISO_SHAPE_NAMES,
  ISO_SHAPES,
  ISO_VIEWBOX,
  projectIso,
} from './geometry'
export type { IsoCircle, IsoPaint, IsoPath, IsoPoint, IsoPrimitive, IsoShapeName } from './geometry'
