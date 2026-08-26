import { seed } from './index'

/**
 * CLI entry: `pnpm --filter @fablab/web seed`.
 *
 * Kept separate from `index.ts` so importing the seed does not *run* it — the seed tests
 * (T047, T057) call `seed()` twice on purpose to prove idempotence, which would be
 * impossible if the module executed on import.
 */

const report = await seed()

const lines = [
  '',
  '  Seed complete.',
  `    organization  ${report.organization} (id ${report.organizationId})`,
  `    master        ${report.master}`,
  ...report.notes.map((n) => `    · ${n}`),
  '',
]
console.log(lines.join('\n'))

// Payload keeps a database pool open; without this the CLI hangs after reporting success,
// which reads as a failed seed to anyone following the README.
process.exit(0)
