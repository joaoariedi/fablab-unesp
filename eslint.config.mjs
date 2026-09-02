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

/**
 * The tenancy fence's selectors, extracted so the colour fence below can re-state them.
 *
 * The extraction exists because of an ESLint flat-config rule that is easy to miss: when two
 * config objects both name `no-restricted-syntax`, the later one REPLACES the earlier one's
 * options — they are not merged. Both fences want that rule over `apps/web/**`, so whichever
 * block comes last must carry both lists or the other fence silently vanishes, with a green
 * `pnpm lint` and no diff anywhere near the code it stopped guarding.
 */
const TENANCY_SELECTORS = [
  // req.payload is a full unscoped client handed to every hook and route handler with
  // ZERO imports. Selectors are deliberately object-agnostic: an earlier draft scoped
  // this to `MemberExpression[object.name='req'][property.name='payload']`, which misses
  // `const { payload } = req` (an ObjectPattern, not a member expression) and
  // `args.req.payload` (where object.name is undefined because the object is itself a
  // member expression). Both are one keystroke from what a contributor naturally writes.
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
]

/**
 * The colour fence (FR-002, CLR-001) — the TypeScript half of it.
 *
 * FR-002 is "zero hexadecimal literals in any component": every colour has exactly one
 * definition, in `packages/ui/src/tokens/`, and everywhere else resolves it through `var()`.
 * CLR-001 adds the half that has no runtime symptom at all — `--color-rosa-raw` is the
 * *default value* of `--color-primary`, never an accent. A CTA painted with the raw pink
 * renders **identically** to a correct one for CITe, passes every test, and fails to co-brand
 * the moment a second organization exists. That is why the token carries a name that reads as
 * wrong at the call site, and why lint rejects it rather than a comment discouraging it.
 *
 * An import boundary cannot do this job — a hex is a *value*, not an import — so
 * `no-restricted-syntax` is the right instrument here for the same reason it was for
 * `req.payload` above.
 */
/**
 * A complete hex colour run, matched ANYWHERE in a string rather than as the whole of one.
 *
 * The first draft anchored the `Literal` selector (`/^#...$/`) so it fired only on a string
 * that is *nothing but* a colour, while the `TemplateElement` selector beside it was already
 * unanchored. The two therefore disagreed: the same colour was an error inside a backtick and
 * legal inside a quote. Measured against that config, all of
 *
 *   { boxShadow: '4px 4px 0 #191C37' }        { border: '1px solid #fff' }
 *   { background: 'linear-gradient(#EE703E, #F8C810)' }
 *   <div style={{ boxShadow: '4px 4px 0 #191C37' }} />
 *
 * produced ZERO findings. That is not a corner case: FR-006 specifies the primary button as a
 * "hard offset shadow", so a compound CSS value carrying a colour is the exact shape this
 * feature guarantees somebody writes, and an inline `style` object is the shortest path to it
 * inside a component. Neither the template selector nor the `.css` script (T007b, which does
 * not read `.tsx`) can see that shape, so it was guarded by nothing at all.
 *
 * The trailing boundary is what keeps the widening honest. Without it an unanchored match
 * finds a colour inside any LONGER hex run — a commit SHA, a content digest — and a fence
 * that fires on fingerprints is one contributors learn to blanket-disable. `#section-3` and
 * the other fragment hrefs are safe by construction: the characters after `#` are not hex.
 */
const HEX_COLOUR = '#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])'

const HEX_MESSAGE =
  'Colour literals belong in packages/ui/src/tokens (FR-002). Resolve the colour through a ' +
  'token instead — var(--color-navy), var(--color-laranja), … — and var(--color-primary) ' +
  'for anything an organization themes.'

const RAW_TOKEN_MESSAGE =
  '--color-rosa-raw is the PRIVATE default for --color-primary, never an accent (CLR-001). ' +
  'Use var(--color-primary): the raw pink renders identically for CITe, so this mistake is ' +
  'invisible until a second organization exists.'

