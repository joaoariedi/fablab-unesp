import { sql } from '@payloadcms/db-postgres'
import {
  getPayload,
  type Field,
  type NumberField,
  type Payload,
  type RelationshipField,
  type SelectField,
  type TextField,
} from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ACOES_XP,
  composeIdempotencyKey,
  REF_TIPOS_XP,
  XpLedger,
} from '../../collections/content/XpLedger'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T006 / FR-001, FR-002 — `xpLedger`, the append-only record every XP number is derived from.
 *
 * CLR-001 made this collection the source of truth: `perfilMaker.xpTotal`, each skill's level,
 * the Nível do Lab and the ranking are **projections**, reconcilable against these rows at any
 * time, and when a projection disagrees with the ledger the ledger is right. That only buys
 * something while the ledger cannot be rewritten, which is why the two properties asserted
 * hardest below are the ones a later edit would quietly remove:
 *
 *  - **Append-only is an ACCESS RULE, not a convention.** `update` and `delete` answer a flat
 *    `false` — to a maker, to the lab team, and to a master. A `teamOnly()` here would read
 *    like caution and would in fact hand the team the ability to edit history that FR-001 says
 *    nobody has; a constraint (a `Where`) would *authorise* the verb and merely narrow the rows.
 *    The refusal is asserted as `false` itself for exactly that reason.
 *  - **`refTipo` and `refId` are SCALARS**, and that is the one shape decision that would
 *    otherwise cost the constitution its own clause. `Curtida.ts` measured why: Payload
 *    expresses compound uniqueness as `indexes: [{ fields, unique: true }]` over *columns of
 *    the row*, and a polymorphic relationship lives in the **relationships join table**, where
 *    there is no column pair to constrain — *"until then a double POST writes two rows"*. A
 *    polymorphic `ref` here would put FR-003's unique index somewhere Postgres cannot build it,
 *    and idempotency (constitution Principle 3, verbatim) would degrade from a database
 *    guarantee into an application-code check.
 *
 * `chaveIdempotencia` is the text column that makes the index buildable at all — one column of
 * the row carrying `(tenant, perfil, acao, refTipo, refId)`. **T007** adds the unique index and
 * the `beforeValidate` that composes it; this task declares the column, and asserts the one
 * property T007 cannot add later without a migration: it is **required**, because Postgres
 * treats NULLs as distinct and a nullable key column would let unlimited unkeyed rows through
 * the very index meant to refuse them.
 *
 * Config-shape only, against the exported collection. `payload.config.ts` registration and the
 * `SCOPE_REGISTRY` entry land together in **T009** — `registry.test.ts` diffs the two in both
 * directions — and the database-level proofs (the `23505` on a duplicate, T011) arrive with the
 * migration. Same vantage point `regras-xp.test.ts` and `skill.test.ts` assert from.
 */

const fieldNamed = (name: string): Field | undefined =>
  XpLedger.fields.find((f) => (f as { name?: string }).name === name)

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = XpLedger.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`xpLedger declares no ${operation} access; it would fall back to logged-in`)
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

const master = { id: 1, collection: 'users', role: 'master' }

/** Everyone who can hold a session, so a refusal asserted over this list has no exception. */
const TODOS = [undefined, member(1, 'maker'), member(1, 'staff'), member(1, 'admin'), master]

describe('xpLedger is the scoped record the projections are derived from (T006, FR-001)', () => {
  it('is slugged xpLedger and labelled in PT-BR, because the admin is the team\'s surface', () => {
    expect(XpLedger.slug).toBe('xpLedger')
    expect(XpLedger.labels?.singular).toBe('Registro de XP')
    expect(XpLedger.labels?.plural).toBe('Registros de XP')
  })

  it('writes nothing to payload-locked-documents, which no plugin scopes', () => {
    // Same switch, same reason, as every other scoped collection: each row of that internal
    // collection names a document by collection and id, and it is not tenant-filtered
    // (FR-018, CLR-004). Locking is ON by default — the predicate is `lockDocuments !== false`
    // — so the leak reopens by omission.
    expect(XpLedger.lockDocuments).toBe(false)
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (XpLedger.endpoints || []).some((e) => (e as { path?: string }).path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection; ' +
        'isolation.test.ts throws for a scoped collection that declares none, and FR-035 asks ' +
        'for a vantage point on the ledger specifically',
    ).toBe(true)
  })

  it('declares no tenant field of its own — the multi-tenant plugin injects it', () => {
    expect(
      fieldNamed('tenant'),
      'a hand-declared tenant collides with the one the plugin injects, and the two disagree ' +
        'about which one access control filters on',
    ).toBeUndefined()
  })
})

describe('xpLedger access: readable and writable in scope, never editable (FR-001)', () => {
  it('answers a member with a query constraint, never a bare authorisation (FR-006)', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks — ' +
        'here the other lab\'s entire XP history (FR-029)',
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader: a ledger says who earned what, and when', async () => {
    expect(await decide('read', undefined)).toBe(false)
  })

  it('scopes create, so a credit lands in the lab whose action caused it', async () => {
    const result = await decide('create', member(7, 'maker'))

    expect(
      result,
      'create is refused for a signed-in maker: creditXp writes through the tenant client with ' +
        'the causing write\'s own req (FR-004), so a refusal here stops every credit',
    ).not.toBe(false)
    expect(
      JSON.stringify(result),
      'create is not scoped to the writer\'s own lab: an action at one lab could write an entry ' +
        'into another\'s ledger, and XP would sum between organizations (FR-029)',
    ).toContain('7')
  })

  it('refuses an anonymous create — nothing earns XP without a session', async () => {
    expect(await decide('create', undefined)).toBe(false)
  })

  it('refuses UPDATE to everyone, including the team and a master (FR-001)', async () => {
    for (const user of TODOS) {
      expect(
        await decide('update', user),
        'update is open on the ledger: history can be rewritten, and every projection that ' +
          'reconciles against it (CLR-001) is reconciling against something editable. ' +
          'Append-only is an ACCESS RULE — a flat false, not a narrowed row set',
      ).toBe(false)
    }
  })

  it('refuses DELETE to everyone, including the team and a master (FR-001)', async () => {
    for (const user of TODOS) {
      expect(
        await decide('delete', user),
        'delete is open on the ledger: an entry can be removed, and the maker\'s total, the ' +
          'skill level and the Nível do Lab all silently drop with it — while FR-015 promises ' +
          'that removing a skill moves nobody\'s XP',
      ).toBe(false)
    }
  })
})

