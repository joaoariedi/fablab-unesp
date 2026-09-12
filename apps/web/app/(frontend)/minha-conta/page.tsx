import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { redirect } from 'next/navigation'

import {
  AvatarPreview,
  DIRECOES_AVATAR,
  EmptyState,
  SkillPips,
  type AvatarCamada,
  type DirecaoAvatar,
} from '@fablab/ui'

import { getTenantScopedPayloadForRSC } from '../../../lib/tenancy'
// Deep import, exactly as every listing and `criar-conta` do it: the anonymous read path is not
// re-exported from `lib/tenancy`'s index, because it runs with `overrideAccess: true` and that
// unexported-ness is one of the two locks the module keeps.
import { getPublicScopedPayloadForRSC } from '../../../lib/tenancy/public-payload'
import { currentUser } from '../../../lib/tenancy/session'

/**
 * T034 / FR-021, FR-022, US5 — **Minha Conta**: the avatar, the name, the `@handle`, the skills
 * with their level and pips, and the maker's own content.
 *
 * `minha-conta.md` § *Estrutura da página* draws it: the avatar card beside the navy `SUAS
 * SKILLS` panel, and a row of content blocks under both. Round 5 (2026-08-24) settled the three
 * things the mockup got wrong — ten pips and not six, level 0 and not 1, and no checkbox on a
 * skill card — and round 5 also decided the content blocks show **"minhas coisas"**: what this
 * maker published, never a recommendation feed.
 *
 * ── It displays; it never awards (FR-022) ───────────────────────────────────────────────────
 *
 * There is no write on this page, by any door: no `create`, no `update`, no server action. XP,
 * levels and missions are feature 005's, and a screen that awarded on view would hand out
 * progress on every refresh — against a ledger that does not exist yet to reconcile it. The
 * levels rendered here are the numbers `perfilMaker.skills` already holds.
 *
 * ── Why the avatar is composed rather than read as a PNG ────────────────────────────────────
 *
 * `perfilMaker.avatarRender` is FR-024's server-composed PNG *for cards and ranking*, and
 * nothing generates it until T035. Displaying only that column would draw an empty frame for
 * every account that exists today, so the avatar is composed the way step 1 composes it — the
 * configuration names item ids, the catalogue carries their sprites, `AvatarPreview` stacks them
 * in `camadaZ` order.
 *
 * ── Why the catalogue is read through the ANONYMOUS door (FR-028) ───────────────────────────
 *
 * `avatarItem` is `global` (CLR-001) and its collection `read` is `masterOnly()`, so the
 * signed-in maker's own client is refused there by construction. `getPublicScopedPayloadForRSC`
 * is the sanctioned door for exactly those three catalogues — its `PUBLIC_GLOBAL_CATALOGUE`
 * allow-list names them — and step 1 of signup already reads them through it. The profile, the
 * skills and the content are this lab's rows and go through `getTenantScopedPayloadForRSC`,
 * which is what FR-028 is about.
 *
 * ── Why a failed read is a state and not an exception ───────────────────────────────────────
 *
 * US5's error edge: *"the read fails — the page reports it in place with a retry, the way every
 * 003 listing does"*. Each read is answered separately, so one outage costs one block rather
 * than the whole screen; a catalogue outage costs the drawing and never the identity, which is
 * FR-007's rule about missing avatar art applied to the page that displays it.
 */

export const metadata = { title: 'MINHA CONTA — Fab Lab CITe Bauru' }

/** This page's own path. Exported because the retry below is built from it and `/minha-conta/
 *  excluir` returns here — the route moves in one edit. */
export const CONTA_PATH = '/minha-conta'

/** Where the deletion screen lives (FR-031b). Minha Conta is the only page that leads to it. */
const EXCLUIR_PATH = `${CONTA_PATH}/excluir`

