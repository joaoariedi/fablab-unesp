# Benchmark de Stack — Arquitetura A × Proposta Astro (relatório Gemini)

> Produzido em 2026-08-24 a pedido do PO, após relatório externo (Gemini) recomendar
> **Astro + React Islands + PixiJS + Supabase**. Este documento compara a proposta com a
> arquitetura decidida ([tech-stack.md](tech-stack.md)) sob os requisitos REAIS do
> projeto e entrega um placar por lente. **A decisão final é do PO** — o documento não
> altera a decisão vigente.

## 1. O que o relatório externo não sabia

O relatório foi escrito sem acesso a decisões e requisitos que pesam na escolha:

| Requisito/decisão | Impacto na análise externa |
|---|---|
| **Multi-tenancy** (orgs, master/org admin, tenancy como propriedade dos dados, plugin oficial do Payload) | Ausente do relatório — é o requisito que mais restringe a escolha |
| **CMS com fila de moderação** (rascunho → revisão → publicado; XP na aprovação) | Supabase **não tem admin editorial** — o Studio dá CRUD técnico de tabela, mas drafts/versões, fila de revisão e UI por papel viram trabalho custom (o motivo pelo qual a **arquitetura C do painel original** — Fastify+Refine, sem CMS — perdeu) |
| **Self-host em VM do campus + troca por env** (MinIO↔S3/R2, Postgres↔gerenciado) | Supabase gerenciado é um BaaS (lock-in de API em auth/GoTrue, storage e PostgREST — **RLS não é lock-in**, é Postgres puro e portátil); o compose oficial de self-host traz **~13 serviços** (db, Kong, GoTrue, PostgREST, Realtime, Storage, imgproxy, Studio, postgres-meta, Edge Functions, Analytics/Logflare, Supavisor, vector) — pior que os 2 runtimes que já reprovamos na **arquitetura B do painel original** (Directus+SvelteKit) |
| **Direção de arte decidida**: sprites fixos produzidos pela designer, 4 direções, hero **pré-renderizado** com hotspots HTML; engines de canvas **rejeitadas** para UI | O relatório assume avatar **procedural** (GLSL palette-swap) e mundo isométrico em **PixiJS/WebGL** — contradiz as rodadas 1–5 |
| **Equipe**: voluntários rotativos, pool React no Brasil | Considerado só de passagem |
| **LGPD/institucional** | Dados de alunos num BaaS terceiro exigem análise de operador/controlador que o relatório não faz |

O que o relatório **acerta** e merece absorção: (a) páginas de conteúdo devem embarcar o
mínimo de JavaScript; (b) o avatar como **seed determinístico** (config compacta,
render derivado) é boa engenharia; (c) **palette swap** pode reduzir o volume de sprites
que a designer produz; (d) a disciplina de "ilhas" (interatividade só onde precisa) é o
modelo mental certo para as nossas telas.

## 2. Configurações comparadas

- **A — Decidida:** Next.js (App Router/RSC) + **Payload 3 embutido** + Postgres +
  MinIO/S3. Um processo; admin/moderação e multi-tenant plugin de graça; invalidação por
  publicação (`revalidateTag`).
- **B — Relatório literal:** **Astro** (ilhas React) + **PixiJS** (avatar/hero WebGL) +
  **Supabase** (Postgres/auth/storage BaaS) + Tailwind.
- **C — Híbrido forte:** **Astro** no frontend + **Payload standalone** (headless) +
  Postgres + MinIO. Mantém CMS/multi-tenant; ganha páginas de conteúdo zero-JS; custa um
  segundo runtime e a ponte de auth/cache.

> **Atenção aos rótulos:** A/B/C acima são as configurações **deste** benchmark. Quando o
> texto cita o **painel original** de [tech-stack.md](tech-stack.md), B = Directus+SvelteKit
> e C = Fastify+tRPC+Prisma+Refine — sempre indicado explicitamente.

## 3. Placar por lente

Notas 1–10; as três primeiras lentes são as do painel original, as três últimas entram
por causa do relatório. *(Números de JS são ordem de grandeza, não medição — ver §4.1.)*