describe('every entry records who, what, which content and how much (FR-002)', () => {
  it('names exactly the seven columns FR-002 requires', () => {
    const declared = XpLedger.fields.map((f) => (f as { name?: string }).name)

    expect(
      [...declared].sort(),
      'the ledger\'s columns have drifted from FR-002 — organization (injected), profile, ' +
        'action, the content referred to, the skill credited, the amount, and when',
    ).toEqual([
      'acao',
      'chaveIdempotencia',
      'perfil',
      'quantidade',
      'refId',
      'refTipo',
      'skill',
    ])
  })

  it('answers "when" with Payload\'s own createdAt rather than a second column', () => {
    // The `curtida` precedent, verbatim: `criado_em` "is Payload's automatic `createdAt`
    // (`timestamps` defaults to true), not a second column: two answers to one question, of
    // which only one would be maintained." CHK019 asked whether that is precise enough to
    // order two credits in the same second — it is `timestamp(3) with time zone`, and the
    // serial `id` breaks a tie inside the same millisecond, so SC-019's reconstruction has a
    // total order without a column anybody has to remember to write.
    expect(
      fieldNamed('criadoEm'),
      'a hand-declared criadoEm sits beside createdAt: two answers to "when did this credit ' +
        'happen", of which only one is maintained by Payload',
    ).toBeUndefined()
    expect(
      XpLedger.timestamps,
      'timestamps are switched off, so the ledger records no time at all and FR-002\'s "when" ' +
        'has nowhere to live',
    ).not.toBe(false)
  })

  it('relates perfil to perfilMaker and leaves it NULLABLE (CLR-011, FR-040)', () => {
    const perfil = fieldNamed('perfil') as RelationshipField | undefined

    expect(perfil?.type).toBe('relationship')
    expect(perfil?.relationTo).toBe('perfilMaker')
    expect(
      perfil?.required,
      'perfil is required, so erasing a profile can only DELETE its entries — which breaks ' +
        'append-only and moves the Nível do Lab. CLR-011 decided the entry survives with ' +
        'perfil null, exactly as 004\'s tombstone leaves the content',
    ).not.toBe(true)
    expect(
      perfil?.validate,
      'perfil does not carry the shared sameTenant: an entry could credit a profile of another ' +
        'lab, which is FR-030 and the one thing spike S4c measured the plugin ACCEPTING',
    ).toBe(sameTenant)
  })

  it('relates skill to the catalogue and leaves it nullable (FR-039, CLR-009)', () => {
    const skill = fieldNamed('skill') as RelationshipField | undefined

    expect(skill?.type).toBe('relationship')
    expect(skill?.relationTo).toBe('skill')
    expect(
      skill?.required,
      'skill is required, so a publication that names none (FR-039 makes it nullable on all ' +
        'four publishables) could not be credited at all — the maker\'s total would be lost ' +
        'with the skill\'s',
    ).not.toBe(true)
    expect(skill?.validate).toBe(sameTenant)
  })

  it('records the action as a select over exactly the five of FR-006', () => {
    const acao = fieldNamed('acao') as SelectField | undefined
    const values = (acao?.options ?? []).map((o) => (o as { value?: string }).value)

    expect(acao?.type).toBe('select')
    expect(acao?.required).toBe(true)
    expect(
      [...values].sort(),
      'the credited actions have drifted from FR-006: watch a class to 100%, publish a project, ' +
        'publish a 3D model, publish an article, complete a mission — and nothing else',
    ).toEqual([...ACOES_XP].sort())
    expect(ACOES_XP).toHaveLength(5)
  })

  it('offers no action for a like or an event, which award nothing (FR-008, CLR-012)', () => {
    // CLR-012 caught this before a line was written: `evento` carries `aprovacaoRegistrada`
    // exactly like the four publishables, so "register the credit on the reviewable
    // collections" would have credited event publication. A value here is what an author of
    // T017 would reach for — its absence is the refusal.
    for (const proibida of ['curtir', 'curtida', 'publicar_evento', 'evento', 'presenca']) {
      expect(
        (ACOES_XP as readonly string[]).includes(proibida),
        `"${proibida}" is a creditable action: FR-008 gives likes and calendar attendance no XP, ` +
          'and CLR-012 keeps the credit hook off evento',
      ).toBe(false)
    }
  })

  it('stores the reference as SCALARS, never a polymorphic relationship', () => {
    const refTipo = fieldNamed('refTipo') as SelectField | undefined
    const refId = fieldNamed('refId') as NumberField | undefined

    // The measurement is `Curtida.ts`'s, and it cost that collection its idempotency: a
    // polymorphic relationship is stored in the relationships JOIN TABLE, so there is no
    // column pair on the row for `indexes: [{ fields, unique: true }]` to constrain. FR-003's
    // index would have nowhere to be built.
    expect(
      refTipo?.type,
      'refTipo is not a select: if the reference became a polymorphic relationship, the unique ' +
        'index of FR-003 could not be built over columns of the row, and idempotency — ' +
        'constitution Principle 3, verbatim — would become an application-code check',
    ).toBe('select')
    expect(refTipo?.required).toBe(true)
    expect(
      (refTipo?.options ?? []).map((o) => (o as { value?: string }).value).sort(),
    ).toEqual([...REF_TIPOS_XP].sort())

    expect(
      refId?.type,
      'refId is not a number: the other half of the reference must be a column of the row too, ' +
        'or the pair is unconstrainable',
    ).toBe('number')
    expect(
      refId?.required,
      'refId is optional: an entry that names no content cannot be deduplicated against the ' +
        'next credit for the same content (FR-025)',
    ).toBe(true)
  })

  it('records the amount as a required number with no max (FR-043)', () => {
    const quantidade = fieldNamed('quantidade') as NumberField | undefined

    expect(quantidade?.type).toBe('number')
    expect(
      quantidade?.required,
      'quantidade is optional, so an entry can answer undefined and every sum over the ledger ' +
        'becomes NaN — the projection of CLR-001 reconciling against nothing',
    ).toBe(true)
    expect(
      quantidade?.max,
      'quantidade carries a max: the cap is a RULE, applied in packages/game and nowhere else ' +
        '(FR-043, CLR-010), and a column ceiling makes retuning the economy a migration',
    ).toBeUndefined()
  })

  it('declares chaveIdempotencia as a REQUIRED text column (FR-003)', () => {
    const chave = fieldNamed('chaveIdempotencia') as TextField | undefined

    expect(chave?.type).toBe('text')
    // Load-bearing, and the one property T007 cannot add afterwards without a migration:
    // Postgres treats NULLs as distinct in a unique index, so a nullable key column lets
    // unlimited unkeyed rows past the very index meant to refuse the second one.
    expect(
      chave?.required,
      'chaveIdempotencia is nullable: Postgres considers NULLs distinct, so the unique index ' +
        'T007 adds would refuse nothing for every row that omits the key',
    ).toBe(true)
    expect(
      chave?.admin?.readOnly,
      'chaveIdempotencia is editable in the admin: a human retyping the key defeats the ' +
        'unique index by hand. It is composed by the system (T007), never entered',
    ).toBe(true)
  })
})