/**
 * The avatar editor (FR-023, US6) — *"Given a signed-in maker **on Minha Conta**, when they
 * **open the avatar editor**"*.
 *
 * This link is the whole of "open". The screen shipped at this route with nothing in the
 * product pointing at it: not this page, not the shell nav, not a redirect. It was reachable
 * only by typing the URL, which is the fifth time in this feature that a finished screen was
 * an orphan — and its own suite could not see it, because a page test walks the tree the page
 * returns and an unreferenced route is exactly what leaves no trace there.
 */
const AVATAR_PATH = `${CONTA_PATH}/avatar`

const LOGIN_PATH = '/login'

/** The query parameter `/login` reads its destination from (`login/page.tsx`). */
const PARAM_DESTINO = 'de'

/** One populated `midiaImagem`, reduced to the only field a sprite needs. Structural rather
 *  than imported from `payload-types.ts`, which is gitignored: a page that imported a generated
 *  type would compile locally and fail CI (tasks.md preamble item 6). */
type MidiaDoc = { readonly url?: string | null }

/** One `avatarItem` row, at `depth: 1` — `sprite` populated, or still an id when it is not. */
type ItemDoc = {
  readonly id?: string | number
  readonly categoria?: string
  readonly camadaZ?: number
  readonly sprite?: MidiaDoc | string | number | null
  readonly spriteFolhas?: MidiaDoc | string | number | null
}

/** One `skill` row as `perfilMaker.skills[].skill` populates it. */
type SkillDoc = { readonly id?: string | number; readonly nome?: string; readonly ativa?: boolean }

/** One row of the profile's `skills` array: the catalogue row, the level, and the XP inside it. */
type SkillDoPerfil = { readonly skill?: SkillDoc | string | number | null; readonly nivel?: number }

type PerfilDoc = {
  readonly id: string | number
  readonly nome?: string
  readonly handle?: string
  readonly avatarConfig?: unknown
  readonly skills?: readonly SkillDoPerfil[]
}

/** One item of the maker's own output, in the four fields a block renders. */
type ConteudoDoc = {
  readonly id?: string | number
  readonly titulo?: string
  readonly slug?: string
  readonly status?: string
}

/**
 * The content blocks, as data (`minha-conta.md` § *Fileira inferior*).
 *
 * **`projeto` is deliberately absent**, for the reason `deletion.ts` records where it lists the
 * same three collections: it carries no `autor` relationship yet, so "the projects I created"
 * is a query nothing can express. A block reading it would filter on a column that does not
 * exist — an exception, or worse, the whole lab's projects presented as this person's.
 *
 * `rota` is the public detail route, or `null` where none exists: `/aulas` has no `[slug]` page
 * yet, and a link to a route that 404s is worse than a title that is not a link.
 */
const BLOCOS = [
  {
    colecao: 'artigo',
    titulo: 'MEUS ARTIGOS',
    rota: '/artigos',
    vazio: 'Você ainda não publicou nenhum artigo.',
    criar: 'Escrever um artigo',
  },
  {
    colecao: 'modelo3d',
    titulo: 'MEUS MODELOS 3D',
    rota: '/biblioteca-3d',
    vazio: 'Você ainda não publicou nenhum modelo 3D.',
    criar: 'Publicar um modelo 3D',
  },
  {
    colecao: 'aula',
    titulo: 'MINHAS AULAS',
    rota: null,
    vazio: 'Você ainda não publicou nenhuma aula.',
    criar: 'Criar uma aula',
  },
] as const

type Bloco = (typeof BLOCOS)[number]

/** How many of a maker's items a block shows before the chevron would take over. Twelve, the
 *  same page size every 003 listing uses, so a block and the full list agree on one screenful. */
const ITENS_POR_BLOCO = 12

/**
 * Where a block's create action goes — the admin's own create form.
 *
 * Publishing has no front-end flow yet (the mockup's `+ Criar novo projeto` is a door onto a
 * route nobody has built), and an empty state whose action 404s is worse than one with none.
 * The admin form is the door that actually exists today; the day the flow ships, this is the one
 * line that changes.
 */
const criarHref = (colecao: string): string => `/admin/collections/${colecao}/create`