| Lente | A (Next+Payload) | B (Astro+Supabase) | C (Astro+Payload) |
|---|---|---|---|
| Manutenibilidade (voluntários rotativos) | **8** — 1 processo, React, schema em código | 4 — 3 paradigmas (Astro+ilhas+PixiJS/GLSL) e todo admin custom | 6 — 2 apps/2 deploys, ponte de auth e stores |
| Aderência ao produto (CMS, moderação, multi-tenant, gamificação) | **9** — fila de moderação e plugin multi-tenant prontos; XP transacional no mesmo processo | 4 — Studio cobre CRUD técnico, mas falta admin editorial (drafts/versões/fila) e UI por papel para a equipe; multi-tenant via RLS artesanal | 8 — mesmo backend da A |
| Operação/custo (VM do campus, swap por env, LGPD) | **8** — 4 containers, ~1,0–1,2 GB; swap = env | 4 — gerenciado elimina backup/ops de banco (ganho real), mas viola a regra de swap e exige análise LGPD; self-host oficial ~13 serviços | 6 — +1 runtime Node; invalidação de cache por conta própria |
| Performance de conteúdo (JS, TTI em celular fraco) | 7 — RSC estático embarca o runtime base (~85–115 KB gz); páginas de conteúdo sem JS por componente | **9** — zero-JS por padrão; ilhas só onde precisa | **9** — idem B |
| Aderência à direção de arte decidida | **9** — DOM/CSS + composite server-side, hero `<picture>` — é o que está especificado | 4 — reabre decisões fechadas (procedural × sprites da designer; WebGL × pré-renderizado) | 8 — arte como decidida; ilhas para builder/preview |
| Custo de mudança AGORA (specs, painel multi-tenant, constituição já escritos p/ A) | **10** — zero | 2 — re-projetar CMS, tenancy, moderação, uploads | 5 — re-projetar entrega do frontend, auth bridge, cache |
| **Total** | **51** | 27 | 42 |

## 4. Análises que sustentam o placar

### 4.1 O argumento central do relatório: payload de JS

É o ponto **legítimo** da proposta — e está **superdimensionado** para o nosso caso:

- O relatório compara Astro com o Next "clássico" (SPA hidratada). Com **App Router/RSC**,
  páginas de conteúdo são renderizadas no servidor e **componentes de servidor não
  embarcam JS próprio**; o que resta é o runtime base do framework (ordem de **~85–115 KB
  gz**) + apenas os client components usados. *(Base da estimativa: o número
  "First Load JS shared by all" impresso pelo `next build`, que o Next calcula **já
  gzipado**; apps mínimos de App Router publicados ficam entre ~80 e ~106 KB, e Next 15/16
  com React 19 tende ao topo da faixa. Não é medição deste projeto — a medição real sai na
  feature 003.)* Astro estático fica em **~0 KB** de fato — poucos KB apenas se o
  `ClientRouter` (view transitions) for usado. A diferença
  real em LCP/TTI num celular modesto existe, mas é **uma fração** do que o texto sugere —
  e o maior peso das nossas páginas será **imagem** (pixel art do hero, fotos de projeto),
  não JS.
- **Mitigação se ficarmos na A** (recomendada de qualquer forma): tratar a disciplina de
  ilhas como regra da feature 001 — *client components apenas para builder de avatar,
  preview 3D, curtir e barras interativas*; orçamento de performance por página (LCP ≤2,5s
  em 4G/dispositivo médio) medido na feature 003; hero mobile servido por `<picture>` com
  AVIF/WebP.

### 4.2 Supabase contra os nossos requisitos

- **O que daria** (steelman honesto): Postgres gerenciado com backup/PITR administrado —
  o que **elimina** boa parte da lista de "operação mínima antes do lançamento" da
  tech-stack.md (pg_dump, retenção, restore ensaiado); auth pronta; storage; **RLS**, que
  é de fato um bom mecanismo de tenancy row-level e, sendo Postgres puro, é a parte
  **portátil** do pacote; e o **Studio**, que dá table editor, SQL editor e gestão de
  usuários — ou seja, "sem admin" é forte demais: falta **admin editorial**, não CRUD.
- **O que faltaria**: *todo o plano editorial* — fluxo rascunho→revisão→publicado,
  drafts/versões, fila de moderação e uma UI **por papel de aplicação** (o Studio é
  console de projeto, para quem tem acesso à conta Supabase, não painel para a equipe do
  lab) — exatamente o custo que derrotou a **arquitetura C do painel original**
  (6–10 semanas até a equipe editar conteúdo). O plugin multi-tenant do Payload
  (`@payloadcms/plugin-multi-tenant`, MIT), o seletor de tenant no admin e o padrão
  "seed-on-create" teriam de ser reconstruídos à mão sobre RLS + um admin custom.
- **Requisito de swap violado**: nossa regra é "gerenciado ↔ self-host trocando env".
  Supabase gerenciado amarra auth/storage/API ao serviço — em **esforço operacional**, não
  em formato proprietário: todos os componentes são open source e o dado sai por `pg_dump`,
  mas trocar de provedor exige reescrever a camada de auth/storage, não uma env. O compose
  oficial de self-host tem **~13 serviços**; é honesto dizer que dá para enxugar
  (Analytics, Realtime, Edge Functions e imgproxy são removíveis), mas mesmo o mínimo útil
  (db, Kong, GoTrue, PostgREST, Storage, Studio) é **~6 containers só para o backend**,
  contra 4 no total da A. (Existe região AWS São Paulo — `sa-east-1` — para o gerenciado,
  o que atenua — mas não resolve — a análise LGPD: o operador continua sendo empresa
  estrangeira.)

