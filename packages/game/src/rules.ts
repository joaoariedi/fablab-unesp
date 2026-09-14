/**
 * The XP economy, as pure functions. FR-005, FR-007.
 *
 * Nothing here reads a database, a request, a clock or an environment variable — constitution
 * Principle 3, enforced by the `packages/game` block in `eslint.config.mjs` rather than by
 * convention. The tunables arrive as an argument because `regrasXp` is **per-organization
 * data** (FR-009, CLR-010): retuning the economy is an edit, not a deploy, so a number written
 * into this file would be a deploy-time answer to a runtime question.
 */

/**
 * One organization's economy. The CITe seed is `{ xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 }`,
 * written by `lib/tenancy/seed-on-create.ts`; those numbers are a seed, never the rule.
 */
export type XpRules = { xpPorAcao: number; xpPorNivel: number; nivelMaximo: number }

/**
 * The level for an XP total, on this organization's curve.
 *
 * **The cap is applied here and nowhere else**, which is why no column in the schema declares a
 * `max`: `perfilMaker.xpTotal` and the ledger's amounts are uncapped and keep rising (CLR-013),
 * and only the *derived* level stops. A `max` on a column would cap the total instead, which
 * would make every maker at the top tie permanently and stop the ranking (FR-013) being one.
 *
 * Level 0 is a real level (CLR-005): 0 XP is level 0, not level 1.
 *
 * @example
 * levelFor(49, { xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 }) // 9
 * levelFor(999, { xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 }) // 10 — capped
 */
export const levelFor = (xp: number, rules: XpRules): number =>
  // Clamped at BOTH ends. The cap is the requirement; the floor is the answer to a question
  // T003's verifier asked and this file could not answer: `levelFor(-1, CITE)` returned **-1**,
  // and `progressInLevel(-1)` a bar filled to -1. Unreachable today — FR-001 makes the ledger
  // append-only and FR-006 credits positive amounts only — so this is not a live defect. It is
  // the shape a reversal would arrive in, and a negative level is nonsense in every direction:
  // it sorts below a maker who has done nothing, and it renders as a bar with less than no fill.
  Math.max(0, Math.min(rules.nivelMaximo, Math.floor(xp / rules.xpPorNivel)))

/**
 * What the ten-segment pip bar fills: the XP earned inside the current level, and the level's
 * width.
 *
 * At the cap the bar is **full and stays full** (CLR-013). The modulo alone would report `0` at
 * exactly `nivelMaximo * xpPorNivel` and then climb again — an empty bar for a maker who just
 * reached the top, which reads as a demotion.
 *
 * @example
 * progressInLevel(7, { xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 }) // { atual: 2, de: 5 }
 * progressInLevel(999, { xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 }) // { atual: 5, de: 5 }
 */
export const progressInLevel = (xp: number, rules: XpRules): { atual: number; de: number } =>
  levelFor(xp, rules) >= rules.nivelMaximo
    ? { atual: rules.xpPorNivel, de: rules.xpPorNivel }
    // `Math.max(0, …)` for the same reason `levelFor` clamps: `-1 % 5` is `-1` in JavaScript,
    // not `4`, so a negative total filled the bar to less than empty.
    : { atual: Math.max(0, xp % rules.xpPorNivel), de: rules.xpPorNivel }
