# Decisão de Tecnologia

> Decidido por painel adversarial (2026-08-22): três arquiteturas defendidas por advogados
> independentes e julgadas por três lentes — manutenibilidade por voluntários rotativos,
> aderência ao produto e operação/custo. Placar (soma das lentes): **A 23 · B 20 · C 15**,
> com A vencendo as três lentes.

## TL;DR — Arquitetura escolhida (A)

| Camada | Escolha |
|---|---|
| Framework | **Next.js (App Router) + Payload CMS 3** embutido no mesmo app (admin em `/admin`) |
| Linguagem | TypeScript de ponta a ponta |
| Banco | **PostgreSQL 16** (adapter Postgres/Drizzle do Payload) |
| Storage de objetos | **S3-compatível**: MinIO self-hosted ↔ S3/R2 gerenciado (troca por env) |
| Preview 3D | `@google/model-viewer` (GLB/GLTF) + `three` com loaders STL/OBJ/3MF (client, lazy) |
| Proxy/TLS | Caddy |
| Deploy | Docker Compose em VM do campus/VPS; imagem buildada no GitHub Actions (a VM só faz pull) |
| Monorepo | pnpm workspaces (sem Turborepo) |

```
apps/web/          Next + Payload (frontend público + admin + API)
packages/game/     regras puras de XP/nível/missão — TS puro, testado, zero import de Payload
packages/ui/       design tokens da identidade + componentes (card, chip, pips, botões)
infra/             docker-compose, Caddyfile, backup, runbooks
```

**Sobre "frontend e backend separados no mesmo repo":** a separação é **de pacotes, não de
processos** — domínio (`packages/game`), UI (`packages/ui`) e app são módulos independentes;
um segundo container não protegeria melhor o bus factor e dobraria a RAM da VM. Registrar
essa interpretação na constitution (Passo 0 da [sdd-strategy.md](sdd-strategy.md)) para o
código não contradizer o documento.

### Por que A venceu

- **Fila de moderação de graça**: a list view do admin Payload (filtro por status + bulk
  edit) é a fila de validação de missões/publicações — maior economia real de horas.
- **Schema em código** (collections TypeScript no git) — sem drift "a verdade está na UI".
- **SEO/invalidação corretos**: RSC + Local API em processo; `revalidateTag` disparado no
  `afterChange` (publicou/corrigiu → página atualiza; B e C só tinham cache por tempo).
- **Menor pegada**: 4 containers de longa duração (caddy, web, db, minio), sem Redis,
  ~1,0–1,2 GB RAM — cabe na VM barata; migração gerenciada é só trocar env.
- Next + React é o stack de maior familiaridade no pool de voluntários brasileiro.

## Correções obrigatórias (defeitos achados pelos juízes)

Incorporar à spec da feature correspondente — não são opcionais:

1. **XP na mesma transação** (roubado da arquitetura C): o hook `afterChange` deve
   propagar o `req` do Payload para o insert no ledger compartilhar a transação da ação
   que o causou. Chave única `idempotencyKey` impede double-grant; a transação impede o
   grant órfão quando a ação falha. É o bug que um novato não consegue diagnosticar.
2. **Tabela de XP editável** (roubado da B): valores de XP e curva de níveis em uma
   collection `regrasXp` editável pela equipe — a economia do jogo será recalibrada por
   não-programadores; não pode exigir deploy.
3. **Validação de upload precisa de spike**: `clientUploads: true` (browser → MinIO por
   URL pré-assinada) é **incompatível** com sniffing de magic bytes em `beforeValidate`
   (o Node nunca vê os bytes). Adotar o fluxo da C: pré-assinado + `HeadObject` +
   verificação pós-upload (baixar primeiros KB, validar STL/3MF/GLB por assinatura,
   quarentena até aprovar). Validar também o comportamento real de `imageSizes` com
   upload direto antes de fixar a spec da feature 002.