const COLOUR_SELECTORS = [
  { selector: `Literal[value=/${HEX_COLOUR}/]`, message: HEX_MESSAGE },
  // NOT optional, and not symmetry. Round 2 ran the `Literal` selector and measured it
  // catching '#EE703E' while missing `#EE703E` and
  // `<style jsx>{`.chip{color:#EE703E}`}</style>` entirely. styled-jsx ships with Next — no
  // install, no import — so a template literal is a natural reach for component CSS, and it
  // is also invisible to the .css half of the fence (scripts/check-colour-tokens.sh), which
  // does not read .tsx. Without this selector that shape is guarded by nothing at all.
  { selector: `TemplateElement[value.raw=/${HEX_COLOUR}/]`, message: HEX_MESSAGE },
  { selector: 'Literal[value=/--color-rosa-raw/]', message: RAW_TOKEN_MESSAGE },
  { selector: 'TemplateElement[value.raw=/--color-rosa-raw/]', message: RAW_TOKEN_MESSAGE },
]

/**
 * The purity boundary's second instrument (FR-018) — the form `no-restricted-imports` is blind to.
 *
 * `no-restricted-imports` visits `ImportDeclaration` and `export … from`. A dynamic
 * `import()` is an `ImportExpression` and is neither, so every deny list in the
 * `packages/ui/src` block below is invisible to it **by construction**, not by oversight.
 * Measured before this existed: with all thirteen static probes red,
 * `await import('payload')`, `await import('next/headers')` and `await import('node:fs')`
 * in `packages/ui/src` produced ZERO findings.
 *
 * That is the worst shape a fence can have, because the dynamic form is exactly what a
 * contributor reaches for *after* the static one is refused — the lint error names the module
 * and says nothing about the syntax, so `await import(…)` reads like the sanctioned way to do
 * it. This is feature 000's method-name lesson a third time: the first attempt matched the
 * wrong specifiers, and the rule that replaced it still matched only one of the two forms the
 * problem takes.
 *
 * Stated as a general rule rather than as a second copy of the deny lists — a copy would
 * drift, and drift silently, since nothing makes two lists in two dialects agree. Inside
 * `packages/ui/src` a dynamic import must name a **relative** module: everything a relative
 * specifier can reach is itself under `src/**` and fenced by the same block, so nothing is
 * lost, and `React.lazy(() => import('./Heavy'))` — the reason the syntax exists — keeps
 * working. Both selectors match on `ImportExpression` itself rather than on its children, so
 * an import-attributes call (`import('./x.json', { with: { type: 'json' } })`) is judged by
 * its source and not by its options object.
 */
const PURITY_MESSAGE =
  'packages/ui does no IO and reaches no server API — a dynamic import() is not a way ' +
  'around that. Inside packages/ui/src a dynamic import must name a relative module ' +
  "(React.lazy(() => import('./Heavy')) still works). Resolve the value in apps/web and " +
  'pass it in as a prop or a CSS custom property.'

/**
 * The CommonJS spelling of the same reach — the fence's third blind spot, and the one the
 * widened `files` glob created.
 *
 * `no-restricted-imports` sees `ImportDeclaration`, `export … from` and `import x = require(…)`
 * (all three measured green). `PURITY_SELECTORS` above sees `ImportExpression`. A bare
 * `require(…)` is none of them — it is an ordinary `CallExpression` — so every deny list in
 * this file is blind to it by construction, exactly as they were blind to `await import(…)`.
 * Measured in `packages/ui/src` with all other probes red:
 *
 *   const p  = require('payload')       -> ZERO findings   (.cjs, .js AND .ts)
 *   const fs = require('node:fs')       -> ZERO findings
 *   const h  = require('next/headers')  -> ZERO findings
 *
 * `@typescript-eslint/no-require-imports` did fire on all of them, and that overlap is the
 * trap rather than the mitigation. It is a style rule about syntax: it names no alternative,
 * says nothing about the boundary, and the one-line fix a contributor writing legitimate
 * CommonJS reaches for is a targeted disable comment — after which the module reach is fenced
 * by nothing at all. A boundary that holds only because an unrelated rule happens to overlap
 * it is a coincidence, and coincidences are not what FR-018 promises.
 *
 * This form only became reachable when `files` widened past `*.{ts,tsx}`: `.cjs` and `.js` are
 * precisely where `require` is the natural spelling rather than an exotic one.
 *
 * `createRequire('node:module')` needs no clause of its own — `node:module` is a builtin and
 * is already denied by the `builtinModules` sweep, so the only way to obtain a `require` here
 * is the one this rule matches.
 */
