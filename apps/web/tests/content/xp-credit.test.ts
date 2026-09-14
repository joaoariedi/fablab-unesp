import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ACOES_XP, REF_TIPOS_XP } from '../../collections/content/XpLedger'
import { creditXp } from '../../lib/content/xp'
import config from '../../payload.config'
import { buildWorld } from '../tenancy/fixtures'

/** A `refId` no other case uses, so the count below is this case's own. */
const REF_DA_CORRIDA = 777_777

/**
 * T017b / SC-020, CLR-012, FR-008, FR-042 — **approving an `evento` writes zero ledger
 * entries.**
 *
 * `evento` is the collection that looks exactly like the four publishables and must not behave
 * like one. It carries `aprovacaoRegistrada` and `aprovadoEm` — the same pair `stampApproval`
 * writes on `projeto`, `artigo`, `aula` and `modelo3d` — so *"register the credit hook on the
 * reviewable collections"* would have credited event publication, which FR-008 forbids in one
 * line (*"o calendário não concede XP por enquanto"*, PO 2026-08-24). CHK002 caught it before
 * a line was written; this file is what keeps it caught.
 *
 * **Driven against a real database, because that is the only place the claim is falsifiable.**
 * `xp-credit-hook.test.ts` asserts the same refusal against the exported collection with
 * `creditXp` mocked — a strictly weaker statement, since it can only see the hooks `Evento.ts`
 * itself declares. A credit reaching the ledger from anywhere else (a shared hook added to
 * every content collection at config assembly, a `beforeChange` on `xpLedger`, a plugin) is
 * invisible to it and visible here. SC-020 asks for exactly this: *"an integration test
 * approving an event and asserting zero entries"*.
 *
 * Three things make the zero mean something rather than merely be true:
 *
 *   1. **The approval is proven to have happened.** A publish that silently failed would also
 *      write no entry, and the test would pass while asserting nothing. So the event is read
 *      back and its approval record asserted before the ledger is counted.
 *   2. **A positive control runs in the same world, through the same call.** An `artigo` of the
 *      same lab is approved the same way and must write exactly one entry. Without it, a
 *      credit path broken for *every* collection — an unregistered hook, a missing `regrasXp`
 *      row, a swallowed error — reads as CLR-012 holding.
 *   3. **The event's own two extra states are exercised.** `cancelado` and `concluido` exist
 *      only here, and `publicado → cancelado → publicado` is the sequence a credit hook
 *      registered later would fire on a second time.
 *
 * The world is a sentinel organization of this file's own, torn down in `afterAll`, rather than
 * `fixtures.ts`'s `buildWorld` — which resets the whole database and seeds every scoped
 * collection, including an `xpLedger` row of its own that this file would then have to
 * subtract from its counts.
 */

const SLUG_SENTINELA = 't017b-evento'
const HOST = `${SLUG_SENTINELA}.localhost`
const SENHA = 'fixture-password-123'

type Linha = { id: string | number }
type Documento = Record<string, unknown>

let payload: Payload
let tenant: string | number
let usuario: Linha
let evento: Linha
let artigo: Linha

/** The ledger of this lab after the event was approved, and nothing else had happened. */
let aposAprovarEvento: { totalDocs: number; docs: Documento[] }
/** …and after `publicado → cancelado → publicado`, the cycle only this collection has. */
let aposRepublicarEvento: { totalDocs: number; docs: Documento[] }
/** …and after the positive control: an `artigo` of the same lab, approved the same way. */
let aposAprovarArtigo: { totalDocs: number; docs: Documento[] }
/** The event as stored once approved — the proof the act under test actually took place. */
let eventoAprovado: Documento

/**
 * A request carrying the two things a content hook needs, exactly as `fixtures.ts` builds one.
 *
 * The **host**, because `creditXp` reaches Payload through `getTenantScopedPayload`, which
 * resolves the organization from `x-tenant-host` and throws `TenantUnresolvedError` when there
 * is none — so a seed or an approval made with a bare Local API call cannot credit anything,
 * and the zero this file asserts would be an artefact of the harness rather than of CLR-012.
 * The **user**, because that same client reads and writes with `overrideAccess: false`, and a
 * hook acting on behalf of nobody is refused in `executeAccess`.
 */
const pedido = () =>
  ({ headers: new Headers({ 'x-tenant-host': HOST }), user: usuario }) as never

const criar = async (collection: string, data: Documento): Promise<Linha> =>
  (await payload.create({
    collection: collection as never,
    data: { ...data, tenant } as never,
    // Setting up the world is not the thing under test: forcing the setup through the guarded
    // path would make a broken guard look like a broken fixture (fixtures.ts, verbatim).
    overrideAccess: true,
    req: pedido(),
  })) as unknown as Linha

