import { builtinModules } from 'node:module'

import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * The import boundary that makes the tenancy choke point real (FR-014).
 *
 * The leak vector is a **clean call**: Payload's Local API skips access control by default,
 * so `payload.find({ collection })` inside an RSC or a hook returns a neighbouring
 * organization's rows with HTTP 200 and contains no suspicious token. Spike round 1
 * reproduced this in our own stack — a bare find returned both organizations' rows.
 *
 * Matching on method name was the first draft and is defective three ways:
 *   const p = await getPayload(); p.find()   — escapes by renaming
 *   req.payload.find()                       — reaches every hook with no import at all
 *   raw SQL                                  — has no method name
 *
 * So the primary mechanism is the **import boundary** (imports are statically visible and
 * cannot be aliased across modules), and `no-restricted-syntax` closes the `req.payload`
 * shape that no import ban can see.
 */

const TENANCY_MESSAGE =
  'Data access must go through getTenantScopedPayload(req) in lib/tenancy. ' +
  'Payload\'s Local API skips access control by default, so this call would read every tenant.'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/migrations/**',
      'apps/web/payload-types.ts',
      'apps/web/app/(payload)/admin/importMap.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ---------------------------------------------------------------------------------------
  // The tenancy fence. Everything in apps/web EXCEPT lib/tenancy itself and the two
  // deliberately-allowlisted entry points.
  // ---------------------------------------------------------------------------------------
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/lib/tenancy/**', // the module that is allowed to touch Payload data
      'apps/web/seed/**', //        bootstrap, runs before any request exists
      'apps/web/tests/**', //       the harness must be able to set up fixtures
      'apps/web/payload.config.ts', // declares collections; imports no client
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'payload',
              importNames: ['getPayload'],
              message: TENANCY_MESSAGE,
            },
          ],
          patterns: [
            // FR-014's raw-SQL clause: the adapter and Drizzle bypass access control entirely.
            '@payloadcms/db-*',
            'drizzle-orm*',
            // Fence the two most dangerous functions in the codebase so a page cannot simply
            // import them. They are never exported from lib/tenancy/index.ts either — this is
            // the second lock on the same door.
            '**/lib/tenancy/unscoped*',
            '**/lib/tenancy/system-payload*',
          ],
        },
      ],

      // req.payload is a full unscoped client handed to every hook and route handler with
      // ZERO imports. Selectors are deliberately object-agnostic: an earlier draft scoped
      // this to `MemberExpression[object.name='req'][property.name='payload']`, which misses
      // `const { payload } = req` (an ObjectPattern, not a member expression) and
      // `args.req.payload` (where object.name is undefined because the object is itself a
      // member expression). Both are one keystroke from what a contributor naturally writes.
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='payload']",
          message: TENANCY_MESSAGE,
        },
        {
          selector: "ObjectPattern > Property[key.name='payload']",
          message: TENANCY_MESSAGE,
        },
        {
          selector: "MemberExpression[property.name='drizzle']",
          message: 'Raw Drizzle access belongs in lib/tenancy.',
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------------------
  // Principle 3: packages/game holds pure rules. The first draft of the plan claimed this
  // boundary with no mechanism — an empty directory enforces nothing.
  // ---------------------------------------------------------------------------------------
  {
    files: ['packages/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['payload', 'payload/*', '@payloadcms/*', 'next', 'next/*'],
              message:
                'packages/game is pure rules: no Payload, no framework, no IO. Pass data in as arguments.',
            },
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------------------
  // FR-018: packages/ui receives resolved values as props or CSS custom properties.
  //
  // This mirrors the packages/game block above; it deliberately does not copy it. The list
  // differs because the packages are different: `@fablab/ui` IS React, so React stays, and
  // client-safe Next entry points (next/link, next/image) are not the hazard. What breaks the
  // promise is a component reaching for the request — `next/headers` or `getPayload()` — which
  // makes it unrenderable anywhere but inside a Next server request, and unreusable by the
  // workbench, by tests, and by any second consumer.
  //
  // SCOPE IS LOAD-BEARING: `src/**`, not `packages/ui/**`. The tests directory must keep
  // `node:fs` and `node:child_process` — T011 asserts no SquareFont artefact is *tracked*,
  // which it can only do by reading the git index. A boundary written one directory wider
  // would look identical in review and make that gate unwritable.
  // ---------------------------------------------------------------------------------------
  {
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'payload',
                'payload/*',
                '@payloadcms/*',
                '@payloadcms/*/*',
                // Next is DENIED BY DEFAULT with a short allowlist, not an enumeration of
                // the server entry points. The first draft banned exactly the four the test
                // probed — next/headers, next/server, next/cache, server-only — and let
                // `next/og` (a server/edge-only API, and a plausible reach for a UI package
                // building an OG card) straight through. An allowlist cannot rot that way:
                // a Next release adding a server API is blocked on arrival, and every
                // exemption below is one line a reviewer can see.
                'server-only',
              ],
              message:
                'packages/ui renders from props and CSS custom properties: no Payload, no Next ' +
                'server APIs. Resolve the value in apps/web and pass it in. Only next/link and ' +
                'next/image are allowed — they render on the client too.',
            },
            {
              // Next is DENIED BY DEFAULT with a two-entry allowlist, expressed as a regex
              // because `group`'s gitignore-style `!` negation is NOT honoured here —
              // measured: '!next/link' still blocked next/link.
              //
              // The first draft banned exactly the four specifiers the test probed
              // (next/headers, next/server, next/cache, server-only) and let `next/og` — a
              // server/edge-only API, and a plausible reach for a UI package building an OG
              // card — straight through. An allowlist cannot rot that way: a Next release
              // adding a server API is blocked on arrival, and the exemption is one visible
              // line. next/link and next/image stay because they render on the client too.
              regex: '^next(?!/link$|/image$)(/.*)?$',
              message:
                'packages/ui renders from props and CSS custom properties: no Next server ' +
                'APIs. Only next/link and next/image are allowed. Resolve the value in ' +
                'apps/web and pass it in.',
            },
            {
              // FR-018's "no IO" clause, derived rather than listed. The first draft paired
              // a general `node:*` glob with a hand-picked list of bare specifiers whose only
              // IO-relevant member was `fs` — the one the test happened to probe. Measured:
              // `node:http` was blocked while bare `https`, `net`, `stream` and
              // `worker_threads` were allowed, so a component could do network IO through
              // the gate that exists to forbid IO. This is feature 000's method-name lesson
              // again: a rule matching a form the problem does not take.
              //
              // builtinModules covers every bare builtin by construction; the `node:` globs
              // cover the prefixed spelling. No Node builtin is legitimate in a package that
              // must render in a browser, so the general rule is also the correct one.
              group: [...builtinModules, 'node:*', 'node:*/*'],
              message:
                'packages/ui does no IO. Node builtins belong in apps/web or in ' +
                'packages/ui/tests, which is outside this boundary on purpose.',
            },
          ],
        },
      ],
    },
  },
)
