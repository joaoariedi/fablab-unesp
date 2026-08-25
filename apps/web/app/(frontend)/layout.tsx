import type React from 'react'

// The public site. Feature 001 brings the design system (@fablab/ui) and feature 003 the
// real pages; this layout exists so the skeleton renders and feature 001 has somewhere to
// land (spec decision 5).
export const metadata = {
  title: 'Fab Lab CITe Bauru',
  description: 'Plataforma da comunidade maker do Fab Lab CITe Bauru (UNESP).',
}

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
