import type { CollectionBeforeValidateHook, Field, RelationshipField } from 'payload'
import { describe, expect, it } from 'vitest'

import { Curtida } from '../../collections/content/Curtida'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T043 / FR-017 — `curtida`: **curtir exige login; não há curtida anônima** (PO, 2026-08-24,
 * on record in `gamification.md` § Curtidas e social and in all four page specs).
 *
 * FR-015 and FR-017 sit deliberately beside each other and point in opposite directions:
 * a **download** is open and anonymous, a **like** is not. So the assertion that matters here
 * is not that the collection exists — it is that the two doors an anonymous like could come
 * through are both shut, and that a like which *is* written names an account:
 *
 *  - `create` access refuses a request with no `req.user`, and
 *  - `usuario` is a **required** relationship, so no row can exist without an account, and
 *  - the account is the **requester's**, stamped server-side rather than taken from the
 *    payload — otherwise "attribution is always to an account" holds while the client still
 *    chooses which one.
 *
 * The counter a visitor reads (`♥ n`) is the target document's own `curtidas` column
 * (`data-model.md` § Derived values), never a listing of these rows — which is why refusing
 * an anonymous *read* here costs the product nothing.
 *
 * Config-shape only, against the exported collection: `payload.config.ts` registration lands
 * with the registry entry in T044, because `registry.test.ts` fails the build whenever the
 * config and `SCOPE_REGISTRY` disagree in either direction — the two cannot land separately.
 */

const fieldNamed = (name: string): Field | undefined =>
  Curtida.fields.find((f) => (f as { name?: string }).name === name)

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = Curtida.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`curtida declares no ${operation} access; it would fall back to logged-in`)
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

/**
 * The attribution hook, reached **through the collection** rather than imported directly: a
 * hook that is written but never registered would pass every direct-call assertion and do
 * nothing in production (the lesson `review.test.ts` records for `stampApproval`).
 */
const attributionHook = (): CollectionBeforeValidateHook => {
  const [hook] = Curtida.hooks?.beforeValidate ?? []
  if (typeof hook !== 'function') {
    throw new Error(
      'curtida registers no beforeValidate hook: nothing binds the like to the requester, ' +
        'so a signed-in member can post a like attributed to any account they name',
    )
  }
  return hook as CollectionBeforeValidateHook
}

const runHook = async (args: Record<string, unknown>): Promise<Record<string, unknown>> =>
  (await attributionHook()(args as never)) as Record<string, unknown>