/**
 * One write into a new status — the only act any test in this file performs on content.
 *
 * Generalised over the collection for T018, which drives `publicado → rascunho → publicado`
 * on an `artigo`: the cycle and `evento`'s own `cancelado` hop are the same operation, and a
 * second copy of it would be a second place for the request (host plus user) to go wrong.
 */
const mudarStatus = async (
  collection: string,
  id: string | number,
  status: string,
): Promise<Documento> =>
  (await payload.update({
    collection: collection as never,
    id,
    data: { status } as never,
    overrideAccess: true,
    req: pedido(),
  })) as unknown as Documento

/** The act under test, and the act of the positive control: one write into `publicado`. */
const publicar = (collection: string, id: string | number): Promise<Documento> =>
  mudarStatus(collection, id, 'publicado')

/** Every ledger entry of this lab, read past access control. */
const ledger = async (): Promise<{ totalDocs: number; docs: Documento[] }> => {
  const { docs, totalDocs } = await payload.find({
    collection: 'xpLedger',
    where: { tenant: { equals: tenant } },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })
  return { totalDocs, docs: docs as unknown as Documento[] }
}

/** The smallest Lexical document Payload accepts for a required `richText` field. */
const paragrafo = (texto: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        textFormat: 0,
        children: [
          { type: 'text', text: texto, format: 0, style: '', mode: 'normal', detail: 0, version: 1 },
        ],
      },
    ],
  },
})

const limpar = async () => {
  for (const collection of [
    'xpLedger',
    'artigo',
    'evento',
    'local',
    'perfilMaker',
    // T018's skill: referenced by its artigo, its ledger entry and the maker's panel, so it
    // is deleted only once all three are gone.
    'skill',
    'categoriaArtigo',
    'midiaImagem',
    'regrasXp',
  ]) {
    // Reverse dependency order: deleting forwards removes a row while its referrer still points
    // at it, and Postgres refuses on the foreign key (fixtures.ts § resetWorld).
    await payload.delete({
      collection: collection as never,
      where: { tenant: { equals: tenant } } as never,
      overrideAccess: true,
    })
  }
  await payload.delete({
    collection: 'users',
    where: { id: { equals: usuario.id } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'organizations',
    where: { slug: { equals: SLUG_SENTINELA } },
    overrideAccess: true,
  })
}

beforeAll(async () => {
  payload = await getPayload({ config })

  const organizacao = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab T017b', slug: SLUG_SENTINELA, status: 'active' },
    overrideAccess: true,
  })
  tenant = organizacao.id

  // Created before `pedido()` is ever called: every seed below travels as this user.
  usuario = (await payload.create({
    collection: 'users',
    data: {
      email: 't017b@example.com',
      password: SENHA,
      role: 'user',
      orgs: [{ organization: tenant, role: 'admin' }],
    },
    overrideAccess: true,
  })) as unknown as Linha

  const imagem = await criar('midiaImagem', {})
  const categoria = await criar('categoriaArtigo', { nome: 'Eixo T017b', slug: 'eixo-t017b', ordem: 1 })
  const perfil = await criar('perfilMaker', {
    nome: 'Maker T017b',
    handle: '@makert017b',
    usuario: usuario.id,
  })
  const local = await criar('local', { nome: 'Sala T017b' })

  evento = await criar('evento', {
    titulo: 'Oficina de marcenaria',
    slug: 'oficina-t017b',
    tipo: 'oficina',
    descricaoCurta: 'Evento de fixture T017b.',
    inicioEm: '2026-10-01T13:00:00.000Z',
    fimEm: '2026-10-01T16:00:00.000Z',
    local: local.id,
    responsavel: perfil.id,
    status: 'rascunho',
  })

  artigo = await criar('artigo', {
    titulo: 'Artigo T017b',
    slug: 'artigo-t017b',
    resumo: 'Resumo do artigo T017b.',
    corpo: paragrafo('Corpo do artigo T017b.'),
    capa: imagem.id,
    categoria: categoria.id,
    // The positive control credits this profile: a publication with no author credits nobody
    // and does not throw (creditOnApproval, plan § D3), which would make the control silent.
    autor: perfil.id,
    status: 'rascunho',
  })

  eventoAprovado = await publicar('evento', evento.id)
  aposAprovarEvento = await ledger()

  await mudarStatus('evento', evento.id, 'cancelado')
  await mudarStatus('evento', evento.id, 'publicado')
  aposRepublicarEvento = await ledger()

  await publicar('artigo', artigo.id)
  aposAprovarArtigo = await ledger()
}, 120_000)

