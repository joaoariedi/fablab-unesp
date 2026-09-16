import type { CollectionAfterChangeHook, CollectionConfig, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `creditXp` owns the ledger write and is proven against a real database elsewhere
// (`xp-credit-idempotencia.test.ts`, `xp-projecoes.test.ts`). What this file pins is the
// **wiring**: which collections call it, with which action, and on which writes. A mock is the
// only way to see the arguments — a live credit shows the entry it produced, not the hook's
// choice of `acao`, and a hook registered on the wrong collection with the right arguments
// looks identical from the database.
vi.mock('../../lib/content/xp', () => ({ creditXp: vi.fn(async () => true) }))

import { Artigo } from '../../collections/content/Artigo'
import { Aula } from '../../collections/content/Aula'
import { Evento } from '../../collections/content/Evento'
import { Modelo3d } from '../../collections/content/Modelo3d'
import { Projeto } from '../../collections/content/Projeto'
import { creditXp } from '../../lib/content/xp'

/**
 * T017 / FR-006, FR-042, US1 — **the credit hook, and the collections it is registered on.**
 *
 * `stampApproval` decides in `beforeChange` whether a write is the approval and records it on
 * the document (feature 004's CLR-001). This hook runs in `afterChange`, reads that record, and
 * credits once. `afterChange` is the half that is inside the caller's transaction and sees the
 * stamp already written — reading the decision in `beforeChange` would race an ordering nobody
 * declared (plan § D1).
 *
 * Three properties, each a silent failure if it is lost:
 *
 *   1. **It credits on the approving write, and on no other.** An edit to an already-approved
 *      document, and any write that never reaches `publicado`, must write nothing. The unique
 *      index is the arbiter that cannot lose a race (FR-003), but a hook that fires on every
 *      save would turn every edit into an insert-and-catch.
 *   2. **Each collection names its OWN action and ref type.** A copy-pasted
 *      `publicar_projeto` on `artigo` produces a ledger that reconstructs the wrong history and
 *      an idempotency key that collides across collections — and nothing in the type system
 *      objects, because both values are members of the same two unions.
 *   3. **The caller's own `req` reaches `creditXp`**, so the entry joins the approving
 *      transaction (FR-004, SC-003). Asserted by identity, not by shape.
 *
 * **`evento` is the collection that looks exactly like the other four and must not behave like
 * one** (CLR-012, FR-008): it carries `aprovacaoRegistrada` too, so "register the hook on the
 * reviewable collections" would credit event publication. Asserted here by running every hook
 * `evento` declares against an approved event.
 *
 * **`aula` is the second one, and it was NOT in CLR-012.** Publishing a class is not one of
 * FR-006's five actions — *watch a class to 100%, publish a project, publish a 3D model,
 * publish an article, complete a mission* — and `ACOES_XP` is where that refusal is
 * enforceable: there is no `publicar_aula` for a hook to write. The only value that mentions a
 * class is `assistir_aula`, and crediting a publication with it would be worse than crediting
 * nothing: the key is `(tenant, perfil, acao, refTipo, refId)`, so stamping
 * `(autor, assistir_aula, aula, 12)` at publication **consumes the key the author's own
 * completion of class 12 would later use**, and their real credit is then refused as a
 * duplicate. So `aula` is asserted to credit nothing, for a reason recorded in `Aula.ts`
 * beside the absence. See the task report: FR-042's *"four"* and FR-006's action list disagree,
 * and this is the reading that leaves the ledger correct.
 */

/** A request object with nothing on it: the assertion about it is identity, never contents. */
const REQ = { transactionID: 'tx-t017' } as unknown as PayloadRequest

const PERFIL = 42
const SKILL = 3
const CONTEUDO = 7

type Doc = Record<string, unknown>

/** The document as `afterChange` receives it: already stamped by `stampApproval`. */
const aprovado = (extra: Doc = {}): Doc => ({
  id: CONTEUDO,
  titulo: 'Bancada de marcenaria',
  status: 'publicado',
  aprovacaoRegistrada: true,
  aprovadoEm: '2026-09-14T12:00:00.000Z',
  autor: PERFIL,
  skill: SKILL,
  ...extra,
})

/**
 * Run every `afterChange` hook the collection declares, the way Payload does.
 *
 * All of them, rather than the first: a collection may carry unrelated hooks (`modelo3d`
 * already carries two in `beforeChange`), and asserting against `afterChange[0]` would pass a
 * credit hook that was appended after one that throws — or miss one entirely.
 */
const escrever = async (
  collection: CollectionConfig,
  doc: Doc,
  previousDoc: Doc = { id: CONTEUDO, status: 'em_revisao' },
): Promise<void> => {
  for (const hook of collection.hooks?.afterChange ?? []) {
    await (hook as CollectionAfterChangeHook)({
      collection,
      context: {},
      data: doc,
      doc,
      operation: 'update',
      previousDoc,
      req: REQ,
    } as unknown as Parameters<CollectionAfterChangeHook>[0])
  }
}

const creditos = () => vi.mocked(creditXp).mock.calls.map(([entrada]) => entrada)

/** The three collections whose publication IS one of FR-006's actions. */
const PUBLICACOES = [
  { nome: 'projeto', collection: Projeto, acao: 'publicar_projeto', refTipo: 'projeto' },
  { nome: 'artigo', collection: Artigo, acao: 'publicar_artigo', refTipo: 'artigo' },
  { nome: 'modelo3d', collection: Modelo3d, acao: 'publicar_modelo3d', refTipo: 'modelo3d' },
] as const

describe('the credit hook on the publishables', () => {
  beforeEach(() => {
    vi.mocked(creditXp).mockClear()
    vi.mocked(creditXp).mockResolvedValue(true)
  })

  it.each(PUBLICACOES)(
    '$nome credits once on the approving write, naming its own action and ref',
    async ({ collection, acao, refTipo }) => {
      await escrever(collection, aprovado())

      expect(creditos()).toHaveLength(1)
      const credito = creditos()[0]
      expect(credito).toMatchObject({ perfil: PERFIL, skill: SKILL, acao, refTipo, refId: CONTEUDO })
      // Identity, not shape: a fresh request would leave the entry and the approval in two
      // different transactions, and a `toEqual` on a plain object cannot tell them apart.
      expect(credito?.req).toBe(REQ)
    },
  )

  it.each(PUBLICACOES)(
    '$nome writes nothing when the document was already approved (FR-025, SC-001)',
    async ({ collection }) => {
      // The unpublish/republish cycle SC-001 names: `stampApproval` never clears the stamp, so
      // every later write arrives with `aprovacaoRegistrada` already true on the stored row.
      await escrever(collection, aprovado({ titulo: 'Título corrigido' }), {
        id: CONTEUDO,
        status: 'rascunho',
        aprovacaoRegistrada: true,
        aprovadoEm: '2026-09-14T12:00:00.000Z',
      })

      expect(creditos()).toEqual([])
    },
  )

  it.each(PUBLICACOES)('$nome writes nothing for a write that is not an approval', async ({
    collection,
  }) => {
    await escrever(
      collection,
      { id: CONTEUDO, titulo: 'Rascunho', status: 'em_revisao', autor: PERFIL, skill: SKILL },
      { id: CONTEUDO, status: 'rascunho' },
    )

    expect(creditos()).toEqual([])
  })

  it.each(PUBLICACOES)(
    '$nome credits the maker even when the publication names no skill (FR-039)',
    async ({ collection }) => {
      await escrever(collection, aprovado({ skill: null }))

      expect(creditos()).toHaveLength(1)
      // `null`, never `undefined`: `xpLedger.skill` is nullable and the entry must say so.
      expect(creditos()[0]?.skill).toBeNull()
    },
  )

  it.each(PUBLICACOES)('$nome resolves a populated relationship to its id', async ({
    collection,
  }) => {
    // Payload hands `doc` back at the request's own depth, so `autor` and `skill` arrive as
    // whole documents on any write made with `depth > 0`. Sending the object through as a
    // relationship value writes a row the idempotency key cannot be composed from.
    await escrever(collection, aprovado({ autor: { id: PERFIL, handle: 'nick' }, skill: { id: SKILL } }))

    expect(creditos()[0]).toMatchObject({ perfil: PERFIL, skill: SKILL })
  })

  it.each(PUBLICACOES)(
    '$nome credits nothing, and does not throw, when the content has no author',
    async ({ collection }) => {
      // A real state today: `projeto.autor` lands in T039, so every project publication until
      // then arrives with no author. Throwing here would roll back a publication that was not
      // wrong.
      await escrever(collection, aprovado({ autor: null }))

      expect(creditos()).toEqual([])
    },
  )

  it.each(PUBLICACOES)('$nome lets a failed credit roll the approval back (SC-003)', async ({
    collection,
  }) => {
    const queda = new Error('ledger write failed')
    vi.mocked(creditXp).mockRejectedValueOnce(queda)

    // Swallowing this would commit the publication with no entry behind it — FR-004 inverted,
    // and nothing left to notice it.
    await expect(escrever(collection, aprovado())).rejects.toThrow(queda)
  })
})

describe('the collections that must NOT credit a publication', () => {
  beforeEach(() => {
    vi.mocked(creditXp).mockClear()
    vi.mocked(creditXp).mockResolvedValue(true)
  })

  it('evento credits nothing when it is approved (FR-008, CLR-012, SC-020)', async () => {
    await escrever(Evento, aprovado({ titulo: 'Oficina de marcenaria' }))

    expect(creditos()).toEqual([])
  })

  it('aula credits nothing when it is published — FR-006 lists no such action', async () => {
    // `ACOES_XP` has no `publicar_aula`, and `assistir_aula` belongs to the maker who watches
    // the class: crediting it here would consume that maker's own idempotency key.
    await escrever(Aula, aprovado({ titulo: 'Introdução à CNC' }))

    expect(creditos()).toEqual([])
  })
})
