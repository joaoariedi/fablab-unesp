import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TenantUnresolvedError } from '../lib/tenancy/errors'

/**
 * T015 / FR-003, US2 — the public layout resolves the organization and injects **one**
 * validated token, and an unresolved host 404s instead of borrowing CITe's identity.
 *
 * ── Why this test calls the layout instead of rendering it ──────────────────────────────
 *
 * CLR-003 locks the stack at Vitest with no DOM, so nothing here renders. A React function
 * component is a plain function returning a plain object, so awaiting the layout and walking
 * the returned tree asserts the markup it actually builds — including the `style` prop on
 * `<body>`, which is the whole subject of FR-003. What it cannot prove is that the browser
 * paints it; that is feature 003's Playwright.
 *
 * ── Why the tenancy module is mocked rather than driven ─────────────────────────────────
 *
 * The choke point reads `next/headers` and a real Postgres. Neither exists here, and the
 * claim under test is not "Payload works" — feature 000 owns that — it is *what the layout
 * does with the three answers the choke point can give*: an organization, a
 * `TenantUnresolvedError`, and any other failure. Those three branches are the requirement.
 * §4 pins the layout to the real choke point by reading its source, so a mock cannot make
 * this suite pass over a layout that invented its own data path.
 */

const mocks = vi.hoisted(() => {
  /** What the real `notFound()` does: it throws, and never returns. Modelling that is
   *  load-bearing — a mock that returns lets execution fall through to a render the real
   *  runtime would never reach, and the test would then assert a tree production never sees. */
  const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    NOT_FOUND,
    notFound: vi.fn((): never => {
      throw NOT_FOUND
    }),
    getTenantScopedPayloadForRSC: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../lib/tenancy', async () => {
  // The errors module is a leaf with no Payload import, so the real classes are used: the
  // layout's `instanceof TenantUnresolvedError` must be tested against the *real* class, or
  // the branch would pass for a layout that matched on a message string instead.
  const errors = await import('../lib/tenancy/errors')
  return {
    ...errors,
    getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
  }
})

const { default: FrontendLayout, currentOrganization } = await import('../app/(frontend)/layout')

const LAYOUT_SOURCE = join(import.meta.dirname, '..', 'app', '(frontend)', 'layout.tsx')

/** The tenant-scoped client the choke point hands back, reduced to what the layout may use.
 *  A named fake rather than an inline object literal: it records the call the layout makes,
 *  so §1 can assert the read was tenant-addressed rather than a bare list. */
class FakeScopedPayload {
  readonly calls: { collection: string; id: string | number }[] = []

  constructor(
    readonly tenantId: string,
    private readonly doc: unknown,
  ) {}

  findByID = async (args: { collection: string; id: string | number }) => {
    this.calls.push({ collection: args.collection, id: args.id })
    if (this.doc instanceof Error) throw this.doc
    return this.doc
  }
}

type AnyElement = ReactElement<{ children?: ReactNode; style?: Record<string, unknown> }>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Depth-first search for the first element of a given intrinsic tag. */
function findTag(node: ReactNode, tag: string): AnyElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findTag(child, tag)
      if (hit) return hit
    }
    return null
  }
  if (!isElement(node)) return null
  if (node.type === tag) return node
  return findTag(node.props.children ?? null, tag)
}

const renderLayout = async () =>
  (await FrontendLayout({ children: 'conteúdo' })) as unknown as ReactNode

