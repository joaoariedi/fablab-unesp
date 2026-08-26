import { defineConfig } from 'vitest/config'

// Load the workspace .env before computing fallbacks, so a developer's real DATABASE_URI
// wins. Without this the fallbacks below would take precedence — Vitest's `env` block is
// applied to process.env, and process.loadEnvFile never overwrites what is already set —
// and integration tests would quietly point at the wrong database.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname)
} catch {
  // No .env: the fallbacks below carry the config-shape tests.
}

export default defineConfig({
  test: {
    // Integration tests drive a real Postgres through Payload's Local API, so they are not
    // isolated from each other by construction — run files serially rather than debugging
    // cross-file interference later.
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      // Loading payload.config.ts calls readEnv(), which throws unless these are present.
      // Defaults let config-shape tests (registry, scope) run with no database at all;
      // integration tests override DATABASE_URI from the real environment.
      DATABASE_URI: process.env.DATABASE_URI ?? 'postgres://fablab:fablab@localhost:5432/fablab',
      PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? 'test-secret-not-used-for-anything-real',
    },
  },
  resolve: {
    alias: {
      '@payload-config': new URL('./payload.config.ts', import.meta.url).pathname,
    },
  },
})
