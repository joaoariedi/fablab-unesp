/**
 * @fablab/game — pure XP / level / mission rules.
 *
 * `package.json` points `main`, `types` and `exports` all at this file, so this is the entire
 * public surface of the package: a rule that lives in `src/` and is not re-exported here is
 * unreachable from `apps/web`. Feature 000 shipped an `export {}` placeholder because the
 * workspace, the import boundary and the tenancy guardrails landed before any rule did; the
 * rules arrived in feature 005 and the placeholder went with them.
 *
 * What this package may not do is unchanged and is enforced, not merely documented: the
 * `packages/game` block in `eslint.config.mjs` fails the build on an import of `payload` or
 * `next` (constitution Principle 3). Tunables are per-organization data (`regrasXp`, CLR-010),
 * so every function takes them as an argument rather than reading a constant — see README.md.
 */

export { levelFor, progressInLevel, type XpRules } from './rules'
