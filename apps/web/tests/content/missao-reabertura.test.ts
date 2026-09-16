import type { CollectionBeforeChangeHook } from 'payload'
import { describe, expect, it } from 'vitest'

import { MissaoSubmissao, reabrirRecusada } from '../../collections/content/MissaoSubmissao'

/**
 * T029b / FR-041, FR-023, SC-022, CLR-015 — **a rejected submission is reopened, never
 * replaced.**
 *
 * FR-023 keeps one `missaoSubmissao` row per (mission, maker) at the database, and T027 froze
 * `missao` and `maker` so the row cannot be re-pointed. Those two together are exactly what
 * makes a rejection permanent unless something reopens the row: the maker cannot create a
 * second submission (the unique index refuses it), cannot delete the first (`delete` is
 * `teamOnly`), and cannot move it to another mission. A review queue whose only outcome is
 * exile is not a review queue — CLR-015's words — so the transition `recusada → enviada` is
 * the whole of this task.
 *
 * **The trigger is the maker EDITING the proof, not merely saving the row.** `comprovante` is
 * the one field a maker may still write (FR-036 names one photo and nothing else; T027's
 * docstring records why no free-text note was smuggled in), so "the maker edits it" and "the
 * photo changed" are the same event. Tying the reopen to the edit rather than to any write is
 * what keeps a team member who opens and re-saves a rejected row from silently un-rejecting
 * it, and what keeps a reviewer approving a rejected row directly from being overwritten back
 * into the queue.
 *
 * Asserted against the hook the collection actually registers, not against a function that
 * exists beside it: a reopen written and never wired reopens nothing, and nothing in the type
 * system objects.
 */

type Doc = Record<string, unknown>

const MISSAO = 7
const MAKER = 42
const FOTO_RECUSADA = 55
const FOTO_NOVA = 56

/** A stored submission in whatever state the caller names. */
const armazenada = (status: string, comprovante: unknown = FOTO_RECUSADA): Doc => ({
  id: 11,
  missao: MISSAO,
  maker: MAKER,
  comprovante,
  status,
})

/**
 * Run every `beforeChange` hook the collection declares, the way Payload does, and return the
 * data the chain produced. All of them rather than the first: asserting against
 * `beforeChange[0]` would pass a reopen appended after an unrelated hook, or miss it entirely.
 */
const escrever = async (data: Doc, originalDoc?: Doc): Promise<Doc> => {
  let atual = data
  for (const hook of MissaoSubmissao.hooks?.beforeChange ?? []) {
    const saida = await (hook as CollectionBeforeChangeHook)({
      collection: MissaoSubmissao,
      context: {},
      data: atual,
      operation: originalDoc === undefined ? 'create' : 'update',
      originalDoc,
      req: {} as never,
    } as unknown as Parameters<CollectionBeforeChangeHook>[0])
    atual = (saida ?? atual) as Doc
  }
  return atual
}

describe('a rejected submission is reopened by the maker\'s edit (T029b, FR-041)', () => {
  it('registers a beforeChange hook at all — one written but never wired reopens nothing', () => {
    expect(
      MissaoSubmissao.hooks?.beforeChange ?? [],
      'the collection declares no beforeChange hook, so nothing can move a recusada row back ' +
        'to enviada and the unique index bars the maker permanently after one rejection',
    ).not.toHaveLength(0)
  })

  it('returns a recusada row to enviada when the maker attaches a new photo', async () => {
    const saida = await escrever(
      { comprovante: FOTO_NOVA },
      armazenada('recusada', FOTO_RECUSADA),
    )

    expect(
      saida.status,
      'the maker edited their rejected submission and it stayed recusada: the row never ' +
        're-enters the queue, and FR-023 forbids a second one (CLR-015)',
    ).toBe('enviada')
  })

  it('reopens the same row — it never re-points missao or maker', async () => {
    const saida = await escrever(
      { comprovante: FOTO_NOVA },
      armazenada('recusada', FOTO_RECUSADA),
    )

    expect(saida.missao, 'the reopen invented a missao on the write').toBeUndefined()
    expect(saida.maker, 'the reopen invented a maker on the write').toBeUndefined()
    expect(saida.comprovante).toBe(FOTO_NOVA)
  })

  it('compares the proof by id when the relationship arrives populated', async () => {
    const saida = await escrever(
      { comprovante: { id: FOTO_NOVA, alt: 'nova prova' } },
      armazenada('recusada', { id: FOTO_RECUSADA, alt: 'prova recusada' }),
    )

    expect(
      saida.status,
      'a populated relationship (depth > 0) was compared as an object, so a genuine new photo ' +
        'read as unchanged and the reopen never fired',
    ).toBe('enviada')
  })

  it('reopens a full-document save that carries the stored recusada back with it', async () => {
    // The admin UI PATCHes the whole document, so a maker's save names `status: 'recusada'`
    // — the value already stored. Field access drops it later (it is the team's verb), but
    // this hook runs before that, and a guard reading "the write names a status" would see
    // one and refuse to reopen exactly the case FR-041 is about.
    const saida = await escrever(
      { ...armazenada('recusada', FOTO_NOVA) },
      armazenada('recusada', FOTO_RECUSADA),
    )

    expect(saida.status).toBe('enviada')
  })

  it('leaves a rejected row rejected when the write changes nothing about the proof', async () => {
    const saida = await escrever({ comprovante: FOTO_RECUSADA }, armazenada('recusada'))

    // The write names no status, so the stored `recusada` survives untouched — which is the
    // outcome, and is not the same as the hook re-asserting it onto the write.
    expect(
      saida.status,
      'a save that did not touch the photo reopened the row anyway: a team member correcting ' +
        'a rejected submission would silently un-reject it, and the queue would grow rows ' +
        'nobody resubmitted',
    ).toBeUndefined()
  })

  it('lets the team approve a rejected row directly — an explicit status wins', async () => {
    const saida = await escrever(
      { comprovante: FOTO_NOVA, status: 'aprovada' },
      armazenada('recusada', FOTO_RECUSADA),
    )

    expect(
      saida.status,
      'the reopen overwrote a reviewer\'s aprovada with enviada, so a rejected submission can ' +
        'never be approved and T029 never credits it',
    ).toBe('aprovada')
  })

  it('never reopens a row that was not rejected', async () => {
    for (const estado of ['enviada', 'aprovada']) {
      const saida = await escrever(
        { comprovante: FOTO_NOVA },
        armazenada(estado, FOTO_RECUSADA),
      )

      expect(
        saida.status,
        `a ${estado} row was rewritten to enviada by an edit: an approved submission would ` +
          'return to the queue after it had already credited (FR-022)',
      ).toBeUndefined()
    }
  })

  it('touches nothing on a create — there is no rejection to reopen yet', async () => {
    const saida = await escrever({ ...armazenada('enviada', FOTO_NOVA) })

    expect(saida.status).toBe('enviada')
  })

  it('is assignable to CollectionBeforeChangeHook, so the wiring cannot drift', () => {
    const hook: CollectionBeforeChangeHook = reabrirRecusada
    expect(typeof hook).toBe('function')
  })
})
