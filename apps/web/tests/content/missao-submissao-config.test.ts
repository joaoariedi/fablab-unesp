import type { Field, RelationshipField, SelectField } from 'payload'
import { describe, expect, it } from 'vitest'

import { MissaoSubmissao } from '../../collections/content/MissaoSubmissao'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T027 / FR-021, FR-023, FR-036 — `missaoSubmissao`, what a maker did about a mission.
 *
 * `missao` (T026) is the catalogue the team publishes; this is the other half, and the split
 * is what lets FR-024 show the same mission to a signed-out visitor with no personal
 * percentage at all. Four things are asserted here because each one costs something real if
 * it is shaped by habit instead of by the requirement:
 *
 *  - **`comprovante` is a `midiaImagem` RELATIONSHIP** (FR-036, CLR-006, 002's D3). A text
 *    key, a URL or a filename would be a second upload path for one collection — precisely
 *    what `midiaImagem` exists to prevent — and it would skip the presigned PUT, the
 *    post-upload verification and the size limits 002 already tested.
 *  - **`(missao, maker)` is a UNIQUE INDEX** (FR-023). "One submission per mission per maker,
 *    forever" is a database guarantee or it is nothing: a check in application code loses to
 *    two concurrent POSTs, which is the race `PendingInvites.ts` already paid for.
 *  - **The pair is immutable after the create.** The index refuses a *second* row; it cannot
 *    object to the existing row being re-pointed. CLR-015 says the row is one (mission,
 *    maker) **forever** — a reopened submission is the same row, so what the maker edits is
 *    the photo, never who submitted or what for.
 *  - **Only the team writes `aprovada` or `recusada`** (FR-021, FR-022). A maker who could
 *    write `aprovada` onto their own row would be one PATCH away from minting XP in whichever
 *    skill the mission names, with the approval hook (T029) doing the crediting for them.
 *    `enviada` stays the maker's, because CLR-015's reopen *is* the maker writing it.
 *
 * Config-shape only, against the exported collection, exactly as `missao-config.test.ts` and
 * `xp-ledger.test.ts` assert. The approval credit (T029), the reopen transition (T029b) and
 * the upload security review (T031) are their own tasks; registration in `payload.config.ts`
 * and `SCOPE_REGISTRY` land together in T028, where `registry.test.ts` diffs the two.
 */

const fieldNamed = (name: string): Field | undefined =>
  MissaoSubmissao.fields.find((f) => (f as { name?: string }).name === name)

/** Invokes a collection access function exactly as Payload does: whole args, `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = MissaoSubmissao.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(
      `missaoSubmissao declares no ${operation} access; it would fall back to logged-in, which ` +
        'authorises the verb and then leaks every row of every lab',
    )
  }
  return access({ req: { user } } as never)
}

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

/** Invokes a field access function the way Payload's field traversal does. */
const podeEscreverStatus = async (
  verbo: 'create' | 'update',
  user: unknown,
  status: string,
  docTenant?: number,
): Promise<boolean> => {
  const field = fieldNamed('status') as SelectField | undefined
  const access = field?.access?.[verbo]
  if (typeof access !== 'function') {
    throw new Error(
      `status declares no ${verbo} field access, so any signed-in maker of this lab may write ` +
        'aprovada onto their own submission and mint XP through the T029 credit hook',
    )
  }
  const data = { status, tenant: docTenant }
  const doc = verbo === 'update' ? { id: 5, status: 'enviada', tenant: docTenant } : undefined
  return (await access({ req: { user }, data, siblingData: data, doc } as never)) as boolean
}

describe('missaoSubmissao is one maker\'s attempt at one mission (T027, FR-021)', () => {
  it('is slugged missaoSubmissao and labelled in PT-BR, the lab team\'s review surface', () => {
    expect(MissaoSubmissao.slug).toBe('missaoSubmissao')
    expect(MissaoSubmissao.labels?.singular).toBe('Submissão de missão')
    expect(MissaoSubmissao.labels?.plural).toBe('Submissões de missões')
  })

  it('writes nothing to payload-locked-documents, which no plugin scopes', () => {
    // Each row of that internal collection names a document by collection and id and it is
    // not tenant-filtered (FR-018, CLR-004). Locking is ON by default — the predicate is
    // `lockDocuments !== false` — so the leak reopens by omission, never by an edit.
    expect(MissaoSubmissao.lockDocuments).toBe(false)
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (MissaoSubmissao.endpoints || []).some((e) => (e as { path?: string }).path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection; ' +
        'isolation.test.ts throws for a scoped collection that declares none',
    ).toBe(true)
  })

  it('declares no tenant field of its own — the multi-tenant plugin injects it', () => {
    expect(
      fieldNamed('tenant'),
      'a hand-declared tenant collides with the one the plugin injects, and the two disagree ' +
        'about which one access control filters on',
    ).toBeUndefined()
  })

  it('carries exactly missao, maker, comprovante and status', () => {
    expect(
      MissaoSubmissao.fields.map((f) => (f as { name?: string }).name).sort(),
      'the columns have drifted from the plan\'s shape. A missing one is a submission with no ' +
        'proof, no owner or no review state; an extra one is scope this task did not carry.',
    ).toEqual(['comprovante', 'maker', 'missao', 'status'])
  })
})

describe('missaoSubmissao: one row per mission per maker, at the database (FR-023)', () => {
  it('declares a UNIQUE compound index over (missao, maker)', () => {
    const indexes = (MissaoSubmissao.indexes ?? []) as { fields?: string[]; unique?: boolean }[]
    const pair = indexes.find(
      (index) =>
        index.unique === true && [...(index.fields ?? [])].sort().join(',') === 'maker,missao',
    )

    expect(
      pair,
      'nothing stops a second submission row for the same maker and mission, so FR-023 is a ' +
        'check somebody must remember to write rather than a constraint — and two concurrent ' +
        'POSTs beat any such check, exactly as PendingInvites measured',
    ).toBeDefined()
  })

  it('freezes missao and maker after the create — the row is that pair, forever (CLR-015)', () => {
    for (const nome of ['missao', 'maker'] as const) {
      const field = fieldNamed(nome) as RelationshipField | undefined
      const update = field?.access?.update

      expect(
        typeof update === 'function' ? update({} as never) : undefined,
        `${nome} is writable on update, so the unique index is satisfied while the row it ` +
          'constrains moves: a rejected submission can be re-pointed at another mission, or ' +
          'a lab-mate\'s row re-attributed to the requester so the T029 credit lands on them',
      ).toBe(false)
    }
  })
})

describe('missaoSubmissao access: the maker submits, the team reviews (FR-021)', () => {
  it('answers a member with a query constraint, never a bare authorisation (FR-006)', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        'including the other lab\'s submissions and the photos attached to them',
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader and an anonymous submitter', async () => {
    expect(await decide('read', undefined)).toBe(false)
    expect(
      await decide('create', undefined),
      'an anonymous POST creates a submission: FR-024\'s signed-out visitor sees the mission ' +
        'and an invitation to sign in, they do not submit one',
    ).toBe(false)
  })

  it('lets a maker create and update their own lab\'s submissions', async () => {
    // Submitting is the maker's own act — nobody approves it into existence — and CLR-015's
    // reopen is the maker editing the row they were rejected on.
    for (const operation of ['create', 'update'] as const) {
      const result = await decide(operation, member(3, 'maker'))

      expect(
        result,
        `a maker was refused ${operation}: FR-021 is "a maker submits a completion", and ` +
          'CLR-015 reopens the rejected row by having them edit it',
      ).not.toBe(false)
      expect(
        JSON.stringify(result),
        `${operation} is not scoped to the writer's own lab: one lab writes another's rows`,
      ).toContain('3')
    }
  })

  it('leaves deleting to the team — the row is the review history (CLR-015)', async () => {
    expect(
      await decide('delete', member(3, 'maker')),
      'a maker may delete their own submission, so "one row per mission per maker, forever" ' +
        'lasts until they delete it: the rejection disappears and the team member reviewing ' +
        'the next attempt cannot see that this is the second one',
    ).toBe(false)
    expect(await decide('delete', member(3, 'admin'))).not.toBe(false)
  })
})