/**
 * T007 / FR-003, SC-002 — the unique index, and the hook that fills the column it constrains.
 *
 * Constitution Principle 3, verbatim: `idempotencyKey = (tenant, user, action, ref)`. T006
 * declared `chaveIdempotencia` as a required text column and deliberately left both halves of
 * the guarantee to this task, because a key constrained before anything composes it refuses
 * rows for a reason no caller can act on.
 *
 * **Two halves, and neither is sufficient alone.**
 *
 *  - The **unique index** is the guarantee. `creditXp` (T015) catches the duplicate as the
 *    success path of idempotency, which is the race-free shape: check-then-insert reads zero
 *    rows twice under concurrency and inserts twice — the exact defect `PendingInvites.ts`
 *    records paying for. The database-level proof (a duplicate insert answering `23505`) is
 *    T011's, once the migration exists; what is assertable here is that the index is
 *    *declared*, because a migration is generated from this config and an index nobody
 *    declared is one Postgres never builds.
 *  - The **`beforeValidate`** is what makes the column trustworthy. The index constrains one
 *    text column, so its teeth are only as good as what is written into it: a caller that
 *    composed the tuple with a field missing — or in a different order, or without the tenant
 *    — would write a key that collides with nobody and be credited twice through an index that
 *    refused nothing. Hence "so no caller can get the tuple wrong": the hook **overwrites**
 *    whatever the payload offered rather than trusting it.
 *
 * The hook is resolved through `XpLedger.hooks.beforeValidate` rather than imported by name,
 * on purpose (preamble item 1): a hook that exists and is not registered is a module with a
 * test and no caller, and it would leave every row keyed by whatever the caller sent.
 */

/** Runs the collection's registered beforeValidate chain exactly as Payload does. */
const runBeforeValidate = async (
  data: Record<string, unknown>,
  operation: 'create' | 'update' = 'create',
  originalDoc?: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const hooks = XpLedger.hooks?.beforeValidate ?? []
  expect(
    hooks.length,
    'xpLedger registers no beforeValidate hook: chaveIdempotencia is required, so every ' +
      'create would either fail validation or carry a key the caller composed itself — and ' +
      'the unique index of FR-003 can only be as correct as that key',
  ).toBeGreaterThan(0)

  let current = data
  for (const hook of hooks) {
    const produced = await hook({ data: current, operation, originalDoc, req: {} } as never)
    if (produced !== undefined) current = produced as Record<string, unknown>
  }
  return current
}

/** The key a create with this tuple ends up carrying. */
const keyFor = async (data: Record<string, unknown>): Promise<unknown> =>
  (await runBeforeValidate(data)).chaveIdempotencia

/** A complete, valid credit: the article approval of US1. */
const CREDITO = {
  tenant: 1,
  perfil: 42,
  acao: 'publicar_artigo',
  refTipo: 'artigo',
  refId: 7,
  quantidade: 1,
}

describe('the unique index on chaveIdempotencia (T007, FR-003, SC-002)', () => {
  it('declares a UNIQUE index over the key column, which is what refuses the second credit', () => {
    const indexes = (XpLedger.indexes ?? []) as { fields?: string[]; unique?: boolean }[]

    expect(
      indexes.some(
        (i) =>
          i.unique === true &&
          Array.isArray(i.fields) &&
          i.fields.length === 1 &&
          i.fields[0] === 'chaveIdempotencia',
      ),
      'no unique index on chaveIdempotencia: the migration is generated from this config, so ' +
        'an index nobody declares is one Postgres never builds — and idempotency (constitution ' +
        'Principle 3, verbatim) degrades from a database guarantee into an application-code ' +
        'check that two concurrent approvals both pass. SC-002 asks for the 23505',
    ).toBe(true)
  })
})