4. **Posse de cosméticos é tabela, não regra**: `perfilCosmeticos` (quem ganhou o quê,
   quando, por qual origem) — sem ela, recompensa de missão/nível do lab não tem onde ser
   registrada e mudança de regra revoga itens já ganhos.
   **Adiado (2026-08-23):** o v1 terá apenas itens fixos, sem cosméticos de recompensa —
   esta tabela entra junto com a mecânica de desbloqueio quando ela for ativada.
5. **Progresso % de missão precisa de modelo**: o mockup mostra 50%/30%/0% — definir o que
   calcula isso (etapas do critério) no brainstorm da feature 005; nenhum advogado cobriu.
6. **Form de publicação do maker é trabalho custom**: o admin cobre a equipe; o maker
   publica pelo site (CTA "Publicar projeto") — orçar upload + preview 3D + rascunho no
   frontend público (features 003/004).
7. **Exclusão LGPD purga versões**: drafts/versions do Payload guardam valores antigos —
   a anonimização deve varrer o histórico de versões e o storage, senão a exclusão é falsa.

## Multi-tenancy (requisito de 2026-08-23)

> Requisito: a plataforma poderá ser fornecida a outros fablabs/makerspaces — usuários
> **master** criam/gerenciam organizações e seus admins; **org admins** gerenciam perfil e
> usuários da própria organização. Analisado por painel adversarial (2 desenhos + juiz).
> **A decisão da arquitetura A não muda**: Directus perde pelas mesmas lentes do painel
> original (e BSL 1.1 piora ao redistribuir a plataforma); stack custom piora com tenancy
> (superfície de auth multi-org); Strapi trava multi-tenancy em enterprise.

### Modelo escolhido

- **Row-level em banco compartilhado** com o plugin oficial
  `@payloadcms/plugin-multi-tenant` (MIT), instalado **antes da primeira collection de
  conteúdo** — o plugin define nome/forma do campo `tenant`, composição do access,
  `tenantsArrayField` no usuário e o seletor de tenant no admin; adotá-lo depois de
  collections hand-rolled é migração cara. DB-por-tenant rejeitado com mecanismo: o
  Payload inicializa **um** adapter de banco por processo, então "DB por tenant" viraria
  processo por tenant (~1 GB por stack) — morre com 2 labs na VM.
- **Princípio central: tenancy é propriedade dos DADOS, nunca modo de deploy.** Não
  existe `TENANCY_MODE` nem ramo condicional: uma instância soberana (lab que se hospeda
  sozinho) é um deploy multi-tenant com **exatamente uma org e nenhum usuário master** —
  o middleware host→org resolve para a org única. Um caminho de código, um runbook, uma
  matriz de testes; a porta "distribuir para self-host" fica aberta de graça.
- **Identidade global, papel por organização**: um e-mail = um `usuario`;
  `usuarios.orgs[]: {org, papel: admin|staff|maker}`; `master` é papel global. Convite por
  org admin com e-mail já existente **adiciona membership** — nunca cria conta nem revela
  a existência da conta em outra org.
- **Painéis**: o admin do Payload já é o painel — master vê tudo + collection
  `organizacoes`; org admin usa o mesmo `/admin` com seletor travado nas suas orgs e
  collections globais ocultas por papel. O requisito fica atendido **em substância desde a
  fundação**; o que se adia é a ergonomia (wizard de org, tema, quotas).
- **Roteamento por subdomínio** (`bauru.plataforma.br`) canônico; path-based proibido
  (cookies, isolamento, percepção de site próprio); custom domain como upgrade. TLS:
  `on_demand_tls` do Caddy (HTTP-01 por subdomínio, sem imagem custom nem chave de DNS);
  wildcard DNS-01 apenas como otimização futura.
- **Storage**: bucket único com prefixo `org/<slug>/…` e **um único construtor de chave**;
  quota por org validada **na emissão da URL pré-assinada**, com job periódico de
  reconciliação contra o prefixo (contador denormalizado sofre drift). O **número** da
  quota por org ainda não existe — decidir (os 10/100/200 MB são limites por arquivo).
