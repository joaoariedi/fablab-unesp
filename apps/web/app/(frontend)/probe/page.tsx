// PROBE 1 of SC-003 — MUST FAIL CI.
// A page importing Payload's client directly, bypassing the choke point entirely.
// This is the shape the import boundary exists to stop.
import { getPayload } from 'payload'

import config from '@payload-config'

export default async function ProbePage() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'tenantCanaries' })
  return <pre>{JSON.stringify(docs)}</pre>
}
