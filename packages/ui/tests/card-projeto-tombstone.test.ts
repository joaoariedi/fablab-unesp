import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { CardProjeto, type CardProjetoProps } from '../src/components/CardProjeto'

/**
 * T030 / FR-031, CLR-003 — `CardProjetoAutor` is a union, and the card draws the removed state.
 *
 * CLR-003 decides that deletion *"erases the personal data and leaves the published content up,
 * with authorship replaced by a tombstone"*, and that the tombstone is a **rendering** state:
 * *"no placeholder profile is created, because a placeholder is a profile someone could later
 * attach data to"*. `plan.md` § Sketch 6 fixes the shape — the profile, or `{ removido: true }` —
 * and states the acceptance in one sentence: *"the compiler then forces every consumer to handle
 * it, which is the difference between a tombstone and a crash on `autor.nome`"*.
 *
 * ── Why half of this suite shells out to `tsc` ──────────────────────────────────────────────
 *
 * The requirement is a **compile-time** one. Nothing a `node` suite renders can observe it: a
 * union whose removed member was forgotten still runs, and a `CardProjetoAutor` left as an
 * interface with optional fields would pass every runtime assertion below while letting a page
 * read `autor.nome` on a deleted maker and paint `undefined`. So the load-bearing cases write a
 * probe consumer, run the package's own `tsc` over it, and assert the exit code — the instrument
 * `tsconfig-typechecks-components.test.ts` established, for the same reason: a gate that reads
 * source text stays green against the defect it was written for.
 *
 * The probes are paired on purpose. One that fails on the unguarded consumer proves nothing
 * unless the guarded one compiles — a type that rejects both is not a union, it is a mistake.
 */

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const TSC_BIN = join(PACKAGE_DIR, 'node_modules', '.bin', 'tsc')
const PROBE_DIR = join(PACKAGE_DIR, 'src', '__tombstone_probe__')

/** `tsc` over the whole package on a cold cache is seconds, not milliseconds. */
const TSC_TIMEOUT_MS = 120_000

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly className?: string
  readonly [key: string]: unknown
}>

/** Every element in the tree, depth-first, the root included. */
function tree(root: ReactNode): AnyElement[] {
  const found: AnyElement[] = []
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child as ReactNode)
      return
    }
    if (!isValidElement(node)) return
    const element = node as AnyElement
    found.push(element)
    visit(element.props.children)
  }
  visit(root)
  return found
}

/** The text a subtree prints, in document order. */
function textOf(root: ReactNode): string {
  const parts: string[] = []
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child as ReactNode)
      return
    }
    if (typeof node === 'string' || typeof node === 'number') {
      parts.push(String(node))
      return
    }
    if (isValidElement(node)) visit((node as AnyElement).props.children)
  }
  visit(root)
  return parts.join(' ')
}

function classesOf(element: AnyElement): string[] {
  return (element.props.className ?? '').split(/\s+/).filter((name) => name !== '')
}

function byClass(root: ReactNode, className: string): AnyElement {
  const found = tree(root).find((element) => classesOf(element).includes(className))
  expect(found, `the tree must carry an element classed .${className}`).toBeDefined()
  return found as AnyElement
}

/** The `<style>` the card ships with itself — asserted to still be there for a removed author. */
function styleText(root: ReactNode): string {
  const styles = tree(root).filter((element) => element.type === 'style')
  expect(styles, 'the rules must travel with the component, as one <style>').toHaveLength(1)
  const children = (styles[0] as AnyElement).props.children
  return (Array.isArray(children) ? children : [children]).join('')
}

const CAPA = createElement('img', { src: '/luminaria.avif', alt: 'Luminária paramétrica' })

function cardProps(overrides: Partial<CardProjetoProps> = {}): CardProjetoProps {
  return {
    titulo: 'Luminária paramétrica',
    descricao: 'Luminária decorativa impressa em 3D com design paramétrico e encaixes precisos.',
    categoria: 'Impressão 3D',
    href: '/projetos/luminaria-parametrica',
    capa: CAPA,
    autor: { avatar: createElement('img', { src: '/avatar.png', alt: '' }), nome: 'Maria Silva', handle: 'mariasilva', nivel: 7 },
    curtidas: 32,
    ...overrides,
  }
}

interface TscResult {
  readonly exitCode: number
  readonly output: string
}

/**
 * Runs the package's own `tsc` against the package's own `tsconfig.json`, from the package
 * directory — exactly what `pnpm --filter @fablab/ui typecheck` does, with no invented flags.
 */
