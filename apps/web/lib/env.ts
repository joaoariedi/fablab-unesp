import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Environment contract for apps/web.
 *
 * Every variable the app reads is declared here and in `.env.example` — those two are the
 * same list, and CI has no way to notice if they drift, so keep them together by hand.
 *
 * US1's error case: a missing or unreachable `DATABASE_URI` must fail with a message naming
 * the variable and its expected shape. A volunteer on a clean clone gets one line they can
 * act on, not a Postgres stack trace that reads like a bug in the app.
 */

/**
 * Load the workspace `.env` before anything reads `process.env`.
 *
 * This is not optional convenience. Next loads a `.env` next to the app it serves, but the
 * **Payload CLI does not load one at all** — so without this, the README's own quick start
 * fails at `pnpm --filter @fablab/web migrate` with a missing `DATABASE_URI`, on a clean
 * clone that followed every instruction. Measured, not theorised.
 *
 * `process.loadEnvFile` is native in Node 22 (the pinned version), so this costs no
 * dependency. Its precedence is the correct one and worth stating: variables already
 * present in the real environment **win**, and the file only fills gaps — so CI, the
 * container and inline overrides are never silently replaced by a developer's local file.
 *
 * A missing file is normal, not an error: production sets real environment variables and
 * ships no `.env` at all.
 */
function loadWorkspaceEnv(): void {
  // apps/web/lib -> apps/web -> apps -> repo root
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', '.env')
  try {
    process.loadEnvFile(envPath)
  } catch {
    // No .env — expected in production and in CI.
  }
}

loadWorkspaceEnv()

type EnvVar = {
  name: string
  shape: string
  why: string
}

const REQUIRED: EnvVar[] = [
  {
    name: 'DATABASE_URI',
    shape: 'postgres://USER:PASSWORD@HOST:PORT/DATABASE',
    why: 'Postgres connection for Payload. `docker compose up` starts one at localhost:5432.',
  },
  {
    name: 'PAYLOAD_SECRET',
    shape: 'a random string of at least 32 characters',
    why: 'Signs auth tokens. Changing it invalidates every existing session.',
  },
]

export class MissingEnvError extends Error {
  constructor(missing: EnvVar[]) {
    const lines = missing.map((v) => `  ${v.name}=${v.shape}\n      ${v.why}`)
    super(
      `Missing required environment ${missing.length === 1 ? 'variable' : 'variables'}:\n\n` +
        `${lines.join('\n\n')}\n\n` +
        `Copy .env.example to .env and fill these in — see the Quick start in README.md.`,
    )
    this.name = 'MissingEnvError'
  }
}

/**
 * Reads and validates the environment. Throws `MissingEnvError` naming every missing
 * variable at once — reporting them one per run wastes a round trip per variable.
 *
 * @example
 *   const { DATABASE_URI } = readEnv()
 */
export function readEnv(source: NodeJS.ProcessEnv = process.env) {
  const missing = REQUIRED.filter((v) => {
    const value = source[v.name]
    return value === undefined || value.trim() === ''
  })

  if (missing.length > 0) throw new MissingEnvError(missing)

  return {
    DATABASE_URI: source.DATABASE_URI as string,
    PAYLOAD_SECRET: source.PAYLOAD_SECRET as string,
    /** Dev-only master seed (CLR-003). Absent in production by design. */
    SEED_MASTER_EMAIL: source.SEED_MASTER_EMAIL,
    SEED_MASTER_PASSWORD: source.SEED_MASTER_PASSWORD,
    /** Object storage. Declared now, consumed by feature 002. */
    S3_ENDPOINT: source.S3_ENDPOINT,
    S3_BUCKET: source.S3_BUCKET,
    S3_ACCESS_KEY_ID: source.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: source.S3_SECRET_ACCESS_KEY,
    S3_REGION: source.S3_REGION,
    NODE_ENV: source.NODE_ENV ?? 'development',
  }
}

/** The variable names `.env.example` must contain. Used by its own test. */
export const REQUIRED_ENV_NAMES = REQUIRED.map((v) => v.name)
