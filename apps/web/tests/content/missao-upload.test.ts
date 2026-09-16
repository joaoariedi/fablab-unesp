import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'

/**
 * T031 / FR-036, SC-017, CLR-006 — **the security review of the mission upload surface**
 * (constitution Principle 5), driven against a real database.
 *
 * A mission submission carries a file a stranger uploaded, and the reviewer who opens the queue
 * opens it. That is what puts missions on the upload trust boundary, and what SC-017 turns into
 * a measurable statement: the submission stores a `midiaImagem` **id**, *"never a key, a URL or
 * a filename"*, and the image it names is this lab's — four wrong shapes, each fed to the write
 * and each refused.
 *
 * ── Why this file is not `missao-submissao-config.test.ts` again ────────────────────────────
 *
 * T027's file asserts the *declaration*: `comprovante` is a relationship, it points at
 * `midiaImagem`, it carries `sameTenant`. Every one of those can be true of a collection that
 * still accepts a storage key, because a declaration is not an outcome — Payload's validators,
 * the column type and the foreign key all have to agree for the refusal to actually happen, and
 * only a write against Postgres exercises the three together. This file feeds the values.
 *
 * ── The case that exposes the id-vs-key difference is IN the fixture ─────────────────────────
 *
 * The cheap version of this test invents its wrong shapes: `'uploads/foto.png'`,
 * `'https://exemplo/foto.png'`. Those are refused by a column that stores an integer *whatever
 * it points at* — they would be refused just as firmly if `comprovante` pointed at the wrong
 * collection, or at a collection that did not exist. They prove "a relationship column rejects
 * gibberish", which is a statement about Postgres.
 *
 * What exposes the difference is feeding the **real filename, the real URL and the real object
 * key of the very row whose id the write accepts** (§0 accepts the id; §1 refuses all three
 * strings). A column that stored a key would take them; this one cannot. So the fixture holds a
 * `midiaImagem` with its file metadata, the three strings are read **off the document Payload
 * stored** rather than from a list somebody typed here, and §1's sanity case fails the file if
 * that read came back empty — a `toBe(undefined)` loop is the vacuous pass this whole shape is
 * meant to avoid.
 *
 * The same rule decides §3: the question *"is there anywhere on this table a key could live?"*
 * is put to `information_schema` **after a real boot**, never to a hand-maintained list of field
 * names. `push` rebuilds the schema from the field config on connect, so the booted database is
 * the authority on what the columns actually are — the lesson `autor-nulavel.test.ts` was
 * written to record.
 *
 * ── The world ───────────────────────────────────────────────────────────────────────────────
 *
 * Two sentinel organizations of this file's own, torn down in `afterAll` (`buildWorld` resets
 * the whole database, and `counters.test.ts` reconciles it — a row left behind fails somebody
 * else's file). Lab B exists to hold an image belonging to **another lab's maker**, which is the
 * fourth shape.
 *
 * Every refused write below names a mission of its own. That is not tidiness: `(missao, maker)`
 * is a unique index (FR-023), so a second create against §0's mission would be refused by the
 * index and the case would pass without the guard under test ever running.
 */

const SLUG_LAB = 't031-upload'
const SLUG_OUTRO_LAB = 't031-upload-outro'
const HOST = `${SLUG_LAB}.localhost`
const HOST_OUTRO = `${SLUG_OUTRO_LAB}.localhost`
const SENHA = 'fixture-password-123'

/** The file metadata the fixture's proof photo carries. Read back, never asserted as a literal. */
const NOME_DO_ARQUIVO = 'comprovante-t031.png'

type Linha = { id: string | number }
type Documento = Record<string, unknown>

