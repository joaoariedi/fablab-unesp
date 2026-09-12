import type { CollectionConfig } from 'payload'

import { paletteCollection } from './palette'

/**
 * The catalogue size `onboarding.md` fixes: the row of swatches above the panels — preto,
 * quatro castanhos, bege/loiro, rosa, laranja, ciano and vermelho.
 *
 * Exported for the same reason as its sibling: the seed (T008) is held to the number, and the
 * admin description is built from it so the two cannot disagree.
 */
export const TOTAL_TONS_DE_CABELO = 10

/**
 * `tomDeCabelo` — **global** reference data (CLR-001, FR-003, FR-027).
 *
 * A separate collection from `tomDePele` and from the haircuts, because the round-3 mockup
 * separated hair *colour* from hair *cut*: the ten swatches repaint any of the thirty cuts, so
 * a colour on the cut row would be thirty rows of the same ten values.
 *
 * Global for the reason `TomDePele` records, and exempt from the colour fence for the reason
 * CLR-005 records — these are data rows, not tokens a theme may repaint.
 */
export const TomDeCabelo: CollectionConfig = paletteCollection({
  slug: 'tomDeCabelo',
  singular: 'Tom de cabelo',
  plural: 'Tons de cabelo',
  description:
    `Catálogo de ${TOTAL_TONS_DE_CABELO} tons de cabelo: preto, quatro castanhos, bege/loiro, ` +
    'rosa, laranja, ciano e vermelho. Arte da plataforma, idêntica em todas as organizações (CLR-001).',
  exemplos: 'Ex.: Preto, Castanho escuro, Loiro, Ciano.',
})
