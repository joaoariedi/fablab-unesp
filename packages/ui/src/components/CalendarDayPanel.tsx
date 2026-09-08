'use client'
// The day drawer opened from a month cell: it opens and closes in place, so the month behind it
// keeps its scroll position and the visitor does not pay a round trip to dismiss a panel they
// opened by accident. That is state, and no server render can hold it (FR-008, US5).

import { useState, type CSSProperties, type MouseEvent, type ReactElement, type ReactNode } from 'react'

/**
 * T023 / FR-008, FR-024, US5 — the calendar's day panel.
 *
 * `calendario.md` § Visão MÊS: *"Painel lateral do dia (drawer à direita, 380px): data por
 * extenso (`SÁBADO, 22 DE AGOSTO`) e a lista completa de `CardEvento` daquele dia"*, opened by
 * a cell's `+ N mais`.
 *
 * ── Why this is the calendar's ONLY island ──────────────────────────────────────────────────
 *
 * Everything else on that page navigates by writing a URL — the `MÊS`/`LISTA` switch, the
 * period arrows, the type chips and the numbered pagination are all anchors, which is what
 * keeps a whole calendar a server component (FR-024, plan § "Implementation approach"). A
 * drawer is the one control whose state is *not* a URL: the day it shows is, but whether it is
 * still on screen is not, and a link that re-rendered the month to close a panel would throw
 * away the visitor's place in it.
 *
 * ── Why the close control is an anchor with a handler, not a button ─────────────────────────
 *
 * The panel is opened by a link (`?dia=2026-08-22`), so the day is in the URL and a visitor
 * with no JavaScript — or one who lands on that URL from a share — must still be able to leave.
 * The `href` is the way out that always works; the handler only spares the round trip when the
 * bundle is there. A `<button>` would be inert in exactly the case the fallback exists for.
 *
 * @example
 *   <CalendarDayPanel titulo="SÁBADO, 22 DE AGOSTO" fecharHref="/calendario?mes=2026-08">
 *     {cards}
 *   </CalendarDayPanel>
 */
export type CalendarDayPanelProps = {
  /** The date in full, already in the caps the design draws: `SÁBADO, 22 DE AGOSTO`. */
  readonly titulo: string
  /** Where the close control goes when there is no JavaScript: the same page without `?dia=`. */
  readonly fecharHref: string
  /** That day's cards, rendered on the server — the panel adds no data of its own. */
  readonly children: ReactNode
}

/** The drawer geometry `calendario.md` fixes: 380px on the right, and the full width below the
 *  tablet target, where a 380px drawer beside a 390px viewport is the whole screen anyway. */
const PANEL_STYLE: CSSProperties = {
  boxSizing: 'border-box',
  width: 'min(380px, 100%)',
  marginLeft: 'auto',
  padding: 'var(--space-5)',
  background: 'var(--surface-card)',
  border: '1px solid var(--color-teal)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-hard)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
}

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-lg)',
  color: 'var(--text-on-dark)',
}

/** FR-022: 44×44 on the compact breakpoints, and this is the control a visitor reaches for
 *  first when the drawer covers what they were reading. */
const CLOSE_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '44px',
  minHeight: '44px',
  color: 'var(--text-on-dark)',
  textDecoration: 'none',
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-lg)',
}

export function CalendarDayPanel({
  titulo,
  fecharHref,
  children,
}: CalendarDayPanelProps): ReactElement | null {
  // Open on arrival: the panel only ever renders because the URL asked for a day, so a closed
  // initial state would render nothing for a link whose entire purpose was to show something.
  const [aberto, setAberto] = useState(true)
  if (!aberto) return null

  const fechar = (evento: MouseEvent<HTMLAnchorElement>): void => {
    evento.preventDefault()
    setAberto(false)
  }

  return (
    <aside aria-label={`Atividades de ${titulo}`} style={PANEL_STYLE}>
      <header style={HEADER_STYLE}>
        <h2 style={TITLE_STYLE}>{titulo}</h2>
        <a href={fecharHref} onClick={fechar} aria-label="Fechar painel do dia" style={CLOSE_STYLE}>
          ×
        </a>
      </header>
      {children}
    </aside>
  )
}