const bodyStyleFor = async (theme: unknown): Promise<Record<string, unknown> | undefined> => {
  const db = new FakeScopedPayload('7', { id: 7, theme })
  mocks.getTenantScopedPayloadForRSC.mockResolvedValue(db)
  const body = findTag(await renderLayout(), 'body')
  expect(body, 'the layout rendered no <body> at all').not.toBeNull()
  return body?.props.style
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('T015 / FR-003, US2 — the frontend layout injects the per-organization accent', () => {
  describe('§1 — currentOrganization() reads the record through the choke point', () => {
    it('is exported, so the layout is not the only thing that can resolve the tenant', () => {
      expect(
        typeof currentOrganization,
        'currentOrganization() is not exported from the layout. T015 names it as the unit ' +
          'that wraps the choke point; without it the resolution branch can only be tested ' +
          'through a full render.',
      ).toBe('function')
    })

    it('asks the choke point for its own organization, addressed by the resolved tenant id', async () => {
      const db = new FakeScopedPayload('42', { id: 42, theme: { primaryColor: '#3760AA' } })
      mocks.getTenantScopedPayloadForRSC.mockResolvedValue(db)

      const org = await currentOrganization()

      expect(mocks.getTenantScopedPayloadForRSC).toHaveBeenCalledTimes(1)
      expect(
        db.calls,
        'currentOrganization() did not read `organizations` by the resolved tenant id. A ' +
          'read addressed any other way is a second data path — the one Principle 2 says ' +
          'this feature must not add.',
      ).toEqual([{ collection: 'organizations', id: '42' }])
      expect(org).toEqual({ id: 42, theme: { primaryColor: '#3760AA' } })
    })
  })

  describe('§2 — the accent reaches <body> and nothing else does', () => {
    it('publishes the organization colour as --color-primary on <body>', async () => {
      expect(
        await bodyStyleFor({ primaryColor: '#3760AA' }),
        'the organization accent never reached <body>. Every component reads ' +
          '--color-primary from the cascade, so a layout that does not set it renders the ' +
          'CITe pink for every tenant — co-branding that silently does nothing (US2).',
      ).toEqual({ '--color-primary': '#3760AA' })
    })

    it('publishes exactly one custom property, so no fixed colour becomes per-tenant', async () => {
      const style = (await bodyStyleFor({ primaryColor: '#74B7A5' })) ?? {}

      expect(
        Object.keys(style),
        'FR-003/CLR-001 make exactly one token per-organization. A second key here is a ' +
          'platform-fixed colour (the laranja chip, the teal band, the navy base) becoming ' +
          'tenant-editable with no requirement saying so.',
      ).toEqual(['--color-primary'])
    })

    it('lets a malformed stored colour through to no declaration at all (FR-004, FR-019)', async () => {
      // The second of CLR-004's two checkpoints, observed from the layout's side: the value
      // is refused *here*, not merely refused by the collection field it never passed.
      for (const hostile of ['red;}body{display:none', '#EE9DC4; display:none', 'red']) {
        expect(
          await bodyStyleFor({ primaryColor: hostile }),
          `the layout published ${JSON.stringify(hostile)} onto <body>. React does not ` +
            'sanitise custom properties: the trailing declaration lands on the element.',
        ).toBeUndefined()
      }
    })

    it('renders the CITe defaults when the record carries no usable theme (SC-003)', async () => {
      for (const absent of [undefined, {}]) {
        expect(
          await bodyStyleFor(absent),
          'the layout published an override for an organization with no theme. Publishing ' +
            'nothing IS the fallback — palette.css already declares the CITe pink — and a ' +
            'second default here is a second thing to keep in sync (FR-004).',
        ).toBeUndefined()
      }
    })

    it('keeps the display-face preload the layout already carried (T010b)', async () => {
      mocks.getTenantScopedPayloadForRSC.mockResolvedValue(new FakeScopedPayload('7', { id: 7 }))
      const link = findTag(await renderLayout(), 'link')

      expect(
        link,
        'the <link rel="preload"> for the display face disappeared. T010b added it ' +
          'deliberately in place of what next/font/local would have emitted; the theme work ' +
          'must not quietly cost the LCP hint.',
      ).not.toBeNull()
    })
  })

  describe('§3 — an unresolved host is a 404, never another tenant’s identity', () => {
    it('converts TenantUnresolvedError into notFound()', async () => {
      mocks.getTenantScopedPayloadForRSC.mockRejectedValue(new TenantUnresolvedError('x.example'))

      await expect(renderLayout()).rejects.toBe(mocks.NOT_FOUND)
      expect(
        mocks.notFound,
        'the layout did not call notFound() for an unresolved host. The choke point throws ' +
          'and this layout wraps every public page, so the alternative is a 500 across the ' +
          "whole site — or worse, CITe's identity served on a stranger's hostname, which " +
          "feature 000's US4 forbids outright.",
      ).toHaveBeenCalledTimes(1)
    })

    it('does not fall back to the default theme for an unresolved host', async () => {
      mocks.getTenantScopedPayloadForRSC.mockRejectedValue(new TenantUnresolvedError(null))

      // The observable difference between "404" and "rendered with defaults" is whether a
      // tree comes back at all. A layout that swallowed the error would resolve here.
      await expect(
        renderLayout(),
        'the layout rendered a page for a host no organization claims. A silent fallback is ' +
          'the failure the tenancy work exists to prevent — nobody notices it.',
      ).rejects.toBe(mocks.NOT_FOUND)
    })

    it('lets every other resolution failure propagate untouched', async () => {
      const boom = new Error('the database is down')
      mocks.getTenantScopedPayloadForRSC.mockRejectedValue(boom)

      await expect(
        renderLayout(),
        'the layout turned an unrelated failure into a 404. A database outage reported as ' +
          '"no such site" is an outage nobody pages for.',
      ).rejects.toBe(boom)
      expect(mocks.notFound).not.toHaveBeenCalled()
    })

    it('degrades to the platform defaults when the theme itself cannot be read', async () => {
      // `organizations.read` is `masterOnly()`, so an anonymous visitor's read of its own
      // record throws Forbidden today. That is a theming gap, not a tenancy failure: the host
      // resolved, the tenant is known, and 404-ing or 500-ing the entire public site over a
      // missing accent colour is strictly worse than rendering the CITe defaults (FR-004 —
      // a missing theme is never a broken page).
      const db = new FakeScopedPayload('7', new Error('Forbidden'))
      mocks.getTenantScopedPayloadForRSC.mockResolvedValue(db)

      const body = findTag(await renderLayout(), 'body')
      expect(body?.props.style).toBeUndefined()
      expect(mocks.notFound).not.toHaveBeenCalled()
    })
  })

  describe('§4 — the layout stays a server component on the sanctioned data path', () => {
    const source = () => readFileSync(LAYOUT_SOURCE, 'utf8')

    it("carries no 'use client' directive", () => {
      expect(
        source(),
        "the frontend layout is marked 'use client'. It wraps every page, so that ships the " +
          'entire tree as a client bundle to apply a colour the server already knows (FR-014).',
      ).not.toMatch(/['"]use client['"]/)
    })

    it('imports the design system stylesheet, which is what defines the token it overrides', () => {
      expect(
        source(),
        'the layout does not import @fablab/ui/styles.css. Setting --color-primary on <body> ' +
          'overrides a declaration that would not exist: no palette, no typography, no ' +
          'layout tokens on any page.',
      ).toMatch(/import\s+['"]@fablab\/ui\/styles\.css['"]/)
    })

    it('reaches Payload only through the tenancy choke point', () => {
      const text = source()

      expect(
        text,
        'the layout does not import getTenantScopedPayloadForRSC from lib/tenancy. Any other ' +
          'route to the data is a second data path around the choke point.',
      ).toMatch(/getTenantScopedPayloadForRSC/)
      expect(
        text,
        'the layout imports getPayload directly, bypassing every tenant constraint.',
      ).not.toMatch(/getPayload\b/)
    })
  })
})