- **Gamificação por org**: ledger, ranking, nível do lab e `regrasXp` escopados;
  `idempotencyKey = (tenant, user, ação, ref)`; `packages/game` recebe `tenantId` como
  argumento explícito. `regrasXp` é **semeada por cópia** na criação da org (sem
  herança/fallback global — ambiguidade escondida).
- **Branding: v1 = co-branding, não white-label** — cor, logo, tipografia e hero por org
  via CSS custom properties (regra da feature 001: **zero literal hexadecimal em
  componente**); a pixel art (avatar, ícones, estações) é compartilhada — identidade
  própria completa exigiria designer por lab.
- Reserva barata: `modelos3d.visibilidade: 'privada' | 'rede'` declarado com **apenas
  `privada` implementada** — features de rede (biblioteca compartilhada, ranking
  cross-lab) só após decisão de produto.

### O risco nº 1: vazamento cross-tenant silencioso

Na **Local API do Payload o access control é pulado por padrão** — o vazamento típico é um
`payload.find()` "limpo" dentro de um RSC ou hook, sem flag suspeita nenhuma, devolvendo
dados do vizinho com HTTP 200. Defesas obrigatórias na fundação, antes de existir a 2ª org:

1. **Choke point único**: nada fora de `lib/tenancy/` chama
   `payload.find/findByID/create/update/delete` nem Drizzle cru; tudo passa por
   `getTenantScopedPayload(req)`; lint pelo **nome do método** (o bug real não contém a
   string `overrideAccess`).
2. **Access de collection scoped retorna query constraint, nunca booleano.**
3. **Validator compartilhado de mesmo-tenant** em todo relationship — o plugin **não**
   valida relationship cruzando tenants.
4. **Registro versionado de escopo** por collection (`scoped`/`global`, com justificativa)
   e teste de CI que falha para collection fora do registro.
5. **Harness de teste de vazamento no CI**: fixture com 2 orgs; usuário da org A recebe 0
   linhas/403 em toda superfície da B (REST, Local API/RSC, admin, endpoints custom) —
   demonstrado vermelho→verde.

### Sequenciamento

- **Feature 000 (nova, curta, antes/junto da 002)**: plugin + `organizacoes` + papéis +
  seed do CITe + middleware host→slug com fallback de org única + choke point + validator
  + harness de vazamento + fluxo de convite. Roda em paralelo com a 001 e **não atrasa o
  lançamento do CITe**.
- **Features 001–006**: escopo inalterado; toda collection nasce com `tenant`; a 004 cria
  membership pela org resolvida do host; a 005 usa a chave idempotente com tenant; LGPD
  opera por `(tenant, user)` incluindo purga de versions e do prefixo de storage.
- **Feature 007 (nova) — onboarding de organizações**: wizard de org, tema/co-branding,
  quotas, TLS multi-host. **Gatilho explícito**: convênio jurídico assinado **e** segundo
  lab real com responsável nomeado — antes disso é gastar meses de voluntário para zero
  usuário (o mesmo relógio de semestre que derrotou a arquitetura C).
- **Nunca no v1**: billing/planos (é convênio universitário, não SaaS); editor de tema com
  preview ao vivo; RLS do Postgres antes de os testes de isolamento existirem e passarem.

### Gates de governança (bloqueiam o 1º tenant externo — não são backlog)

- **Instrumento jurídico assinado** definindo controlador/operador LGPD, DPO, notificação
  de incidente, responsabilidade pelo conteúdo publicado e política explícita de ausência
  de SLA ("best-effort").
- **Conteúdo de terceiros**: "moderação humana como antivírus" **quebra** quando o
  moderador é de outra instituição — ou ClamAV entra na verificação pós-upload, ou o
  convênio transfere a responsabilidade por escrito.
