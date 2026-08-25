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