afterAll(async () => {
  if (payload) await limpar()
})

describe('approving an evento credits nothing (T017b, SC-020, CLR-012, FR-008)', () => {
  it('really approved it — the stamp the four publishables credit on is on the row', () => {
    // Without this, a publish that silently failed would also write no entry and every
    // assertion below would pass while asserting nothing about CLR-012.
    expect(eventoAprovado.status).toBe('publicado')
    expect(
      eventoAprovado.aprovacaoRegistrada,
      'the event was published and `stampApproval` recorded nothing, so the zero below is the ' +
        'absence of an approval rather than the absence of a credit',
    ).toBe(true)
    expect(typeof eventoAprovado.aprovadoEm).toBe('string')
  })

  it('writes ZERO xpLedger entries for this lab (SC-020)', () => {
    expect(
      aposAprovarEvento.totalDocs,
      'publishing an event credited XP. FR-008 gives the calendar no XP in v1 and CLR-012 keeps ' +
        'the credit hook off `evento` — which carries `aprovacaoRegistrada` exactly like the ' +
        'four publishables, so this is what "register it on the reviewable collections" looks ' +
        'like from the ledger. Entries: ' +
        JSON.stringify(aposAprovarEvento.docs),
    ).toBe(0)
  })

  it('still credits nothing across publicado → cancelado → publicado', () => {
    // The two states only this collection has. A credit hook registered here later would fire
    // on the republish as well, which is the second entry SC-001 forbids everywhere else.
    expect(
      aposRepublicarEvento.totalDocs,
      'cancelling and republishing an event credited XP. Entries: ' +
        JSON.stringify(aposRepublicarEvento.docs),
    ).toBe(0)
  })
})

describe('the control: the same act on a publishable DOES credit', () => {
  it('approving an artigo of the same lab writes exactly one entry', () => {
    // Without this the file passes when the credit path is broken for *everything* — an
    // unregistered hook, a missing `regrasXp` row, a swallowed rejection — and reports it as
    // CLR-012 holding.
    expect(
      aposAprovarArtigo.totalDocs,
      'approving an artigo in the same world, through the same call, wrote ' +
        String(aposAprovarArtigo.totalDocs) +
        ' entries instead of one. Until that is one, the zero asserted for `evento` says ' +
        'nothing about `evento`',
    ).toBe(1)
    expect(aposAprovarArtigo.docs[0]).toMatchObject({
      acao: 'publicar_artigo',
      refTipo: 'artigo',
      refId: Number(artigo.id),
    })
  })
})

describe('the ledger has no vocabulary for an event publication (CLR-012)', () => {
  it('neither ACOES_XP nor REF_TIPOS_XP can name one', () => {
    // The refusal enforced where a hook cannot route around it: a `publicar_evento` is not a
    // value the column accepts, so a future hook cannot write the entry even by mistake.
    expect(ACOES_XP).not.toContain('publicar_evento')
    expect(REF_TIPOS_XP).not.toContain('evento')
  })
})

/**
 * T018 / SC-001, US1, FR-003 — **approve → unpublish → re-approve writes exactly ONE entry,
 * driven against a real database.**
 *
 * SC-001 names the evidence it wants in its own words: *"an integration test driving a real
 * approve → unpublish → approve cycle"*. `xp-credit-hook.test.ts` already asserts the refusal
 * with `creditXp` mocked, and that is a strictly weaker statement — it sees the arguments the
 * hook was called with and nothing else. Everything between the hook and the row is exactly
 * what SC-001 is about: `stampApproval` re-asserting the stamp onto an unpublish so the
 * republish is not a fresh approval, the field access that keeps a request from clearing it,
 * and the unique index on `chaveIdempotencia` behind both. Here those run.
 *
 * **Two mechanisms hold this, and the assertions below are deliberately about the OUTCOME
 * rather than about either one.** The hook refuses a document already stamped, and the ledger
 * refuses a duplicate key even if the hook is bypassed. Measured here, 2026-09-14, not assumed:
 * deleting the hook's `previousDoc.aprovacaoRegistrada` guard alone leaves this file **green**
 * — the unpublish and the republish both reach `creditXp`, and the unique index on
 * `chaveIdempotencia` turns each into FR-025's no-op. Only when *both* are broken (that guard
 * removed **and** the key made non-deterministic) does it go red, with three entries, an entry
 * id that moved, and an `xpTotal` of 3. So a test written against either mechanism alone would
 * pass while the other was the only thing still holding SC-001, and would report that as the
 * guarantee.
 *
 * Four things make the one mean something rather than merely be true:
 *
 *   1. **The cycle is proven to have happened** — each of the three writes is read back.
 *      A republish that silently failed, or an unpublish that never took, also yields one
 *      entry, and the assertion would be about nothing.
 *   2. **The count is taken after EACH step**, not only at the end. One entry at the end is
 *      also what a second credit followed by a delete would look like, and the ledger is
 *      append-only (FR-001).
 *   3. **The surviving row is the SAME row** — its id and `criadoEm` are unchanged. A
 *      delete-and-rewrite, or an entry replaced by a later one, counts as one too.
 *   4. **The projection did not double either.** `perfilMaker.xpTotal` is recomputed from the
 *      ledger on every credit (FR-010), so a second credit is visible there as well — and a
 *      projection that drifted while the ledger stayed correct is precisely the state FR-011's
 *      reconciliation gate exists to catch. `xpPorAcao` is read from this lab's own `regrasXp`
 *      row rather than written here as a number: the seed is 1 today (CLR-010), and against a
 *      hard-coded 1 a `count` masquerading as a `sum` would pass.
 *
 * The maker and the skill are this section's own, so the totals asserted belong to a profile
 * that earned in exactly one way — the T017b control credits its own profile, and sharing one
 * would make every number here a subtraction.
 */