let payload: Payload
let tenant: string | number
let outroTenant: string | number
let equipe: Linha
let oMaker: Linha
let makerDoOutroLab: Linha
let perfilDoMaker: Linha
let skill: Linha
/** The legitimate proof: this lab's image, with the metadata §1's three strings are read from. */
let imagem: Documento
/** The fourth shape: an image uploaded by a maker of the OTHER lab. */
let imagemDeOutroMaker: Linha
/** §0's accepted submission, and the row §2 tries to re-point at the other lab's image. */
let submissao: Linha
/**
 * The refusal §2 read, kept so the disclosure case can inspect the same message rather than
 * provoking a second one — a second write would need a second mission and would assert against
 * a different error than the one a maker actually sees.
 */
let recusaDoOutroLab = ''
/** Columns of `missao_submissao` as the booted database reports them (§3). */
let colunas: { column_name: string; data_type: string }[] = []

/**
 * A request carrying the host and the user, exactly as the sibling integration files build one:
 * the host because everything reaching Payload through the tenancy choke point needs one, the
 * user because these writes run with `overrideAccess: false` and an operation acting for nobody
 * is refused in `executeAccess`.
 */
const pedido = (user: Linha, host = HOST) =>
  ({ headers: new Headers({ 'x-tenant-host': host }), user }) as never

/** Fixture setup, past the guards: a broken guard must not look like a broken fixture. */
const criar = async (
  collection: string,
  data: Documento,
  emQualTenant: string | number = tenant,
): Promise<Linha> =>
  (await payload.create({
    collection: collection as never,
    data: { ...data, tenant: emQualTenant } as never,
    overrideAccess: true,
    req: pedido(equipe),
  })) as unknown as Linha

const conta = async (
  sufixo: string,
  role: string,
  emQualTenant: string | number,
): Promise<Linha> =>
  (await payload.create({
    collection: 'users',
    data: {
      email: `${sufixo}@example.com`,
      password: SENHA,
      role: 'user',
      // `as never`: the fixture id is `string | number`, the generated `User` narrows it to this
      // database's own integer.
      orgs: [{ organization: emQualTenant, role }],
    } as never,
    overrideAccess: true,
  })) as unknown as Linha

/** A fresh mission, so a refusal below is never the unique index answering instead of the guard. */
const missaoNova = async (titulo: string): Promise<Linha> =>
  criar('missao', {
    titulo,
    descricao: 'Missão de apoio à revisão de segurança do upload (T031).',
    icone: imagem.id,
    skill: skill.id,
    status: 'publicado',
  })

/**
 * The maker attaching a proof, **through the guarded path** — the surface the review is about.
 * `overrideAccess: false` deliberately: a fixture that overrode access would prove the refusal
 * on a write no maker could have made.
 */
const anexar = async (missao: string | number, comprovante: unknown): Promise<Linha> =>
  (await payload.create({
    collection: 'missaoSubmissao',
    // `tenant` explicitly, exactly as `review.test.ts` writes its guarded creates: the
    // multi-tenant plugin's `assigned tenant` field is `required`, and the Local API has no
    // cookie for the plugin to read it from — without it every case below fails on *that*
    // field and never reaches `comprovante` at all.
    data: {
      missao,
      maker: perfilDoMaker.id,
      comprovante,
      status: 'enviada',
      tenant,
    } as never,
    overrideAccess: false,
    req: pedido(oMaker),
  })) as unknown as Linha

/** Whatever the write left behind, read past access control. Empty means it was refused. */
const submissoesDe = async (missao: string | number): Promise<Documento[]> => {
  const { docs } = await payload.find({
    collection: 'missaoSubmissao',
    where: { missao: { equals: missao } } as never,
    depth: 0,
    limit: 10,
    overrideAccess: true,
  })
  return docs as unknown as Documento[]
}

