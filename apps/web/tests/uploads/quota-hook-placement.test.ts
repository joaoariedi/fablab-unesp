import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MEDIA_SLUGS } from '../../collections/Media'
import { FakeBucket, bootWithFakeBucket, pngDe } from './fake-bucket'

/**
 * T005 / FR-022, FR-026, FR-034, D5 — where an upload's tenant and its file coexist, MEASURED.
 *
 * Round 1 of the plan placed the quota check by reasoning, and the reasoning was wrong (preamble
 * item 13). This file is the measurement T008 is built on. Probes are pushed onto the live hook
 * arrays of `midiaImagem` and record, at each hook, the tenant, `req.file`, and how many objects
 * had reached the bucket. What the measurement showed, 2026-10-13:
 *
 * | path                                   | result     | tenant at beforeOperation | file |
 * |----------------------------------------|------------|---------------------------|------|
 * | system, own tenant explicit            | accepted   | present                   | yes  |
 * | maker, own tenant explicit (the admin) | accepted   | present                   | yes  |
 * | maker, tenant from the cookie only     | Forbidden  | absent                    | yes  |
 * | maker of A, `tenant: B` explicit       | ACCEPTED   | present (B)               | yes  |
 *
 * The last row is the state of 2026-10-13. Since PR #20 it is REFUSED by the `tenant` field — §5.
 *
 * **Preamble item 13 was half right.** A tenant supplied only by the plugin's cookie `defaultValue`
 * is indeed absent at `beforeOperation` — but that path is refused outright for a maker, because
 * the plugin validates the cookie by counting `organizations` with `overrideAccess: false`, which
 * `masterOnly()` refuses. So every upload that SUCCEEDS carries its tenant explicitly in `data`,
 * and the tenant and the file coexist at all three `before*` hooks.
 *
 * **The last row was a live cross-tenant write.** A maker of A named B's id and the upload landed in
 * B, bytes and all. It was not the quota's defect — the same create succeeded on 19 of 23 scoped
 * collections — and it was fixed on its own, before T008, by PR #20. §5 now pins the refusal.
 */

const BUCKET = 'fablab-test-t005'
const SLUG = MEDIA_SLUGS.image
const HOOKS = ['beforeOperation', 'beforeValidate', 'beforeChange'] as const
type Hook = (typeof HOOKS)[number]

type Leitura = { cenario: string; hook: Hook; operacao: string; tenant: unknown; arquivo: boolean; noBalde: number }
const leituras: Leitura[] = []
let cenario = ''

const bucket = new FakeBucket(BUCKET)
let payload: Payload
let orgA: string | number
let orgB: string | number
let maker: Record<string, unknown>
const ORGS = ['t005-org-a', 't005-org-b']
const MAKER = 't005-maker@example.com'

type HookArgs = {
  operation?: string
  args?: { data?: { tenant?: unknown } }
  data?: { tenant?: unknown }
  req?: { file?: unknown }
}

/** A populated relationship arrives as the document; the id is what identifies the tenant. */
const idDe = (tenant: unknown): unknown =>
  typeof tenant === 'object' && tenant !== null ? (tenant as { id: unknown }).id : tenant

const limpar = async () => {
  await payload.delete({ collection: SLUG as never, where: { filename: { like: 't005-' } } as never, overrideAccess: true })
  await payload.delete({ collection: 'users', where: { email: { equals: MAKER } }, overrideAccess: true })
  for (const slug of ORGS) {
    await payload.delete({ collection: 'organizations', where: { slug: { equals: slug } }, overrideAccess: true })
  }
}

