import { beforeAll, describe, expect, it } from 'vitest'

import { buildTenantClient, type TenantScopedPayload } from '../../lib/tenancy/client'
import { ESCOLARIDADES, VINCULOS_UNESP } from '../../collections/content/PerfilMaker'
import { buildWorld, type Fixture } from './fixtures'

/**
 * **What `select` does to a real database** (T007, FR-030, SC-022, CHK024, CHK037–CHK039).
 *
 * `find-select-threading.test.ts` proves the projection *reaches* `payload.find` — it records
 * the arguments a fake was handed. That is the wiring, and it is deliberately all that file
 * asserts. It cannot answer the question the design actually rests on: **does the database
 * return fewer columns because of it?** A typecheck cannot either — `select` is typed
 * `Record<string, boolean>` on `FindArgs`, so every object with the right shape compiles,
 * including one naming a column that does not exist.
 *
 * Nor is "the returned object has two keys" an answer. Payload assembles documents in JS after
 * the query, so a client that fetched the whole row and then trimmed it would look identical at
 * the call site — and the row it fetched carries `dataNascimento`, `escolaridade`, `curso`,
 * `vinculoUnesp` and `usuario`, the consented personal data the anonymous ranking must never
 * touch. The assertion that distinguishes those two worlds is *"the personal columns are not in
 * the result"*, made against a row that **was populated with them** — a fixture profile with
 * those columns null passes on a row that had nothing to disclose.
 *
 * ## The four behaviours measured here, and why each one is load-bearing
 *
 * Measured 2026-09-16 against Postgres through `@payloadcms/db-postgres`, not assumed:
 *
 *   1. **A field that does not exist is silently ignored — no throw.** `{ handle: true,
 *      naoExisteEsteCampo: true }` returns `{ id, handle }`. The important half is what the
 *      silence does NOT do: it does not fall back to the whole row. A select that is *entirely*
 *      a typo returns `{ id }` alone. So a misspelled field costs a blank column on a card,
 *      never a widened read — the failure mode points the safe way, and `readPublicRanking`'s
 *      typo risk is a rendering bug rather than a disclosure.
 *   2. **`id` comes back whether or not it is selected.** Rows stay usable as React keys and as
 *      the argument to a later read, so a projection never has to name `id` defensively.
 *   3. **A selected relationship populates at `depth: 1`** — `avatarRender` arrives as the
 *      `midiaImagem` document, which is what FR-017's ranking renders. With the sharp edge
 *      recorded below: the projection does **not** reach into the populated document.
 *   4. **`select` composes with the `where` the door AND-s in.** The tenant clause still
 *      confines the rows even though `tenant` is not among the selected columns — the
 *      projection decides *which columns*, the tenant clause *which rows*, and neither
 *      displaces the other.
 */

/** The consented personal columns on `perfilMaker`, the ones a public projection must exclude. */
const PESSOAIS = ['dataNascimento', 'escolaridade', 'curso', 'vinculoUnesp', 'usuario'] as const

/** The four public columns `readPublicRanking` (T009) will ask for. */
const PUBLICOS = { handle: true, nome: true, xpTotal: true, nivel: true } as const

let world: Fixture
let door: TenantScopedPayload
/**
 * Captured rather than thrown: a throw in `beforeAll` aborts the file and reports its tests as
 * *skipped*, which a gate reading the output cannot tell from a harness that measured nothing
 * (tasks.md § preamble item 4). The first test below asserts it, in wording no projection
 * assertion shares.
 */
let falhaNoPreparo: unknown = null

beforeAll(async () => {
  try {
    world = await buildWorld()
    // The profile is seeded with `nome`, `handle` and `usuario` only, so every personal column
    // on it is null. Populating them is the whole point: an absent column cannot be observed
    // to be absent for the right reason.
    await world.payload.update({
      collection: 'perfilMaker',
      id: world.rows.perfilMaker!.A,
      data: {
        dataNascimento: '1999-04-01T00:00:00.000Z',
        vinculoUnesp: Object.keys(VINCULOS_UNESP)[0],
        escolaridade: Object.keys(ESCOLARIDADES)[0],
        curso: 'Engenharia de Controle e Automação',
        // The image seeded into THIS organization — `sameTenant` refuses the neighbour's.
        avatarRender: Number(world.rows.midiaImagem!.A),
      } as never,
      overrideAccess: true,
    })
    door = buildTenantClient({
      payload: world.payload,
      tenantId: String(world.orgA.id),
      overrideAccess: true,
    })
  } catch (err) {
    falhaNoPreparo = err
  }
}, 120_000)

