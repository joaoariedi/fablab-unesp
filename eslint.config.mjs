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
)
