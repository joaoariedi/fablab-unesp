import { notFound } from 'next/navigation'
import type React from 'react'

// The design system's token layer. It declares every custom property the components read —
// including `--color-primary` — so the override set on <body> below has something to
// override. Imported once, here, because this layout wraps every public page.
import '@fablab/ui/styles.css'
import { Footer, HeaderNav, MenuSheet, MobileTabBar } from '@fablab/ui'

import { getTenantScopedPayloadForRSC, TenantUnresolvedError } from '../../lib/tenancy'
import { themeStyle } from '../../lib/theme'

// The public site. Feature 001 brings the design system (@fablab/ui) and feature 003 the
// real pages; this layout exists so the skeleton renders and feature 001 has somewhere to
// land (spec decision 5).
export const metadata = {
  title: 'Fab Lab CITe Bauru',
  description: 'Plataforma da comunidade maker do Fab Lab CITe Bauru (UNESP).',
}

// The absolute path `@font-face` in packages/ui/src/tokens/typography.css requests, served
// from apps/web/public/fonts/. It is repeated here rather than imported because the token
// layer is CSS: there is no value to import, and a mismatch would silently buy nothing.
const DISPLAY_FONT_HREF = '/fonts/aldo-the-apache.woff2'

/** As much of the organization record as the theme layer is allowed to care about. Kept as
 *  loose as `themeStyle`'s own parameter: these values come from the database, so a stricter
 *  type here would be a claim about stored data rather than a check on it. */
export type ThemedOrganization = { theme?: { primaryColor?: unknown } }

/**
 * The organization serving this request, read through the tenancy choke point (FR-003, US2).
 *
 * `getTenantScopedPayloadForRSC()` resolves the host and **throws `TenantUnresolvedError`**
 * when nothing claims it — the layout below is what turns that into a 404. It is not caught
 * here: this function's caller needs to tell "no such site" apart from "no accent colour",
 * and swallowing the throw would erase the distinction at the only place it exists.
 *
 * **The read of the record itself is best-effort, and the reason is not defensive coding.**
 * `organizations.read` is `masterOnly()` (lib/tenancy/access.ts), and Payload's
 * `executeAccess` throws `Forbidden` on a `false` access result — so an anonymous visitor's
 * read of the organization it is already scoped to fails today. That is a *theming* gap, not
 * a tenancy failure: the host resolved and the tenant is known. Taking the whole public site
 * down over a missing accent colour would be strictly worse than rendering the platform
 * defaults, which FR-004 sanctions ("a missing theme is never a broken page"), so the failure
 * is reported to the server log and the default stands.
 *
 * The gap is real and belongs to the tenancy layer, not to this file: access.ts already
 * records that an organization "reaches them through host resolution", and host resolution
 * (`ResolvedOrganization`) carries id/slug/name/status but no `theme`. Until it does — a
 * feature-000 contract change — a co-branded accent will not appear for anonymous visitors,
 * however correct everything downstream of `themeStyle()` is.
 *
 * @example const org = await currentOrganization() // { theme: { primaryColor: '#3760AA' } }
 */
export async function currentOrganization(): Promise<ThemedOrganization | null> {
  const db = await getTenantScopedPayloadForRSC()

  try {
    return await db.findByID<ThemedOrganization>({
      collection: 'organizations',
      id: db.tenantId,
      depth: 0,
    })
  } catch (err) {
    // Loud in the log, invisible to the visitor — FR-004's "the default is used and the
    // problem is reported", applied to a record that could not be read rather than a colour
    // that could not be trusted.
    console.warn(
      `[theme] organization ${db.tenantId} could not be read; rendering the platform defaults.`,
      err,
    )
    return null
  }
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  let org: ThemedOrganization | null = null

  try {
    org = await currentOrganization()
  } catch (err) {
    // An unresolved host is a 404 for the whole site, **not** a fall back to CITe's identity:
    // serving one organization's branding on another's hostname is the exact failure feature
    // 000's US4 forbids, and it would be worse than a 500 because nobody would notice it.
    // `notFound()` throws, so nothing below runs.
    if (err instanceof TenantUnresolvedError) notFound()
    // Anything else is an outage, and an outage reported as "no such site" is one nobody
    // pages for.
    throw err
  }

  return (
    <html lang="pt-BR">
      {/*
        The preload `next/font/local` would have emitted, added deliberately (plan Sketch 8,
        which kept typography inside packages/ui as plain @font-face and so gave this up).
        Aldo renders the logo and every heading — the LCP text — and a plain @font-face is
        only discovered once the stylesheet has been fetched and parsed. Only the display
        face is preloaded: a second hint would split the same early bandwidth, and Comfortaa
        swaps in acceptably under font-display: swap.

        `crossOrigin` is required even though the file is same-origin — fonts are fetched in
        anonymous CORS mode, and a preload without it is a second, separate download rather
        than a warm cache hit. React 19 hoists this <link> into <head>.
      */}
      <link
        rel="preload"
        href={DISPLAY_FONT_HREF}
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      {/*
        Exactly one custom property varies per organization (FR-003, CLR-001), and it arrives
        as a React style object rather than CSS text: `themeStyle()` validates the stored
        value and returns `undefined` when it cannot be trusted, which *is* the fallback —
        palette.css already declares the CITe pink, so publishing no override renders it.
      */}
      <body style={themeStyle(org)}>
        {/*
          FR-008's shell, mounted. The four components were built, tested and rendered
          NOWHERE — grepping this file for them returned 0 — which is the same "delivered but
          never wired" failure FR-009's `profileHref` had: a component nothing renders is not
          delivered, however green its own suite is.

          `isSignedIn` is hard-false until authentication lands (feature 004). That is the
          safe default and the one FR-009 names: an unauthenticated visitor tapping PERFIL
          must reach login, never the guarded account page.
        */}
        <HeaderNav menu={<MenuSheet />} />
        {children}
        <Footer />
        <MobileTabBar isSignedIn={false} />
      </body>
    </html>
  )
}