/** One profile row read through the door, with whatever projection the caller names. */
const lerPerfil = async (
  args: { select?: Record<string, boolean>; depth?: number; where?: Record<string, unknown> } = {},
): Promise<Record<string, unknown>> => {
  const { docs } = await door.find<Record<string, unknown>>({
    collection: 'perfilMaker',
    ...args,
  } as never)
  return docs[0] ?? {}
}

/**
 * The SQL the **database** actually received, captured around one read.
 *
 * **This is the assertion CHK024 asks for, and nothing else in this file can make it.** Every
 * other case here reads `Object.keys` off the returned document — which cannot tell a projection
 * pushed into the query apart from a client that fetched the whole row and trimmed it in
 * JavaScript. Those two are identical at the call site and opposite at the database boundary, and
 * the second one is a row of consented personal data crossing a wire it has no business crossing.
 *
 * `payload.db.pool` is the `pg` pool the drizzle adapter issues through, so wrapping `query` sees
 * the statement text verbatim. Restored in a `finally`: a pool left wrapped would follow this
 * file into everybody else's.
 */
async function sqlDe(executar: () => Promise<unknown>): Promise<string[]> {
  const pool = (world.payload.db as unknown as { pool: { query: (...args: never[]) => unknown } }).pool
  const original = pool.query.bind(pool)
  const enviadas: string[] = []

  pool.query = ((...args: never[]) => {
    const primeiro = args[0] as unknown
    const texto =
      typeof primeiro === 'string' ? primeiro : ((primeiro as { text?: string })?.text ?? '')
    if (texto !== '') enviadas.push(texto)
    return original(...args)
  }) as typeof pool.query

  try {
    await executar()
  } finally {
    pool.query = original as typeof pool.query
  }
  return enviadas
}