function runTypecheck(): TscResult {
  try {
    const output = execFileSync(TSC_BIN, ['--noEmit'], {
      cwd: PACKAGE_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: TSC_TIMEOUT_MS,
    })
    return { exitCode: 0, output }
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string; stderr?: string }
    // `status` is null when the child was killed by a signal rather than exiting: reporting
    // that as 0 would turn an infrastructure failure into a silent pass.
    return { exitCode: failure.status ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` }
  }
}

function writeProbe(fileName: string, source: string): void {
  mkdirSync(PROBE_DIR, { recursive: true })
  writeFileSync(join(PROBE_DIR, fileName), source, 'utf8')
}

/** The consumer CLR-003 exists to break: it reads the profile without asking whether there is
 *  one. Against a plain interface this compiles and paints `undefined` on a deleted maker. */
const UNGUARDED_CONSUMER = `import type { CardProjetoAutor } from '../components/CardProjeto'

export function creditoUnguarded(autor: CardProjetoAutor): string {
  return autor.nome
}
`

/** The same consumer, written correctly. It must compile, or the union is unusable rather
 *  than strict — a type that rejects every consumer proves nothing about this one. */
const GUARDED_CONSUMER = `import type { CardProjetoAutor } from '../components/CardProjeto'

export function creditoGuarded(autor: CardProjetoAutor): string {
  if (autor.removido === true) return 'Maker removido'
  return \`\${autor.nome} (nível \${autor.nivel})\`
}
`

/** CLR-003's other half: the removed state carries NO personal fields, so the placeholder
 *  profile `plan.md` § Sketch 6 names — `{ nome: 'Maker removido', handle: '', nivel: 0 }` —
 *  cannot be smuggled in beside the flag. */
const PLACEHOLDER_PROFILE = `import type { CardProjetoAutor } from '../components/CardProjeto'

export const autorPlaceholder: CardProjetoAutor = {
  removido: true,
  nome: 'Maker removido',
  handle: '',
  nivel: 0,
}
`

describe('CardProjetoAutor — the removed state is a member of the type (FR-031, CLR-003)', () => {
  afterEach(() => {
    rmSync(PROBE_DIR, { recursive: true, force: true })
  })

  it(
    'refuses a consumer that reads the profile without handling the removed author',
    () => {
      writeProbe('Unguarded.tsx', UNGUARDED_CONSUMER)
      const { exitCode, output } = runTypecheck()
      expect(exitCode, `tsc accepted \`autor.nome\` on a possibly-removed author:\n${output}`).not.toBe(0)
      // Guards against passing for the wrong reason — a missing module or a broken tsconfig
      // would also exit non-zero, and would prove nothing about this type.
      expect(output).toMatch(/Unguarded\.tsx/)
      expect(output).toMatch(/Property 'nome' does not exist/)
    },
    TSC_TIMEOUT_MS,
  )

  it(
    'accepts a consumer that narrows on `removido` first',
    () => {
      writeProbe('Guarded.tsx', GUARDED_CONSUMER)
      const { exitCode, output } = runTypecheck()
      expect(exitCode, `a correctly narrowed consumer must compile; tsc reported:\n${output}`).toBe(0)
    },
    TSC_TIMEOUT_MS,
  )

  it(
    'refuses a placeholder profile wearing the removed flag — the tombstone is not a row',
    () => {
      writeProbe('Placeholder.tsx', PLACEHOLDER_PROFILE)
      const { exitCode, output } = runTypecheck()
      expect(exitCode, `tsc accepted a placeholder profile as the removed state:\n${output}`).not.toBe(0)
      expect(output).toMatch(/Placeholder\.tsx/)
      // Named, so the case cannot pass on some unrelated error: the rejected property is the
      // personal datum, not the flag.
      expect(output).toMatch(/'nome' does not exist/)
    },
    TSC_TIMEOUT_MS,
  )
})

describe('CardProjeto — the tombstone the card draws (FR-031, CLR-003)', () => {
  it('words the removed author once, in the component', () => {
    // "no page invents a placeholder object and no two pages word it differently" (plan § The
    // tombstone splits in two). The wording therefore has to come out of the card itself.
    const rodape = byClass(CardProjeto(cardProps({ autor: { removido: true } })), 'fl-card-projeto__rodape')
    expect(textOf(rodape)).toContain('Maker removido')
  })

  it('prints no handle, no level and no avatar for a removed author', () => {
    // Read from the footer, not the whole card: the card ships its own <style>, whose `@media`
    // would satisfy a naive "contains no @" over the entire tree.
    const rodape = byClass(CardProjeto(cardProps({ autor: { removido: true } })), 'fl-card-projeto__rodape')
    const text = textOf(rodape)
    // The erasure obligation is over the personal data; an `@` or a `Nível n` beside the
    // tombstone would be exactly the personal data deletion just promised to remove.
    expect(text).not.toContain('@')
    expect(text).not.toMatch(/Nível/)
    expect(tree(rodape).some((element) => element.type === 'img')).toBe(false)
  })

  it('keeps the work up: the title, the cover, the count and the arrow all survive', () => {
    // CLR-003 keeps the published content — a tombstone that also dropped the card's content
    // would be a withdrawal, which is the outcome the clarification refuses.
    const card = CardProjeto(cardProps({ autor: { removido: true } }))
    expect(tree(card)).toContain(CAPA)
    expect(textOf(card)).toContain('Luminária paramétrica')
    expect(textOf(byClass(card, 'fl-card-projeto__curtidas'))).toContain('32')
    const anchors = tree(card).filter((element) => element.type === 'a')
    expect(anchors).toHaveLength(1)
    expect((anchors[0] as AnyElement).props['href']).toBe('/projetos/luminaria-parametrica')
    expect(styleText(card)).toContain('fl-card-projeto__rodape')
  })

  it('still prints the profile when there is one', () => {
    const text = textOf(byClass(CardProjeto(cardProps()), 'fl-card-projeto__rodape'))
    expect(text).toContain('Maria Silva')
    expect(text).toContain('@mariasilva')
    expect(text).toContain('Nível 7')
    expect(text).not.toContain('Maker removido')
  })
})