### 4.3 PixiJS e procedural × o que já foi decidido

- O **paperdoll em camadas** o projeto já tem — via DOM/CSS no builder e **composite
  server-side (sharp)** para miniaturas; PixiJS só se justificaria se o mapa do hero
  virasse um mundo navegável (explicitamente fora do v1) ou se a composição em DOM
  falhar em performance (nada indica isso para ~10 camadas estáticas).
- **Palette swap (GLSL)** resolve um problema que **não temos como framework** — mas é
  uma **ótima ideia de pipeline de produção**: a designer pode desenhar bases em tons
  neutros e derivar os 20 tons de pele/10 tons de cabelo por LUT **no build**, sem WebGL
  em runtime. **Ressalva técnica:** o `sharp` **não expõe operação de LUT/`maplut`** — sua
  API de cor tem só `tint`, `greyscale` e conversão de colourspace, e `recomb` é matriz
  3×3, que não faz troca de paleta indexada. O caminho viável é ler os pixels com
  `.raw()` e remapear as cores da paleta em JS (barato para sprites pixel art, dezenas de
  milhares de pixels) ou manipular a paleta do PNG indexado. Encaminhar ao brainstorm da
  feature 004 **com um spike de 1 dia** para confirmar o custo. **Absorvido, com ressalva.**
- **Seed determinístico**: já armazenamos `avatar_config` como JSON; adotar também uma
  **serialização canônica curta** (ex.: `f-p04-c07-h12-...`) como chave de cache do
  composite é ganho barato. **Absorvido.**

### 4.4 O híbrido C (Astro + Payload headless), com honestidade

É a única alternativa que compete: mantém tudo que fez a A vencer (CMS, moderação,
multi-tenant, uploads) e ganha o melhor conteúdo estático. Custos reais: **dois runtimes**
na VM (o padrão que reprovamos na arquitetura B do painel original), ponte de sessão (cookie do Payload
consumido pelo SSR do Astro), **invalidação por publicação** deixa de ser `revalidateTag`
e vira cache curto/webhook de rebuild, e o middleware de tenant por subdomínio precisa
ser reimplementado no Astro.

**Em favor da C (o que o Astro 5 já resolve):** *server islands* (`server:defer`) deixam a
página ficar estática/cacheável enquanto só o pedaço personalizado — header com avatar,
progresso de missão, botão de curtir — renderiza por requisição, o que **derruba boa parte
da ponte de cache**; *Astro Actions* dão funções de servidor tipadas para as mutações; e as
*sessions* do Astro dão onde guardar estado de sessão no servidor. Isso reduz o custo da
ponte, **não o elimina**: a sessão ainda é emitida pelo Payload e precisa ser validada no
Astro, a invalidação por publicação continua sendo cache curto/webhook (server island é
`Cache-Control`, não `revalidateTag`), o middleware host→org continua sendo reescrita, e o
segundo runtime na VM continua de pé. Por isso a nota da lente de operação da C fica em 6.
Faz sentido **apenas se** a performance de conteúdo da A, medida, falhar o orçamento —
não como aposta antecipada.

## 5. Recomendação

**Manter a Arquitetura A**, absorvendo do relatório: (1) disciplina de ilhas + orçamento
de performance como regra das features 001/003; (2) serialização-semente do avatar como
chave de cache; (3) palette swap como opção de pipeline de sprites (brainstorm 004, com
spike do remapeamento de paleta em `sharp` — ver §4.3); (4) gatilho objetivo de revisão —
*se, medida na feature 003, a Home/listagens falharem
o orçamento (LCP ≤2,5s em 4G médio), reabrir o híbrido C*. A proposta B (literal) reabre
decisões de design já fechadas e substitui os dois maiores ganhos da A (moderação e
multi-tenant prontos) por trabalho custom.

## 6. Opções para o PO

- **[A] Manter Next+Payload** com as 4 absorções acima *(recomendada)*.
- **[C] Migrar para Astro+Payload headless** — pagar já os custos de 2 runtimes/ponte de
  auth em troca do melhor estático; re-trabalho moderado nas specs.
- **[B] Adotar a proposta literal (Astro+Supabase+PixiJS)** — exige re-projetar CMS,
  moderação, multi-tenancy e reabrir a direção de arte; não recomendada.
