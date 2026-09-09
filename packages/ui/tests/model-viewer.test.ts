import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { AVISO_FALHA, ModelViewer, resolveModelPreview } from '../src/components/ModelViewer'

/**
 * T021 / FR-014, US6, CLR-002 — the one 3D island, and the thumbnail it falls back to.
 *
 * FR-014: *"The 3D preview renders `.glb`/`.gltf` **on the detail page only**; a listing card
 * shows the stored thumbnail and loads no 3D code (CLR-002)"*. US6 states the two ways a model
 * can fail to be shown and gives both the same answer:
 *
 *   - **Edge**: *"a model with only `.stl`/`.obj`/`.3mf` and no web-ready preview shows its
 *     thumbnail instead — never a broken or empty canvas"*.
 *   - **Error**: *"a preview that fails to load falls back to the thumbnail and reports the
 *     failure in place, without taking down the page"*.
 *
 * SC-011 names the validation method this file implements: *"Render a model of each shape and
 * assert the fallback"*.
 *
 * ── Why the decision is an exported function ────────────────────────────────────────────────
 *
 * CLR-003 keeps this package at `node` with no `jsdom`/`happy-dom`, so nothing here renders.
 * The failure branch is reached by a DOM event that cannot be dispatched in this suite, so
 * `resolveModelPreview(src, failed)` exists for the same reason `clampScale()` does on
 * `PixelImage`: the criterion is asserted as data, and the component is then asserted to
 * *use* it. Testing the function alone would leave a component free to render a viewer for
 * every model and still pass.
 *
 * ── Why the dispatcher is faked ─────────────────────────────────────────────────────────────
 *
 * `menu-sheet.test.ts` established this: `useState` resolves through React's current
 * dispatcher, which is null outside a renderer, so calling an island directly throws. The fake
 * pins the state the test wants to read and records what the component asks for. A component
 * reaching for a hook the fake does not offer fails loudly here rather than quietly growing
 * into a bigger island than CLR-002 allows.
 *
 * What this file cannot prove: that WebGL paints. That is feature 003's Playwright.
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/components/ModelViewer.tsx', import.meta.url))
const BARREL_PATH = fileURLToPath(new URL('../src/components/index.ts', import.meta.url))
const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))

/** Every source file under `dir`, recursively — the package tree is small and has no build
 *  output in it, so there is nothing to exclude. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

/** Where React 19 keeps the hook dispatcher — read defensively, as `menu-sheet.test.ts` does. */
const INTERNALS_KEY = '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE'

/** The thumbnail every `modelo3d` has: `Modelo3d.thumbnail` is `required: true`, so the
 *  fallback is always available — there is no third rendering to design. */
const POSTER = '/media/bolsa-vazada-card.png'
const ALT = 'Bolsa vazada, render do modelo'

/** A web-ready preview: what `Modelo3d.arquivoPreview3d` stores when a maker uploads one. */
const GLB = '/media/bolsa-vazada.glb'

/**
 * `source` with its comments removed, so the assertions below are asked about CODE only.
 *
 * `islands.test.ts` learned this the hard way and records it: a file that documents a rule
 * naturally QUOTES the thing the rule forbids, and a whole-text scan then reads the
 * explanation as the violation. This component's docblock says `import '@google/model-viewer'`
 * three times while importing it nowhere.
 *
 * Deliberately a text strip and not a parse: over-stripping can only hide a real import, and
 * a hidden one keeps the assertion green — so the two cases below pair it with a check that
 * the module IS reached the sanctioned way, which an over-strip would turn red.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly [key: string]: unknown
}>

/**
 * The two hooks the island is allowed. `useEffect` records rather than runs: the effect is
 * where the viewer library is fetched, and running it in `node` would import a browser bundle
 * that registers a custom element — the very thing CLR-002 keeps off every other page.
 */
class FakeHookDispatcher {
  readonly updates: unknown[] = []
  readonly effects: unknown[] = []

