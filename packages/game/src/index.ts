/**
 * @fablab/game — pure XP / level / mission rules.
 *
 * Deliberately empty in feature 000. The workspace, the import boundary that keeps Payload
 * out of this package, and the tenancy guardrails ship first; the rules arrive in feature
 * 005. See README.md for what this package may not do.
 *
 * When the first rule lands it looks like this — no IO, tenant passed in explicitly:
 *
 * ```ts
 * export const levelFor = (xp: number, rules: XpRules): number =>
 *   Math.min(rules.levelCap, Math.floor(xp / rules.xpPerLevel))
 * ```
 */

export {}
