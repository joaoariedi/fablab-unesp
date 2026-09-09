'use client'
// WebGL and camera controls: the model has to be orbited, zoomed and lit by the visitor, and
// none of that survives a server render. The one island the Biblioteca 3D pays for, on the
// detail page only and never on a listing card (FR-014, US6, CLR-002).

import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactElement, type Ref } from 'react'

/**
 * T021 / FR-014, US6, CLR-002 — the 3D preview, and the thumbnail it falls back to.
 *
 * FR-014: *"The 3D preview renders `.glb`/`.gltf` on the detail page only; a listing card
 * shows the stored thumbnail and loads no 3D code"*. US6 gives the same answer to both ways a
 * model can fail to be shown: *"a model with only `.stl`/`.obj`/`.3mf` and no web-ready
 * preview shows its thumbnail instead — never a broken or empty canvas"*, and *"a preview that
 * fails to load falls back to the thumbnail and reports the failure in place, without taking
 * down the page"*.
 *
 * ── Why there is no STL/OBJ/3MF loader ──────────────────────────────────────────────────────
 *
 * `@google/model-viewer` reads glTF and nothing else; the other formats need `three`'s loaders,
 * which are deliberately not installed (plan § Sketch 5). That is not an omission to fix later:
 * FR-014 *decides* those formats fall back to the stored thumbnail, and `Modelo3d.thumbnail` is
 * `required: true`, so the fallback always exists. `three` itself IS declared — it is
 * `@google/model-viewer`'s peer (`^0.183.0`) and enters the tree with or without a declaration,
 * so it is declared rather than left implicit.
 *
 * ── Why the element is registered from an effect, through a relative module ─────────────────
 *
 * Three constraints meet here, and one shape satisfies all of them: a dynamic import of
 * `./viewer-element`, run in an effect, only on the branch that shows a viewer.
 *
 * 1. **CLR-002.** `components/index.ts` re-exports every component, so a static
 *    `import '@google/model-viewer'` in this file would join the module graph of anything that
 *    imports `@fablab/ui` — the Biblioteca 3D cards included, which is exactly where FR-014
 *    says no 3D code may load. Behind a dynamic import it is a chunk of its own.
 * 2. **Registering the element needs a browser.** The library reaches for `customElements` at
 *    module scope, and a client component is still rendered on the server for the initial
 *    HTML. An effect runs in the browser and nowhere else.
 * 3. **The purity boundary** (`eslint.config.mjs`) refuses a dynamic `import()` of a bare
 *    module under `packages/ui/src` and blesses the relative form it exists for —
 *    `React.lazy(() => import('./Heavy'))`. `./viewer-element` is that `./Heavy`: one
 *    side-effect line, and the only file in this package that names the library.
 *
 * The import is awaited for its failure, not for its value: a chunk that cannot be fetched is
 * the same outcome for the visitor as a mesh that cannot be parsed, so it takes the same
 * branch — the thumbnail — instead of leaving an unupgraded `<model-viewer>` on the page,
 * which renders as nothing at all.
 *
 * ── What this component is not ──────────────────────────────────────────────────────────────
 *
 * It does not fetch, does not know what a `modelo3d` is, and does not decide which file is the
 * preview. The detail page reads `arquivoPreview3d` through the tenancy choke point and passes
 * a URL or nothing; this component's whole job is the choice between two renderings.
 */

/** Which of the two renderings a model gets. A closed union rather than a boolean: `viewer`
 *  carries the src it was cleared for, so the caller cannot pair the decision with a
 *  different file than the one it was made about. */
export type ModelPreview =
  | { readonly kind: 'viewer'; readonly src: string }
  | { readonly kind: 'thumbnail' }

/**
 * The formats `@google/model-viewer` reads. glTF's two containers and nothing else — every
 * other extension `biblioteca-3d.md` allows (`.stl`, `.3mf`, `.obj`, `.zip`) needs a loader
 * this product does not ship.
 */
const WEB_READY_EXTENSIONS = ['.glb', '.gltf'] as const