describe('the projection reaches the DATABASE, not merely the returned object (CHK024)', () => {
  it('emits a select naming the projected columns and none of the personal ones', async () => {
    const enviadas = await sqlDe(() => lerPerfil({ select: { ...PUBLICOS } }))

    // The statement that reads the ROWS. `find` also issues `select count(*) from perfil_maker`
    // for the pagination total, and that one names no columns at all — it would satisfy every
    // "does not mention escolaridade" assertion below while proving nothing.
    const leitura = enviadas.find(
      (texto) => /from\s+"?perfil_maker"?/i.test(texto) && !/count\(\*\)/i.test(texto),
    )
    expect(
      leitura,
      'no statement in this read names perfil_maker, so the capture is looking at the wrong ' +
        'pool and every assertion below would pass against nothing',
    ).toBeDefined()

    for (const campo of PESSOAIS) {
      const coluna = campo.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`)
      expect(
        leitura,
        `the SQL names ${coluna}. The projection was applied to the RESULT and not to the ` +
          'QUERY, so the consented personal columns crossed the database boundary and were ' +
          'trimmed afterwards — indistinguishable from a real projection at the call site, and ' +
          'the opposite of it where FR-030 cares (CHK024)',
      ).not.toMatch(new RegExp(`"?${coluna}"?`, 'i'))
    }

    expect(leitura, 'the SQL does not name the columns that were asked for').toMatch(/"?handle"?/i)
  })
})

describe('select narrows what the database returns', () => {
  it('prepared a world whose profile has personal data to disclose', () => {
    expect(falhaNoPreparo, `the harness never ran: ${String(falhaNoPreparo)}`).toBeNull()
  })

  it('returns the personal columns when nothing is projected — the control', async () => {
    // Without this the next test is a tautology: a row whose personal columns are null is
    // absent from every result, projected or not, and asserting their absence proves nothing.
    const cheio = await lerPerfil()

    for (const campo of PESSOAIS) {
      expect(
        cheio[campo] ?? null,
        `the fixture profile has no ${campo}, so a projection excluding it would prove nothing`,
      ).not.toBeNull()
    }
  })

  it('omits every unselected column from the row the database returns', async () => {
    const magro = await lerPerfil({ select: { ...PUBLICOS } })

    expect(magro.handle, 'a selected column is missing — the projection took too much').toBe(
      '@makera',
    )
    for (const campo of PESSOAIS) {
      expect(
        Object.prototype.hasOwnProperty.call(magro, campo),
        `${campo} came back on a read that did not select it — the projection did not narrow`,
      ).toBe(false)
    }
  })
})

describe('a field the collection does not have', () => {
  /**
   * Measured, and recorded here because the design leans on the answer: Payload does **not**
   * throw. It drops the key it cannot resolve and honours the rest.
   */
  it('is ignored rather than raising, and the real fields still narrow', async () => {
    const magro = await lerPerfil({ select: { handle: true, naoExisteEsteCampo: true } })

    expect(magro.handle, 'a typo alongside a real field cost the real field too').toBe('@makera')
    expect(
      Object.prototype.hasOwnProperty.call(magro, 'naoExisteEsteCampo'),
      'the unknown field materialised as a column',
    ).toBe(false)
    for (const campo of PESSOAIS) {
      expect(
        Object.prototype.hasOwnProperty.call(magro, campo),
        `a typo in the select widened the read back to the full row — ${campo} came back`,
      ).toBe(false)
    }
  })

  it('does not fall back to the whole row when EVERY selected field is a typo', async () => {
    // The dangerous shape of a silent ignore would be "nothing resolved, so return everything".
    // It is not what happens: the result is `{ id }`, the same floor as any other projection.
    const magro = await lerPerfil({ select: { naoExisteEsteCampo: true } })

    expect(
      Object.keys(magro).sort(),
      'an entirely unresolvable select returned more than the id — a typo became a full-row read',
    ).toEqual(['id'])
  })
})

describe('the id a projection never has to ask for', () => {
  it('comes back on a select that omits it', async () => {
    const magro = await lerPerfil({ select: { handle: true } })

    expect(
      magro.id,
      'the row came back without an id — every projection would have to name it defensively',
    ).toBeDefined()
    expect(magro.handle).toBe('@makera')
  })
})

describe('a selected relationship at depth 1', () => {
  it('populates the related document instead of returning the raw id', async () => {
    const magro = await lerPerfil({ select: { handle: true, avatarRender: true }, depth: 1 })
    const avatar = magro.avatarRender as { id?: unknown } | number | null

    expect(
      typeof avatar === 'object' && avatar !== null,
      'avatarRender came back unpopulated under a select — the ranking would have an id to render',
    ).toBe(true)
    expect((avatar as { id?: unknown }).id).toBe(Number(world.rows.midiaImagem!.A))
  })

  it('leaves the id in place at depth 0, so the projection is not what populates', async () => {
    const magro = await lerPerfil({ select: { handle: true, avatarRender: true }, depth: 0 })

    expect(
      magro.avatarRender,
      'depth 0 populated the relationship — then depth 1 above proves nothing about depth',
    ).toBe(Number(world.rows.midiaImagem!.A))
  })

  it('does NOT carry the projection into the populated document', async () => {
    // Recorded because a reader could reasonably assume otherwise: `select` applies to the
    // collection being queried, and the related document arrives WHOLE. Harmless for
    // `midiaImagem`, which holds no personal data — and the reason a future relationship to a
    // collection that does hold some cannot be made safe by the parent's projection alone.
    const magro = await lerPerfil({ select: { avatarRender: true }, depth: 1 })
    const avatar = magro.avatarRender as Record<string, unknown>

    expect(
      Object.keys(avatar).length,
      'the populated document was itself projected — the note below is stale, re-measure it',
    ).toBeGreaterThan(2)
  })
})

describe('select composed with the where the door AND-s in', () => {
  it('still confines the result to the request organization', async () => {
    // Both organizations hold a profile, and the caller's own `where` matches both of them.
    // Only the tenant clause separates them — and `tenant` is not among the selected columns,
    // which is precisely the composition that has to hold.
    const { docs, totalDocs } = await door.find<Record<string, unknown>>({
      collection: 'perfilMaker',
      select: { handle: true },
      where: { handle: { exists: true } },
    })
    const { totalDocs: existentes } = await world.payload.find({
      collection: 'perfilMaker',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    expect(
      existentes,
      'the world holds fewer than two profiles — there is no boundary to cross',
    ).toBe(2)
    expect(
      totalDocs,
      'a projected read crossed the tenant boundary — the select displaced the tenant clause',
    ).toBe(1)
    expect(docs[0]?.handle).toBe('@makera')
  })

  it("keeps the caller's own where in force alongside the projection", async () => {
    // The mirror of the case above: the tenant clause must not swallow the caller's filter
    // either. This one matches nothing, and a result of one row would mean the `where` was
    // dropped the moment a select appeared.
    const { totalDocs } = await door.find<Record<string, unknown>>({
      collection: 'perfilMaker',
      select: { handle: true },
      where: { handle: { equals: '@ninguem' } },
    })

    expect(totalDocs, "the caller's where was dropped once a select was supplied").toBe(0)
  })
})
