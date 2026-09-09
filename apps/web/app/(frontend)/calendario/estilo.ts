/**
 * T023 / FR-021, FR-027 — every visual decision the Calendário declares.
 *
 * Split out of `page.tsx` under the same 500-line rule as `periodo.ts`, and along the seam the
 * other listings already draw inside their own file: what needs a breakpoint is a stylesheet,
 * because a media query cannot live in a style object, and everything else is data.
 *
 * Style objects rather than class names, for the reason `Button`, `Chip` and `Tabs` each
 * record: the suite runs at `node` with no DOM, so a class name would be assertable only as
 * text in two files — a check that stays green when the rule behind it is wrong. Every colour
 * resolves through a token (FR-027); there is no hex here and there must never be one.
 */

import type { CSSProperties } from 'react'

/** The class names, in one place: the markup and {@link CALENDARIO_CSS} must agree, and a typo
 *  in either is an unstyled element or a breakpoint that switches nothing. */
export const CLASSE = {
  conteudo: 'fl-cal',
  mes: 'fl-cal-mes',
  grade: 'fl-cal-grade',
  dia: 'fl-cal-dia',
  lista: 'fl-cal-lista',
  card: 'fl-cal-card',
  chips: 'fl-cal-chips',
  filtros: 'fl-cal-filtros',
} as const

/**
 * Everything that needs a breakpoint, as a stylesheet — the rest is style objects below.
 *
 * The split is the one every component in `packages/ui` makes: a media query cannot live in a
 * style object. Two decisions live here and nowhere else:
 *
 *   - **CLR-008's default view.** `[data-visao="auto"]` shows the list below the desktop target
 *     and the grid at or above it — *"a 7-column grid at 390px is unreadable, and the list is
 *     the same data"*. An explicit `?visao=` is honoured at every width, which is the whole
 *     point of the switch being a link.
 *   - **The chip row scrolls** on the compact breakpoints (`calendario.md` § Adaptação tablet:
 *     *"chips de tipo em faixa rolável horizontalmente"*) rather than wrapping into four rows
 *     that push the grid off the first screen.
 */
export const CALENDARIO_CSS = `
.${CLASSE.grade} {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-1);
}
.${CLASSE.dia} {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 96px;
  padding: var(--space-2);
  border: 1px solid var(--color-teal);
  border-radius: var(--radius-sm);
  min-width: 0;
}
.${CLASSE.chips} {
  display: flex;
  gap: var(--space-2);
  padding: 0 var(--space-5);
  overflow-x: auto;
}
.${CLASSE.filtros} {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
}
.${CLASSE.card} {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--surface-card);
  border: 1px solid var(--color-teal);
  border-radius: var(--radius-md);
  min-width: 0;
}
.${CLASSE.conteudo}[data-visao='auto'] .${CLASSE.mes} { display: none; }
@media (min-width: 1440px) {
  .${CLASSE.conteudo}[data-visao='auto'] .${CLASSE.mes} { display: block; }
  .${CLASSE.conteudo}[data-visao='auto'] .${CLASSE.lista} { display: none; }
  .${CLASSE.chips} { flex-wrap: wrap; overflow-x: visible; }
}
`

/**
 * Every colour and spacing decision this page declares, in one object.
 *
 * Style objects rather than a stylesheet, for the reason `Button`, `Chip` and `Tabs` each
 * record: the suite runs at `node` with no DOM, so a class name would be assertable only as
 * text in two files — a check that stays green when the rule behind it is wrong. Every colour
 * resolves through a token (FR-027); there is no hex here and there must never be one.
 */
