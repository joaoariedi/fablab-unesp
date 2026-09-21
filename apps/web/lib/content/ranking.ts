/**
 * What the ranking IS, for every surface that draws or reads it.
 *
 * **Why this is a module and not two constants on the page.** They lived on
 * `app/(frontend)/ranking/page.tsx` until feature 006, and two things then imported them: the
 * Home, for the `VER RANKING COMPLETO` link, and `lib/tenancy/public-payload.ts`, for the order
 * `readPublicRanking` must not retype. The second is the one that matters — a **library**
 * importing a Next **route module** drags the page's metadata export, its imports and its
 * rendering into the tenancy door, and inverts the dependency the whole layer is built on.
 *
 * `tests/content/missoes-model.test.ts` § T019 is the rule that caught it: *"neither page imports
 * the other"*, written for `/missoes` and the Home and true of any route. A constant a second
 * surface needs is a constant that never belonged on a page.
 */

/** Where the full board lives. The Home's card footer links here (FR-020). */
export const RANKING_PATH = '/ranking'

/**
 * The declared order (FR-013). Named, because it is the requirement — a literal retyped at a
 * second call site is a second ranking free to disagree with this one.
 *
 * **An array, and the comma-joined string it replaced was not a multi-key sort at all.** Payload
 * splits on `,` only in `sanitizeSortParams`, which is wired into the REST layer; the local API
 * an RSC reaches calls `sanitizeSortQuery`, which does not split. `@payloadcms/drizzle`'s
 * `buildOrderBy` then wraps the whole string in an array, fails to resolve a column named
 * `xpTotal,handle`, swallows the failure in a bare `catch (_) { continue }`, and leaves the
 * `-createdAt` it pushes before the loop. The board listed the **newest profile first** — not by
 * XP, and with no tie-break — and FR-013 was met in no part.
 *
 * It passed its own test because the fake in `ranking-page.test.ts` split the comma. The witness
 * is `tests/public/ranking-ordem.test.ts`, which asks a real Postgres on a fixture built so the
 * `-createdAt` fallback returns the exact opposite of the right answer.
 */
export const ORDENACAO_DO_RANKING = ['-xpTotal', 'handle']
