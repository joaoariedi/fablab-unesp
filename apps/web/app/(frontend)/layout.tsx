import type React from 'react'

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

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
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
      <body>{children}</body>
    </html>
  )
}