const SLUG_ARTIGO_T018 = 'artigo-t018'

let perfilT018: Linha
let skillT018: Linha
let artigoT018: Linha

/** This lab's economy, as stored. The amount one action is worth is not this file's to decide. */
let xpPorAcao: number

/** The publication as read back after each of the cycle's three writes. */
let aprovadoT018: Documento
let despublicadoT018: Documento
let reaprovadoT018: Documento

/** This publication's ledger entries after each step — never the lab's, so T017b is not mixed in. */
let entradasAposAprovar: { totalDocs: number; docs: Documento[] }
let entradasAposDespublicar: { totalDocs: number; docs: Documento[] }
let entradasAposReaprovar: { totalDocs: number; docs: Documento[] }

/** The maker's projections once the whole cycle is done. */
let perfilAposCiclo: Documento

/** Every ledger entry naming one publication, read past access control. */
const entradasDe = async (
  refTipo: string,
  refId: number,
): Promise<{ totalDocs: number; docs: Documento[] }> => {
  const { docs, totalDocs } = await payload.find({
    collection: 'xpLedger',
    where: {
      and: [
        { tenant: { equals: tenant } },
        { refTipo: { equals: refTipo } },
        { refId: { equals: refId } },
      ],
    },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })
  return { totalDocs, docs: docs as unknown as Documento[] }
}

