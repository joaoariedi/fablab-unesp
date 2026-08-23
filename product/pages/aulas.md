# Aulas

## Propósito

Catálogo dos **cursos e tutoriais em vídeo** do Fab Lab CITe Bauru — "Aprenda com tutoriais
práticos e conteúdos feitos para makers de todos os níveis." A página permite encontrar uma
aula por busca textual, avaliar rapidamente esforço (duração em minutos) e popularidade
(curtidas), dar crédito ao autor (avatar pixel + @handle + nível) e iniciar o consumo pelo
botão `ASSISTIR`. É um dos ganchos de XP do sistema: assistir aulas é uma das ações que
geram pontos — **1 XP** por aula assistida (`gamification.md`).

## Fonte de design

- `design/ChatGPT Image 18 de ago. de 2026, 11_54_58.png` — tela completa de Aulas (header,
  hero teal `AULAS`, título de seção `TODAS AS AULAS`, busca, lista numerada 01–08 em duas
  colunas, footer de pilares).
- Apoio: `concept.md`, `visual-identity.md`, `gamification.md`.

## Estrutura da página — desktop (≥1280px)

> **Decidido (2026-08-23):** a página **Aulas usa fundo branco na área de conteúdo**, com
> texto em navy `#191C37` (mesma regra da Biblioteca 3D). O mockup, todo sobre navy, fica
> como **registro histórico**: onde as descrições abaixo dizem "sobre navy" / "fundo navy",
> vale o fundo branco. O tratamento exato da sidebar/faixa teal e o ajuste dos contornos,
> chips e contrastes sobre o fundo claro serão detalhados com a designer **(proposta)**.

### Header (faixa navy no topo)

- Logo-chip extrudado laranja `FAB ● LAB` / `CITE BAURU` à esquerda, com hachura de sombra 3D.
- Navegação em caps display, na ordem exata do mockup:
  `BIBLIOTECA 3D` · `PROJETOS` · `AULAS` · `INSTAGRAM` · `ARTIGOS`
  - **Decidido (2026-08-23):** navegação canônica em todas as páginas, nesta ordem —
    `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`. O mockup (sem
    `CALENDÁRIO`) fica como registro histórico. Todos os itens **alinhados** — o `AULAS`
    torto/desalinhado em alguns mockups é ruído de render, não intenção de design.
  - Item ativo `AULAS` em **rosa** com sublinhado rosa curto; demais em branco.
  - `INSTAGRAM` abre em nova aba **(proposta)**.
- À direita: avatar pixel em moldura clara + `MAKER_X` / `NÍVEL 3` + chevron `⌄` (menu da conta).

### Hero (faixa teal `#74B7A5`)

- Grid isométrico wireframe branco sutil ao fundo (cubos e hexágonos).
- Título display navy: `AULAS`.
- Parágrafo navy em três linhas: `Aprenda com tutoriais práticos e conteúdos feitos para
  makers de todos os níveis.`
- Chevrons duplos `»` rosa/navy abaixo/à direita do parágrafo (ornamento).
- Composição isométrica à direita: letra **F** extrudada (rosa/laranja/amarelo) e cubo navy
  com arestas rosa sobre slab teal.

### Barra de seção e busca (sobre navy no mockup)

- Título de seção à esquerda, caps display claro: `TODAS AS AULAS`.
  **Decidido (2026-08-23):** sobre o fundo branco da página, o título vai em **navy**.
- À direita: campo de busca arredondado, fundo navy, borda rosa fina, placeholder
  `Buscar aulas...` e ícone de lupa rosa à direita do campo.
  **Decidido (2026-08-23):** sobre fundo branco o campo é claro com texto navy; a borda rosa
  e a lupa permanecem — acabamento exato **(proposta)** a validar com a designer.
- Não há tabs/filtros de categoria neste mockup (diferente de Projetos e Biblioteca 3D).
  **(proposta)** Avaliar filtros futuros por skill e por nível — ver "Questões em aberto".

### Lista de aulas

- **Lista numerada em 2 colunas**, ordem de leitura em coluna (esquerda `01`–`04`, direita
  `05`–`08`); 8 cards visíveis no mockup.