const PURITY_REQUIRE_MESSAGE =
  'packages/ui does no IO and reaches no server API — require() is not a way around that. ' +
  'Inside packages/ui/src a require() must name a relative module. Resolve the value in ' +
  'apps/web and pass it in as a prop or a CSS custom property.'

const PURITY_SELECTORS = [
  { selector: 'ImportExpression[source.value=/^[^.]/]', message: PURITY_MESSAGE },
  {
    // A source that is not a plain string — a template literal, an identifier, a
    // concatenation — cannot be checked by anything, so it is refused rather than assumed
    // innocent. Leaving it out would reduce the rule above to a speed bump: `const m =
    // 'pay' + 'load'` is one line, and an allowlist that any variable defeats is not a
    // boundary. `packages/ui` has no legitimate need for a computed module specifier.
    selector: "ImportExpression:not([source.type='Literal'])",
    message: PURITY_MESSAGE,
  },
  // The two clauses above, restated for `require(…)`. Same shape and same reasoning: a
  // non-relative specifier is refused, and one that is not a plain string is refused because
  // nothing can check it. `require('./sibling')` stays legal — everything a relative
  // specifier can reach is itself under `src/**` and fenced by this same block, so refusing
  // it would buy nothing and cost the rule its credibility.
  {
    selector: "CallExpression[callee.name='require'][arguments.0.value=/^[^.]/]",
    message: PURITY_REQUIRE_MESSAGE,
  },
  {
    selector: "CallExpression[callee.name='require']:not([arguments.0.type='Literal'])",
    message: PURITY_REQUIRE_MESSAGE,
  },
]

/**
 * Stated ONCE because the colour fence was measured reading a shorter list than this one.
 *
 * The purity blocks below widened to every module extension after `.js`, `.mjs` and `.jsx`
 * were measured escaping them. The colour block still read `*.{ts,tsx}`, and the same
 * measurement over the same probes says the same thing about colour: in `apps/web`, a hex in
 * a `.mts`, `.cts`, `.js`, `.mjs` or `.cjs` file produced ZERO findings and a `.jsx` file was
 * not linted AT ALL, while the byte-identical `.ts` beside it was refused. FR-002 is "zero
 * hexadecimal literals in any component", and `.jsx` is the default spelling for a React
 * component outside TypeScript — not an exotic one.
 *
 * Two fences reading two lists is the shape that produced that hole, so there is now one
 * list. `packages/ui/tests/colour-fence.test.ts` asserts the probe set covers every extension
 * named here, so widening this string without probing the new spelling fails the suite.
 */
const MODULE_EXTENSIONS = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}'

/**
 * Where the purity boundary looks — the clause that was still an enumeration.
 *
 * The deny lists below are general on purpose (`builtinModules` rather than a hand-picked
 * list, a deny-by-default Next regex rather than four specifiers) because an enumeration
 * matches a form the problem does not take. `files` is an enumeration in exactly the same way,
 * and it read `*.{ts,tsx}`. Measured against that: in `packages/ui/src/`, `import 'payload'`
 * from a `.js` or `.mjs` file produced ZERO findings, the same import from a `.jsx` file was
 * not linted AT ALL, and `.mts`/`.cts` — TypeScript that ESLint does visit — reported nothing
 * from either fence. Every deny list still read as correct; nothing consulted them.
 *
 * `.jsx` is not an exotic spelling for a React package, it is the default one outside
 * TypeScript, and `.mjs`/`.cjs` are what a build helper or a codegen output lands as. So the
 * scope names every extension a module can carry, and the three blocks share one constant:
 * they must widen together, and two of them are `no-restricted-syntax` blocks that already
 * have to re-state each other's selectors — a third thing to keep in sync by hand is a fourth
 * silent hole.
 *
 * Extensions only — the DIRECTORY stays `src/**`. `packages/ui/tests/**` keeps `node:fs` and
 * `git ls-files`, which T011 needs; a widening that reached it would look identical in review.
 */