  constructor(private readonly failed: boolean) {}

  readonly useState = (): [boolean, (next: unknown) => void] => [
    this.failed,
    (next: unknown): void => {
      this.updates.push(next)
    },
  ]

  readonly useEffect = (effect: unknown): void => {
    this.effects.push(effect)
  }

  /**
   * The handle the component attaches its `error` listener through.
   *
   * `current` is a FakeElement rather than `null` because that is what the ref holds by the
   * time an effect runs in a browser — and a fake that leaves it null would make every
   * assertion about the listener pass vacuously, which is the shape of the defect this file is
   * being corrected for.
   */
  readonly element = new FakeElement()
  readonly useRef = (): { current: unknown } => ({ current: this.element })
}

/** A DOM element with only the two methods the effect uses, recording what it was asked. */
class FakeElement {
  readonly added: { type: string; listener: (event?: unknown) => void }[] = []
  readonly removed: { type: string; listener: (event?: unknown) => void }[] = []

  readonly addEventListener = (type: string, listener: (event?: unknown) => void): void => {
    this.added.push({ type, listener })
  }

  readonly removeEventListener = (type: string, listener: (event?: unknown) => void): void => {
    this.removed.push({ type, listener })
  }
}

interface Mounted {
  readonly tree: AnyElement
  readonly dispatcher: FakeHookDispatcher
}

/** The component's element with the `failed` state forced, so both branches are reachable
 *  from a suite that cannot dispatch a DOM event. The dispatcher is always restored. */
function mount(src: string | undefined, failed = false): Mounted {
  const internals = (React as unknown as Record<string, { H: unknown } | undefined>)[INTERNALS_KEY]
  expect(internals, `React no longer exposes ${INTERNALS_KEY}; this fake needs it`).toBeTypeOf(
    'object',
  )
  const shared = internals as { H: unknown }
  const dispatcher = new FakeHookDispatcher(failed)
  const previous = shared.H
  shared.H = dispatcher
  try {
    return { tree: ModelViewer({ src, poster: POSTER, alt: ALT }) as AnyElement, dispatcher }
  } finally {
    shared.H = previous
  }
}

/** Every element in the tree, children included — both branches now wrap in a `<figure>`. */
function everyElement(node: ReactNode, found: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    for (const child of node) everyElement(child, found)
    return found
  }
  if (typeof node !== 'object' || node === null || !('type' in node) || !('props' in node)) {
    return found
  }
  const element = node as AnyElement
  found.push(element)
  return everyElement((element.props as { children?: ReactNode }).children ?? null, found)
}

const ofType = (tree: ReactNode, type: unknown): AnyElement | undefined =>
  everyElement(tree).find((element) => element.type === type)

/** The thumbnail. Asserted to exist here, so a caller reads a real element or fails saying so. */
function imageIn(tree: ReactNode): AnyElement {
  const image = ofType(tree, 'img')
  expect(image, 'no <img> in the tree — the thumbnail fallback rendered nothing').toBeDefined()
  return image as AnyElement
}

/** The `<model-viewer>` element, whatever the local alias resolves to. */
function viewerIn(tree: ReactNode): AnyElement {
  const viewer = ofType(tree, 'model-viewer')
  expect(viewer, 'no <model-viewer> in the tree — the viewer branch rendered nothing').toBeDefined()
  return viewer as AnyElement
}

/** The failure report, or `undefined` when there is none — which is the assertion, both ways. */
const captionIn = (tree: ReactNode): AnyElement | undefined => ofType(tree, 'figcaption')

/**
 * Invoke every recorded effect and collect what each returned.
 *
 * The fake dispatcher only RECORDS effects, which is why a guard inside one could be deleted
 * with every test still green. Running them is what turns the recording into evidence.
 */
function runEffects(dispatcher: FakeHookDispatcher): (undefined | (() => void))[] {
  return dispatcher.effects.map((effect) => (effect as () => undefined | (() => void))())
}

