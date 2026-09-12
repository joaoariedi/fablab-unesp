import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * CLR-011 / FR-024 — the boundary between what 004 ships and what it does not.
 *
 * ## Why a deferral gets a test
 *
 * `avatarRender` is written as `null` when the configuration changes. That is correct under
 * CLR-011 and indistinguishable, in every other suite, from the defect it used to be: T035's
 * guard asserted only that the key `avatarRender` was present in the write, which a composed
 * document id satisfies exactly as `null` does. So "we decided not to build this yet" and "we
 * forgot to build this" looked the same, and the second is what a reader will assume first.
 *
 * This file makes the decision the thing under test. It fails if somebody quietly starts
 * composing — which should be a deliberate change with its own spec amendment, not a surprise —
 * and it fails if the *reason* stops being recorded, because a deferral nobody can find is an
 * omission with better manners.
 *
 * ## Why the blocker is the interesting half
 *
 * FR-024 is not deferred for effort: `sharp` is already a dependency and the plan named it. It
 * is deferred because **there is no sprite art in this repository** — `avatarItem.sprite` and
 * `spriteFolhas` are relationships to `midiaImagem` documents nobody has uploaded, which is why
 * `docs/avatar-budget.md` records both sheets at 0 B. A compositor written today would be green
 * against an empty catalogue and would never have composed a real avatar.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8')

const SPEC = read('.specify/specs/004-contas-avatar/spec.md')
const TASKS = read('.specify/specs/004-contas-avatar/tasks.md')
const EDITOR = read('apps/web/app/(frontend)/minha-conta/avatar/page.tsx')

describe('the render is stored, not composed (CLR-011)', () => {
  it('clears `avatarRender` when the configuration changes, and composes nothing', () => {
    // The write that IS the deferral. A composed id here would mean FR-024's generation half
    // arrived without the decision being revisited.
    expect(
      /avatarRender:\s*null/.test(EDITOR),
      'the editor no longer clears `avatarRender`. If it now composes one, CLR-011 has been ' +
        'reversed and both it and this file should say so; if it simply stopped writing the ' +
        'column, a stale render survives a configuration change and every card shows the old ' +
        'avatar.',
    ).toBe(true)
  })

  it('does not reach for a compositor anywhere in the editor', () => {
    expect(
      /\bsharp\b/.test(EDITOR),
      'the editor imports `sharp`. Composing here would read sprite relationships that resolve ' +
        'to nothing, so it would produce an empty PNG and a green test.',
    ).toBe(false)
  })
})

describe('and the reason is on the record, where the next reader will look', () => {
  it('spec.md carries the clarification that amends FR-024', () => {
    expect(SPEC, 'CLR-011 is gone from the spec, so the null is undocumented again').toContain(
      'CLR-011',
    )
    expect(
      /sprite art/i.test(SPEC),
      'the clarification no longer says WHY. "Deferred" without the blocker reads as "nobody ' +
        'got to it", and the blocker is the part that decides when it can be picked up.',
    ).toBe(true)
  })

  it('tasks.md carries it as ⛔ work, outside the phase tables', () => {
    const fora = TASKS.slice(TASKS.indexOf('## Outstanding, and not executable by a run'))
    expect(fora, 'the § Outstanding section is gone').not.toBe('')
    expect(
      /T042 ⛔/.test(fora),
      'the compositor is not listed as outstanding. A ⛔ row inside a phase table deadlocks the ' +
        'run forever (003 § run 6), and no row at all means the work is simply lost.',
    ).toBe(true)
    expect(fora).toContain('ISS-003')
  })
})