const UI_SRC_MODULES = `packages/ui/src/**/*.${MODULE_EXTENSIONS}`
const UI_TOKEN_MODULES = `packages/ui/src/tokens/**/*.${MODULE_EXTENSIONS}`
const WEB_MODULES = `apps/web/**/*.${MODULE_EXTENSIONS}`

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
  // The colour fence, TS half (FR-002, CLR-001). See COLOUR_SELECTORS above for why there
  // are four selectors rather than one.
  //
  // ORDER IS LOAD-BEARING: this block sits BEFORE the tenancy fence, and the tenancy fence
  // re-states COLOUR_SELECTORS. Flat config replaces a rule's options rather than merging
  // them, so for the apps/web files both blocks match, the LAST block's list is the whole
  // list. Placing this one second would have disarmed the tenancy fence across apps/web with
  // no visible symptom. `packages/ui/tests/colour-fence.test.ts` probes `req.payload` for
  // exactly that regression.
  //
  // EXEMPTIONS ARE PATHS, NOT DISABLES. `tokens/**` is the one place a colour may be written.
  // The two test directories must be able to do the forbidden thing: T016 needs two
  // organizations with DIFFERENT primaryColor hexes and T041's probe is a hex on purpose. The
  // tenancy fence below already exempts apps/web/tests/** for that same reason — the
  // precedent existed and round 3 found the first draft of this rule not following it. A path
  // stays visible in review; a per-line eslint-disable does not.
  // ---------------------------------------------------------------------------------------
  {
    files: [UI_SRC_MODULES, WEB_MODULES],
    ignores: [
      'packages/ui/src/tokens/**', // the one place a colour is defined
      'apps/web/tests/**', //         fixtures must be able to write a hex (T016)
      'packages/ui/tests/**', //      ditto: the fence's own probes live here
    ],
    rules: {
      'no-restricted-syntax': ['error', ...COLOUR_SELECTORS],
    },
  },

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

      // Both lists, deliberately. This block is the last one to name `no-restricted-syntax`
      // for most of apps/web, and flat config REPLACES rule options rather than merging them
      // — so listing only the tenancy selectors here would delete the colour fence from every
      // page and component in the app, silently. The colour block above still carries the
      // paths this block exempts (lib/tenancy, seed, payload.config.ts), which is why those
      // stay fenced for colour while being exempt for tenancy.
      'no-restricted-syntax': ['error', ...TENANCY_SELECTORS, ...COLOUR_SELECTORS],
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
    files: [UI_SRC_MODULES],
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
                // `server-only` is the explicit "this module may not reach the client"
                // marker; a component carrying it has already left the boundary. Next
                // itself is denied by default one entry down — this group holds no `next`
                // specifier on purpose, because an enumeration is what failed the first time.
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

  // ---------------------------------------------------------------------------------------
  // The same boundary, for the form `no-restricted-imports` cannot see: `await import(…)`.
  // See PURITY_SELECTORS above for what was measured and why the rule is general rather than
  // a second copy of the deny lists.
  //
  // WHY TWO BLOCKS, AND WHY THEY RE-STATE COLOUR_SELECTORS. Flat config REPLACES a rule's
  // options rather than merging them, and these blocks are the last ones to name
  // `no-restricted-syntax` over `packages/ui/src`. Naming only the purity selectors here
  // would delete the colour fence from every component in the package — `pnpm lint` green,
  // no diff anywhere near the code it stopped guarding. The tenancy fence carries the same
  // scar; this is the third block in the file to have to.
  //
  // The split exists because the two fences disagree about exactly one directory.
  // `src/tokens/**` is the one place a colour may be *written*, so the colour fence exempts
  // it — but tokens are also the most tempting place to read a palette off disk at build
  // time, so the purity clause has to reach in. One block cannot say both, and folding the
  // purity clause into the colour block would have quietly bought the exemption with it.
  // `packages/ui/tests/**` is outside both, per the scope note above.
  // ---------------------------------------------------------------------------------------
  {
    files: [UI_SRC_MODULES],
    ignores: ['packages/ui/src/tokens/**'],
    rules: {
      'no-restricted-syntax': ['error', ...PURITY_SELECTORS, ...COLOUR_SELECTORS],
    },
  },
  {
    files: [UI_TOKEN_MODULES],
    rules: {
      'no-restricted-syntax': ['error', ...PURITY_SELECTORS],
    },
  },
)