describe('missaoSubmissao fields: the proof is a relationship (FR-036, CLR-006)', () => {
  it('declares missao as a required relationship to missao, same-tenant', () => {
    const missao = fieldNamed('missao') as RelationshipField | undefined

    expect(missao?.type).toBe('relationship')
    expect(missao?.relationTo).toBe('missao')
    expect(
      missao?.required,
      'a submission that names no mission is a row the review queue cannot title and the ' +
        'credit cannot resolve a skill from (FR-022)',
    ).toBe(true)
    expect(
      missao?.validate,
      'missao has no same-tenant validator: spike S4c measured the plugin ACCEPTING a write ' +
        'pointing at another lab\'s row, so a submission could complete a neighbour\'s mission',
    ).toBe(sameTenant)
  })

  it('declares maker as a required relationship to perfilMaker, same-tenant', () => {
    const maker = fieldNamed('maker') as RelationshipField | undefined

    expect(maker?.type).toBe('relationship')
    expect(
      maker?.relationTo,
      'the submitter is the scoped profile, not the global users row: XP is per profile per ' +
        'organization, and the credit (T029) has nowhere to land from a global account',
    ).toBe('perfilMaker')
    expect(
      maker?.required,
      'a submission with no maker is an approval with nobody to credit, and it also escapes ' +
        'the unique (missao, maker) pair — Postgres treats NULLs as distinct',
    ).toBe(true)
    expect(maker?.validate).toBe(sameTenant)
  })

  it('declares comprovante as a midiaImagem relationship — never a key, URL or filename', () => {
    const comprovante = fieldNamed('comprovante') as RelationshipField | undefined

    expect(
      comprovante?.type,
      'comprovante is not a relationship: a text key, a URL or a filename is a second upload ' +
        'path for one collection (CLR-006, 002 D3), skipping the presigned PUT, the ' +
        'post-upload verification and the size limits midiaImagem already carries',
    ).toBe('relationship')
    expect(comprovante?.relationTo).toBe('midiaImagem')
    expect(
      comprovante?.required,
      'the proof is optional, so a submission can reach the review queue with nothing for the ' +
        'reviewer to look at — FR-036 says a submission carries one photo',
    ).toBe(true)
    expect(
      comprovante?.validate,
      'comprovante has no same-tenant validator: a maker could attach another lab\'s image ' +
        'and the reviewer would open it from inside their own queue (spike S4c, FR-036)',
    ).toBe(sameTenant)
  })
})

