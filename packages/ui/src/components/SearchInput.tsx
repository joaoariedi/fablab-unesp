import type { CSSProperties } from 'react'

/**
 * T024 / FR-006 — the search field, on both surfaces.
 *
 * `visual-identity.md` § Busca: *"input arredondado com ícone de lupa (escuro sobre navy;
 * claro nas páginas de fundo branco)"*. `artigos.md` § "Barra de filtros e busca" fixes the
 * dark rendering exactly: *"campo de busca arredondado, fundo navy, borda clara fina,
 * placeholder `Buscar artigos...` e ícone à direita, **dentro** do campo"* — and then
 * supersedes what the mockup draws: *"no render é um círculo vazado de contorno claro/rosa,
 * **sem cabo de lupa**; usar ícone de lupa na implementação"*.
 *
 * ── The light surface is `--color-claro`, not white ─────────────────────────────────────────
 *
 * FR-011 puts Biblioteca 3D and Aulas on white *pages*; this is the field sitting on one of
 * them, and it is not the page. There is no white token to reach for and this component is not
 * the place to invent one — `tokens/index.ts` records why: pure white has no custom property
 * behind it, so a `white` key would be a colour the cascade cannot paint. Both surfaces are
 * therefore ordinary palette pairs, which is what lets `contrast.test.ts` score them:
 * `claro`-on-`navy` and `navy`-on-`claro` are the two workhorse entries in `DOCUMENTED_PAIRS`,
 * and `search-input.test.ts` asserts membership rather than trusting the choice.
 *
 * ── Why the input carries its own colour and face ───────────────────────────────────────────
 *
 * No browser lets an `<input>` inherit `color` or `font-family` from an ancestor. Styling only
 * the shell leaves the one element a user types into to the UA stylesheet — near-black text on
 * the navy fill. The shell still sets `color`, because that is what `currentColor` resolves
 * against for the icon, which is a *sibling* of the input and reaches nothing the input sets.
 *
 * ── Why the radius is `--radius-sm` and not a pill ──────────────────────────────────────────
 *
 * layout.css defines two steps and assigns them: "sm for chips and inputs, md for cards and
 * buttons". "Arredondado" is satisfied by the step the contract already names; a literal pill
 * radius here would be a third step, with no token and no way to apply it consistently.
 *
 * ── Why the identity is a style object and not a CSS module ─────────────────────────────────
 *
 * The trade `Button` and `Chip` document: CLR-003 keeps this package's tests at `node` with no
 * DOM, so a class name would be assertable only as file text — a check that a string appears in
 * two files, which stays green when the rule behind it is wrong. As style objects the decision
 * is data the test can read.
 *
 * A server component, and an uncontrolled one: it takes no handler, so the query lives in the
 * island that composes it (FR-014) — the same split `Chip` makes for filter state.
 */

/** Which background the field sits on: the navy base, or a white content page. */
export type SearchSurface = 'navy' | 'light'

export interface SearchInputProps {
  /**
   * The accessible name, e.g. `Buscar artigos`. Required and separate from `placeholder`,
   * which is not a name: it disappears the moment a character is typed, taking the field's
   * only label with it.
   */
  readonly label: string
  /** The in-field prompt, e.g. `Buscar artigos...`. */
  readonly placeholder: string
  /** Defaults to `'navy'` — the base background every page starts from (FR-011). */
  readonly surface?: SearchSurface
  /** Form field name, for the uncontrolled case where the field submits with a form. */
  readonly name?: string
}

/**
 * Fill and ink per surface. The border takes the ink colour on both, so the field reads as an
 * outline of its own text rather than as a third colour needing its own decision.
 *
 * Both pairs appear in `DOCUMENTED_PAIRS` at `small`; a surface added here without its pair
 * added there fails `search-input.test.ts` rather than shipping unscored.
 */
const SURFACES: Record<SearchSurface, { readonly fill: string; readonly ink: string }> = {
  navy: { fill: 'var(--color-navy)', ink: 'var(--color-claro)' },
  light: { fill: 'var(--color-claro)', ink: 'var(--color-navy)' },
}

/** The field shell: rounded, thin-bordered, icon and input on one row. */
function shellStyle(surface: SearchSurface): CSSProperties {
  const { fill, ink } = SURFACES[surface]
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    background: fill,
    // Not just decoration: `currentColor` on the icon resolves against this, which is what
    // makes one icon correct on both surfaces.
    color: ink,
    border: `1px solid ${ink}`,
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-2) var(--space-3)',
  }
}

/** The input itself: transparent inside the shell, but never colourless. */
function inputStyle(surface: SearchSurface): CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    // Explicit, because an <input> inherits neither of these from the shell.
    color: SURFACES[surface].ink,
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    // No `outline: none`. The focus ring is the only signal a keyboard user gets that the
    // caret is here, and a search field is a frequent keyboard destination.
    flex: 1,
    // Without this the flex item refuses to shrink below its intrinsic size and the field
    // overflows its column on the 390 target.
    minWidth: 0,
  }
}

/**
 * The rounded search field, dark on navy and light on white pages.
 *
 * @example <SearchInput label="Buscar artigos" placeholder="Buscar artigos..." />
 */
export function SearchInput({ label, placeholder, surface = 'navy', name }: SearchInputProps) {
  return (
    <div style={shellStyle(surface)}>
      <input
        // `search`, not `text`: it is the semantic the assistive announcement and the platform
        // clear affordance both key off.
        type="search"
        name={name}
        aria-label={label}
        placeholder={placeholder}
        style={inputStyle(surface)}
      />
      {/*
        The magnifier: lens plus handle, inline rather than a nested <MagnifierIcon /> element.
        Nothing in this package renders (CLR-003), so a nested component would appear in the
        tree as an uncalled function and its markup would be unassertable — the icon would be
        proven present and never proven to be a magnifier.

        The handle is the point. `artigos.md` records that the mockup draws a bare hollow circle
        and that the implementation must not copy it: a circle alone reads as a dot or a
        disabled radio, not as search. `currentColor` inherits the shell's `color`, which is
        what makes one icon correct on both surfaces without a second colour decision.
      */}
      <svg
        // Sized in `em` so the icon tracks the field's font size instead of pinning a pixel
        // literal that would drift from `--text-base`.
        width="1em"
        height="1em"
        viewBox="0 0 16 16"
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        // The field already has an accessible name; an announced icon would repeat it.
        aria-hidden={true}
        focusable="false"
      >
        <circle cx={7} cy={7} r={4.5} stroke="currentColor" />
        <line x1={10.5} y1={10.5} x2={14} y2={14} stroke="currentColor" />
      </svg>
    </div>
  )
}
