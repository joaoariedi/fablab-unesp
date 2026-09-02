import type { ReactElement } from 'react'

/**
 * A placeholder page body, for the routes feature 003 will fill in.
 *
 * Deliberately almost empty. The spec's scope boundary gives the real pages to feature 003,
 * and these exist for one reason: until a route file exists, every tab in the shell is a 404,
 * so the navigation cannot be walked and the designer cannot see the shell at each breakpoint.
 * Rendering anything more here would pre-empt decisions that are theirs to make.
 *
 * Type comes from the token layer, never a literal — the same discipline the colour fence
 * enforces for hex, and the reason `--text-3xl` exists.
 */
export function PageStub({ title }: { readonly title: string }): ReactElement {
  return (
    <main style={{ padding: 'var(--space-6) var(--space-5)', minHeight: '60vh' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-3xl)',
          color: 'var(--color-claro)',
          margin: 0,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-base)',
          color: 'var(--color-claro)',
          opacity: 0.75,
        }}
      >
        Página em construção — a estrutura chega na feature 003.
      </p>
    </main>
  )
}
