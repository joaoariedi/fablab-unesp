import { notFound } from 'next/navigation'
import type React from 'react'

// The design system's token layer. It declares every custom property the components read —
// including `--color-primary` — so the override set on <body> below has something to
// override. Imported once, here, because this layout wraps every public page.
import '@fablab/ui/styles.css'
import { Footer, HeaderNav, MenuSheet, MobileTabBar } from '@fablab/ui'

import { TenantUnresolvedError } from '../../lib/tenancy'
// Deep import on purpose: the anonymous read path is NOT re-exported from lib/tenancy's
// index, because it runs with `overrideAccess: true` and that unexported-ness is one of the
// two locks the module documents. This is its first production caller.
import {
  getPublicScopedPayloadForRSC,
  readPublicOrganizationTheme,
} from '../../lib/tenancy/public-payload'
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
 * The organization serving this request, read through the **anonymous** path (FR-003, US2).
 *
 * `getPublicScopedPayloadForRSC()` resolves the host and **throws `TenantUnresolvedError`**
 * when nothing claims it — the layout below is what turns that into a 404. It is not caught
 * here: this function's caller needs to tell "no such site" apart from "no accent colour",
 * and swallowing the throw would erase the distinction at the only place it exists.
 *
 * **Why the anonymous client and not the choke point (T014).** `organizations.read` is
 * `masterOnly()` (lib/tenancy/access.ts), and Payload's `executeAccess` throws `Forbidden` on
 * a `false` access result — so the session-scoped client refused this read for every visitor
 * of the public site, which has no session at all. Feature 001 delivered the token, the
 * validator and the `<body>` override and co-branding still never appeared, because the read
 * underneath them could not succeed. Feature 002 opens the one sanctioned path for a caller
 * with no user, and `readPublicOrganizationTheme` is that path's single, projected read of
 * the `organizations` record — the same fix as the public content path, one symptom later.
 *
 * **The read itself stays best-effort.** A record that cannot be read is a missing accent
 * colour, not a missing site: taking the whole public site down over it would be strictly
 * worse than rendering the platform defaults, which FR-004 sanctions ("a missing theme is
 * never a broken page"). Resolution failures are the caller's to classify and are not caught.
 *
 * @example const org = await currentOrganization() // { theme: { primaryColor: '#3760AA' } }
 */
export async function currentOrganization(): Promise<ThemedOrganization | null> {
  const db = await getPublicScopedPayloadForRSC()

  try {
    return await readPublicOrganizationTheme(db)
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
