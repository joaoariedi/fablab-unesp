import { after } from 'next/server'
import { createPayloadRequest } from 'payload'

import config from '@payload-config'
import { canInvite, resolveInvite } from '@/lib/tenancy'

/**
 * `POST /api/organizations/:id/invites` — org admin or master only (FR-021, FR-029, US8).
 *
 * **A Next Route Handler, not a Payload-config endpoint.** Payload 3's recommended place for
 * custom server logic, and — confirmed by spike S7 — where `after()` is actually available.
 *
 * **The response says nothing about what happened.** All three success paths return a
 * byte-identical `202`: membership added, already a member, or pending invite recorded. A
 * caller must not be able to learn whether an address already has an account, which is what
 * US8 forbids and SC-007 measures.
 *
 * **And it responds before doing the work.** An identical body is not enough on its own:
 * the three branches do different amounts of database work, so replying afterwards would
 * leak the branch through response *timing*. `after()` moves the work off the response path
 * entirely — spike S7 verified the callback runs after the response is sent and can still
 * read request state.
 */

/** Every success branch returns exactly this. Do not make it informative. */
const ACCEPTED = { ok: true } as const

const ROLES = new Set(['admin', 'staff', 'maker'])
const looksLikeEmail = (v: unknown): v is string =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = await ctx.params

  const req = await createPayloadRequest({ config, request })
  const user = req.user as { id?: string | number; role?: string; orgs?: [] } | null

  // Authorisation is resolved BEFORE the 202. A 403 deferred behind an accepted response
  // would be indistinguishable from success to the caller — and would mean an unauthorised
  // request still queued work.
  if (!canInvite(user, organizationId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { email?: unknown; role?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Corpo inválido: esperado JSON.' }, { status: 400 })
  }

  // Input-shape errors are safe to report: they describe the request, not the directory.
  if (!looksLikeEmail(body.email)) {
    return Response.json({ error: 'Informe um e-mail válido.' }, { status: 400 })
  }
  const role = typeof body.role === 'string' && ROLES.has(body.role) ? body.role : 'maker'
  const email = body.email

  after(async () => {
    try {
      const outcome = await resolveInvite({
        organizationId,
        email,
        role: role as 'admin' | 'staff' | 'maker',
        invitedBy: user?.id as string | number,
      })
      // Logged, never returned. This is the only place the branch is visible.
      console.info(`[invite] org=${organizationId} outcome=${outcome}`)
    } catch (err) {
      // The 202 has already been sent, so there is nobody left to tell. Feature 004 gains a
      // retry when a transport exists; until then a failure must be findable in the log
      // rather than silently dropped.
      console.error(`[invite] org=${organizationId} FAILED`, err)
    }
  })

  return Response.json(ACCEPTED, { status: 202 })
}