/** `null` is *"this read failed"*, which is a different screen from *"there is nothing here"*. */
async function lerOuFalhar<T>(leitura: () => Promise<T>): Promise<T | null> {
  try {
    return await leitura()
  } catch (erro) {
    console.warn('[minha-conta] a read failed; the page reports it in place.', erro)
    return null
  }
}

/** The chosen item ids, in the order the configuration lists them. Ids are stored as strings and
 *  arrive from the database as numbers (`criar-conta` reconciles the same pair), so everything is
 *  compared as a string. */
function itensEscolhidos(config: unknown): string[] {
  const itens = (config as { itens?: unknown } | null)?.itens
  if (typeof itens !== 'object' || itens === null) return []
  return Object.values(itens as Record<string, unknown>)
    .filter((valor): valor is string | number => typeof valor === 'string' || typeof valor === 'number')
    .map(String)
}

/** The stored direction, or none — an unknown value lets `AvatarPreview` fall back to the front
 *  rather than drawing a frame that does not exist. */
function direcaoEscolhida(config: unknown): DirecaoAvatar | undefined {
  const direcao = (config as { direcao?: unknown } | null)?.direcao
  return DIRECOES_AVATAR.find((conhecida) => conhecida === direcao)
}

/** A populated relationship's URL. An unpopulated one is an id, which is not art. */
const urlDe = (midia: ItemDoc['sprite']): string | undefined =>
  typeof midia === 'object' && midia !== null && typeof midia.url === 'string' ? midia.url : undefined

/**
 * The chosen pieces as drawable layers.
 *
 * `depth: 1` is what makes this work at all: at depth 0 `sprite` comes back as a relationship id
 * and `AvatarPreview` drops every layer for having no art. The limit is the number of ids asked
 * for — Payload's default is 10, and nine slots plus one is the shape that silently truncates.
 */
async function camadasDoAvatar(config: unknown): Promise<AvatarCamada[]> {
  const ids = itensEscolhidos(config)
  if (ids.length === 0) return []

  const catalogo = await getPublicScopedPayloadForRSC()
  const { docs } = await catalogo.find<ItemDoc>({
    collection: 'avatarItem',
    where: { id: { in: ids } },
    depth: 1,
    limit: ids.length,
  })

  return docs.map((item) => ({
    slot: item.categoria ?? '',
    camadaZ: item.camadaZ ?? 0,
    sprite: urlDe(item.sprite),
    spriteFolhas: urlDe(item.spriteFolhas),
  }))
}

/**
 * The skills this panel shows: the maker's rows whose catalogue entry is still **active**.
 *
 * `Skill.ts`: *"Skills inativas somem do painel sem alterar o XP de ninguém. Reativar faz o
 * progresso reaparecer."* Deactivation is the product's remove — the row survives precisely so
 * the XP survives — so a profile keeps carrying skills the lab has retired, and a panel that
 * rendered the array as stored would show a vocabulary the team deliberately withdrew.
 *
 * An unpopulated `skill` (a bare id) is skipped for the same reason a layer with no art is: it
 * has no name, and a level under a blank label is not information.
 */
function skillsVisiveis(perfil: PerfilDoc): { chave: string; nome: string; nivel: number }[] {
  return (perfil.skills ?? []).flatMap((linha, indice) => {
    const skill = linha.skill
    if (typeof skill !== 'object' || skill === null) return []
    if (skill.ativa === false || !skill.nome) return []
    return [{ chave: String(skill.id ?? indice), nome: skill.nome, nivel: linha.nivel ?? 0 }]
  })
}

/** The avatar card: the composed figure over the grid the mockup draws. */
function cartaoDoAvatar(perfil: PerfilDoc, camadas: readonly AvatarCamada[]): ReactElement {
  return (
    <div style={ESTILO.avatar}>
      <AvatarPreview
        camadas={camadas}
        larguraBase={LARGURA_DO_QUADRO}
        alturaBase={ALTURA_DO_QUADRO}
        larguraAlvo={LARGURA_DO_PREVIEW}
        direcao={direcaoEscolhida(perfil.avatarConfig)}
        alt={`Avatar de ${perfil.nome ?? 'maker'}`}
      />
      {/* Beside the avatar rather than among the content blocks: US6 opens the editor from the
          thing it edits, and a person looking for "change my avatar" looks at their avatar. */}
      <a href={AVATAR_PATH} style={ESTILO.editarAvatar}>
        Editar avatar
      </a>
    </div>
  )
}