- Card de aula (retângulo horizontal, contorno fino claro, cantos levemente arredondados,
  fundo navy no mockup — **decidido (2026-08-23):** sobre a área de conteúdo branca o card é
  claro com texto navy e contorno navy/rosa; acabamento exato **(proposta)** com a designer):
  1. **Número de ordem** em chip retangular com borda rosa, canto superior esquerdo, dígitos
     com zero à esquerda: `01`, `02`, `03`, `04`, `05`, `06`, `07`, `08`.
  2. **Thumbnail ilustrada** (proporção ~5:3, ≈16:10 — medida no mockup) à esquerda, com fundo
     colorido por aula, repetindo cores entre cards: `01` teal, `02` rosa, `03` teal, `04` bege,
     `05` azul, `06` rosa, `07` verde-quadro, `08` madeira.
  3. **Título** em display claro caps, 1–2 linhas:
     `PRIMEIROS PASSOS IMPRESSÃO 3D`, `PRIMEIROS PASSOS CORTE A LASER`,
     `PRIMEIROS PASSOS SERIGRAFIA`, `O QUE É CULTURA MAKER`,
     `COMO TROCAR O BICO DE UMA IMPRESSORA BAMBU`, `COMO CONSERTAR CORTE A LASER`,
     `DICAS PARA MANTER SUA MÁQUINA`, `FERRAMENTAS DO MAKER`.
  4. **Descrição** em duas linhas:
     - `Aprenda os conceitos básicos da impressão 3D e faça sua primeira impressão com segurança.`
     - `Entenda o funcionamento da máquina e crie seus primeiros projetos.`
     - `Descubra os materiais, técnicas e processos da serigrafia.`
     - `Entenda a cultura maker, seus valores e como ela transforma ideias em soluções reais.`
     - `Passo a passo para substituir o bico da sua impressora Bambu com segurança.`
     - `Soluções para os problemas mais comuns no corte a laser.`
     - `Boas práticas de manutenção para aumentar a vida útil das suas máquinas.`
     - `Conheça as ferramentas essenciais para criar, prototipar e inovar.`
  5. **Metadados** na base do card, em linha:
     - Avatar pixel + `@handle` / `NÍVEL n` — `@maker_x` `NÍVEL 1`, `@laser.nick` `NÍVEL 1`,
       `@print.lu` `NÍVEL 1`, `@maker_x` `NÍVEL 1`, `@maker_jv` `NÍVEL 2`, `@laser.nick`
       `NÍVEL 2`, `@projeto_ana` `NÍVEL 2`, `@fab.teach` `NÍVEL 1`.
       **Decidido (2026-08-23):** os níveis dos autores nos mockups são **ilustrativos** —
       a economia real é 1 XP por ação, 5 XP por nível e **nível máximo 10**
       (`gamification.md`).
     - Ícone de relógio outline + duração: `25 min`, `28 min`, `23 min`, `18 min`, `15 min`,
       `22 min`, `17 min`, `20 min`.
     - Ícone de coração outline rosa + curtidas: `42`, `38`, `27`, `34`, `31`, `29`, `24`, `26`.
  6. **Botão `ASSISTIR`** à direita do card: retângulo outline teal com **ícone de download**
     (seta para baixo sobre traço) acima do rótulo `ASSISTIR` em caps.
     - **Decidido (2026-08-23):** a ação é **assistir online** (reproduzir o vídeo); não há
       download. O ícone de download do mockup fica a critério da designer trocar por ícone
       de play (ver questão 1, já resolvida).
- **Paginação**: não visível no mockup. Adotar botão `CARREGAR MAIS` centralizado abaixo da
  lista, com scroll infinito como alternativa **(proposta)**.
  **Decidido (2026-08-23):** botões primários da página (`CARREGAR MAIS`, `LIMPAR BUSCA`,
  `TENTAR NOVAMENTE`, `COMECE A CRIAR`) usam o **estilo canônico**: rosa preenchido, texto
  navy, sombra dura deslocada (`visual-identity.md`).

### Footer (faixa navy mais clara)

- Três pilares com ícone outline claro e rótulo em duas linhas caps, separados por divisórias
  verticais:
  - Ícone de grupo de pessoas — `APRENDA` / `FAZENDO`
  - Ícone de cubo wireframe — `COMPARTILHE` / `CONHECIMENTO`
  - Ícone de estrela/sparkle — `DESENVOLVA` / `PROJETOS REAIS`
