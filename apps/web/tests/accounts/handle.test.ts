import { describe, expect, it } from 'vitest'

import { foldToHandle } from '../../lib/accounts/handle'

/**
 * T018 / FR-010, CLR-002 — **the handle fold: ASCII, lowercase, letters only**.
 *
 * CLR-002: *"fold the name to ASCII lowercase and drop everything that is not a letter —
 * `Maria Silva` → `mariasilva`, `João D'Ávila` → `joaodavila`"*. Only the *fold* is this
 * task's subject; the collision suffix and the unique index belong to T019/T020 and this
 * file deliberately says nothing about either.
 *
 * ── Why a table, and why these rows ────────────────────────────────────────────────────────
 *
 * The function is three transformations composed — decompose, lowercase, filter — and each is
 * invisible in the output of a name that does not exercise it. So every row is chosen to die
 * if one of them is dropped:
 *
 * - Drop `normalize('NFD')` and a precomposed `Á` is not a letter in the ASCII range, so it is
 *   filtered out whole: `D'Ávila` → `dvila`, not `davila`. The accented rows are the only
 *   thing standing between this and a fold that silently eats a fifth of Brazilian names.
 * - Drop `toLowerCase()` and every capital goes with it: `Maria` → `aria`.
 * - Lowercase *before* stripping marks would still pass — but filtering before decomposing
 *   would not, which is why the accented rows carry both cases (`Ávila`, `ávila`).
 * - Drop the final `[^a-z]` filter and spaces, apostrophes and digits survive into the URL.
 *
 * ── The cases that are consequences, not decisions ─────────────────────────────────────────
 *
 * `ß` and non-Latin scripts have no ASCII letter to fold to — NFD does not decompose them —
 * so they vanish, and a name written entirely in one of them folds to `''`. That is a real
 * outcome of "ASCII letters only" rather than an oversight, and it is asserted here so that
 * the caller's problem is visible: an empty base handle is a collision magnet the moment two
 * such names exist. Adjudicating it is the insert's job (T020), not the fold's — the fold
 * stays total and pure, and returns exactly what the rule says it returns.
 */
describe('foldToHandle', () => {
  const cases: ReadonlyArray<readonly [name: string, expected: string, why: string]> = [
    ['Maria Silva', 'mariasilva', 'the spec worked example: space dropped, all lowercase'],
    ["João D'Ávila", 'joaodavila', 'the spec worked example: tilde, acute and apostrophe folded'],
    ['ÁÉÍÓÚÀÂÃÇÑ', 'aeiouaaacn', 'uppercase accents decompose, then lowercase'],
    ['áéíóúàâãçñ', 'aeiouaaacn', 'lowercase accents decompose the same way'],
    ['Ana-Clara Übel', 'anaclaraubel', 'hyphen dropped, umlaut folded'],
    ['Maria 2 Silva', 'mariasilva', 'digits are not letters'],
    ['  Ana  ', 'ana', 'surrounding whitespace is dropped like any non-letter'],
    ['', '', 'the empty name folds to the empty handle rather than throwing'],
    ['123 !@#', '', 'a name with no letters at all yields no handle'],
    ['Straße', 'strae', 'ß has no ASCII letter to fold to, so it is dropped'],
    ['Мария', '', 'a non-Latin script leaves nothing in the ASCII range'],
  ]

  it.each(cases)('folds %j to %j — %s', (name, expected) => {
    expect(foldToHandle(name)).toBe(expected)
  })

  it('is pure: the same name folds to the same handle every time', () => {
    const name = "João D'Ávila"
    expect(foldToHandle(name)).toBe(foldToHandle(name))
    expect(name).toBe("João D'Ávila")
  })

  it('is idempotent: folding an already-folded handle changes nothing', () => {
    const once = foldToHandle('Maria Silva')
    expect(foldToHandle(once)).toBe(once)
  })
})