/** Name and `@handle`. The handle is **one string** so it reads as one token — `@` and the
 *  handle as separate children would print as `@ mariasilva`. */
function identidade(perfil: PerfilDoc): ReactElement {
  return (
    <div style={ESTILO.identidade}>
      <p style={ESTILO.nome}>{perfil.nome ?? ''}</p>
      <p style={ESTILO.handle}>{`@${perfil.handle ?? ''}`}</p>
    </div>
  )
}

/** One skill card: the name, `NÍVEL n` and the ten-pip strip — and no checkbox (round 5). */
function cartaoDeSkill(skill: { chave: string; nome: string; nivel: number }): ReactElement {
  return (
    <li key={skill.chave} style={ESTILO.skill}>
      <span style={ESTILO.skillNome}>{skill.nome}</span>
      <span style={ESTILO.skillNivel}>{`NÍVEL ${skill.nivel}`}</span>
      <SkillPips level={skill.nivel} label={skill.nome} />
    </li>
  )
}

/**
 * The `SUAS SKILLS` panel (FR-021, FR-022).
 *
 * A lab whose team has added no skills yet has nothing to show, and FR-013's *"every **active**
 * skill at level 0"* is the reason that is an ordinary state rather than a bug: a new
 * organization starts with an empty catalogue, and its first maker's panel is empty with it.
 */
function painelDeSkills(perfil: PerfilDoc): ReactElement {
  const skills = skillsVisiveis(perfil)
  return (
    <section style={ESTILO.painel} aria-labelledby="suas-skills">
      <h2 id="suas-skills" style={ESTILO.painelTitulo}>
        SUAS SKILLS
      </h2>
      <p style={ESTILO.painelSubtitulo}>Você poderá evoluir todas com o tempo!</p>
      {skills.length === 0 ? (
        <p style={ESTILO.painelSubtitulo}>
          Este lab ainda não cadastrou skills. Assim que cadastrar, elas aparecem aqui no nível 0.
        </p>
      ) : (
        <ul style={ESTILO.skills}>{skills.map(cartaoDeSkill)}</ul>
      )}
    </section>
  )
}

/** One item of the maker's own output. The status travels with it because this page shows drafts
 *  — it is the one screen where an unpublished item of theirs can be found. */
function itemDoBloco(bloco: Bloco, doc: ConteudoDoc): ReactElement {
  const titulo = doc.titulo ?? ''
  const href = bloco.rota && doc.slug ? `${bloco.rota}/${doc.slug}` : null
  return (
    <li key={String(doc.id ?? titulo)} style={ESTILO.item}>
      {href ? (
        <a href={href} style={ESTILO.itemLink}>
          {titulo}
        </a>
      ) : (
        <span style={ESTILO.itemLink}>{titulo}</span>
      )}
      {doc.status ? <span style={ESTILO.status}>{doc.status}</span> : null}
    </li>
  )
}

/** The grid, the empty body or the error body — exactly one of the three, as every 003 listing
 *  answers the same three questions (US5). */
function corpoDoBloco(bloco: Bloco, docs: readonly ConteudoDoc[] | null): ReactNode {
  if (docs === null) {
    return (
      <EmptyState
        surface="light"
        variant="erro"
        titulo={`Não foi possível carregar ${bloco.titulo.toLowerCase()}.`}
        acao={{ label: 'Tentar novamente', href: CONTA_PATH }}
      />
    )
  }

  if (docs.length === 0) {
    return (
      <EmptyState
        surface="light"
        variant="vazio"
        titulo={bloco.vazio}
        acao={{ label: bloco.criar, href: criarHref(bloco.colecao) }}
      />
    )
  }

  return <ul style={ESTILO.itens}>{docs.map((doc) => itemDoBloco(bloco, doc))}</ul>
}