export const ESTILO: Record<string, CSSProperties> = {
  pagina: {
    background: 'var(--surface-page)',
    color: 'var(--text-on-dark)',
    display: 'flex',
    flexDirection: 'column',
  },
  hero: {
    background: 'var(--surface-band)',
    // The ring must follow the BAND, not only the page: the accent on this teal scores 1.13:1
    // against WCAG 1.4.11's 3:1, so the ring on every target inside the band was invisible.
    // Navy on teal is 7.18:1 and is the documented pair.
    '--focus-ring-color': 'var(--text-on-light)',
    // Navy on teal is the documented pair; the light-on-dark default would be unreadable here.
    color: 'var(--text-on-light)',
    padding: 'var(--space-10) var(--space-5)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  } as CSSProperties,
  heroTitulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    textTransform: 'uppercase',
  },
  heroTexto: { margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', maxWidth: '46ch' },
  barra: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-4)',
    padding: 'var(--space-6) var(--space-5) var(--space-3)',
  },
  barraTitulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xl)',
    textTransform: 'uppercase',
  },
  grupoLinks: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    // FR-022: the compact breakpoints owe every target 44×44, and these are the page's densest.
    minHeight: '44px',
    padding: '0 var(--space-3)',
    border: '1px solid var(--color-teal)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-on-dark)',
    textDecoration: 'none',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
    whiteSpace: 'nowrap',
  },
  chipAtivo: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '44px',
    padding: '0 var(--space-3)',
    border: '1px solid var(--color-primary)',
    borderRadius: 'var(--radius-sm)',
    // "item ativo em rosa sublinhado" — both, never one: colour alone is not a state.
    color: 'var(--color-primary)',
    textDecoration: 'underline',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
    whiteSpace: 'nowrap',
  },
  seta: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '44px',
    minHeight: '44px',
    color: 'var(--text-on-dark)',
    textDecoration: 'none',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-lg)',
  },
  periodo: { fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' },
  hoje: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '44px',
    padding: '0 var(--space-3)',
    border: '1px solid var(--color-claro)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-on-dark)',
    textDecoration: 'none',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
  },
  seletor: {
    minHeight: '44px',
    padding: '0 var(--space-3)',
    background: 'var(--color-navy)',
    color: 'var(--text-on-dark)',
    border: '1px solid var(--color-claro)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
  },
  aplicar: {
    minHeight: '44px',
    padding: '0 var(--space-4)',
    background: 'var(--color-primary)',
    // On the accent fill the ring would be 1.00:1 — see PRIMARY_BUTTON_STYLE, which carries the
    // same override for every CTA that spreads it. This region paints the fill by hand.
    '--focus-ring-color': 'var(--color-navy)',
    color: 'var(--text-on-light)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-hard)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
  } as CSSProperties,
  cabecalhoColuna: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xs)',
    textAlign: 'center',
    padding: 'var(--space-1)',
  },
  dia: { background: 'transparent' },
  // "dias fora do mês em opacidade reduzida" — drawn, so the grid is a rectangle, but quiet.
  diaFora: { background: 'transparent', opacity: 0.45 },
  diaHoje: { borderColor: 'var(--color-primary)' },
  diaSelecionado: { background: 'var(--surface-card)' },
  numeroDia: { fontFamily: 'var(--font-display)', fontSize: 'var(--text-xs)' },
  pilula: {
    display: 'block',
    borderLeft: '3px solid var(--color-teal)',
    padding: '0 var(--space-1)',
    color: 'var(--text-on-dark)',
    textDecoration: 'none',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-xs)',
    // A pill is one line whatever the title's length: the cell height is the grid's, not the
    // longest title's.
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  mais: {
    color: 'var(--color-primary)',
    textDecoration: 'underline',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xs)',
  },
  grupo: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  grupoTitulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-base)',
    // "cabeçalho de dia fixo ao rolar" (§ Visão LISTA).
    position: 'sticky',
    top: 0,
  },
  cards: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', margin: 0, padding: 0, listStyle: 'none' },
  blocoData: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: '0 0 auto',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xs)',
    minWidth: '72px',
  },
  diaGrande: { fontSize: 'var(--text-2xl)' },
  corpo: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0, flex: 1 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' },
  chipTipo: {
    border: '1px solid var(--color-teal)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-1) var(--space-2)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xs)',
  },
  rotulo: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-claro)',
  },
  titulo: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-lg)',
    textTransform: 'uppercase',
    color: 'var(--text-on-dark)',
  },
  tituloCancelado: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-lg)',
    textTransform: 'uppercase',
    color: 'var(--text-on-dark)',
    // "evento CANCELADO aparece tachado com aviso a todos" (§ Estados e interações).
    textDecoration: 'line-through',
  },
  descricao: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-3)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
  },
}