describe('the beforeValidate composes the key so no caller can get the tuple wrong (T007)', () => {
  it('fills chaveIdempotencia on create, from a payload that names none', async () => {
    const key = await keyFor({ ...CREDITO })

    expect(typeof key, 'chaveIdempotencia is not composed: the column is required, so every ' +
      'credit fails validation and nothing is ever credited').toBe('string')
    expect(key as string).not.toHaveLength(0)
  })

  it('is deterministic — the same tuple composes the same key, which is what collides', async () => {
    expect(await keyFor({ ...CREDITO })).toBe(await keyFor({ ...CREDITO }))
  })

  it('carries ALL FIVE components: change any one and the key changes', async () => {
    // Each variation below is a *different* credit that must be allowed to exist. If a
    // component is missing from the composition, its variation collides with the base credit
    // and the unique index refuses a legitimate second one — a maker silently loses XP.
    const variacoes: [string, Record<string, unknown>][] = [
      ['tenant', { tenant: 2 }],
      ['perfil', { perfil: 43 }],
      ['acao', { acao: 'concluir_missao' }],
      ['refTipo', { refTipo: 'projeto' }],
      ['refId', { refId: 8 }],
    ]

    const base = await keyFor({ ...CREDITO })
    for (const [nome, diff] of variacoes) {
      expect(
        await keyFor({ ...CREDITO, ...diff }),
        `the key ignores ${nome}: two credits that differ only in ${nome} compose the same ` +
          'key, so the unique index refuses the second — either a maker loses a credit they ' +
          'earned, or (for tenant) XP stops being per-organization, which is FR-029',
      ).not.toBe(base)
    }
  })

  it('separates two labs even when everything else is identical (FR-029, US7)', async () => {
    // The named case of the loop above, kept on its own because it is the one that is a
    // tenancy failure rather than a lost credit: without `tenant` in the key, the first lab
    // to credit an action would make it uncreditable at the second.
    expect(await keyFor({ ...CREDITO, tenant: 1 })).not.toBe(
      await keyFor({ ...CREDITO, tenant: 2 }),
    )
  })

  it('OVERWRITES a key the caller supplied, because that is the whole point (FR-003)', async () => {
    const key = await keyFor({ ...CREDITO, chaveIdempotencia: 'o-que-eu-quiser' })

    expect(
      key,
      'a caller-supplied chaveIdempotencia survives: anything that can create a ledger entry ' +
        'can then pick a key that collides with nobody and be credited twice, through an ' +
        'index that refused nothing. The hook exists precisely so no caller composes the tuple',
    ).not.toBe('o-que-eu-quiser')
    expect(key).toBe(await keyFor({ ...CREDITO }))
  })

  it('reads a relationship through its id whether it arrives bare or populated', async () => {
    // `perfil` and `tenant` arrive as a bare id from the tenant client and as a populated
    // document from other paths. String()-ing the object would key the row `[object Object]`,
    // which collides with every other populated write — every credit after the first refused.
    expect(await keyFor({ ...CREDITO, perfil: { id: 42 } })).toBe(await keyFor({ ...CREDITO }))
    expect(await keyFor({ ...CREDITO, tenant: { id: 1 } })).toBe(await keyFor({ ...CREDITO }))
  })

  it('keys an entry that names no perfil, rather than leaving the column empty', async () => {
    // `perfil` is nullable by CLR-011. A create that names none still has to satisfy the
    // required column, and its key still has to be per-content so the same content is not
    // credited twice.
    const semPerfil: Record<string, unknown> = { ...CREDITO }
    delete semPerfil.perfil
    const key = await keyFor(semPerfil)

    expect(typeof key).toBe('string')
    expect(key as string).not.toHaveLength(0)
    expect(key).not.toBe(await keyFor({ ...CREDITO }))
    // An omitted perfil and an explicit null are the same absence, and must compose the same
    // key: otherwise the erasure path and the never-had-one path would each be creditable once.
    expect(key).toBe(await keyFor({ ...CREDITO, perfil: null }))
  })

  it('leaves the key UNTOUCHED on update — the erasure tombstone must not re-open a credit', async () => {
    // CLR-011/T011b: erasing a profile nulls `perfil` through the trusted server path, which
    // access control does not stop (`overrideAccess: true`). If the hook recomposed the key
    // there, the entry would be re-keyed to the no-perfil tuple and the content it credits
    // would become creditable a second time — an append-only ledger growing a duplicate on a
    // deletion. Recomposition is a create-time act, exactly as `curtida` and `progressoAula`
    // stamp only on create.
    const stored = { ...CREDITO, chaveIdempotencia: '1:42:publicar_artigo:artigo:7' }
    const after = await runBeforeValidate({ perfil: null }, 'update', stored)

    expect(
      after.chaveIdempotencia,
      'the key is recomposed on update: nulling perfil for LGPD erasure re-keys the entry, ' +
        'and the article it credited can be credited again — the unique index no longer ' +
        'covers the tuple it was built for',
    ).toBeUndefined()
  })
})

/**
 * T011 / SC-002 — **the duplicate is refused by Postgres, and this proof never enters
 * application code.**
 *
 * Everything above this line reads the *config*. That is the right vantage point for a shape,
 * and it is the wrong one for a guarantee: a config can declare a unique index the running
 * database does not have. This tree measured that inversion at full cost — `autor-nulavel.test.ts`
 * records a migration that was written, was correct, and was silently undone on every developer
 * machine, while the gate that shipped with it matched the migration file's **text** and stayed
 * green against a schema that was gone. *"A gate that asserts the artefact instead of the
 * state."* SC-002 is a statement about the state, so it is asked of the state.
 *
 * ── Why the insert is raw SQL and not `payload.create` ────────────────────────────────────
 *
 * The task's wording is load-bearing — *"at the database, not in application code"* — and the
 * Local API cannot answer it even in principle. `@payloadcms/drizzle`'s `handleUpsertError`
 * intercepts the violation and rethrows a `ValidationError`; by the time any caller sees it the
 * SQLSTATE and the index name are **gone**. `handle-unique-index.test.ts` measured that on
 * 2026-09-12 and T015 is built on the measurement, catching the duplicate by table plus column
 * pair. So a `payload.create` here would prove that *something* refused the second credit, which
 * is exactly the claim that stays true after someone replaces the index with a `SELECT` first —
 * the check-then-insert race `PendingInvites.ts` records paying for, where two concurrent
 * reviewers both read zero rows and both write.
 *
 * `payload.db.drizzle.execute` goes under all of it: no hook composes the key, no access rule
 * runs, no validator fires. The only thing left between the two statements is the index, so
 * `23505` and `chaveIdempotencia_idx` are evidence **nothing in this repository can fabricate**.
 *
 * ── Why it still boots Payload first ──────────────────────────────────────────────────────
 *
 * `payload.config.ts` sets `push: env.NODE_ENV !== 'production'`, and `@payloadcms/db-postgres`
 * runs `pushDevSchema` on connect — so outside production the live schema is rebuilt from the
 * **config** on every boot, never from the committed migrations. Booting *is* the setup: it is
 * what guarantees the schema under test is the current one, on a clean clone and in CI alike.
 * (The migration's own text is covered separately, by `migrations.test.ts`; production is the
 * only database push never touches, and it is the one that runs those files.)
 *
 * **The honest consequence, stated rather than discovered later:** because push repairs the
 * schema on every boot, this test *cannot* be turned red by dropping the index by hand — the
 * boot in `beforeAll` puts it straight back (verified: dropped, one boot, present again). It was
 * therefore verified red the only way it can be — the unique index was replaced with a plain one
 * and the suite run with `NODE_ENV=production`, which is the one value that switches push off.
 * The second insert then succeeded, `doErroPg` answered `undefined` for both fields, and exactly
 * the three assertions that depend on the constraint failed while the first-insert guard and the
 * one-component-different case still passed. Restored, all five pass (2026-09-14).
 *
 * ── Why the three foreign keys are left NULL ──────────────────────────────────────────────
 *
 * `tenant_id`, `perfil_id` and `skill_id` are nullable (CLR-011 makes `perfil` so deliberately),
 * and the tuple under test lives entirely in `chave_idempotencia` — one text column, which is
 * the whole reason that column exists. Naming real rows would buy nothing and cost two things
 * this suite has already been billed for: fixtures that must be torn down in foreign-key order,
 * and leftover rows landing in `counters.test.ts`, which reconciles the **whole database** and
 * so reports another file's mess as its own failure.
 */

