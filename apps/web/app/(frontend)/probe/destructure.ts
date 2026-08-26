// PROBE 3 of SC-003 — MUST FAIL CI.
// `const { payload } = req` is an ObjectPattern, which a member-expression selector misses.
export async function leak(req: { payload: { find: (a: unknown) => Promise<unknown> } }) {
  const { payload } = req
  return payload.find({ collection: 'tenantCanaries' })
}