describe('resolveModelPreview() — the two renderings FR-014 allows', () => {
  it('previews a .glb and a .gltf, the only formats model-viewer reads', () => {
    expect(resolveModelPreview(GLB, false)).toEqual({ kind: 'viewer', src: GLB })
    expect(resolveModelPreview('/media/peca.gltf', false)).toEqual({
      kind: 'viewer',
      src: '/media/peca.gltf',
    })
  })

  it('reads the extension case-insensitively and past a query string', () => {
    // Both shapes are real: `Bolsa.GLB` is what a Windows slicer writes, and S3 hands out
    // object URLs with a signature appended. A naive `endsWith('.glb')` sends the first to
    // the thumbnail and would send the second there too — a model that HAS a preview,
    // silently shown as a still image.
    expect(resolveModelPreview('/media/Bolsa.GLB', false).kind).toBe('viewer')
    expect(resolveModelPreview('/media/bolsa.glb?X-Amz-Signature=abc123', false).kind).toBe('viewer')
  })

  it('falls a mesh-only model back to the thumbnail — US6 edge, SC-011', () => {
    // `biblioteca-3d.md` lists `.stl .3mf .obj .gltf .glb .zip`, and the STL/OBJ/3MF loaders
    // are deliberately not installed (plan § Sketch 5). Handing one of those to the viewer
    // is the empty canvas US6 forbids.
    for (const file of ['/m/a.stl', '/m/a.obj', '/m/a.3mf', '/m/a.zip', '/m/a.pdf']) {
      expect(resolveModelPreview(file, false), `${file} has no web-ready preview`).toEqual({
        kind: 'thumbnail',
      })
    }
  })

  it('falls back when there is no preview file at all', () => {
    // `arquivoPreview3d` is optional on `Modelo3d`, so this is the common case, not the odd
    // one — and it is the case that must never load the library.
    expect(resolveModelPreview(undefined, false)).toEqual({ kind: 'thumbnail' })
    expect(resolveModelPreview(null, false)).toEqual({ kind: 'thumbnail' })
    expect(resolveModelPreview('', false)).toEqual({ kind: 'thumbnail' })
    expect(resolveModelPreview('   ', false)).toEqual({ kind: 'thumbnail' })
  })

  it('falls back after a failure, even for a perfectly web-ready file — US6 error', () => {
    expect(resolveModelPreview(GLB, true)).toEqual({ kind: 'thumbnail' })
  })
})