/**
 * A credit no fixture and no seed will ever write.
 *
 * The sentinel `tenant` is what makes `limpar()` exact: every key this file composes starts
 * `990011:`, so the cleanup deletes precisely its own rows and cannot take a real credit with
 * it — the ledger is append-only and a careless `delete` here would be the one thing in the
 * codebase allowed to violate that.
 */
const TUPLA = {
  tenant: 990011,
  perfil: 990042,
  acao: 'publicar_artigo',
  refTipo: 'artigo',
  refId: 7,
} as const

/** Every key this file writes. Matches `limpar()`'s `LIKE`, so the two cannot drift apart. */
const PREFIXO_SENTINELA = `${TUPLA.tenant}:`

/**
 * The key the collection's **own hook** composes — never one hand-written here.
 *
 * Hand-writing `'990011:990042:publicar_artigo:artigo:7'` would still collide with itself and
 * still produce a `23505`, and it would prove the index refuses *a repeated string*. What SC-002
 * needs is that the index refuses **the string the application actually writes**, so the format
 * is taken from `composeIdempotencyKey` and a change to it moves this proof with it.
 */
const chaveDe = (tupla: Record<string, unknown>): string =>
  (composeIdempotencyKey({ data: { ...tupla }, operation: 'create', req: {} } as never) as unknown as {
    chaveIdempotencia: string
  }).chaveIdempotencia

/** Runs `fn` and returns what it threw, or `undefined` if it threw nothing. */
const capturar = async (fn: () => Promise<unknown>): Promise<unknown> => {
  try {
    await fn()
    return undefined
  } catch (erro) {
    return erro
  }
}

/**
 * Reads one field off a pg error **wherever the driver stack buried it**.
 *
 * drizzle wraps a failed statement in a `DrizzleQueryError` and hangs the original on `cause`,
 * and the depth is a detail of a dependency rather than a promise to us. Walking the chain means
 * a drizzle upgrade that adds or removes a wrapper changes nothing here; the bound on the walk
 * is there so a self-referencing `cause` cannot hang the suite instead of failing it.
 */
const doErroPg = (erro: unknown, campo: 'code' | 'constraint'): string | undefined => {
  let atual: unknown = erro
  for (let saltos = 0; atual && saltos < 10; saltos += 1) {
    const valor = (atual as Record<string, unknown>)[campo]
    if (typeof valor === 'string') return valor
    atual = (atual as { cause?: unknown }).cause
  }
  return undefined
}

let payload: Payload

/** One raw INSERT, under Payload: no hooks, no access control, no validation. */
const inserirDireto = (chave: string): Promise<unknown> =>
  payload.db.drizzle.execute(sql`
    insert into "xp_ledger"
      ("acao", "ref_tipo", "ref_id", "quantidade", "chave_idempotencia")
    values (
      ${TUPLA.acao}::"public"."enum_xp_ledger_acao",
      ${TUPLA.refTipo}::"public"."enum_xp_ledger_ref_tipo",
      ${TUPLA.refId}, 1, ${chave}
    )
  `)

const contarComChave = async (chave: string): Promise<number> => {
  const resultado = await payload.db.drizzle.execute(
    sql`select count(*)::int as total from "xp_ledger" where "chave_idempotencia" = ${chave}`,
  )
  const linhas = ((resultado as { rows?: unknown[] }).rows ?? resultado) as { total: number }[]
  return Number(linhas[0]?.total ?? 0)
}

/** Deletes only this file's sentinel rows — see `PREFIXO_SENTINELA`. */
const limpar = (): Promise<unknown> =>
  payload.db.drizzle.execute(
    sql`delete from "xp_ledger" where "chave_idempotencia" like ${`${PREFIXO_SENTINELA}%`}`,
  )

