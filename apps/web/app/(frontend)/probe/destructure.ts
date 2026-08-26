// PROBE 3 of SC-003 — MUST FAIL CI.
// `const { payload } = req` is an ObjectPattern in a declarator, not a member expression.
// An earlier, narrower selector missed exactly this shape — one keystroke from what a
// contributor naturally writes inside a hook.
export async function leak(req: { payload: { find: (a: unknown) => Promise<unknown> } }) {
  const { payload } = req
  return payload.find({ collection: 'tenantCanaries' })
}