describe('ModelViewer — the element the visitor actually gets (FR-014)', () => {
  it('renders the viewer for a .glb, with camera controls and the poster behind it', () => {
    // Found by type rather than read off the root: both branches now render inside one
    // `<figure>`, so that the failure report can appear without the picture moving.
    const viewer = viewerIn(mount(GLB).tree)
    expect(viewer.props.src).toBe(GLB)
    // The poster is what the viewer shows while the mesh streams; without it the visitor
    // watches an empty box on a 4G connection (SC-006 is measured on that profile).
    expect(viewer.props.poster).toBe(POSTER)
    expect(viewer.props['camera-controls']).toBe(true)
    expect(viewer.props.alt).toBe(ALT)
  })

  it('carries NO onError prop, which React would silently drop here', () => {
    // ── The defect this replaces ────────────────────────────────────────────────────────────
    //
    // The first draft asserted `tree.props.onError` was a function, and it was. React 19.2
    // never calls it: `setPropOnCustomElement`'s `default` branch checks
    // `registrationNameDependencies.hasOwnProperty(key)` and, for a registered synthetic event
    // name, validates the type and does nothing else — no listener, no property. `error` is
    // non-delegated, so only a capture-phase root listener exists and it never sees an event
    // dispatched on a custom element. `@google/model-viewer` signals failure with exactly
    // `dispatchEvent(new CustomEvent('error', …))`.
    //
    // So the prop is asserted ABSENT: leaving it there is a second, dead route to the same
    // behaviour that reads like the working one.
    expect(
      viewerIn(mount(GLB).tree).props.onError,
      'onError is back on the custom element. It compiles, it reads correctly, and React ' +
        'drops it — the error half of US6 would be wired to a handler nothing can call.',
    ).toBeUndefined()
  })

  it('listens for the element\u2019s own error event, through the ref', () => {
    const { dispatcher } = mount(GLB)
    runEffects(dispatcher)

    expect(
      dispatcher.element.added.map((entry) => entry.type),
      'nothing listens for the failure the library actually dispatches',
    ).toEqual(['error'])
  })

  it('flips to the fallback when that listener fires', () => {
    const { dispatcher } = mount(GLB)
    runEffects(dispatcher)
    dispatcher.element.added[0]?.listener()

    expect(dispatcher.updates).toEqual([true])
  })

  it('removes the listener on cleanup, so a re-render does not stack them', () => {
    const { dispatcher } = mount(GLB)
    const cleanups = runEffects(dispatcher)
    for (const cleanup of cleanups) cleanup?.()

    expect(dispatcher.element.removed.map((entry) => entry.type)).toEqual(['error'])
    expect(
      dispatcher.element.removed[0]?.listener,
      'a different function was removed than was added, so the listener stays attached',
    ).toBe(dispatcher.element.added[0]?.listener)
  })

  it('ignores a late failure after cleanup, rather than setting state on a dead island', () => {
    const { dispatcher } = mount(GLB)
    const cleanups = runEffects(dispatcher)
    const listener = dispatcher.element.added[0]?.listener
    for (const cleanup of cleanups) cleanup?.()
    listener?.()

    expect(dispatcher.updates).toEqual([])
  })

  it('does no work at all on the fallback branch (CLR-002)', () => {
    // ── The mutant this kills ───────────────────────────────────────────────────────────────
    //
    // Deleting `if (!isViewer) return` from the effect left all 18 of the previous tests green,
    // because the effect was recorded and never invoked — while the component's own comment
    // claims "the fallback path fetches no 3D code at all, which is what makes CLR-002 true at
    // runtime and not only in the bundle". The guard is observable in exactly one way without a
    // renderer: with it the fallback effect returns nothing, without it the branch runs and
    // returns a cleanup. That difference is the assertion.
    const { dispatcher } = mount(undefined)
    const cleanups = runEffects(dispatcher)

    expect(
      cleanups,
      'the fallback branch\u2019s effect did work: it returned a cleanup, so it got past the ' +
        '`if (!isViewer) return` guard and imported the viewer element on a page CLR-002 keeps ' +
        '3D off entirely.',
    ).toEqual([undefined])
    expect(dispatcher.element.added, 'the fallback branch attached a listener').toEqual([])
  })

  it('renders the thumbnail, not a viewer, for a mesh-only model', () => {
    const { tree } = mount('/media/bolsa.stl')
    const image = imageIn(tree)
    expect(image.props.src).toBe(POSTER)
    // The alt carries the model's name: a fallback that swallows it leaves a screen reader
    // with an unnamed image where the product promised a model.
    expect(image.props.alt).toBe(ALT)
  })

  it('renders the thumbnail when there is no preview file', () => {
    expect(imageIn(mount(undefined).tree).props.src).toBe(POSTER)
  })

  it('renders the thumbnail after a failure', () => {
    expect(imageIn(mount(GLB, true).tree).props.src).toBe(POSTER)
  })

  it('reports the failure in place, which is US6\u2019s second verb', () => {
    // "a preview that fails to load falls back to the thumbnail AND reports the failure in
    // place, without taking down the page". The first draft did only the falling back, so a
    // failed preview and a model that never had one were indistinguishable to the visitor.
    const caption = captionIn(mount(GLB, true).tree)

    expect(caption, 'a failed preview reports nothing at all').toBeDefined()
    expect(caption?.props.children).toBe(AVISO_FALHA)
    // Information, not an interruption: the page is intact and the thumbnail is showing.
    expect(caption?.props.role).toBe('status')
  })

  it('reports nothing for a model that simply has no preview (US6 edge, not error)', () => {
    // The edge case is a correct and complete answer, not a fault. Captioning it would report
    // a failure on every mesh-only model in the library.
    expect(captionIn(mount('/media/bolsa.stl').tree)).toBeUndefined()
    expect(captionIn(mount(undefined).tree)).toBeUndefined()
  })

  it('asks for no hook beyond state, the ref and the one effect', () => {
    // The island's cost is bounded by what it actually does. A further effect appearing here is
    // a component growing past "WebGL and camera controls" without anyone deciding to.
    expect(mount(GLB).dispatcher.effects).toHaveLength(1)
  })
})