describe('the unique index refuses the second credit AT THE DATABASE (T011, FR-003, SC-002)', () => {
  const CHAVE = chaveDe(TUPLA)
  /** The same credit for a different article: one component changed, so a different key. */
  const CHAVE_OUTRA = chaveDe({ ...TUPLA, refId: TUPLA.refId + 1 })

  let erroPrimeiro: unknown
  let erroDuplicado: unknown

  beforeAll(async () => {
    // Booting rebuilds the live schema from the config (`push`), so what is measured below is
    // the schema this repository currently declares — not whatever a previous branch left
    // behind. Scoped to this describe on purpose: the config-shape half of this file asserts
    // against an imported object and runs with no database at all, which `vitest.config.ts`
    // preserves deliberately ("Defaults let config-shape tests run with no database").
    // **`payload.config` is imported HERE and not at the top of the file, and that is a
    // correctness requirement rather than a style.** Loading it runs `buildConfig`, and
    // `multiTenantPlugin` MUTATES the very collection object the config-shape describes above
    // assert against — it pushes the injected `tenant` field into `XpLedger.fields`. Measured:
    // with a top-level import, *"declares no tenant field of its own"* and *"names exactly the
    // seven columns FR-002 requires"* both fail, in a task that changed neither. Deferring the
    // import to here means the mutation happens after those assertions have run.
    const { default: config } = await import('../../payload.config')

    payload = await getPayload({ config })
    await limpar()

    erroPrimeiro = await capturar(() => inserirDireto(CHAVE))
    erroDuplicado = await capturar(() => inserirDireto(CHAVE))
  }, 180_000)

  afterAll(async () => {
    if (payload) await limpar()
  })

  it('accepts the first credit — without this every assertion below would be vacuous', () => {
    // If the insert failed for a reason of its own (a column renamed, an enum value dropped, a
    // NOT NULL added), the "duplicate" would be refused too and this file would report SC-002
    // proven by an error that has nothing to do with uniqueness.
    expect(
      erroPrimeiro,
      'the FIRST insert into xp_ledger was refused, so the refusal measured below is not the ' +
        'unique index doing its job — it is whatever broke this statement. Got: ' +
        String((erroPrimeiro as { message?: string })?.message ?? erroPrimeiro),
    ).toBeUndefined()
  })

  it('refuses the SECOND insert of the same tuple with SQLSTATE 23505 (SC-002)', () => {
    expect(
      erroDuplicado,
      'Postgres accepted the same idempotency key twice. The ledger now holds two credits for ' +
        'one article, and every projection derived from it (CLR-001) — xpTotal, the skill ' +
        'level, the Nível do Lab, the ranking — is inflated by a write nobody can distinguish ' +
        'from a real one. FR-003 is an index or it is nothing',
    ).toBeDefined()
    expect(
      doErroPg(erroDuplicado, 'code'),
      'the second insert was refused, but not with 23505 (unique_violation). SC-002 asks for ' +
        'that code specifically because it is the one a check-then-insert in application code ' +
        'can never produce: this insert ran under Payload, so no hook, access rule or ' +
        'validator was between the two statements. Got: ' +
        String((erroDuplicado as { message?: string })?.message ?? erroDuplicado),
    ).toBe('23505')
  })

  it('names chaveIdempotencia_idx as the constraint that refused it', () => {
    // Which index refused matters as much as that one did: any other unique constraint on this
    // table would also answer 23505, and the assertion above would pass while FR-003's index
    // had been dropped. The name is also what a migration, `pg_indexes` and `psql` agree on,
    // so a rename is a schema change that fails here rather than passing unnoticed.
    expect(
      doErroPg(erroDuplicado, 'constraint'),
      'the duplicate was refused by some other constraint, or by none this error names — so ' +
        'this file cannot tell FR-003\'s unique index from any other failed insert',
    ).toBe('chaveIdempotencia_idx')
  })

  it('leaves exactly one row: the refusal is a refusal, not a silent upsert', async () => {
    expect(
      await contarComChave(CHAVE),
      'the ledger holds a number of rows for this key other than one. Either the duplicate was ' +
        'written after all, or the refusal took the first credit with it — and an append-only ' +
        'ledger that loses the entry it already accepted is worse than one that duplicates it',
    ).toBe(1)
  })

  it('accepts a credit that differs in ONE component — it refuses duplicates, not writes', async () => {
    // The half that dies if someone "fixes" a failure here by constraining something broader.
    // An index that refuses every second credit would pass all four assertions above and would
    // mean a maker earns XP exactly once, ever.
    const erro = await capturar(() => inserirDireto(CHAVE_OUTRA))

    expect(
      erro,
      `a credit for a different article (${CHAVE_OUTRA}) was refused by the same index. The ` +
        'key is not injective — two different credits compose one string — so a maker silently ' +
        'loses every credit after their first',
    ).toBeUndefined()
    expect(await contarComChave(CHAVE_OUTRA)).toBe(1)
  })
})

/**
 * T012 / FR-001 — **append-only asked of the RUNNING SYSTEM, not of the config.**
 *
 * The access half of this file already asserts that `XpLedger.access.update` and `.delete` are
 * the function `() => false`. That is the right vantage point for a *shape* and the wrong one
 * for a *guarantee*, and this file has already paid once for the difference: T011's docstring,
 * two hundred lines up, is the same argument about the unique index — *"a config can declare a
 * unique index the running database does not have"*. The mirror claim here is that a collection
 * can declare a refusing access function that the running system never consults. It happens by
 * omission rather than by malice: a custom endpoint, an admin override, a hook that writes on
 * the caller's behalf — none of them touches the two lines the config tests read.
 *
 * So the question is put to `payload.update` and `payload.delete` themselves, with
 * `overrideAccess: false` and a session, which is how an admin-panel click and a REST call
 * arrive.
 *
 * ── The trap this harness was built wrong for first, and the fix ──────────────────────────
 *
 * The obvious harness writes the sentinel credit with **no tenant** and then asserts every
 * session gets a 403. It passes — and it passes against `teamOnly()` and against
 * `scopedAccess()`, the two weaker shapes the collection docstring names as wrong. Measured on
 * 2026-09-14, with `update`/`delete` temporarily set to `scopedAccess()`: eight of the ten
 * per-session assertions stayed **green**.
 *
 * The reason is in `operations/updateByID.js`: when access answers a `Where` and the query
 * matches nothing, Payload throws **`Forbidden`, not `NotFound`** (`if (!doc && hasWherePolicy)
 * throw new Forbidden`). A row outside the session's scope is therefore indistinguishable from
 * a refused verb, and a harness built on an unscoped row reports "append-only" for a collection
 * that is merely *scoped*.
 *
 * So the sentinel credit is written **inside the very organization every session below belongs
 * to**. Under `() => false` each session gets a 403 before the database is touched; under any
 * `Where` the row is in scope and the write **goes through**, which is what the failure message
 * then says. That is the difference between asserting FR-001 and asserting FR-029.
 *
 * ── Why the error's NAME is asserted, and not merely that one was thrown ──────────────────
 *
 * `Forbidden` (403) is what `executeAccess` throws for a falsy access result. A bare
 * `rejects.toThrow()` would also accept a validation error, a `NotFound`, or a connection that
 * fell over — every one of which would leave a reader believing the ledger is immutable because
 * something, somewhere, went wrong.
 *
 * Each session gets its own `it`, because FR-001's claim is about **who**: `teamOnly()` refuses
 * a maker and admits the team, so a single assertion over a maker would stay green while the
 * team rewrote totals. The team is exactly who would be asked to "fix" a number.
 *
 * ── Why both the by-id and the bulk form ─────────────────────────────────────────────────
 *
 * They are different operations — `operations/updateByID.js` and `operations/update.js`, each
 * calling `executeAccess` itself — and a collection refusing one while allowing the other would
 * be append-only only for callers who do not know the query form. That is also the form
 * `resetWorld` uses, so it is the one reached for by anyone who wants rows gone.
 *
 * ── Why this cannot pass vacuously ───────────────────────────────────────────────────────
 *
 * `executeAccess` throws before anything touches the database, so a 403 alone would also be
 * thrown for an entry that does not exist. Three guards close that: § "a entrada existe" proves
 * the row is there first, § "deixa a entrada intacta" proves it is still there and unchanged
 * after twenty refusals, and § "a mesma sessão ainda LÊ" proves a session that was just refused
 * four times can still reach this collection — so the 403 is about the verb, not about a failed
 * boot, a malformed session, or `xpLedger` being unreachable.
 */

/** The sentinel organization: raw-inserted, so no `SEED_ON_CREATE` hook fires and nothing this
 *  block leaves behind can reach `counters.test.ts`, which reconciles the whole database. */
const ORG_T012 = { nome: 'Lab sentinela T012', slug: 't012-append-only-sentinel' } as const

