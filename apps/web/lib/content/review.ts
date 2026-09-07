/**
 * The approval stamp: written **once per document, never cleared** (FR-009, SC-004, T028).
 *
 * This feature grants **no XP**. CLR-001 splits the two halves deliberately: the ledger is
 * append-only behind a `(tenant, user, action, ref)` idempotency key, and a guarantee authored
 * in one feature and maintained in another is a guarantee that quietly stops holding. So what
 * lands here is the *record that approval happened* — `aprovacaoRegistrada` and `aprovadoEm`,
 * in the same write as the transition — and feature 005 reads it to credit. Content approved
 * before 005 ships therefore credits correctly when 005 arrives, with no backfill.
 *
 * That makes 005's correctness a property of **this** function: it has no other way to tell a
 * first publication from a fourth. Two guards are needed, and SC-004's own sequence
 * (`publicado → rascunho → publicado` yielding one record) is what separates them:
 *
 *   1. **Entering `publicado`** — a status edit on a document that is already published, or a
 *      save that never reaches `publicado`, records nothing.
 *   2. **Not already stamped** — the republish in SC-004 *is* a fresh transition, so guard 1
 *      alone waves it through and stamps a second time. Only the document's own stamp refuses.
 *
 * **Deviation from plan § Sketch 5, on purpose.** The sketch returns `data` untouched once the
 * document is stamped. But `beforeChange` receives `data` from the request body, so an
 * unpublish carrying `aprovacaoRegistrada: false` erases the stamp — and the next publish,
 * finding nothing, credits a second time. That is SC-004 failing through the field rather than
 * through the transition. An existing stamp is therefore **re-asserted onto the outgoing
 * write** instead of merely left alone: "never cleared" is enforced here, not assumed of every
 * caller. Rewriting the same values is a no-op against the stored row, so the cost is nil.
 *
 * Pure and synchronous: no `payload.find/create/update` and no SQL, which keeps FR-024 intact —
 * the hook decides, the operation it is attached to does the writing.
 */

/** The review queue of FR-008. `evento` carries its own set and does not use this hook. */
export type ReviewStatus = 'rascunho' | 'em_revisao' | 'publicado'

/** The slice of a content document this hook reads; every content collection has it. */
export type ReviewableDoc = {
  status?: ReviewStatus | null
  /** Set on first entry into `publicado`. Feature 005's idempotency key (CLR-001). */
  aprovacaoRegistrada?: boolean | null
  /** ISO-8601, set with the flag and never re-dated. */
  aprovadoEm?: string | null
}

/**
 * The `beforeChange` arguments this hook reads. Payload passes a superset (`req`, `collection`,
 * `operation`, `context`); naming only these two keeps the function callable from a unit test
 * without fabricating a `PayloadRequest`, and `tests/content/stamp-approval.test.ts` pins the
 * assignability to `CollectionBeforeChangeHook` so the narrowing cannot break the wiring.
 *
 * `originalDoc` is `undefined` on create — a document posted straight into `publicado` is a
 * first approval and is stamped, which is also why guard 1 tolerates a missing original.
 */
type ApprovalWrite = {
  data: Partial<ReviewableDoc>
  originalDoc?: Partial<ReviewableDoc>
}

/**
 * @example
 * // In a collection config:
 * hooks: { beforeChange: [stampApproval] }
 */
export const stampApproval = ({ data, originalDoc }: ApprovalWrite): Partial<ReviewableDoc> => {
  if (originalDoc?.aprovacaoRegistrada === true) {
    return {
      ...data,
      aprovacaoRegistrada: true,
      // The stored date wins. `undefined` means "field not provided" to Payload, so a document
      // stamped without one (a row predating this hook) is left alone rather than invented for.
      aprovadoEm: originalDoc.aprovadoEm ?? data.aprovadoEm ?? undefined,
    }
  }

  const enteringPublicado = data.status === 'publicado' && originalDoc?.status !== 'publicado'
  if (!enteringPublicado) return data

  return { ...data, aprovacaoRegistrada: true, aprovadoEm: new Date().toISOString() }
}
