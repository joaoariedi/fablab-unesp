# Estratégia SDD — Framework Hefesto / spec-kit

Como usar o framework para sair destes documentos de produto e chegar em código, com
gates humanos onde o processo exige julgamento.

## Insumos (já produzidos)

- [concept.md](concept.md) — visão, IA, público, requisitos de plataforma
- [visual-identity.md](visual-identity.md) — paleta, tipografia, componentes, direção de arte
- [gamification.md](gamification.md) — regras do jogo + questões em aberto
- `pages/*.md` — especificação por página (desktop fiel ao mockup + adaptações tablet/mobile)
- [tech-stack.md](tech-stack.md) — decisão de arquitetura e serviços

## Passo 0 — Fundação do repositório (uma vez)

1. `git init` + primeiro commit dos docs de produto (o pipeline SDD assume repositório git).
2. `/speckit.init` — bootstrap do diretório `.specify/`.
3. `/speckit.constitution` — princípios do projeto. Conteúdo mínimo:
   - stack decidida em tech-stack.md (e a regra de intercambiabilidade MinIO↔S3, Postgres↔gerenciado);
   - monorepo com frontend/backend separados;
   - conteúdo do site em PT-BR; código e commits em inglês;
   - responsivo mobile-first em três tamanhos (390 / 834 / 1440 como alvos de design);
   - fidelidade à identidade visual (tokens derivados de visual-identity.md);
   - LGPD para contas de usuário;
   - **princípios de multi-tenancy** (tech-stack.md → seção Multi-tenancy): tenancy é
     propriedade dos dados (sem `TENANCY_MODE`); registro de escopo por collection; access
     como query constraint; choke point único de leitura; identidade global com papel por
     org; nenhum tenant externo antes de instrumento jurídico; v1 = co-branding;
   - limites de qualidade do framework (funções <50 linhas, arquivos <500 LOC, testes).

## Passo 1 — Fatiamento em features

Uma feature = um ciclo SDD completo. Ordem proposta (dependências entre parênteses):

| # | Feature | Escopo | Fonte |
|---|---|---|---|
| 000 | `fundacao-multi-tenant` (paralela à 001) | Plugin multi-tenant, coleção `organizacoes`, papéis (master/org admin/staff/maker), seed CITe, middleware host→org com fallback de org única, choke point `getTenantScopedPayload`, validator de mesmo-tenant, harness de vazamento no CI, fluxo de convite | tech-stack.md → Multi-tenancy |
| 001 | `design-system-shell` | Tokens (cores, tipografia, shapes) como **CSS custom properties — zero hex literal em componente** (porta do co-branding), componentes base (card, botão, chip, barra de progresso, pips), header/footer responsivos, grid | visual-identity.md, pages/* |
| 002 | `cms-conteudo` | Coleções (projetos, modelos 3D, aulas, artigos, eventos, usuários), upload multi-formato para storage S3-compatível, admin/moderação | pages/*/Modelo de conteúdo |
| 003 | `paginas-publicas` (001, 002) | Home v1, Projetos, Artigos, Aulas, Biblioteca 3D (com preview 3D), Calendário | pages/*.md |
| 004 | `contas-avatar` (001, 002) | Cadastro em 2 passos (avatar → dados pessoais), login, Minha Conta (avatar + skills), construtor de avatar pixel art, LGPD | pages/onboarding.md, pages/minha-conta.md |
| 005 | `gamificacao` (004) | Ledger de XP, skills/níveis, missões + validação, ranking, nível do lab, recompensas cosméticas | gamification.md |
| 006 | `home-gamificada` (003, 005) | Home logada com missões em destaque, ranking, nível do lab; hero v2 (mapa pixel art) se aprovado | pages/home.md |
| 007 | `onboarding-de-orgs` — **gatilho: convênio assinado + 2º lab real** | Wizard de organização, tema/co-branding, quotas de storage, TLS multi-host | tech-stack.md → Multi-tenancy |

Fatias pequenas mantêm cada espec/plan/tasks dentro de uma janela de contexto saudável
(ver regra de context-management: reset decisivo a ~40%).

## Passo 2 — Ciclo por feature

```
/speckit.brainstorm  →  /speckit.specify  →  /speckit.clarify  →  /speckit.review
        →  /speckit.plan  →  /speckit.tasks  →  (/speckit.checklist, /speckit.analyze)
        →  implementação  →  quality gates  →  PR
```

- **`/speckit.brainstorm`** — usar primeiro nas features 005 e 004: as "Questões em aberto"
  de gamification.md e pages/onboarding.md são exatamente a pauta socrática (tabela de XP,
  moderação, passos 2–3 do cadastro, check-in presencial). Para features mecânicas (001),
  pode-se pular direto para specify.
- **`/speckit.specify`** — apontar explicitamente os arquivos de `product/` como fonte;
  cada page-spec já traz cenários por breakpoint e modelo de conteúdo.
- **`/speckit.clarify` e `/speckit.review`** — gates humanos; não delegar a workflow.
- **Implementação:** `/speckit.implement` para listas curtas; para listas grandes
  (002, 003, 005) usar **`hefesto:speckit-workflow`** (nome completo) — ordem de fases
  garantida em código, tarefas [P] em paralelo, verificação adversarial por agentes que
  não escreveram o código. Sempre DEPOIS dos gates humanos.
- **Qualidade:** `test-specialist` após implementação; `quality-guardian` antes de commit;
  `code-reviewer` antes do PR; `/hef.security-scan` nas features 002/004 (upload de
  arquivos e contas são superfícies de ataque — validar extensão/MIME, limites, LGPD).

## Passo 3 — Ritmo e contexto

- Uma feature por sessão (ou menos); checkpoint em `.claude/progress.md` ao fechar fase.
- Rodar `/graphify` após a feature 002 para manter o grafo do código como apoio de
  exploração barata nas sessões seguintes.
- Trivialidades fora do ciclo (typo, config): `/speckit.fix`.

## Riscos de processo

- **Design só desktop:** as adaptações tablet/mobile seguem como propostas — validar com
  a designer antes da feature 001 virar spec. Exceção já decidida (2026-08-23): o hero da
  home terá **arte mobile dedicada** produzida pela designer.
- **Fontes:** arquivos recebidos em `product/fonts/` (2026-08-23): Aldo the Apache,
  SquareFont (Bou Fonts) e Comfortaa variável (OFL). Pendência restante: **confirmar a
  licença web** de Aldo the Apache e SquareFont (vieram sem arquivo de licença); não
  bloqueia mais a feature 001, mas a confirmação deve chegar antes do lançamento.
- **Gamificação:** números fechados em 2026-08-23 (1 XP por ação; 5 XP por nível; máximo
  10; curtidas sem XP; cosméticos de recompensa adiados). O brainstorm da 005 foca no que
  restou: moderação/anti-farm, check-in presencial e a recompensa coletiva do Nível do Lab.