/**
 * A credit no fixture and no seed writes — **one per session**, and that is not tidiness.
 *
 * A single shared row makes the sessions dependent on each other: measured on 2026-09-14 with
 * `update`/`delete` weakened to `scopedAccess()`, the maker's `delete` succeeded first, and
 * every session after it was then measured against a row that no longer existed — staff, admin
 * and master each reported a clean refusal for a credit the maker had already taken. The
 * failure was loud enough overall, but three of the five sessions FR-001 names had gone
 * unmeasured. One row each, so every session is asked of a live credit in its own organization.
 */
const TUPLA_T012 = { perfil: null, acao: 'concluir_missao', refTipo: 'missao' } as const

/** `refId` of the first session's credit; each subsequent session gets the next one. */
const REF_ID_BASE = 990031

/** What each credit is worth going in, and must still be worth coming out. */
const QUANTIDADE_ORIGINAL = 7

/** What every refused write tried to make it. Must never appear in the table. */
const QUANTIDADE_INVASORA = 9999

/**
 * Everyone who can hold a session. The organization id is not known until the sentinel
 * organization exists, so the role is declared here and the session built in `beforeAll`.
 */
const SESSOES: { rotulo: string; papel: string | null }[] = [
  { rotulo: 'um maker', papel: 'maker' },
  { rotulo: 'a equipe (staff)', papel: 'staff' },
  { rotulo: 'a equipe (admin)', papel: 'admin' },
  { rotulo: 'um master', papel: 'master' },
  { rotulo: 'um visitante anônimo', papel: null },
]

const sessaoDe = (papel: string | null, organizacao: number): unknown => {
  if (papel === null) return undefined
  if (papel === 'master') return master
  return member(organizacao, papel)
}

/** One session's own credit: the id the by-id door addresses, the key the query door matches. */
type Credito = { id: number; chave: string }

/**
 * The two verbs FR-001 refuses, and the two forms each arrives in.
 *
 * `operations/updateByID.js` and `operations/update.js` are **different operations**, each
 * calling `executeAccess` itself, and the same split exists for delete. A collection refusing
 * only the by-id form would be append-only just for callers who do not know the query form —
 * which is the form `resetWorld` uses, and so the one reached for by anyone who wants rows gone.
 */
const VERBOS = ['update', 'delete'] as const
const FORMAS = ['id', 'query'] as const

/** Every door into a credit, keyed `verbo:forma`, so a failure names exactly which one opened. */
const PORTAS: Record<string, (credito: Credito, user: unknown) => Promise<unknown>> = {
  'update:id': ({ id }, user) =>
    payload.update({
      collection: 'xpLedger',
      id,
      data: { quantidade: QUANTIDADE_INVASORA },
      overrideAccess: false,
      user: user as never,
    }),
  'delete:id': ({ id }, user) =>
    payload.delete({ collection: 'xpLedger', id, overrideAccess: false, user: user as never }),
  'update:query': ({ chave }, user) =>
    payload.update({
      collection: 'xpLedger',
      where: { chaveIdempotencia: { equals: chave } },
      data: { quantidade: QUANTIDADE_INVASORA },
      overrideAccess: false,
      user: user as never,
    }),
  'delete:query': ({ chave }, user) =>
    payload.delete({
      collection: 'xpLedger',
      where: { chaveIdempotencia: { equals: chave } },
      overrideAccess: false,
      user: user as never,
    }),
}

/**
 * Removes this block's organization and every credit in it — in foreign-key order.
 *
 * Scoped by the sentinel slug rather than by a key prefix (T011's idiom), because the
 * idempotency key carries the organization's real serial id and so is not known before the row
 * exists. Exact either way: nothing else in the tree holds this slug.
 */
const limparT012 = async (): Promise<void> => {
  await payload.db.drizzle.execute(sql`
    delete from "xp_ledger" where "tenant_id" in
      (select "id" from "organizations" where "slug" = ${ORG_T012.slug})
  `)
  await payload.db.drizzle.execute(sql`delete from "organizations" where "slug" = ${ORG_T012.slug}`)
}

/** Reads the single column a `returning`/`select` statement was asked for. */
const primeiraLinha = <T>(resultado: unknown): T | undefined =>
  (((resultado as { rows?: unknown[] }).rows ?? resultado) as T[])[0]

const inserirOrganizacao = async (): Promise<number> => {
  const resultado = await payload.db.drizzle.execute(sql`
    insert into "organizations" ("name", "slug") values (${ORG_T012.nome}, ${ORG_T012.slug})
    returning "id"
  `)
  return Number(primeiraLinha<{ id: number }>(resultado)?.id ?? 0)
}

/**
 * One raw INSERT under Payload, returning the id the doors above address.
 *
 * Raw for the reason T011's is: no hook composes the key, no access rule runs, no validator
 * fires — so the row this block protects was put there by something the access rules cannot
 * have influenced, and its survival is evidence about them alone.
 */
const inserirCredito = async (tenant: number, refId: number, chave: string): Promise<number> => {
  const resultado = await payload.db.drizzle.execute(sql`
    insert into "xp_ledger"
      ("tenant_id", "acao", "ref_tipo", "ref_id", "quantidade", "chave_idempotencia")
    values (
      ${tenant},
      ${TUPLA_T012.acao}::"public"."enum_xp_ledger_acao",
      ${TUPLA_T012.refTipo}::"public"."enum_xp_ledger_ref_tipo",
      ${refId}, ${QUANTIDADE_ORIGINAL}, ${chave}
    )
    returning "id"
  `)
  return Number(primeiraLinha<{ id: number }>(resultado)?.id ?? 0)
}

type LinhaDoLedger = { id: number; quantidade: number }

/** The row as Postgres holds it — read raw, so no access rule can filter the evidence away. */
const lerCredito = async (chave: string): Promise<LinhaDoLedger | undefined> => {
  const resultado = await payload.db.drizzle.execute(sql`
    select "id", "quantidade" from "xp_ledger" where "chave_idempotencia" = ${chave}
  `)
  return primeiraLinha<LinhaDoLedger>(resultado)
}

/** The name Payload gives the error `executeAccess` throws for a falsy access result. */
const nomeDoErro = (erro: unknown): string | undefined =>
  (erro as { name?: string } | undefined)?.name

const statusDoErro = (erro: unknown): number | undefined =>
  (erro as { status?: number } | undefined)?.status

