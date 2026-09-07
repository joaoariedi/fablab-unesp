import type { CollectionBeforeChangeHook } from 'payload'
import { describe, expect, it } from 'vitest'

import { stampApproval, type ReviewableDoc } from '../../lib/content/review'

/**
 * T028 / FR-009, SC-004 — approval is recorded **once per document, and never cleared**.
 *
 * This feature writes no XP (CLR-001). What it writes is the pair feature 005 will read to
 * decide whether a document has already been credited: `aprovacaoRegistrada` and `aprovadoEm`.
 * The append-only ledger lives over there; the *idempotency* of what it reads has to be
 * guaranteed here, because 005 has no other way to tell a first publication from the fourth.
 *
 * SC-004's sequence is `publicado → rascunho → publicado` yielding **one** record, and it is
 * the case that separates the two guards this hook needs. A `status` transition check alone
 * ("entering `publicado`") passes on the republish — it *is* a fresh transition — and stamps a
 * second time. Only reading the stamp already on the document refuses it. Both are asserted
 * below, and the republish case is asserted through the whole three-write sequence rather than
 * a single synthetic call, because that is the sequence the criterion names.
 *
 * **"Never cleared" is asserted against a hostile write, not only against forgetfulness.**
 * `beforeChange` receives `data` from the request body, so an unpublish that carries
 * `aprovacaoRegistrada: false` would erase the stamp — and the next publish, finding nothing,
 * would credit a second time. The plan's sketch (§ Sketch 5) returns `data` untouched on that
 * path, which leaves the hole open; this asserts the stamp survives the write instead. The
 * deviation is deliberate and recorded in the module docstring.
 *
 * Pure-function tests, no database. T033 owns the same guarantee driven through Payload's
 * Local API against real rows (`tests/content/review.test.ts`); this file pins the decision
 * logic itself so a failure there points at the wiring rather than at the rule.
 */

/** Payload's own args are a superset of what the hook reads; this is the wiring contract. */
const wireableIntoACollection: CollectionBeforeChangeHook = stampApproval

type Stamped = Partial<ReviewableDoc> & Record<string, unknown>

/** One write through the hook: what the request carries, over what is already stored. */
const write = (data: Stamped, originalDoc?: Stamped): Stamped =>
  stampApproval({ data, originalDoc }) as Stamped

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('stampApproval', () => {
  it('is assignable to a Payload beforeChange hook', () => {
    expect(wireableIntoACollection).toBe(stampApproval)
  })

  it('stamps on the first entry into publicado', () => {
    const result = write(
      { titulo: 'Bancada', status: 'publicado' },
      { titulo: 'Bancada', status: 'em_revisao' },
    )

    expect(result.aprovacaoRegistrada).toBe(true)
    expect(typeof result.aprovadoEm).toBe('string')
    expect(result.aprovadoEm as string).toMatch(ISO_8601)
    expect(Math.abs(Date.parse(result.aprovadoEm as string) - Date.now())).toBeLessThan(5_000)
    // The hook is a filter on the write, not a replacement for it.
    expect(result.titulo).toBe('Bancada')
    expect(result.status).toBe('publicado')
  })

  it('stamps a document created straight into publicado, where there is no originalDoc', () => {
    const result = write({ titulo: 'Suporte', status: 'publicado' })

    expect(result.aprovacaoRegistrada).toBe(true)
    expect(result.aprovadoEm as string).toMatch(ISO_8601)
  })

  it.each(['rascunho', 'em_revisao'] as const)('does not stamp a %s', (status) => {
    const result = write({ titulo: 'Rascunho', status }, { titulo: 'Rascunho', status: 'rascunho' })

    expect(result.aprovacaoRegistrada).toBeUndefined()
    expect(result.aprovadoEm).toBeUndefined()
  })

  it('does not restamp an edit to an already published document', () => {
    const stored: Stamped = {
      status: 'publicado',
      aprovacaoRegistrada: true,
      aprovadoEm: '2026-01-02T03:04:05.678Z',
    }

    const result = write({ titulo: 'Título corrigido', status: 'publicado' }, stored)

    expect(result.aprovadoEm).toBe('2026-01-02T03:04:05.678Z')
    expect(result.aprovacaoRegistrada).toBe(true)
  })

  it('SC-004: publicado → rascunho → publicado records approval exactly once', () => {
    // A stand-in for the row: each write is applied over it, the way Payload persists one.
    let stored: Stamped = { titulo: 'Luminária', status: 'rascunho' }
    const apply = (data: Stamped) => {
      stored = { ...stored, ...write(data, stored) }
    }

    apply({ status: 'publicado' })
    const firstApproval = stored.aprovadoEm
    expect(stored.aprovacaoRegistrada).toBe(true)
    expect(firstApproval as string).toMatch(ISO_8601)

    apply({ status: 'rascunho' })
    apply({ status: 'publicado' })

    // One record: the republish neither re-dated the stamp nor added a second one.
    expect(stored.aprovadoEm).toBe(firstApproval)
    expect(stored.aprovacaoRegistrada).toBe(true)
    expect(stored.status).toBe('publicado')
  })

  it('never clears the stamp, even when the incoming write asks it to', () => {
    const stored: Stamped = {
      status: 'publicado',
      aprovacaoRegistrada: true,
      aprovadoEm: '2026-01-02T03:04:05.678Z',
    }

    // The unpublish request body carries the cleared pair — feature 005 would then credit the
    // next publication a second time, which is exactly what SC-004 forbids.
    const result = write(
      { status: 'rascunho', aprovacaoRegistrada: false, aprovadoEm: null },
      stored,
    )

    expect(result.aprovacaoRegistrada).toBe(true)
    expect(result.aprovadoEm).toBe('2026-01-02T03:04:05.678Z')
    // The status change itself is the team's to make; only the stamp is immutable.
    expect(result.status).toBe('rascunho')
  })

  it('a cleared stamp on an unpublish cannot buy a second record on the republish', () => {
    let stored: Stamped = {
      titulo: 'Prensa',
      status: 'publicado',
      aprovacaoRegistrada: true,
      aprovadoEm: '2026-01-02T03:04:05.678Z',
    }
    const apply = (data: Stamped) => {
      stored = { ...stored, ...write(data, stored) }
    }

    apply({ status: 'rascunho', aprovacaoRegistrada: false, aprovadoEm: null })
    apply({ status: 'publicado' })

    expect(stored.aprovadoEm).toBe('2026-01-02T03:04:05.678Z')
    expect(stored.aprovacaoRegistrada).toBe(true)
  })
})