describe('missaoSubmissao review state: only the team approves (FR-021, FR-022)', () => {
  const status = () => fieldNamed('status') as SelectField | undefined

  it('offers exactly enviada, aprovada and recusada, required, defaulting to enviada', () => {
    const values = (status()?.options ?? []).map((o) =>
      typeof o === 'string' ? o : (o as { value: string }).value,
    )

    expect(status()?.type).toBe('select')
    expect(
      values.slice().sort(),
      'the review states have drifted: the queue reviews submissions, whose vocabulary is ' +
        'enviada/aprovada/recusada — not the content queue\'s rascunho/em_revisao/publicado',
    ).toEqual(['aprovada', 'enviada', 'recusada'])
    expect(
      status()?.defaultValue,
      'a submission created with no status defaults to something other than `enviada`, so a ' +
        'maker\'s proof either skips the queue or never enters it',
    ).toBe('enviada')
    expect(
      status()?.required,
      'status is optional, so a row can carry null — invisible to `status = enviada` and to a ' +
        'not-equals audit alike, which is how a submission goes missing from the queue',
    ).toBe(true)
  })

  it('refuses a maker writing aprovada — on create and on update alike', async () => {
    for (const verbo of ['create', 'update'] as const) {
      expect(
        await podeEscreverStatus(verbo, member(3, 'maker'), 'aprovada', 3),
        `a maker may ${verbo} a submission already approved: FR-022 credits on approval, so ` +
          'they are one write away from minting XP in whichever skill the mission names, with ' +
          'the T029 hook doing the crediting for them',
      ).toBe(false)
    }
  })

  it('refuses a maker writing recusada — rejecting is the team\'s verb too', async () => {
    expect(await podeEscreverStatus('update', member(3, 'maker'), 'recusada', 3)).toBe(false)
  })

  it('lets the maker write enviada, because CLR-015\'s reopen is exactly that write', async () => {
    expect(
      await podeEscreverStatus('update', member(3, 'maker'), 'enviada', 3),
      'the maker cannot set their rejected row back to enviada, so the unique index bars them ' +
        'permanently after one rejection — which is not what a review queue is for (CLR-015)',
    ).toBe(true)
  })

  it('lets this lab\'s team approve, and refuses another lab\'s team', async () => {
    expect(
      await podeEscreverStatus('update', member(3, 'staff'), 'aprovada', 3),
      'the lab team cannot approve its own lab\'s submissions, so the review queue FR-021 ' +
        'names has no outcome',
    ).toBe(true)
    expect(
      await podeEscreverStatus('update', member(7, 'admin'), 'aprovada', 3),
      'a team member of lab 7 approved a submission of lab 3: being staff somewhere is not ' +
        'being staff here (the canPublishField reasoning, one collection over)',
    ).toBe(false)
  })
})