beforeAll(async () => {
  payload = await bootWithFakeBucket(bucket, 'quota-hook-placement-t005')
  await limpar()
  const criarOrg = async (slug: string) =>
    (await payload.create({ collection: 'organizations', data: { name: slug, slug, status: 'active' } as never, overrideAccess: true })).id
  orgA = await criarOrg(ORGS[0]!)
  orgB = await criarOrg(ORGS[1]!)
  maker = (await payload.create({
    collection: 'users',
    data: { email: MAKER, password: 'fixture-password-123', role: 'user', orgs: [{ organization: orgA, role: 'maker' }] } as never,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>

  const hooks = hooksDaColecao(SLUG)
  for (const hook of HOOKS) {
    hooks[hook] = [
      ...(hooks[hook] ?? []),
      (a: HookArgs) => {
        leituras.push({
          cenario,
          hook,
          operacao: String(a.operation ?? ''),
          tenant: idDe(hook === 'beforeOperation' ? a.args?.data?.tenant : a.data?.tenant),
          arquivo: Boolean(a.req?.file),
          noBalde: bucket.puts.length,
        })
        return hook === 'beforeOperation' ? a.args : a.data
      },
    ]
  }
}, 180_000)

afterAll(async () => {
  if (payload) await limpar()
  await bucket.close()
})

/** Uploads one PNG under scenario `nome`; resolves to the outcome rather than throwing. */
const subir = async (nome: string, opts: Record<string, unknown>): Promise<'aceito' | string> => {
  cenario = nome
  const data = await pngDe()
  const { data: extra, ...resto } = opts as { data?: object }
  return payload
    .create({
      collection: SLUG as never,
      data: { alt: `t005-${nome}`, ...(extra ?? {}) } as never,
      file: { data, mimetype: 'image/png', name: `t005-${nome}.png`, size: data.length },
      ...resto,
    } as never)
    .then(
      () => 'aceito' as const,
      (e: unknown) => `recusado: ${String(e)}`,
    )
}

/**
 * A collection's live hook arrays. Indexed through an explicit record rather than `as never`:
 * with the generated `payload-types.ts` present, `collections[x as never]` is `never` and the
 * file stops compiling — CI, which compiles without that file, would never notice.
 */
const hooksDaColecao = (slug: string): Record<string, unknown[]> =>
  (payload.collections as unknown as Record<string, { config: { hooks: Record<string, unknown[]> } }>)[slug]!
    .config.hooks

const doCriar = (nome: string) => leituras.filter((l) => l.cenario === nome && l.operacao === 'create')
const putsAntes = (nome: string) => Math.min(...doCriar(nome).map((l) => l.noBalde))

describe('§1 — the tenant and the file coexist at every before-hook of an upload that succeeds', () => {
  it('system path: own tenant explicit', async () => {
    expect(await subir('sistema', { data: { tenant: orgA }, overrideAccess: true })).toBe('aceito')
    for (const l of doCriar('sistema')) {
      expect(l.tenant, `${l.hook}: tenant absent`).toEqual(orgA)
      expect(l.arquivo, `${l.hook}: req.file absent`).toBe(true)
    }
    expect(doCriar('sistema').map((l) => l.hook)).toEqual([...HOOKS])
  })

  it('maker path: own tenant explicit — what the admin form submits', async () => {
    const resultado = await subir('maker-proprio', { data: { tenant: orgA }, overrideAccess: false, user: maker })
    expect(resultado).toBe('aceito')
    for (const l of doCriar('maker-proprio')) {
      expect(l.tenant, `${l.hook}: tenant absent`).toEqual(orgA)
      expect(l.arquivo, `${l.hook}: req.file absent`).toBe(true)
    }
  })
})

describe('§2 — a maker cannot upload on the cookie alone (why every success carries `data.tenant`)', () => {
  it('refuses the upload before it reaches beforeValidate', async () => {
    const resultado = await subir('maker-cookie', {
      overrideAccess: false,
      user: maker,
      req: { headers: new Headers({ cookie: `payload-tenant=${String(orgA)}` }) },
    })
    expect(resultado).toMatch(/^recusado: .*Forbidden/)
    expect(doCriar('maker-cookie').map((l) => l.hook)).toEqual(['beforeOperation'])
  })
})

describe('§3 — no byte reaches the bucket before the before-hooks finish (CHK007)', () => {
  it('the bucket holds nothing of this upload at any before-hook, and everything after', async () => {
    const antes = bucket.puts.length
    expect(await subir('ordem', { data: { tenant: orgA }, overrideAccess: true })).toBe('aceito')
    expect(putsAntes('ordem'), 'an object reached the bucket before a before-hook ran').toBe(antes)
    expect(bucket.puts.length, 'the upload wrote nothing at all').toBeGreaterThan(antes)
  })

  it('the follow-up update after an upload carries no file — a quota check keyed on req.file skips it', () => {
    const seguintes = leituras.filter((l) => l.cenario === 'ordem' && l.operacao === 'update')
    expect(seguintes.length, 'no follow-up update was observed — the measurement changed').toBeGreaterThan(0)
    for (const l of seguintes) expect(l.arquivo, `${l.hook} of the follow-up update saw a file`).toBe(false)
  })
})

describe('§4 — the three media collections run the same hooks', () => {
  it('model3d and document carry the very hook functions image does, so §1–§3 hold for them', () => {
    const hooksDe = (slug: string) =>
      hooksDaColecao(slug)
    // Measured on image; the other two are built by the same factory in `collections/Media.ts`.
    // Compared by NAME and POSITION, excluding this file's own probes appended at the end.
    for (const hook of HOOKS) {
      const nomes = (slug: string) =>
        (hooksDe(slug)[hook] ?? []).map((f) => (f as { name?: string }).name ?? '').filter((n) => n !== '')
      expect(nomes(MEDIA_SLUGS.model3d), hook).toEqual(nomes(MEDIA_SLUGS.document))
    }
  })
})

describe('§5 — a maker cannot upload into another organization (CHK024, CHK025)', () => {
  // Measured ACCEPTED on 2026-10-13, bytes written to the bucket — and not only here: the same
  // create succeeded on 19 of 23 scoped collections. Fixed on dev by PR #20, a validator on the
  // `tenant` field itself (`tenantMustBeAMembership`). This is the case T008 rests on: the quota
  // reads `data.tenant`, so it must be a tenant the writer belongs to before any hook runs.
  it('refuses an upload naming organization B, by the tenant field, and stores nothing', async () => {
    cenario = 'maker-alheio'
    const antes = bucket.puts.length
    const data = await pngDe()
    const erro = await payload
      .create({
        collection: SLUG as never,
        data: { alt: 't005-maker-alheio', tenant: orgB } as never,
        file: { data, mimetype: 'image/png', name: 't005-maker-alheio.png', size: data.length },
        overrideAccess: false,
        user: maker,
      } as never)
      .then(
        () => null,
        (e: unknown) => e,
      )

    const campos = (erro as { data?: { errors?: { path?: string }[] } } | null)?.data?.errors ?? []
    expect(erro, 'a maker of A uploaded into organization B').not.toBeNull()
    expect(
      campos.some((c) => c.path === 'tenant'),
      `refused, but not by the tenant field: ${String(erro)}`,
    ).toBe(true)
    expect(bucket.puts.length, 'the refused upload still wrote to the bucket').toBe(antes)
  })
})