export interface ModelViewerProps {
  /**
   * URL of the `.glb`/`.gltf` preview — `Modelo3d.arquivoPreview3d`, which is **optional**, so
   * absent is the common case rather than the odd one.
   */
  readonly src?: string | null
  /**
   * The stored thumbnail (`Modelo3d.thumbnail`, required). It is both the poster the viewer
   * shows while the mesh streams and the whole rendering when there is no viewer.
   */
  readonly poster: string
  /** The model's accessible name. Required: the fallback is a content image, not decoration. */
  readonly alt: string
}

/**
 * The extension of `src`, lowercased, with any query string and fragment removed first.
 *
 * Both strips are load-bearing rather than defensive. S3-compatible storage hands out object
 * URLs with a signature appended (`...glb?X-Amz-Signature=…`), and a plain `endsWith` on the
 * whole string sends a model that HAS a preview to the thumbnail — a silent downgrade nobody
 * would see a symptom of. Case follows from the same place: `Bolsa.GLB` is what a slicer on
 * Windows writes, and the object key preserves it.
 */
function extensionOf(src: string): string {
  const path = src.split(/[?#]/)[0] ?? ''
  const dot = path.lastIndexOf('.')
  return dot === -1 ? '' : path.slice(dot).toLowerCase()
}

/**
 * Which rendering a model gets, given its preview URL and whether the viewer has already
 * failed for it.
 *
 * Exported because it is the only way FR-014 can be asserted in this package: CLR-003 keeps
 * the tests at `node` with no DOM, so the failure branch — reached by an event that cannot be
 * dispatched there — is unreachable through the component alone. Same device, same reason, as
 * `clampScale()` on `PixelImage`.
 *
 * `failed` is checked first: a file can be perfectly web-ready and still be a 404, and once it
 * has failed no amount of correct extension makes it renderable.
 *
 * @example resolveModelPreview('/media/bolsa.stl', false) // => { kind: 'thumbnail' }
 */
export function resolveModelPreview(
  src: string | null | undefined,
  failed: boolean,
): ModelPreview {
  if (failed) return { kind: 'thumbnail' }
  const trimmed = src?.trim() ?? ''
  if (trimmed === '') return { kind: 'thumbnail' }
  const extension = extensionOf(trimmed)
  return WEB_READY_EXTENSIONS.some((allowed) => allowed === extension)
    ? { kind: 'viewer', src: trimmed }
    : { kind: 'thumbnail' }
}

/** The attributes this product sets on the custom element. Deliberately narrow: an element
 *  typed as "anything" is one where a misspelled attribute is silently inert. */
interface ModelViewerAttributes {
  /** The handle the effect attaches the `error` listener through. */
  readonly ref?: Ref<HTMLElement>
  readonly src: string
  readonly poster: string
  readonly alt: string
  /** Orbit, pan and zoom — the interactivity that makes this an island at all. */
  readonly 'camera-controls'?: boolean
  readonly loading?: 'lazy' | 'eager'
  readonly style?: CSSProperties
}

// NO `onError` — and this is not an oversight to be tidied up later.
//
// React 19.2 drops it. `setPropOnCustomElement` (react-dom-client, the `default` branch) checks
// `registrationNameDependencies.hasOwnProperty(key)` for any prop it does not handle specially:
// for a REGISTERED synthetic event name it validates the type and does nothing else — no
// listener, no property set. `error` is non-delegated, so only a capture-phase root listener
// exists (`onErrorCapture`), and it never sees an event dispatched on a custom element.
// `@google/model-viewer@4.3.1` signals a failed model with exactly
// `dispatchEvent(new CustomEvent('error', { detail: { type: 'loadfailure' } }))`.
//
// Measured on this repo's React: the handler fired 0 times for the custom element and once for
// a control `<img>`. So `onError={() => setFailed(true)}` compiled, read correctly, and could
// never run — US6's whole error path was wired to a handler nothing could call. The listener
// is attached from the effect instead, through a ref.

/**
 * The custom element, typed locally rather than through a global `JSX.IntrinsicElements`
 * augmentation. A global augmentation would make `<model-viewer>` valid TSX in every file of
 * the product, including the listing cards CLR-002 keeps 3D out of; the boundary is easier to
 * hold when the element only exists where it is imported from.
 */
const MODEL_VIEWER = 'model-viewer' as unknown as ComponentType<ModelViewerAttributes>

/** Both renderings occupy the same box, so the fallback does not reflow the detail page the
 *  moment a preview fails. No colour: the surrounding page owns the background (FR-002). */
const PREVIEW_STYLE: CSSProperties = { width: '100%', aspectRatio: '1 / 1' }

/** One shape on every branch — a `<figure>` even when there is no caption — so that a preview
 *  failing mid-load swaps the picture without moving the rest of the detail page. */
const FIGURE_STYLE: CSSProperties = { margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }

/** The report US6 asks for, in the page's own ink (FR-002 leaves the background to the page). */
const AVISO_STYLE: CSSProperties = { margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }

/**
 * What the visitor is told when a preview that EXISTED failed to load.
 *
 * US6's error clause has two verbs — *"falls back to the thumbnail **and reports the failure in
 * place**"* — and the first draft implemented only the first, so a failed preview was
 * indistinguishable from a model that never had one. Only the failure is announced: a model
 * with no `.glb` is the edge case, showing its thumbnail is the correct and complete answer,
 * and captioning that would report a fault where there is none.
 */
export const AVISO_FALHA = 'Não foi possível carregar a pré-visualização 3D. Exibindo a miniatura.'

/**
 * The model, interactive where the file allows it and the stored thumbnail everywhere else.
 *
 * @example <ModelViewer src={preview3d} poster={thumbnail} alt="Bolsa vazada, render do modelo" />
 */
export function ModelViewer({ src, poster, alt }: ModelViewerProps): ReactElement {
  const [failed, setFailed] = useState(false)
  const viewerRef = useRef<HTMLElement | null>(null)
  const preview = resolveModelPreview(src, failed)
  const isViewer = preview.kind === 'viewer'

  useEffect(() => {
    // Nothing to load for a model that is not being previewed — the fallback path fetches no
    // 3D code at all, which is what makes CLR-002 true at runtime and not only in the bundle.
    //
    // Returning `undefined` here rather than falling through is what makes the guard
    // OBSERVABLE: with it, the fallback branch's effect has no cleanup; without it, the branch
    // runs the import and returns one. `model-viewer.test.ts` asserts that difference, because
    // deleting this line left all 18 tests green — the effect was recorded and never invoked.
    if (!isViewer) return
    let cancelled = false
    void import('./viewer-element').catch(() => {
      if (!cancelled) setFailed(true)
    })

    // The listener React will not attach for us — see the note above `MODEL_VIEWER`. Read from
    // the ref rather than closed over, so the cleanup removes the listener from the element it
    // was added to even if the ref has since moved on.
    const element = viewerRef.current
    const onLoadFailure = (): void => {
      if (!cancelled) setFailed(true)
    }
    element?.addEventListener('error', onLoadFailure)

    return () => {
      cancelled = true
      element?.removeEventListener('error', onLoadFailure)
    }
  }, [isViewer])

  if (!isViewer) {
    return (
      <figure style={FIGURE_STYLE}>
        <img src={poster} alt={alt} style={PREVIEW_STYLE} />
        {/* Only when a preview existed and failed. `role="status"` and not `alert`: the page is
            intact and the visitor is looking at the thumbnail, so this is information rather
            than an interruption. */}
        {failed ? (
          <figcaption role="status" style={AVISO_STYLE}>
            {AVISO_FALHA}
          </figcaption>
        ) : null}
      </figure>
    )
  }

  return (
    <figure style={FIGURE_STYLE}>
      <MODEL_VIEWER
        ref={viewerRef}
        src={preview.src}
        poster={poster}
        alt={alt}
        camera-controls
        loading="lazy"
        style={PREVIEW_STYLE}
      />
    </figure>
  )
}