describe('curtida refuses the anonymous like (T043, FR-017)', () => {
  it('refuses an anonymous create — the door FR-017 exists to shut', async () => {
    expect(
      await decide('create', undefined),
      'an anonymous visitor can write a curtida row: FR-017 says the heart opens the ' +
        'sign-up invitation instead, and there is no anonymous like',
    ).toBe(false)
  })

  it('refuses an anonymous read — the public counter is the target document\'s own column', async () => {
    expect(await decide('read', undefined)).toBe(false)
  })

  it('answers a member with a query constraint, never a bare authorisation (FR-006)', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        'including who liked what in the other lab (FR-006)',
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('lets a maker like and unlike, scoped to their own lab', async () => {
    for (const operation of ['create', 'delete'] as const) {
      const result = await decide(operation, member(7, 'maker'))
      expect(result, `a maker was refused ${operation}: liking is not a team privilege`).not.toBe(
        false,
      )
      expect(
        JSON.stringify(result),
        `${operation} is not scoped to the maker's own lab`,
      ).toContain('7')
    }
  })

  it('refuses every update — a like is made or withdrawn, never re-attributed', async () => {
    expect(
      await decide('update', member(7, 'admin')),
      'update is open: the account a like is attributed to can be rewritten after the fact, ' +
        'which is the same forgery the create-time stamp exists to prevent',
    ).toBe(false)
  })
})

describe('curtida names the account that made it (T043, FR-017)', () => {
  it('requires usuario, so no row can exist without an account', () => {
    const usuario = fieldNamed('usuario') as RelationshipField | undefined

    expect(usuario, 'curtida declares no usuario: every like would be anonymous').toBeDefined()
    expect(usuario?.type).toBe('relationship')
    expect(
      usuario?.relationTo,
      'the like is attributed to the login, not to the per-lab profile: `req.user` is what ' +
        'proves someone is signed in, and mapping it to a perfilMaker would need a query',
    ).toBe('users')
    expect(
      usuario?.required,
      'usuario is optional — an anonymous like is then simply a like with no usuario, and ' +
        'FR-017 is enforced nowhere in the data',
    ).toBe(true)
    expect(
      usuario?.validate,
      'sameTenant on a relationship whose target is global measures a document against a ' +
        'tenant column that does not exist (data-model.md § Relationships that need sameTenant, ' +
        'which names the global side as the exception)',
    ).toBeUndefined()
  })

  it('stamps the requester over whatever account the payload named', async () => {
    const data = await runHook({
      data: { usuario: 4242, conteudo: { relationTo: 'projeto', value: 1 } },
      req: { user: { id: 7, collection: 'users' } },
      operation: 'create',
    })

    expect(
      data.usuario,
      'the client chose the account: a signed-in maker can manufacture likes attributed to ' +
        'anyone, so the counter stops measuring what people liked',
    ).toBe(7)
    expect(data.conteudo, 'the hook dropped the rest of the document').toEqual({
      relationTo: 'projeto',
      value: 1,
    })
  })

  it('leaves attribution alone when there is no session — the local API seeds this way', async () => {
    const data = await runHook({
      data: { usuario: 4242, conteudo: { relationTo: 'projeto', value: 1 } },
      req: {},
      operation: 'create',
    })

    expect(
      data.usuario,
      'the hook overwrote or refused a create with no session. Fixtures and seeds write ' +
        'through the Local API with overrideAccess and no user; the request-borne anonymous ' +
        'like is refused one layer up, by create access, which is the layer that sees requests',
    ).toBe(4242)
  })

  it('does not re-stamp on update, where there is nothing to attribute', async () => {
    const data = await runHook({
      data: { conteudo: { relationTo: 'projeto', value: 2 } },
      req: { user: { id: 7, collection: 'users' } },
      operation: 'update',
    })

    expect(data.usuario, 'an update invented an attribution the document never carried').toBeUndefined()
  })
})

describe('curtida joins an account to scoped content (T043, FR-003)', () => {
  it('is slugged curtida and labelled in PT-BR', () => {
    expect(Curtida.slug).toBe('curtida')
    expect(Curtida.labels?.singular).toBe('Curtida')
    expect(Curtida.labels?.plural).toBe('Curtidas')
  })

  it('relates to scoped content polymorphically, under sameTenant', () => {
    const conteudo = fieldNamed('conteudo') as RelationshipField | undefined

    expect(conteudo, 'curtida declares no conteudo: the like has no subject').toBeDefined()
    expect(conteudo?.required).toBe(true)
    // The **array** form, even while only `projeto` exists. The heart is on all four content
    // types (gamification.md § Curtidas e social), but FR-022's amendment is binding: a
    // `relationTo` naming a collection absent from the config throws `InvalidFieldRelationship`
    // — and the generated `CollectionSlug` union refuses it at typecheck first. Polymorphic
    // storage from row one is what makes `modelo3d`, `artigo` and `aula` a one-token addition
    // in T038–T040 rather than a column migration, so the shape is pinned here and the
    // membership is not.
    expect(
      Array.isArray(conteudo?.relationTo),
      'a single relationTo stores conteudo as a column; the other three content types then ' +
        'cannot be added without migrating it (FR-022 amendment)',
    ).toBe(true)
    expect(conteudo?.relationTo).toContain('projeto')
    expect(
      conteudo?.validate,
      'the content side is scoped, and spike S4c measured the plugin ACCEPTING a row in A ' +
        'pointed at a row in B. Without the shared validator a like crosses organizations ' +
        'and lands on another lab\'s counter (FR-007)',
    ).toBe(sameTenant)
  })

  it('takes criado_em from Payload\'s own timestamps rather than a second column', () => {
    expect(
      fieldNamed('criado_em') ?? fieldNamed('criadoEm'),
      'a hand-declared creation date beside the automatic createdAt gives the row two ' +
        'answers to one question, and only one of them is maintained',
    ).toBeUndefined()
    expect(Curtida.timestamps, 'timestamps are off: there is then no criado_em at all').not.toBe(
      false,
    )
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (Curtida.endpoints || []).some((e) => (e as { path?: string }).path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })

  it('writes no row to payload-locked-documents (FR-018, CLR-004)', () => {
    expect(Curtida.lockDocuments).toBe(false)
  })
})