- **Decisão de negócio precedente**: a UNESP **hospeda** labs de terceiros (SaaS
  institucional) ou **distribui** o software para self-host? O modelo mantém as duas
  portas abertas até a 007; convênio, LGPD e suporte dependem da resposta.
- Demais questões de produto para o brainstorm da 007: quem paga a infra e sob que
  instrumento; portabilidade/saída de um lab (o que leva, o que é apagado); marca
  "powered by" no rodapé; features de rede; barra mínima para aceitar um lab (responsável
  nomeado, compromisso de moderação); licença do código; SSO institucional; número da
  quota de storage por org; gatilho de saída da VM (R2 primeiro → Postgres gerenciado →
  app por último).

## Camada de experiência do jogo (frontend)

Como o design gamificado se materializa — decidido junto com a arquitetura A:

- **UI gamificada em DOM + CSS, não em engine de jogo.** Cards, pips, barras de progresso,
  missões e ranking são UI comum com pele de jogo: tokens de `visual-identity.md`,
  **Tailwind CSS** como sistema responsivo e `image-rendering: pixelated` para nitidez dos
  sprites. Engines de canvas (Phaser/PixiJS) foram descartadas para essas superfícies:
  destruiriam SEO, acessibilidade e texto responsivo sem ganho em telas estáticas.
- **Avatar pixel art por composição de camadas**: cada cosmético é um PNG por slot
  (corpo/cabelo/rosto/roupas/acessórios) empilhado por z-index no construtor; um composite
  server-side (`sharp`) gera a miniatura cacheada usada em cards e ranking.
  **Decidido (2026-08-23, rodadas 1–3):** a designer produz os sprites; rotação em
  **4 direções**; catálogo conforme `design/avatar-create.png` atualizado pela rodada 3 —
  base **`F`/`M`** (rótulos trocados de XX/XY), 20 tons de pele, 10 tons de cabelo, 30
  cabelos, rosto com **4 olhos + 4 narizes + 4 bocas**, roupas em 3 slots de 10 (**apenas
  a parte de cima varia por base** — F com peitos, M sem), óculos e chapéus com 5 cada;
  somente **itens fixos** no v1 (cosméticos de recompensa adiados); cards/ranking usam o
  mesmo rosto do boneco em miniatura. Resta definir o template/grade técnico dos sprites
  no brainstorm da feature 004 (produção: partes de cima ×2 bases, tudo ×4 direções).
- **Hero v2 (mapa isométrico)** como arte pré-renderizada com *art direction*, não mundo
  renderizado — **decidido (2026-08-23):** o v2 é o hero oficial da home (substitui o v1)
  e o mobile recebe **arte dedicada** produzida pela designer; `<picture>` seleciona a
  arte por breakpoint. Estações clicáveis, se desejadas, são hotspots HTML posicionados
  sobre a imagem.
- **Preview 3D** (Biblioteca 3D): `@google/model-viewer` para GLB/GLTF e loaders do
  `three` (STL/OBJ/3MF) carregados lazy, client-only, apenas na página de detalhe.
- **Aulas**: embeds do YouTube — ação do botão `ASSISTIR` é reproduzir online
  (decidido em 2026-08-23, ver `pages/aulas.md`).
- **Responsivo mobile-first em três layouts nomeados**: mobile <768px (alvo 390),
  tablet 768–1279px (alvo 834), desktop ≥1280px (alvo 1440). As adaptações por componente
  (grid 3→2→1, header → hambúrguer/bottom-nav, sidebar → chips/drawer, alvos de toque
  44px) estão especificadas por página em `pages/*.md`, marcadas `(proposta)` até
  validação com a designer.

## Banco: Postgres, não Mongo