- Composição isométrica rosa/laranja/teal no canto inferior direito.
- **(proposta)** Linha inferior com créditos institucionais UNESP, links legais e Instagram.

## Adaptação tablet (768–1279px)

Todas as decisões abaixo são **(proposta)** — o mockup cobre apenas desktop.

- **Header (proposta)**: logo-chip reduzido; navegação colapsa em menu "hambúrguer" à direita
  quando os 6 itens da nav canônica não couberem; bloco de conta reduz para avatar +
  `NÍVEL 3` (esconde `MAKER_X`).
- **Hero (proposta)**: mantém faixa teal; composição isométrica reduz ~40% e o texto ocupa
  ~60% da largura; parágrafo reflui em 2 linhas.
- **Barra de seção (proposta)**: `TODAS AS AULAS` e busca permanecem na mesma linha; a busca
  encolhe para ~50% da largura.
- **Lista (proposta)**: **2 → 1 coluna** de cards, mantendo o layout horizontal interno
  (thumbnail à esquerda, texto ao centro, botão `ASSISTIR` à direita) e a numeração `01`–`08`
  em ordem vertical contínua.
- **Botão (proposta)**: `ASSISTIR` mantém ícone + rótulo, altura mínima 44px.
- **Footer (proposta)**: três pilares permanecem em linha, com a composição isométrica
  reduzida ou omitida.

## Adaptação mobile (<768px)

Todas as decisões abaixo são **(proposta)** — o mockup cobre apenas desktop.

- **Header (proposta)**: logo-chip + avatar apenas; navegação em **barra inferior fixa**
  (Home · Biblioteca · Projetos · Aulas · Perfil) com item ativo em rosa; itens secundários
  (Artigos, Instagram, Calendário) em drawer aberto pelo item "Mais".
- **Hero (proposta)**: composição isométrica reduzida abaixo do texto ou omitida; título
  `AULAS` em tamanho menor; parágrafo com no máximo 4 linhas.
- **Busca (proposta)**: campo em largura total abaixo do título `TODAS AS AULAS`; opção de
  busca colapsada em ícone de lupa que expande ao toque.
- **Lista (proposta)**: **1 coluna**, card **empilhado verticalmente** — thumbnail em largura
  total no topo (16:9) com o chip numérico `0n` sobreposto no canto superior esquerdo; abaixo
  título, descrição (limitada a 2 linhas com reticências), linha de metadados (avatar +
  @handle + nível à esquerda; `min` e curtidas à direita) e botão `ASSISTIR` em largura total.
- **Alvos de toque (proposta)**: mínimo 44×44px para `ASSISTIR`, coração, avatar/@handle e
  itens da barra inferior; espaçamento vertical mínimo de 8px entre alvos.
- **Paginação (proposta)**: `CARREGAR MAIS` em largura total.
- **Footer (proposta)**: três pilares empilhados, um por linha, sem divisórias verticais.

## Componentes

> **Decidido (2026-08-23):** esta página tem **área de conteúdo em fundo branco** (texto
> navy), então os componentes reusáveis abaixo precisam de variante clara — as descrições
> "navy" vêm do mockup. Os botões primários seguem o **estilo canônico** (rosa preenchido,
> texto navy, sombra dura deslocada). O acabamento das variantes claras (contornos, sidebar/
> faixa teal, busca) fica **(proposta)** até o detalhamento com a designer.

| Componente | Descrição | Reuso |
|---|---|---|
| `HeaderPrincipal` | Logo-chip, nav canônica em caps (`BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`, itens alinhados), bloco de conta com avatar/nível | Todas as páginas |
| `HeroSecao` | Faixa teal com título display, parágrafo, chevrons e composição isométrica | Projetos, Artigos, Calendário (na Biblioteca 3D o teal é sidebar, não faixa) |
| `CampoBusca` | Input arredondado navy, borda rosa, lupa; placeholder `Buscar aulas...`; **variante clara** para o fundo branco desta página | Todas as listagens |
| `CardAula` | Card horizontal: número, thumbnail, título, descrição, metadados, `ASSISTIR`; sobre **fundo branco** (texto navy) | Exclusivo desta página |
| `ChipNumero` | Chip retangular com borda rosa e número `01`–`08` | **(proposta)** listas ordenadas |
| `AutorInline` | Avatar pixel + `@handle` + `NÍVEL n` | Projetos, Biblioteca 3D, Artigos |
| `MetaDuracao` | Ícone de relógio + `n min` | **(proposta)** Calendário |
| `BotaoCurtida` | Coração outline rosa + contador | Todas as listagens |
| `BotaoAssistir` | Botão outline teal com ícone de download + rótulo `ASSISTIR` | Exclusivo desta página |
| `CarregarMais` **(proposta)** | Botão de paginação centralizado, **estilo primário canônico** (rosa preenchido, texto navy, sombra dura) | Todas as listagens |
| `FooterPilares` | Três pilares + composição isométrica | Todas as páginas |

