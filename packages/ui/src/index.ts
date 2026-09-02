/**
 * `@fablab/ui` — the design system's root entry (T039, FR-018).
 *
 * Everything the app may reach lives behind one of the four export-map subpaths. This root
 * re-exports the three code barrels so a consumer can take one import; `./styles.css` is the
 * fourth and is CSS, so it is imported for effect rather than named here.
 *
 * The placeholder this replaces was `export {}`, and it was not a harmless stub: with it in
 * place the ENTIRE shell had no legal import from `apps/web`, so FR-008's navigation could
 * not be mounted no matter how complete the components were.
 */
export * from './components'
export * from './shapes'
export * from './shell'
export * from './tokens'