O núcleo é relacional e transacional — ledger de XP, curtidas com unicidade composta,
missões com FK e máquina de estados. `jsonb` (+ índice GIN) cobre o avatar equipado e
metadados heterogêneos sem segundo datastore. Mongo exigiria replica set para transações,
segundo backup e segundo modelo mental, e os alvos gerenciados pedidos (RDS/Neon/Supabase)
são Postgres. Caminho gerenciado: trocar `DATABASE_URI` (`?sslmode=require`); atenção ao
modo pooled do Supabase (pgbouncer × prepared statements).

## Storage: MinIO ↔ S3/R2

- Self-host: MinIO no compose (`forcePathStyle: true`). Nota de longevidade: MinIO é AGPL
  e vem estreitando a edição community — fallback documentado: Garage/SeaweedFS, ou
  **Cloudflare R2 desde o dia 1** (free tier 10 GB, egress zero — elimina container,
  backup de objetos e a migração futura; decidir com o lab se pode haver dependência
  externa já no início).
- Gerenciado: trocar `S3_ENDPOINT`/chaves, `forcePathStyle: false`. Zero mudança de código.
- Limites: imagens 10 MB, malhas 3D 100 MB, ZIP 200 MB (+ `client_max_body_size` no Caddy).
- **Reaper de órfãos**: upload pré-assinado abandonado deixa objeto sem registro — regra de
  lifecycle no bucket ou job de limpeza. Nenhum advogado tinha previsto.

## Operação mínima antes do lançamento (lente de operação)

- **Disco é a queda nº 1**: malhas 3D + Postgres + imagens Docker num volume só — definir
  quota do bucket, retenção de backup e alerta de espaço livre.
- **Backup com destino externo nomeado** (R2/B2/NAS do campus): `pg_dump` + espelho do
  bucket, retenção definida, **restore ensaiado** e runbook escrito que um voluntário novo
  consiga seguir.
- **Monitoramento**: uptime ping externo + healthcheck com rollback de tag de imagem +
  retenção de logs. Sem isso, quem descobre a queda é um aluno.
- **Malware em downloads públicos**: moderação humana como "antivírus" deve ser aceita
  explicitamente na constitution, ou adicionar ClamAV na verificação pós-upload.

## Riscos aceitos e mitigação

| Risco | Mitigação |
|---|---|
| Treadmill acoplado Next+Payload (major de um trava o outro) | Pinar versões; upgrade só em sprint dedicada; registrar na constitution |
| Drift de migrations (Postgres adapter) | `push: true` só em dev; `payload migrate:create` commitado; job de CI que falha quando o schema commitado divergir |
| Bundle do admin derruba o site (processo único) | Uploads pré-assinados, ISR + cache no Caddy, healthcheck + rollback; `docker compose restart web` como runbook de 3h da manhã |
| Conhecimento Payload-específico sai com o voluntário | Toda regra de jogo em `packages/game` (TS puro, vitest); hooks são adaptadores finos |
| Pipeline de sprites do avatar | Resolvido em 2026-08-23: a designer produz os sprites (4 direções, 10 itens/aba, itens fixos, mesmo rosto em miniatura); resta definir o template/grade técnico no brainstorm da feature 004 |

## Alternativas consideradas

- **B — Directus + SvelteKit + Postgres + MinIO (20 pts):** melhor documentação de ops e
  backup, RBAC fino e `regrasXp` editável (ideia roubada). Perdeu por: dois runtimes Node
  + Redis (~2 GB), upload passando pelo Node (queda mais provável das três), Svelte contra
  um pool de voluntários React, triggers SQL como núcleo do jogo, licença BSL 1.1 em
  universidade pública.
- **C — Fastify + tRPC + Prisma + Refine (15 pts):** a gamificação mais correta
  (transação única, idempotência no schema — ideia roubada) e o melhor fluxo de upload
  (idem). Perdeu por: CMS inteiro é custo (6–10 semanas até a equipe editar conteúdo, num
  projeto com relógio de semestre), ~9 bibliotecas para dominar, auth próprio sob LGPD em
  lib jovem (Better Auth), backup projetado para o mesmo disco.