## Modelo de conteúdo (CMS)

### Coleção `aula`

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `titulo` | texto curto | sim | exibido em caps (`PRIMEIROS PASSOS IMPRESSÃO 3D`) |
| `slug` | slug | sim | derivado do título |
| `descricao` | texto (máx. ~140 car.) | sim | 2 linhas no card |
| `thumbnail` | imagem | sim | `.jpg` `.png` `.webp` `.svg`; proporção ~5:3 (desktop) e 16:9 no mobile **(proposta)** |
| `video_url` | URL / embed | sim | YouTube/Vimeo ou arquivo hospedado **(proposta)** |
| `duracao_min` | inteiro | sim | exibido como `n min` |
| `ordem` | inteiro | sim | numeração `01`–`08` da lista |
| `autor` | relação → `usuario` | sim | fornece avatar, `@handle` e `NÍVEL n` |
| `skill` | relação → `skill` | **(proposta)** sim | Modelagem 3D, Corte a Laser, Impressão 3D, Eletrônica, Design |
| `nivel_dificuldade` | enum **(proposta)** | não | Iniciante · Intermediário · Avançado |
| `xp_recompensa` | inteiro | sim | XP concedido ao concluir — **decidido (2026-08-23):** valor fixo **1 XP** por aula assistida; campo mantido só para exceções futuras |
| `materiais` | lista de arquivos **(proposta)** | não | `.pdf` `.zip` `.stl` `.3mf` `.obj` `.gltf` `.glb` `.svg` `.dxf` |
| `transcricao` | texto longo **(proposta)** | não | acessibilidade e SEO |
| `publicado_em` | data | sim | ordenação alternativa **(proposta)** |
| `status` | enum **(proposta)** | sim | rascunho · em revisão · publicado |

### Coleções relacionadas

- `usuario` — `handle` (ex.: `@laser.nick`), `avatar_pixel` (`.png` `.gif`), `nivel`, `xp`, `skills[]`.
- `skill` — `nome`, `icone` (`.svg`), `nivel_usuario` (via progressão).
- `curtida` **(proposta)** — relação `usuario` × `aula`, única por par, alimenta o contador.
- `progresso_aula` **(proposta)** — `usuario`, `aula`, `percentual_assistido`, `concluida_em`.

## Ganchos de gamificação

- **XP por assistir aula** — ação central do `gamification.md` ("ao assistir aulas … ganham
  pontos"). **Decidido (2026-08-23):** assistir uma aula concede **1 XP** (economia: 1 XP por
  ação, 5 XP por nível, nível máximo 10). **(proposta)** XP creditado ao atingir ≥90% do vídeo
  ou ao marcar `CONCLUIR AULA`, uma vez por aula (anti-farm). Eventual **bônus por
  trilha/sequência** segue **em aberto**.
- **Skills** — **(proposta)** o XP da aula é creditado na skill de `skill` (ex.: `PRIMEIROS
  PASSOS CORTE A LASER` → Corte a Laser), evoluindo a barra segmentada em pips do perfil.
- **Níveis** — o nível do autor aparece em cada card (`NÍVEL 1`, `NÍVEL 2`); o nível do usuário
  logado aparece no header (`MAKER_X` / `NÍVEL 3`). **Decidido (2026-08-23):** esses valores
  são **ilustrativos**; a faixa real vai de 1 a **10**.
- **Curtidas** — coração + contador por aula (`42`, `38`, `27`, `34`, `31`, `29`, `24`, `26`).
  **Decidido (2026-08-23):** curtidas **não geram XP** — apenas reputação/popularidade.
  **(proposta)** Curtir exige login.