function blocoDeConteudo(bloco: Bloco, docs: readonly ConteudoDoc[] | null): ReactElement {
  return (
    <section key={bloco.colecao} style={ESTILO.bloco}>
      <h2 style={ESTILO.blocoTitulo}>{bloco.titulo}</h2>
      {corpoDoBloco(bloco, docs)}
    </section>
  )
}

/** The whole screen when the profile itself could not be read (US5's error edge). */
function falhaDaConta(): ReactElement {
  return (
    <main style={ESTILO.pagina_}>
      <h1 style={ESTILO.titulo}>MINHA CONTA</h1>
      <EmptyState
        surface="light"
        variant="erro"
        titulo="Não foi possível carregar sua conta."
        acao={{ label: 'Tentar novamente', href: CONTA_PATH }}
      />
    </main>
  )
}

/**
 * A signed-in person with **no profile in this lab** (002 § CLR-002).
 *
 * One login may hold profiles in two labs, and holding none here is an ordinary state rather
 * than an error. It must not redirect: `/minha-conta/excluir` sends exactly this person here, so
 * a redirect back would be a loop between two pages.
 */
function contaSemPerfil(): ReactElement {
  return (
    <main style={ESTILO.pagina_}>
      <h1 style={ESTILO.titulo}>MINHA CONTA</h1>
      <EmptyState
        surface="light"
        variant="vazio"
        titulo="Você ainda não tem um perfil de maker neste lab."
        descricao="Crie o seu para montar um avatar e acompanhar suas skills."
        acao={{ label: 'Criar meu perfil', href: '/criar-conta' }}
      />
    </main>
  )
}

/** One avatar frame in source pixels, and the width the card would like — the proportions
 *  `criar-conta` declares, at the scale `clampScale` rounds down to a whole multiple of. */
const LARGURA_DO_QUADRO = 32
const ALTURA_DO_QUADRO = 48
const LARGURA_DO_PREVIEW = LARGURA_DO_QUADRO * 5

/** This maker's own rows of one collection, newest touched first. `-updatedAt` and not
 *  `-dataPublicacao`: a draft has no publication date, and this page shows drafts. */
async function lerConteudo(
  db: Awaited<ReturnType<typeof getTenantScopedPayloadForRSC>>,
  bloco: Bloco,
  perfilId: string | number,
): Promise<ConteudoDoc[] | null> {
  return lerOuFalhar(async () => {
    const { docs } = await db.find<ConteudoDoc>({
      collection: bloco.colecao,
      where: { autor: { equals: perfilId } },
      depth: 0,
      limit: ITENS_POR_BLOCO,
      sort: '-updatedAt',
    })
    return docs
  })
}

/**
 * This request's own profile in this lab, read from the session on every call.
 *
 * The lookup is filtered by the signed-in account. Scoped to the organization alone it would
 * return whichever profile came first, and Minha Conta would show a stranger's avatar, handle
 * and content to whoever is signed in.
 */
async function lerPerfil(
  db: Awaited<ReturnType<typeof getTenantScopedPayloadForRSC>>,
  usuarioId: string | number,
): Promise<PerfilDoc | null | undefined> {
  const resultado = await lerOuFalhar(async () => {
    const { docs } = await db.find<PerfilDoc>({
      collection: 'perfilMaker',
      where: { usuario: { equals: usuarioId } },
      // One level, so `skills[].skill` arrives as a catalogue row: the panel needs its `nome`
      // and its `ativa`, and at depth 0 both are relationship ids.
      depth: 1,
      limit: 1,
    })
    // `undefined` is "no profile here", which is a different screen from `null`'s failed read.
    return docs[0]
  })
  return resultado
}

/**
 * `/minha-conta` — the maker's own account page.
 *
 * @example /minha-conta  (signed out, it becomes /login?de=%2Fminha-conta)
 */
