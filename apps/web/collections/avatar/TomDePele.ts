import type { CollectionConfig } from 'payload'

import { paletteCollection } from './palette'

/**
 * The catalogue size `onboarding.md` fixes: a 4x5 grid of swatches, lightest to darkest.
 *
 * Exported so the seed (T008) is held to the number rather than counting whatever it happens
 * to write, and so the admin description below cannot drift from it — the round-3 mockup
 * superseded an earlier catalogue of six, and a stale count in one of the two places is
 * exactly how that kind of change half-lands.
 */
export const TOTAL_TONS_DE_PELE = 20

/**
 * `tomDePele` — **global** reference data (CLR-001, FR-003, FR-027).
 *
 * Global rather than scoped because these twenty swatches are one designer's art shipped with
 * the product: identical for every lab, and scoping them would mean seeding twenty rows per
 * organization for a catalogue nobody varies.
 *
 * **The cost is priced, not overlooked.** A second lab cannot supply its own skin tones in v1.
 * CLR-001 names that as feature 007's co-branding question, so the day it is answered this
 * becomes a migration rather than a surprise.
 *
 * A skin tone is also the one colour in the product that is *not* themeable — repainting it
 * would change a person's depiction of themselves — which is why CLR-005 calls these rows data
 * rather than tokens and exempts them from feature 001's colour fence.
 */
export const TomDePele: CollectionConfig = paletteCollection({
  slug: 'tomDePele',
  singular: 'Tom de pele',
  plural: 'Tons de pele',
  description:
    `Catálogo de ${TOTAL_TONS_DE_PELE} tons de pele, do mais claro ao mais escuro. ` +
    'Arte da plataforma: idêntica em todas as organizações (CLR-001).',
  exemplos: 'Ex.: Pele 01, Pele 02 — o nome identifica a linha, o swatch mostra a cor.',
})