- **Missões** — **(proposta)** aulas podem ser pré-requisito de missões da home (ex.: "Desafio
  Corte Laser" exige `PRIMEIROS PASSOS CORTE A LASER`); ao concluir, a barra de progresso da
  missão avança.
- **Nível do Lab** — **(proposta)** o XP de aulas concluídas soma ao XP coletivo do lab.
- **(proposta)** Selo visual de "aula concluída" no chip numérico do card para o usuário logado.

## Estados e interações

- **Hover/focus (proposta)**: card eleva-se levemente e o contorno passa a rosa; título muda
  para rosa; `ASSISTIR` inverte para preenchimento teal com texto navy; coração preenche em
  rosa. Foco de teclado com anel visível de 2px (contraste AA) em card, busca e botões; card
  inteiro navegável por `Tab` e acionável por `Enter`.
- **Busca (proposta)**: filtragem incremental com debounce de ~300ms sobre título, descrição e
  `@handle`; termo destacado nos resultados; botão `×` para limpar.
- **Loading (proposta)**: skeletons com a silhueta do card (chip numérico, thumbnail, três
  barras de texto), 4 por coluna; `CARREGAR MAIS` exibe spinner e fica desabilitado.
- **Vazio (proposta)**: busca sem resultado → "Nenhuma aula encontrada para *termo*." com
  botão `LIMPAR BUSCA`; catálogo vazio → "Ainda não há aulas publicadas." com convite ao
  contato da equipe do lab.
- **Erro (proposta)**: falha de carregamento → mensagem "Não foi possível carregar as aulas."
  + botão `TENTAR NOVAMENTE`; thumbnail quebrada cai em placeholder isométrico da identidade.
- **Deslogado (proposta)**: header troca o bloco de conta por `CRIAR CONTA` / `ENTRAR`; cards,
  busca e metadados permanecem visíveis (conteúdo público indexável); clicar em coração ou em
  `ASSISTIR` abre modal "Crie sua conta para assistir e ganhar XP" com CTA `COMECE A CRIAR`.
  Se visitante pode assistir sem conta: ver "Questões em aberto".
- **Logado (proposta)**: exibe progresso por aula (barra fina no rodapé do card), estado de
  curtida persistido, selo de concluída e toast de XP ao concluir — **decidido (2026-08-23):**
  a mensagem é **"+1 XP em Impressão 3D"** (o "+50 XP" era placeholder).

## Questões em aberto

1. ~~O botão `ASSISTIR` usa **ícone de download** no mockup — a ação é reproduzir vídeo, baixar
   material de apoio, ou ambos (botão duplo)?~~ **Decidido (2026-08-23):** a ação é
   **assistir online** (reproduzir o vídeo); não há download. O ícone de download do mockup
   fica a critério da designer trocar por ícone de play.
2. Visitante não logado pode assistir aulas sem conta? (Repete a questão 6 de `gamification.md`.)
3. ~~Quanto XP cada aula concede e a qual skill? Existe bônus por sequência/trilha?~~
   **Decidido (2026-08-23):** assistir uma aula concede **1 XP** (economia geral: 1 XP por
   ação, 5 XP por nível, nível máximo 10). A skill creditada é a do campo `skill`
   **(proposta)** e o **bônus por sequência/trilha permanece em aberto**.
4. A numeração `01`–`08` é ordem fixa de trilha (curso sequencial) ou apenas ordenação da
   listagem? Se trilha, há bloqueio de aulas seguintes?
5. Faltam filtros por skill/nível/duração — devem existir, como em Projetos e Biblioteca 3D?
6. Onde vive a página de detalhe da aula (player, materiais, comentários) e qual seu layout?
7. Aulas têm autor único ou podem ter coautores/instrutor externo?
8. Há aulas presenciais no catálogo (ligadas ao Calendário) ou apenas vídeo?
9. Legendas/transcrição são obrigatórias para acessibilidade?
10. ~~`CALENDÁRIO` entra na navegação desta página, conforme `concept.md`?~~
    **Decidido (2026-08-23):** sim. Navegação canônica em todas as páginas:
    `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`, itens alinhados.
11. Tratamento exato da faixa hero teal, da busca e dos contornos de card sobre o **fundo
    branco** desta página (detalhamento com a designer).