describe('the 3D code stays on the detail page (CLR-002)', () => {
  const source = readFileSync(SOURCE_PATH, 'utf8')

  it('names the viewer library in no import of its own, static or dynamic', () => {
    // This is the whole of CLR-002 in one assertion. The barrel re-exports every component,
    // so a static `import '@google/model-viewer'` here is pulled into the graph of anything
    // that imports `@fablab/ui` — every listing card included, which is the one place FR-014
    // says the library must not be. The dynamic form is refused for a second reason:
    // `eslint.config.mjs`'s purity boundary allows a dynamic `import()` under
    // `packages/ui/src` only for a RELATIVE module, which is why `viewer-element.ts` exists.
    expect(stripComments(source)).not.toMatch(/['"]@google\/model-viewer['"]|['"]three['"]/)
  })

  it('reaches the element through a dynamic import of the relative side-effect module', () => {
    // The `React.lazy(() => import('./Heavy'))` shape the fence names, which is also what
    // gives the library its own chunk: the fallback path never fetches it.
    // Stripped, like the assertion above: the docblock quotes this exact call while
    // explaining it, and a scan of the raw text would be satisfied by the prose alone.
    expect(stripComments(source)).toMatch(/import\(\s*['"]\.\/viewer-element['"]\s*\)/)
  })

  it('keeps that module out of the barrel, so nothing pulls it eagerly', () => {
    // A dynamic import splits the chunk; a re-export from `components/index.ts` would put it
    // straight back into every consumer's graph and undo the split without touching this file.
    expect(readFileSync(BARREL_PATH, 'utf8')).not.toContain('viewer-element')
  })

  it('confines the library to that one module — it is imported nowhere else in the package', () => {
    const files = sourceFiles(SRC_DIR)
    // The set-difference above is trivially true over an empty scan, and a walk that silently
    // finds nothing is the failure this feature has already shipped seven times.
    expect(files.length, 'the scan found no source files — it is not looking at the package').
      toBeGreaterThan(10)
    const namingIt = files.filter((file) =>
      stripComments(readFileSync(file, 'utf8')).includes('@google/model-viewer'),
    )
    expect(
      namingIt.map((file) => file.slice(SRC_DIR.length + 1)),
      'the boundary is one file wide on purpose: a second importer is a second chunk seam, ' +
        'and the one that gets it wrong is the one on a listing page.',
    ).toEqual(['components/viewer-element.ts'])
  })

  it('carries the client directive as its first statement, with a reason beside it', () => {
    // The islands audit asserts this across the tree; it is repeated here because a directive
    // that slips below an import is not a directive at all — the component silently stays a
    // server component and its `useState` fails at build time, far from this file.
    const [first] = source.split('\n')
    expect(first?.trim()).toMatch(/^['"]use client['"];?$/)
  })

  it('writes no hex colour — the fence applies to an island too (FR-002)', () => {
    expect(source).not.toMatch(/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/)
  })
})