beforeAll(async () => {
  const { docs } = await payload.find({
    collection: 'regrasXp',
    where: { tenant: { equals: tenant } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  xpPorAcao = (docs[0] as { xpPorAcao?: number } | undefined)?.xpPorAcao as number

  perfilT018 = await criar('perfilMaker', {
    nome: 'Maker T018',
    handle: '@makert018',
    usuario: usuario.id,
  })
  skillT018 = await criar('skill', { nome: 'Marcenaria T018', slug: 'marcenaria-t018', ativa: true })

  const imagem = await criar('midiaImagem', {})
  const categoria = await criar('categoriaArtigo', { nome: 'Eixo T018', slug: 'eixo-t018', ordem: 2 })

  artigoT018 = await criar('artigo', {
    titulo: 'Artigo T018',
    slug: SLUG_ARTIGO_T018,
    resumo: 'Resumo do artigo T018.',
    corpo: paragrafo('Corpo do artigo T018.'),
    capa: imagem.id,
    categoria: categoria.id,
    autor: perfilT018.id,
    // Named so the `skills[]` half of the projection is exercised as well: a cycle that
    // double-credited would show it in the panel, not only in `xpTotal`.
    skill: skillT018.id,
    status: 'rascunho',
  })

  // ── The cycle SC-001 names, one write at a time, counted after each ──────────────────────
  aprovadoT018 = await publicar('artigo', artigoT018.id)
  entradasAposAprovar = await entradasDe('artigo', Number(artigoT018.id))

  despublicadoT018 = await mudarStatus('artigo', artigoT018.id, 'rascunho')
  entradasAposDespublicar = await entradasDe('artigo', Number(artigoT018.id))

  reaprovadoT018 = await publicar('artigo', artigoT018.id)
  entradasAposReaprovar = await entradasDe('artigo', Number(artigoT018.id))

  perfilAposCiclo = (await payload.findByID({
    collection: 'perfilMaker',
    id: perfilT018.id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Documento
}, 120_000)

describe('approve → unpublish → re-approve credits exactly once (T018, SC-001, US1)', () => {
  it('really ran the cycle — three writes, each one read back', () => {
    // Without this the single entry below could be the shape of a republish that never
    // happened, and nothing in this file would notice.
    expect(aprovadoT018.status, 'the first approval did not take').toBe('publicado')
    expect(despublicadoT018.status, 'the unpublish did not take').toBe('rascunho')
    expect(reaprovadoT018.status, 'the re-approval did not take').toBe('publicado')
    expect(
      reaprovadoT018.aprovacaoRegistrada,
      'the republished artigo carries no approval record, so the single entry says nothing ' +
        'about a SECOND approval being refused — there was no approval to refuse',
    ).toBe(true)
  })

  it('writes exactly one entry on the first approval', () => {
    expect(
      entradasAposAprovar.totalDocs,
      'approving a publication for the first time wrote ' +
        String(entradasAposAprovar.totalDocs) +
        ' entries instead of one. Entries: ' +
        JSON.stringify(entradasAposAprovar.docs),
    ).toBe(1)
    expect(entradasAposAprovar.docs[0]).toMatchObject({
      acao: 'publicar_artigo',
      refTipo: 'artigo',
      refId: Number(artigoT018.id),
      quantidade: xpPorAcao,
    })
  })

  it('unpublishing neither credits nor removes anything (FR-001)', () => {
    // The ledger is append-only: an unpublish must leave the entry exactly where it is. A
    // zero here would be an entry deleted, which reads identically to "never written" at the
    // end of the cycle.
    expect(
      entradasAposDespublicar.totalDocs,
      'unpublishing changed this publication’s ledger entries from 1 to ' +
        String(entradasAposDespublicar.totalDocs),
    ).toBe(1)
  })

  it('re-approving writes NO second entry (SC-001)', () => {
    expect(
      entradasAposReaprovar.totalDocs,
      're-approving the same publication wrote ' +
        String(entradasAposReaprovar.totalDocs) +
        ' entries. SC-001 allows exactly one for the whole cycle: `stampApproval` never clears ' +
        'the stamp, so the republish is not a first approval, and the unique index on ' +
        '`chaveIdempotencia` refuses the duplicate even when it is reached. Entries: ' +
        JSON.stringify(entradasAposReaprovar.docs),
    ).toBe(1)
  })

  it('and it is the SAME entry, never a rewritten one (FR-001)', () => {
    // One entry at the end is also what "credited twice, then deleted one" looks like, and
    // what "replaced by a fresh row" looks like. Identity is what separates them.
    const antes = entradasAposAprovar.docs[0]
    const depois = entradasAposReaprovar.docs[0]
    expect(depois?.id, 'the surviving entry is a different row than the one first written').toBe(
      antes?.id,
    )
    // `createdAt`, not a `criadoEm` of our own: FR-002's "when" is Payload's own column, and
    // `XpLedger.ts` records why there is exactly one answer to that question. Asserted to be a
    // string first — two `undefined`s compare equal, and a field this collection does not have
    // would make the line below pass while comparing nothing.
    expect(typeof antes?.createdAt, `the entry carries no createdAt: ${JSON.stringify(antes)}`).toBe(
      'string',
    )
    expect(
      depois?.createdAt,
      'the surviving entry was re-dated, so it was written again rather than kept',
    ).toBe(antes?.createdAt)
  })

  it('leaves the maker credited once in xpTotal and in the panel (FR-010)', () => {
    // The ledger and the projection are two places a double credit can show, and the gate
    // that reconciles them (FR-011) runs nightly — not inside this cycle.
    expect(
      perfilAposCiclo.xpTotal,
      `xpTotal is ${String(perfilAposCiclo.xpTotal)} after a cycle worth one action of ` +
        `${String(xpPorAcao)} XP`,
    ).toBe(xpPorAcao)

    const panel = (perfilAposCiclo.skills ?? []) as { skill?: unknown; xp?: number }[]
    const linha = panel.find((row) => String(row.skill) === String(skillT018.id))
    expect(linha?.xp, `the SUAS SKILLS row for this skill reads ${JSON.stringify(linha)}`).toBe(
      xpPorAcao,
    )
  })
})

/**
 * T019 / SC-003, US1, FR-004 — **a rejected ledger write rolls the approval back: the content
 * is still unpublished afterwards.**
 *
 * SC-003 names its own evidence: *"a test with a rejecting ledger, asserting the content is
 * still unpublished"*. This is the assertion that proves `afterChange` runs **inside** the
 * approving transaction rather than assuming it. Nothing else in this feature can: `creditXp`
 * awaiting its create and rethrowing anything that is not the duplicate is necessary but not
 * sufficient — if the hook ran after the commit (Payload's `after: commit`), or on a request of
 * its own, the same rethrow would leave a published article with no entry behind it, and every
 * unit test of `creditXp` would still be green. The rollback is a property of where the hook
 * runs, and only a real transaction can be asked about it.
 *
 * **The ledger is made to reject at the database**, by replacing `payload.db.create` for the
 * duration of one approval and letting every other collection through. That is the narrowest
 * seam that is still *below* everything under test: the hook, `creditXp`'s try/catch, the
 * tenant client and Payload's own operation all run untouched, exactly as they do in
 * production, and only the insert into `xp_ledger` comes back as a failure. Breaking the
 * economy instead (deleting `regrasXp`) would fail *before* the write and would prove a
 * strictly weaker thing — that a throw from a hook rolls back, not that the ledger's own
 * refusal does.
 *
 * The rejection is a plain `Error` on purpose: `creditXp` swallows exactly one error shape —
 * the unique-index duplicate, which is idempotency's success path (FR-025) — and a test that
 * injected that shape would assert the opposite of SC-003.
 *
 * Four things make the rollback mean something rather than merely be true:
 *
 *   1. **The ledger was actually reached.** A hook that never credits also leaves the content
 *      unpublishable-by-rollback-looking... no: it publishes. The interception count is
 *      asserted anyway, so "the credit path never ran" can never be read as "the rollback
 *      held".
 *   2. **The content is re-read from the database on a fresh request**, after the failed
 *      transaction is dead. Reading through the same `req` would report the doomed
 *      transaction's own uncommitted view.
 *   3. **No entry and no projection survived.** `xpTotal` is written in the same transaction
 *      (FR-010), so a rollback that spared it would leave the projection claiming a credit the
 *      ledger cannot show — the exact drift FR-011's gate exists to catch.
 *   4. **A positive control runs in the same world, on the same row.** With the ledger
 *      restored, the very same approval publishes and credits once. Without it, an article that
 *      could never be published for any other reason — a failing validator, a broken fixture —
 *      would read as SC-003 holding.
 *
 * **Which assertion catches which defect — measured, 2026-09-14, not assumed.** Two mutations
 * of `creditOnApproval` were run against this section:
 *
 *   - **The credit left un-awaited** (`void creditXp(...)`) — the "afterChange assumed to be
 *     inside the transaction" defect itself. The article commits **publicado**, the ledger is
 *     never even reached inside the write, and three assertions here go red. This is the one
 *     the task names.
 *   - **The credit failure swallowed** (`try { await creditXp(...) } catch {}`). Only the
 *     *rejection* assertion goes red: the article stays `rascunho` anyway, because Payload's
 *     create operation already called `killTransaction` on the way out, so the approval had
 *     nothing left to commit. So **"still unpublished" alone would pass a hook that silently
 *     drops every credit** — a published-looking rollback for the wrong reason. The two
 *     assertions are kept together for exactly that: the status proves the rollback, and the
 *     rejection proves the caller was told.
 */

const SLUG_ARTIGO_T019 = 'artigo-t019'

/** What the injected ledger failure says. Asserted, so a rollback from another cause is visible. */
const FALHA_LEDGER = 'T019: o xpLedger recusou a escrita'

let perfilT019: Linha
let artigoT019: Linha

/** How many inserts into `xpLedger` the injected failure actually refused. */
let recusasDoLedger = 0
/** What the approval rejected with — `null` if it did not reject at all, which is a failure. */
let erroDaAprovacao: unknown

/** The publication, its entries and its author, read back AFTER the failed approval. */
let artigoAposFalha: Documento
let entradasAposFalha: { totalDocs: number; docs: Documento[] }
let perfilAposFalha: Documento

/** …and after the control: the same approval, with the ledger working again. */
let artigoAposControle: Documento
let entradasAposControle: { totalDocs: number; docs: Documento[] }
let perfilAposControle: Documento

type CriarNoBanco = Payload['db']['create']

/**
 * Run `acao` with every insert into `xpLedger` refused at the database, and restore the adapter
 * however it ends.
 *
 * Restored in `finally` rather than after the call: the act under test is expected to reject,
 * and a ledger left rejecting would poison every file after this one — `fileParallelism` is off
 * and the adapter is the process-wide singleton.
 */
const comLedgerRecusando = async <T>(acao: () => Promise<T>): Promise<T> => {
  const original = payload.db.create.bind(payload.db) as CriarNoBanco
  payload.db.create = (async (args: Parameters<CriarNoBanco>[0]) => {
    if (args.collection !== 'xpLedger') return original(args)
    recusasDoLedger += 1
    throw new Error(FALHA_LEDGER)
  }) as CriarNoBanco
  try {
    return await acao()
  } finally {
    payload.db.create = original
  }
}

/** One row as committed, read on a request of its own — never the failed transaction's view. */
const lerDocumento = async (collection: string, id: string | number): Promise<Documento> =>
  (await payload.findByID({
    collection: collection as never,
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Documento

beforeAll(async () => {
  perfilT019 = await criar('perfilMaker', {
    nome: 'Maker T019',
    handle: '@makert019',
    usuario: usuario.id,
  })

  const imagem = await criar('midiaImagem', {})
  const categoria = await criar('categoriaArtigo', { nome: 'Eixo T019', slug: 'eixo-t019', ordem: 3 })

  artigoT019 = await criar('artigo', {
    titulo: 'Artigo T019',
    slug: SLUG_ARTIGO_T019,
    resumo: 'Resumo do artigo T019.',
    corpo: paragrafo('Corpo do artigo T019.'),
    capa: imagem.id,
    categoria: categoria.id,
    autor: perfilT019.id,
    status: 'rascunho',
  })

  // ── The act under test: approve once, with the ledger refusing ───────────────────────────
  erroDaAprovacao = await comLedgerRecusando(async () => {
    try {
      await publicar('artigo', artigoT019.id)
      return null
    } catch (erro) {
      return erro
    }
  })

  artigoAposFalha = await lerDocumento('artigo', artigoT019.id)
  entradasAposFalha = await entradasDe('artigo', Number(artigoT019.id))
  perfilAposFalha = await lerDocumento('perfilMaker', perfilT019.id)

  // ── The control: the same approval, on the same row, with the ledger working ─────────────
  await publicar('artigo', artigoT019.id)
  artigoAposControle = await lerDocumento('artigo', artigoT019.id)
  entradasAposControle = await entradasDe('artigo', Number(artigoT019.id))
  perfilAposControle = await lerDocumento('perfilMaker', perfilT019.id)
}, 120_000)

describe('a rejected ledger write rolls the approval back (T019, SC-003, US1)', () => {
  it('really reached the ledger, and really rejected', () => {
    // Without this, a credit path that never ran at all would reach the assertions below with
    // nothing to say, and the first of them would be measuring a hook that does not exist.
    expect(
      recusasDoLedger,
      'no insert into xpLedger was attempted while approving, so nothing below says anything ' +
        'about a FAILED credit — the credit never happened',
    ).toBeGreaterThanOrEqual(1)
    // Asserted to BE an error before its message is read: `toContain` on the `undefined` a
    // resolved approval leaves behind reports an argument-type complaint instead of the defect,
    // and the defect is the whole point of the line (measured against a swallowing hook, below).
    expect(
      erroDaAprovacao,
      'approving with a rejecting ledger did not reject: the caller was told the publication ' +
        'succeeded. FR-004 makes the entry part of the approval, so a credit that failed must ' +
        'take the approval with it and say so',
    ).toBeInstanceOf(Error)
    expect(
      String((erroDaAprovacao as Error | null)?.message),
      'the approval rejected with something other than the ledger failure, so the rollback ' +
        'below may be some other refusal wearing SC-003 s clothes',
    ).toContain(FALHA_LEDGER)
  })

  it('leaves the content STILL UNPUBLISHED (SC-003)', () => {
    expect(
      artigoAposFalha.status,
      'the article is ' +
        JSON.stringify(artigoAposFalha.status) +
        ' after an approval whose ledger write failed. SC-003 forbids published content with ' +
        'no entry behind it, and the rollback is what `afterChange` running INSIDE the ' +
        'approving transaction buys — running after the commit would leave exactly this row ' +
        'published and uncredited',
    ).toBe('rascunho')
  })

  it('and carries no approval stamp either', () => {
    // `stampApproval` writes the record in `beforeChange` of the same write. If it survived the
    // rollback, the next approval would arrive with `previousDoc.aprovacaoRegistrada === true`
    // and `creditOnApproval`'s second guard would skip the credit forever: unpublished content
    // that can never be credited again.
    expect(artigoAposFalha.aprovacaoRegistrada).not.toBe(true)
    expect(artigoAposFalha.aprovadoEm ?? null).toBeNull()
  })

  it('writes no ledger entry that outlives the rollback (FR-001, FR-004)', () => {
    expect(
      entradasAposFalha.totalDocs,
      'the failed approval left ' +
        String(entradasAposFalha.totalDocs) +
        ' entries behind. Entries: ' +
        JSON.stringify(entradasAposFalha.docs),
    ).toBe(0)
  })

  it('and moves no projection (FR-010)', () => {
    // The projection is written in the same transaction as the entry, so it must roll back with
    // it. An xpTotal that survived would claim a credit the ledger cannot show — the drift
    // FR-011's reconciliation gate exists to catch, arriving here for free.
    expect(
      perfilAposFalha.xpTotal,
      `xpTotal is ${String(perfilAposFalha.xpTotal)} after an approval that was rolled back`,
    ).toBe(0)
  })
})

describe('the control: with the ledger working, the same approval goes through', () => {
  it('publishes the very same article and credits it exactly once', () => {
    // Without this the file passes for an article that could never be published at all — a
    // failing validator, a broken fixture — and reports it as SC-003 holding.
    expect(
      artigoAposControle.status,
      'the same article could not be published even with a working ledger, so the "still ' +
        'unpublished" asserted above is not evidence of a rollback',
    ).toBe('publicado')
    expect(artigoAposControle.aprovacaoRegistrada).toBe(true)
    expect(
      entradasAposControle.totalDocs,
      'approving with a working ledger wrote ' +
        String(entradasAposControle.totalDocs) +
        ' entries instead of one. Entries: ' +
        JSON.stringify(entradasAposControle.docs),
    ).toBe(1)
    expect(perfilAposControle.xpTotal).toBe(xpPorAcao)
  })
})

/**
 * The assertion that would have caught the defect this module was rebuilt around.
 *
 * `creditXp` used to write first and **catch** the duplicate, returning `false` for *"already
 * credited, carry on"*. It reads first now, and the difference is not stylistic — the old shape
 * was measurably a lie.
 *
 * Payload's `create` wraps every operation in
 * `catch (error) { await killTransaction(args.req); throw error }`, and `killTransaction` calls
 * `rollbackTransaction(req.transactionID)` **unconditionally** before deleting the id.
 * `@payloadcms/drizzle` takes **no savepoint** — there is no `SAVEPOINT` anywhere in the
 * adapter. So by the time a `catch` in this module ran, the caller's transaction was already
 * destroyed. Measured on this tree, with the old code:
 *
 *     { reconhecido: true, txAindaNoReq: null, sobreviveram: 0 }
 *
 * The duplicate was recognised, the transaction was gone, and the **first, entirely valid**
 * entry did not survive. `creditXp` returned `false` over a rollback.
 *
 * Neither existing test could see it: the unit test uses a fake store that throws a hand-built
 * object and kills no transaction, and the integration test drove its duplicate with no
 * enclosing transaction at all — so both measured the error *shape*, correctly, and never the
 * transaction *consequence*. This case measures the consequence, which is the requirement
 * (FR-004: granted inside the same transaction as the action that caused it).
 */
describe('a second credit leaves the causing transaction alive (FR-003, FR-004)', () => {
  it('no-ops on the duplicate and commits the work that was already right', async () => {
    const world = await buildWorld()
    const req: Record<string, unknown> = {
      payload,
      headers: new Headers({ 'x-tenant-host': 'org-a.localhost' }),
      user: world.userA,
    }
    // A REAL transaction on the req — this is the whole instrument. Without it the duplicate
    // costs nothing and the case passes against the code it exists to refuse.
    req.transactionID = await payload.db.beginTransaction()

    // Asserted rather than asserted-away: `noUncheckedIndexedAccess` is on, and an absent
    // fixture row would otherwise reach `creditXp` as `undefined` and fail for the wrong reason.
    const perfil = world.rows.perfilMaker?.A
    const skill = world.rows.skill?.A
    expect(perfil, 'the fixture seeded no perfilMaker for A').toBeDefined()
    expect(skill, 'the fixture seeded no skill for A').toBeDefined()

    const entrada = {
      req: req as never,
      perfil: perfil as string | number,
      skill: skill as string | number,
      acao: 'publicar_projeto' as const,
      refTipo: 'projeto' as const,
      refId: REF_DA_CORRIDA,
    }

    expect(await creditXp(entrada), 'the first credit did not write').toBe(true)
    expect(
      await creditXp(entrada),
      'the second credit reported a write. It is the same tuple, so FR-003 makes it a no-op.',
    ).toBe(false)

    expect(
      req.transactionID,
      'the caller’s transaction was destroyed by the second credit. That is the defect this ' +
        'file exists to pin: `killTransaction` rolls back unconditionally and there are no ' +
        'savepoints, so a duplicate caught AFTER the insert takes the approval down with it.',
    ).toBeDefined()

    await payload.db.commitTransaction(req.transactionID as never)

    const { totalDocs } = await payload.count({
      collection: 'xpLedger',
      where: { refId: { equals: REF_DA_CORRIDA } } as never,
      overrideAccess: true,
    })
    expect(
      totalDocs,
      'the entry did not survive the commit — the first, valid credit was rolled back by the ' +
        'second call rather than being left alone',
    ).toBe(1)
  }, 180_000)
})