/** Describes what actually came back, so a failure is diagnosable from its own message. */
const descrever = (erro: unknown): string =>
  erro === undefined
    ? 'nothing was thrown — the write went through'
    : `${nomeDoErro(erro) ?? 'Error'} (status ${String(statusDoErro(erro))}): ${String(
        (erro as { message?: string }).message,
      )}`

/** The whole argument for FR-001, in the message of whichever assertion fails. */
const porQueImporta = (porta: string, rotulo: string, erro: unknown): string =>
  `the "${porta}" door into xpLedger was not refused with Forbidden for ${rotulo}. The credit ` +
  'lives in that session\'s OWN organization, so a Where-shaped rule (teamOnly(), ' +
  'scopedAccess()) lets the write through: history becomes editable by whoever owns the row, ' +
  'and every projection that reconciles against the ledger (CLR-001) — xpTotal, the skill ' +
  'level, the Nível do Lab, the ranking — goes on treating it as the source of truth. ' +
  'Append-only is a flat false, the only access result executeAccess turns into a 403. ' +
  `Got: ${descrever(erro)}`

describe('append-only is enforced by PAYLOAD, for every session there is (T012, FR-001)', () => {
  /** Per session: its own credit, and what each of the four doors returned. */
  const creditos = new Map<string, Credito>()
  const recusas = new Map<string, Record<string, unknown>>()

  let organizacao = 0
  let existiamAntes = 0
  /** Both halves: `capturar` returns `undefined` on success, so an error-only capture could
   *  never tell "the read worked" from "the read came back empty". */
  let leitura: { erro: unknown; total: number | undefined } = { erro: undefined, total: undefined }

  beforeAll(async () => {
    // Deferred import for the reason T011's block records: loading the config runs
    // `multiTenantPlugin`, which MUTATES the imported `XpLedger` object the config-shape half
    // of this file asserts against. Booting also rebuilds the live schema from the config
    // (`push`), so the table these statements hit is the one this repository declares.
    const { default: config } = await import('../../payload.config')

    payload = await getPayload({ config })
    await limparT012()
    organizacao = await inserirOrganizacao()

    for (const [posicao, { rotulo, papel }] of SESSOES.entries()) {
      const refId = REF_ID_BASE + posicao
      // Composed by the collection's own hook rather than hand-written here, so a change to the
      // key format moves this block with it — the reason T011 gives for `chaveDe`.
      const chave = chaveDe({ ...TUPLA_T012, tenant: organizacao, refId })
      const credito = { id: await inserirCredito(organizacao, refId, chave), chave }
      existiamAntes += await contarComChave(chave)
      creditos.set(rotulo, credito)

      const user = sessaoDe(papel, organizacao)
      const porSessao: Record<string, unknown> = {}
      for (const [porta, abrir] of Object.entries(PORTAS)) {
        porSessao[porta] = await capturar(() => abrir(credito, user))
      }
      recusas.set(rotulo, porSessao)
    }

    // The guard against "403 because the collection is unreachable": run AFTER the twenty
    // refusals, with the same master session that was just refused four times.
    try {
      const encontrado = await payload.find({
        collection: 'xpLedger',
        where: { tenant: { equals: organizacao } },
        overrideAccess: false,
        user: master as never,
      })
      leitura = { erro: undefined, total: encontrado.totalDocs }
    } catch (erro) {
      leitura = { erro, total: undefined }
    }
  }, 180_000)

  afterAll(async () => {
    if (payload) await limparT012()
  })

  it('as entradas existem antes de qualquer tentativa — sem isto tudo abaixo é vácuo', () => {
    // `executeAccess` throws Forbidden BEFORE the operation reads the database, so every
    // refusal below would be thrown just the same for rows that were never inserted. This is
    // what makes "the entries survived" a claim about real rows.
    expect(organizacao, 'the sentinel organization was not created').toBeGreaterThan(0)
    expect(
      existiamAntes,
      'one sentinel credit per session was not written, so the refusals measured below are ' +
        'refusals to touch nothing and the survival assertion has no subject',
    ).toBe(SESSOES.length)
  })

  for (const { rotulo } of SESSOES) {
    for (const verbo of VERBOS) {
      it(`recusa ${verbo.toUpperCase()} a ${rotulo}, por id e por query, com 403 (FR-001)`, () => {
        for (const forma of FORMAS) {
          const porta = `${verbo}:${forma}`
          const erro = recusas.get(rotulo)?.[porta]

          expect(nomeDoErro(erro), porQueImporta(porta, rotulo, erro)).toBe('Forbidden')
          expect(statusDoErro(erro)).toBe(403)
        }
      })
    }
  }

  it('deixa TODAS as entradas intactas: mesma linha, mesma quantidade', async () => {
    // Twenty refusals later. A refusal that threw AFTER writing, or that removed the row on its
    // way to a 403, would satisfy every assertion above and still lose the credit.
    for (const { rotulo } of SESSOES) {
      const credito = creditos.get(rotulo)
      const linha = await lerCredito(credito?.chave ?? '')

      expect(
        linha,
        `the credit ${rotulo} was refused access to is gone from xp_ledger: something reached ` +
          'the row on its way to throwing, and an append-only ledger that loses an accepted ' +
          'entry is worse than one that duplicates it',
      ).toBeDefined()
      expect(Number(linha?.id)).toBe(credito?.id)
      expect(
        Number(linha?.quantidade),
        `the credit ${rotulo} was refused is worth ${String(linha?.quantidade)} rather than ` +
          `${QUANTIDADE_ORIGINAL}: a refused update changed the row anyway`,
      ).toBe(QUANTIDADE_ORIGINAL)
    }
  })

  it('a mesma sessão ainda LÊ as entradas — a recusa é do verbo, não da coleção', () => {
    // The last vacuity guard. Forbidden is thrown before the database is touched, so a boot
    // that half-failed, a malformed session or a collection missing from the config would
    // produce the same 403 for every verb. A master that can still FIND the rows proves the
    // refusals above are about `update` and `delete` specifically.
    expect(
      leitura.erro,
      `a master could not even READ xpLedger (${descrever(leitura.erro)}), so the 403s above ` +
        'may be saying "this collection is unreachable" rather than "this verb is refused"',
    ).toBeUndefined()
    expect(
      leitura.total,
      'the ledger read back empty for a master, so the refusals above were measured against ' +
        'rows nothing can see',
    ).toBe(SESSOES.length)
  })
})