export default async function Page(): Promise<ReactElement> {
  const usuario = await currentUser()
  if (!usuario) redirect(`${LOGIN_PATH}?${PARAM_DESTINO}=${encodeURIComponent(CONTA_PATH)}`)

  const db = await getTenantScopedPayloadForRSC()
  const perfil = await lerPerfil(db, usuario.id)
  if (perfil === null) return falhaDaConta()
  if (!perfil) return contaSemPerfil()

  // In parallel, and each answered separately: the avatar catalogue is a different door from the
  // content, and one outage should cost one region of the page rather than the screen.
  const [camadas, conteudos] = await Promise.all([
    lerOuFalhar(() => camadasDoAvatar(perfil.avatarConfig)),
    Promise.all(BLOCOS.map((bloco) => lerConteudo(db, bloco, perfil.id))),
  ])

  return (
    <main style={ESTILO.pagina_}>
      <h1 style={ESTILO.titulo}>MINHA CONTA</h1>
      <section style={ESTILO.topo}>
        <div style={ESTILO.cartao}>
          {cartaoDoAvatar(perfil, camadas ?? [])}
          {identidade(perfil)}
        </div>
        {painelDeSkills(perfil)}
      </section>
      <section style={ESTILO.blocos}>
        {BLOCOS.map((bloco, indice) => blocoDeConteudo(bloco, conteudos[indice] ?? null))}
      </section>
      {/* The only door onto the deletion screen FR-031b ships: `/minha-conta/excluir` returns
          here when someone cancels, and nothing else in the product links to it. */}
      <a href={EXCLUIR_PATH} style={ESTILO.excluir}>
        Excluir minha conta
      </a>
    </main>
  )
}

/**
 * Every style this page declares, in one object — style objects rather than a stylesheet, for
 * the reason every page here records: the suite runs at `node` with no DOM, so a class name
 * would be assertable only as text in two files. Every colour is a token (FR-034); there is no
 * hex here and there must never be one.
 */
const ESTILO: Record<string, CSSProperties> = {
  // Trailing underscore, as the sibling pages write it: `pagina` also names a query parameter in
  // this codebase, and two meanings for one word is how the wrong one gets used.
  pagina_: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-6)',
    background: 'var(--surface-inverted)',
    color: 'var(--text-on-light)',
    padding: 'var(--space-8) var(--space-5) var(--space-10)',
  },
  titulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    textTransform: 'uppercase',
  },
  topo: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'stretch' },
  cartao: {
    // The `:root` ring is the accent, which scores ~2:1 on a light surface — invisible on exactly
    // the controls a keyboard visitor is aiming for. Navy is the ink this card already writes in.
    '--focus-ring-color': 'var(--text-on-light)',
    background: 'var(--surface-light)',
    border: '2px solid var(--color-navy)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-hard)',
    padding: 'var(--space-5)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    alignItems: 'center',
  } as CSSProperties,
  avatar: { display: 'flex', justifyContent: 'center' },
  identidade: { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', alignItems: 'center' },
  nome: { margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' },
  handle: { margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' },
  painel: {
    flex: '1 1 20rem',
    background: 'var(--color-navy)',
    color: 'var(--color-claro)',
    '--focus-ring-color': 'var(--color-claro)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-6)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  } as CSSProperties,
  painelTitulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    textTransform: 'uppercase',
  },
  painelSubtitulo: { margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' },
  skills: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
    gap: 'var(--space-4)',
  },
  skill: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  skillNome: { fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)' },
  skillNivel: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' },
  blocos: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
    gap: 'var(--space-5)',
  },
  bloco: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  blocoTitulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-lg)',
    textTransform: 'uppercase',
  },
  itens: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  item: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'baseline' },
  itemLink: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', color: 'var(--text-on-light)' },
  status: {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    background: 'var(--color-teal)',
    color: 'var(--text-on-light)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 var(--space-2)',
  },
  excluir: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-on-light)' },
  /** The editor link under the avatar. `--text-on-light` because this is a white page, and the
   *  44px min-height is FR-032b's target rule applied to a control that sits alone. */
  editarAvatar: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '44px',
    marginTop: 'var(--space-2)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-on-light)',
    textTransform: 'uppercase',
  },
}