const linhaDaSubmissao = async (): Promise<Documento> =>
  (await payload.findByID({
    collection: 'missaoSubmissao',
    id: submissao.id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Documento

/** Everything an error carries, flattened: Payload reports field errors under `data.errors`. */
const mensagemDe = (err: unknown): string => {
  const e = err as { message?: string; data?: { errors?: { message?: string }[] } }
  return [e.message, ...(e.data?.errors ?? []).map((x) => x.message)].join(' ')
}

/** Runs a write that must fail, and hands back its message. Never swallows a success. */
const recusaDe = async (escrita: () => Promise<unknown>): Promise<string> => {
  try {
    await escrita()
  } catch (err) {
    return mensagemDe(err)
  }
  return ''
}

/**
 * The object key for a stored upload, derived from the document's own URL rather than rebuilt
 * from a template — the path an S3 client would GET, which is what "a key" means here.
 */
const chaveDoObjeto = (documento: Documento): string =>
  String(documento.url ?? '').replace(/^\/+/, '')

const limpar = async () => {
  for (const tenantId of [tenant, outroTenant]) {
    if (tenantId === undefined) continue
    // Reverse dependency order: deleting forwards removes a row while its referrer still points
    // at it, and Postgres refuses on the foreign key (fixtures.ts § resetWorld).
    for (const collection of [
      'xpLedger',
      'missaoSubmissao',
      'missao',
      'perfilMaker',
      'skill',
      'midiaImagem',
      'regrasXp',
    ]) {
      await payload.delete({
        collection: collection as never,
        where: { tenant: { equals: tenantId } } as never,
        overrideAccess: true,
      })
    }
  }
  await payload.delete({
    collection: 'users',
    where: { email: { like: 't031-upload%@example.com' } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'organizations',
    where: { slug: { in: [SLUG_LAB, SLUG_OUTRO_LAB] } },
    overrideAccess: true,
  })
}

beforeAll(async () => {
  // Booting IS part of the setup: `push` makes the live schema match the field config on
  // connect, and §3 asks the database what that left behind.
  payload = await getPayload({ config })
  await limpar().catch(() => undefined)

  const lab = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab T031', slug: SLUG_LAB, status: 'active' },
    overrideAccess: true,
  })
  tenant = lab.id
  const outroLab = await payload.create({
    collection: 'organizations',
    data: { name: 'Outro lab T031', slug: SLUG_OUTRO_LAB, status: 'active' },
    overrideAccess: true,
  })
  outroTenant = outroLab.id

  equipe = await conta(`${SLUG_LAB}-staff`, 'staff', tenant)
  oMaker = await conta(`${SLUG_LAB}-maker`, 'maker', tenant)
  makerDoOutroLab = await conta(`${SLUG_OUTRO_LAB}-maker`, 'maker', outroTenant)

  // **The row carries its file metadata**, because §1's three shapes are read off it. No bytes:
  // `filesRequiredOnCreate: false` exists for exactly this, CI runs Postgres with no object
  // store, and the review is about the *value written into the submission*, not about sharp.
  imagem = (await payload.create({
    collection: 'midiaImagem',
    data: {
      tenant,
      filename: NOME_DO_ARQUIVO,
      mimeType: 'image/png',
      filesize: 2048,
      // **No `url` in the data.** Payload reads `data.url` on an upload collection as a remote
      // file to FETCH (`generateFileData` → `FileRetrievalError: Failed to fetch from
      // http:://null/...`), which aborts the whole file in `beforeAll` and reports 13 *skipped*
      // tests rather than a failure. The served URL is Payload's to compose from `filename`,
      // and composing it here would be asserting against a string this file wrote anyway.
    } as never,
    overrideAccess: true,
    req: pedido(equipe),
  })) as unknown as Documento

  // Another lab, and another lab's *maker*: the fourth shape is somebody else's media, not an
  // abstract cross-tenant id.
  imagemDeOutroMaker = (await payload.create({
    collection: 'midiaImagem',
    data: {
      tenant: outroTenant,
      filename: 'prova-do-outro-lab.png',
      mimeType: 'image/png',
      filesize: 2048,
    } as never,
    overrideAccess: false,
    req: pedido(makerDoOutroLab, HOST_OUTRO),
  })) as unknown as Linha

  perfilDoMaker = await criar('perfilMaker', {
    nome: 'Maker T031',
    handle: '@makert031',
    usuario: oMaker.id,
  })
  skill = await criar('skill', {
    nome: 'Marcenaria T031',
    slug: 'marcenaria-t031',
    ativa: true,
  })

  const resultado = await payload.db.drizzle.execute(
    `select column_name, data_type from information_schema.columns
     where table_name = 'missao_submissao'`,
  )
  colunas = ((resultado as { rows?: unknown[] }).rows ?? resultado) as typeof colunas
}, 180_000)

afterAll(limpar)

describe('§0 — the accepted shape is the id, and the id is what is stored (FR-036, SC-017)', () => {
  it('accepts the midiaImagem id and writes the id, not the filename or the URL', async () => {
    const missao = await missaoNova('Comprovante por id (T031)')
    submissao = await anexar(missao.id, imagem.id)

    const linha = await linhaDaSubmissao()
    expect(
      linha.comprovante,
      'the submission did not store the id of the image it was given. Whatever it stored ' +
        'instead is a second representation of a file, which is the whole of what FR-036 and ' +
        "002's D3 forbid",
    ).toBe(Number(imagem.id))
    // Stated as inequalities too, because `toBe(id)` alone would still pass on a column that
    // stored a *number-shaped* key. These are the values a key-storing column would hold.
    expect(linha.comprovante).not.toBe(imagem.filename)
    expect(linha.comprovante).not.toBe(imagem.url)
    expect(linha.comprovante).not.toBe(chaveDoObjeto(imagem))
  })

  it('leaves a submission that resolves to the real image, so §1 is refusing a REACHABLE row', async () => {
    // Without this the three strings below could be refused because the image does not exist,
    // rather than because they are not ids — the difference the whole file is about.
    const resolvida = (await payload.findByID({
      collection: 'missaoSubmissao',
      id: submissao.id,
      depth: 1,
      overrideAccess: true,
    })) as unknown as { comprovante?: Documento }

    expect(resolvida.comprovante?.filename).toBe(NOME_DO_ARQUIVO)
  })
})

describe('§1 — a key, a URL and a filename are refused (SC-017)', () => {
  it('read the file metadata off the stored document, so the cases below are not undefined', () => {
    // A vacuous loop is the failure mode this file exists to avoid: three `undefined`s would be
    // refused by any column whatsoever and would prove nothing about this one.
    expect(
      [imagem.filename, imagem.url, chaveDoObjeto(imagem)],
      'the fixture image carries no filename or URL, so the three shapes below are empty and ' +
        'every case in this section would pass against a column that happily stores keys',
    ).toEqual([NOME_DO_ARQUIVO, expect.stringContaining(NOME_DO_ARQUIVO), expect.any(String)])
    expect(chaveDoObjeto(imagem).length).toBeGreaterThan(0)
  })

  const formas = (): { nome: string; valor: () => unknown }[] => [
    { nome: 'o filename que o Payload guardou', valor: () => imagem.filename },
    { nome: 'a URL servida por esse mesmo documento', valor: () => imagem.url },
    { nome: 'a chave do objeto no bucket', valor: () => chaveDoObjeto(imagem) },
  ]

  it.each(formas())('refuses $nome, and writes nothing', async ({ nome, valor }) => {
    const missao = await missaoNova(`Comprovante como texto: ${nome}`)

    const mensagem = await recusaDe(() => anexar(missao.id, valor()))

    expect(
      mensagem,
      `a submission was accepted carrying ${nome} (${String(valor())}) instead of an id. That ` +
        'is a second upload route for this collection: it skips the presigned PUT, the ' +
        'post-upload verification and the size limits feature 002 already tested, and it ' +
        'points the reviewer at a string nothing in the database constrains',
    ).not.toBe('')
    expect(
      await submissoesDe(missao.id),
      `the write carrying ${nome} reported an error and left a row behind anyway`,
    ).toEqual([])
  })

  it('refuses the same three shapes on the UPDATE the maker is allowed to make', async () => {
    // `comprovante` is the one field a maker may still write — CLR-015 reopens a rejected row
    // by having them replace the photo — so the edit is as much of the trust boundary as the
    // create, and a guard that only ran on create would leave it wide open.
    for (const { nome, valor } of formas()) {
      const mensagem = await recusaDe(() =>
        payload.update({
          collection: 'missaoSubmissao',
          id: submissao.id,
          data: { comprovante: valor() } as never,
          overrideAccess: false,
          req: pedido(oMaker),
        }),
      )
      expect(mensagem, `an edit replaced the proof with ${nome} and was accepted`).not.toBe('')
    }

    expect(
      (await linhaDaSubmissao()).comprovante,
      'one of the refused edits still changed the stored proof',
    ).toBe(Number(imagem.id))
  })
})

describe('§2 — another maker\'s media is refused (FR-007, FR-036)', () => {
  /**
   * "Another maker" is a maker of **another lab**, and that is the requirement rather than a
   * convenient reading: `scopedAccess` scopes to the organization, not to the row, so a maker
   * of this lab attaching a lab-mate's image is a gap the collection prices explicitly and
   * closes in the shared access layer. What must never happen is the image crossing the
   * organization boundary, because the reviewer then opens a stranger's file from inside their
   * own queue — the upload trust boundary CLR-006 names.
   */
  it('refuses a create pointing at the other lab\'s image, and writes nothing', async () => {
    const missao = await missaoNova('Comprovante de outro lab (T031)')

    recusaDoOutroLab = await recusaDe(() => anexar(missao.id, imagemDeOutroMaker.id))
    const mensagem = recusaDoOutroLab

    expect(
      mensagem,
      "a maker attached another lab's image to their own submission. Spike S4c measured that " +
        'the multi-tenant plugin accepts exactly this write, which is why `sameTenant` is ' +
        'project code and why it has to be ON this field',
    ).not.toBe('')
    expect(mensagem.toLowerCase()).toMatch(/comprovante/)
    expect(await submissoesDe(missao.id)).toEqual([])
  })

  it('refuses the same swap on an update of an existing submission', async () => {
    const mensagem = await recusaDe(() =>
      payload.update({
        collection: 'missaoSubmissao',
        id: submissao.id,
        data: { comprovante: imagemDeOutroMaker.id } as never,
        overrideAccess: false,
        req: pedido(oMaker),
      }),
    )

    expect(mensagem, 'an existing submission was re-pointed at another lab\'s image').not.toBe('')
    expect((await linhaDaSubmissao()).comprovante).toBe(Number(imagem.id))
  })

  /**
   * **The same refusal with access control out of the way** — the path every hook and every
   * maintenance job in this feature actually writes through, since all of them run elevated.
   * `relationships.test.ts` drives its own cross-tenant case this way for the same reason:
   * validation runs regardless of `overrideAccess`, so this is not an access question.
   *
   * ── What was measured here, stated because it is not what one would assume ───────────────
   *
   * Deleting `validate: sameTenant` from `comprovante` leaves **every case in this section
   * green, this one included**. Two other layers refuse the write first: under
   * `overrideAccess: false` Payload resolves the referenced row with the requester's own
   * access, and `scopedAccess` makes the other lab's image simply not exist; under
   * `overrideAccess: true` the multi-tenant plugin's own `filterOptions` — the ones
   * `addFilterOptionsToFields` injects into every relationship pointing at a scoped
   * collection — still answer *"invalid selection"*.
   *
   * So this section asserts the **outcome** SC-017 and FR-036 are about, and it is worth having
   * precisely because it is the outcome rather than one mechanism: it stays true if either
   * layer is refactored, and it fails the day all of them go. What it cannot do is prove the
   * shared validator is *attached* — three layers agreeing look identical from out here. That
   * assertion is `missao-submissao-config.test.ts`'s, by identity (`toBe(sameTenant)`), and the
   * two files are the pair: one says the guard is on the field, this one says the boundary
   * holds when a maker pushes on it.
   */
  it('refuses it with access control out of the way, the path every hook writes through', async () => {
    const missao = await missaoNova('Comprovante de outro lab, sem access (T031)')

    const mensagem = await recusaDe(() =>
      payload.create({
        collection: 'missaoSubmissao',
        data: {
          missao: missao.id,
          maker: perfilDoMaker.id,
          comprovante: imagemDeOutroMaker.id,
          status: 'enviada',
          tenant,
        } as never,
        overrideAccess: true,
        // As the MAKER, not the team: T027 binds `maker` to the requester in `beforeValidate`,
        // and hooks run whatever `overrideAccess` says — so a submission written as a team
        // member is now refused for having nobody to attribute it to, and this case would then
        // read that refusal instead of the one it is about. The elevation under test is
        // `overrideAccess: true`, which is what takes access control out of the way while
        // leaving every validator and hook in place.
        req: pedido(oMaker),
      }),
    )

    expect(
      mensagem,
      "a submission in this lab was written pointing at another lab's image once access " +
        'control was not the thing refusing it. That is the S4c hole open on the upload trust ' +
        'boundary, on the path every hook in this feature uses: an elevated writer can attach ' +
        "a stranger's file to a row this lab's reviewer opens",
    ).not.toBe('')
    expect(mensagem.toLowerCase()).toMatch(/comprovante/)
    expect(await submissoesDe(missao.id)).toEqual([])
  })

  it('does not disclose which organization owns the refused image', () => {
    // Naming it turns any relationship input into an ID-ownership oracle: feed ids, read back
    // which lab owns them. `tests/tenancy/relationships.test.ts` records the same rule.
    expect(
      recusaDoOutroLab,
      'the cross-tenant case above did not run, so this assertion is inspecting an empty string',
    ).not.toBe('')
    expect(recusaDoOutroLab).not.toContain(SLUG_OUTRO_LAB)
    expect(recusaDoOutroLab).not.toContain('Outro lab T031')

    // The id the requester supplied is echoed back — that is their own input, not a
    // disclosure. It is stripped before asking about the *organization* id, and asked with
    // word boundaries: a bare `toContain(String(outroTenant))` reads any digit of any number
    // in the message and reported a false failure the first time this ran, on a scratch
    // database where the image id and the organization id both happened to be 2.
    const semOIdPedido = recusaDoOutroLab.split(String(imagemDeOutroMaker.id)).join('')
    expect(
      semOIdPedido,
      'the refusal named the organization that owns the image, which turns this field into an ' +
        'ID-ownership oracle: feed it ids, read back whose lab they are',
    ).not.toMatch(new RegExp(`\\b${outroTenant}\\b`))
  })
})

describe('§3 — the booted database has nowhere to put a key (SC-017)', () => {
  it('found the table, so the two cases below are not scanning an empty list', () => {
    expect(
      colunas.map((c) => c.column_name).sort(),
      'information_schema returned no columns for missao_submissao, so every assertion below ' +
        'is reading an empty array and would pass against any schema whatsoever',
    ).toContain('comprovante_id')
  })

  it('stores the proof in an integer column, which is what makes it an id', () => {
    const coluna = colunas.find((c) => c.column_name === 'comprovante_id')

    expect(
      coluna?.data_type,
      'comprovante is not an integer column on a booted database. `push` rebuilds the schema ' +
        'from the field config on connect, so this means the field stopped being a ' +
        'relationship — and a text column accepts a key, a URL and a filename in silence',
    ).toBe('integer')
  })

  it('carries no character column at all — a key would have nowhere to live', () => {
    // Asked of the database rather than of a list of field names kept by hand: a hand-kept list
    // is exactly what was wrong with the redaction gate feature 004 shipped, which named every
    // field the framework uses and none of this codebase's own.
    const texto = colunas.filter((c) => c.data_type.includes('character') || c.data_type === 'text')

    expect(
      texto.map((c) => c.column_name),
      'missao_submissao gained a text column. FR-036 names one photo and nothing else, and the ' +
        'collection records why no free-text note was smuggled in: a text field on the upload ' +
        'trust boundary is a surface this security review has not been written against — it is ' +
        'either a place to paste a storage key, or unreviewed user content the queue renders',
    ).toEqual([])
  })
})
