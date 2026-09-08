/**
 * T021 / FR-014, CLR-002 — the side-effect module that defines `<model-viewer>`, and the only
 * file in this package that names the viewer library.
 *
 * Importing `@google/model-viewer` registers a custom element: it reaches for `customElements`
 * and `window` at module scope. That has two consequences, and this one-line module is what
 * keeps both of them out of `ModelViewer.tsx`.
 *
 *  1. **It must never load on a listing page** (CLR-002, FR-014). `components/index.ts`
 *     re-exports every component, so a static import inside `ModelViewer.tsx` would join the
 *     graph of anything importing `@fablab/ui` — the Biblioteca 3D cards included. Behind a
 *     dynamic `import('./viewer-element')` the bundler gives it its own chunk, fetched by the
 *     detail page and by nothing else.
 *  2. **It must never run on the server.** A client component is still rendered on the server
 *     for the initial HTML, and `customElements` does not exist there.
 *
 * The relative specifier is not incidental: `eslint.config.mjs`'s purity boundary refuses a
 * dynamic `import()` of a bare module anywhere under `packages/ui/src` — *"a dynamic import
 * must name a relative module (`React.lazy(() => import('./Heavy'))` still works)"*. This is
 * that `./Heavy`, and it is the whole of it, so the fence keeps meaning what it says while the
 * one genuinely heavy dependency in the product stays behind a boundary.
 *
 * `three` is not imported here or anywhere: it is `@google/model-viewer`'s declared peer
 * (`^0.183.0`), pulled in by the library itself. The STL/OBJ/3MF loaders are not installed at
 * all — FR-014 falls those formats back to the stored thumbnail.
 */
import '@google/model-viewer'
