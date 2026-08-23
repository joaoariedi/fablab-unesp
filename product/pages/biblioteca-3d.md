# Biblioteca 3D

## Propósito

Catálogo público de **modelos 3D criados pela comunidade maker** do Fab Lab CITe Bauru, para
explorar, filtrar, curtir e baixar arquivos imprimíveis. É a página de acervo do lab: dá
visibilidade autoral aos alunos (avatar + @handle + nível) e alimenta o ciclo de gamificação
(publicar modelo gera XP; baixar/curtir gera sinal social).

## Fonte de design

- `design/ChatGPT Image 18 de ago. de 2026, 11_45_01.png` — mockup único, **desktop**, tela
  completa da Biblioteca 3D (header, sidebar teal, busca + filtros, lista numerada de modelos,
  paginação e footer institucional).
- Apoio: `concept.md`, `visual-identity.md`, `gamification.md`.

## Estrutura da página — desktop (≥1280px)

### Header (fundo navy, largura total)

- Logo-chip extrudado **laranja** `FAB LAB` / `CITE BAURU` à esquerda, com **cubo isométrico**
  navy entre `FAB` e `LAB` e sombra hachurada.
- Navegação em caps display (mockup): `BIBLIOTECA 3D` · `PROJETOS` · `AULAS` · `INSTAGRAM` ·
  `ARTIGOS`.
  - `BIBLIOTECA 3D` é o item **ativo**: rosa com sublinhado rosa.
  - `AULAS` aparece em peso mais forte/branco e desalinhado no mockup — leitura anterior era
    "estado de hover".
  - > **Decidido (2026-08-23):** navegação canônica em todas as páginas, nesta ordem —
    > `BIBLIOTECA 3D` · `PROJETOS` · `CALENDÁRIO` · `AULAS` · `INSTAGRAM` · `ARTIGOS`.
    > `CALENDÁRIO` **entra** no menu principal (a ausência no mockup era defasagem do render).
    > O destaque/desalinhamento de `AULAS` é **ruído de render**, não hover nem intenção de
    > design — todos os itens ficam alinhados e no mesmo peso; o único item destacado é o
    > **ativo** (`BIBLIOTECA 3D`, rosa sublinhado).
- À direita: avatar pixel em moldura + `MAKER_X` / `NÍVEL 3` + chevron `⌄` (menu da conta).

### Sidebar esquerda (faixa teal, ~1/5 da largura, altura total do conteúdo)

> Teal é o token `#74B7A5` de `visual-identity.md`; no mockup a faixa aparece em um tom mais
> escuro (~`#419189`).
> **Decidido (2026-08-23):** valem os hexes da prancha de identidade oficial como **tokens web
> definitivos** — a divergência do render é artefato e deve ser ignorada (usar `#74B7A5`).
> Como a área de conteúdo desta página passa a ter **fundo branco**, o tratamento exato da
> faixa teal (manter coluna teal, reduzir a acento ou substituir) será detalhado com a
> designer **(proposta)**.

- Título display navy em duas linhas: `BIBLIOTECA` / `3D`.
- Descrição: `Explore, baixe e imprima modelos 3D criados pela comunidade maker.`
- Composição isométrica: letra **F** extrudada (rosa/laranja) + cubo navy sobre slab, com
  grid isométrico wireframe sutil ao fundo.
- **Bloco `CATEGORIAS`** (card navy com contorno claro, cantos arredondados) — lista de itens
  com ícone outline à esquerda, rótulo em caps e contador à direita:

  - `TODOS` `1234` — **ativo** (rosa, com realce/borda); ícone círculo-cubo
  - `ACESSÓRIOS` `236` (bolsa) · `ANIMAIS` `184` (gato) · `VEÍCULOS` `142` (carro)
  - `DECORAÇÃO` `198` (vaso/planta) · `EDUCAÇÃO` `123` (cubo) · `UTILIDADES` `351` (caixa)

### Área principal (fundo branco)

> **Decidido (2026-08-23):** a Biblioteca 3D (com Aulas) usa **fundo branco** na área de
> conteúdo, com **texto navy**. O mockup em navy fica como registro histórico; toda descrição
> de "fundo navy" abaixo se refere ao mockup. Cards, busca, filtros e numeração passam a ser
> desenhados sobre claro — o tratamento exato desses componentes sobre fundo branco
> (contornos, sombras, thumbnails, contraste) fica **(proposta)** a detalhar com a designer.

**Barra de busca e filtros** (no mockup, card navy com contorno claro):

- Input arredondado escuro com ícone de lupa à direita; placeholder `Buscar modelos 3D...`.
- Rótulo `FILTRAR POR:` seguido de três dropdowns com chevron `⌄`:
  1. `Mais recentes` (ordenação)
  2. `Todos os níveis`
  3. `Todos os formatos`

**Lista de modelos** — grid de **2 colunas × 5 linhas** (10 cards por página), numerados
`01`–`10` em caixa com contorno rosa no canto superior esquerdo de cada card. A numeração
corre **na vertical**: `01`–`05` na coluna esquerda, `06`–`10` na coluna direita.

Anatomia do card (linha horizontal; no mockup, contorno claro sobre navy — sobre o **fundo
branco** decidido, contorno e thumbnail a definir com a designer **(proposta)**):

1. **Número** `01`… `10` em display rosa dentro de caixa com contorno rosa.
2. **Thumbnail** — render 3D do modelo sobre fundo navy.
3. **Bloco de texto** — título display em caps (claro) + descrição curta (2 linhas).
4. **Rodapé de autoria** — avatar pixel + `@handle` + `NÍVEL n`.
5. **Coluna de ações** (à direita, separada por divisória): botão **download** (ícone de seta
   para baixo em moldura teal, com micro-rótulo ilegível no mockup — texto a definir
   **(proposta)**) e contador de curtidas `♥ n` em rosa.

Conteúdo exato dos 10 cards do mockup:

| # | Título | Descrição | Autor | Nível | ♥ |
|---|---|---|---|---|---|
| 01 | `BOLSA VAZADA` | `Bolsa decorativa com estrutura vazada e design paramétrico.` | `@print.lu` | `NÍVEL 6` | `42` |
| 02 | `CARRO DE CORRIDA` | `Carrinho aerodinâmico com rodas móveis.` | `@laser.nick` | `NÍVEL 7` | `58` |
| 03 | `TRICERÁTOPS` | `Dinossauro estilizado com encaixes para montagem.` | `@projeto_ana` | `NÍVEL 4` | `33` |
| 04 | `VASO GEOMÉTRICO` | `Vaso com design facetado para plantas pequenas.` | `@maker_jv` | `NÍVEL 5` | `21` |
| 05 | `FUSQUINHA` | `Clássico dos clássicos! Modelo do fusca para colecionar.` | `@bia.tech` | `NÍVEL 6` | `38` |
| 06 | `MINI LOBO GUÁRÁ` | `Modelo articulado do lobo guará, símbolo do cerrado brasileiro.` | `@maker_jv` | `NÍVEL 5` | `36` |
| 07 | `TIRANOSSAURO REX` | `Modelo articulado para montar e brincar.` | `@bia.tech` | `NÍVEL 6` | `49` |
| 08 | `CHAVEIRO FAB LAB` | `Chaveiro com logo do Fab Lab para personalizar.` | `@print.lu` | `NÍVEL 6` | `27` |
| 09 | `VELOCIRAPTOR` | `Modelo articulado com partes móveis e encaixes.` | `@laser.nick` | `NÍVEL 7` | `41` |
| 10 | `CHAVEIRO CONTROLE` | `Chaveiro de controle de videogame para gamers makers.` | `@projeto_ana` | `NÍVEL 4` | `26` |

> Grafia do mockup preservada em `MINI LOBO GUÁRÁ` — **decidido (2026-08-23):** no
> conteúdo real usar a grafia correta `MINI LOBO GUARÁ`.

> **Decidido (2026-08-23):** os níveis de autor da tabela (`NÍVEL 4` a `NÍVEL 7`) são
> **ilustrativos**. A economia real é 1 XP por ação, 5 XP por nível e **nível máximo 10**
> (`gamification.md`).

**Paginação** (centralizada abaixo da lista): `‹` · `1` (ativo, chip rosa) · `2` · `3` · `4` ·
`5` · `...` · `124` · `›`.

### Footer institucional (fundo navy, largura total)

> No mockup o footer é um navy **mais claro que a área principal** (então também navy).
> **Decidido (2026-08-23):** com a área de conteúdo em **fundo branco**, a comparação do
> mockup não vale mais — o footer permanece **navy** (institucional, igual às demais
> páginas); o tom exato do navy do footer fica **(proposta)** com a designer.

Três pilares com ícone outline, separados por divisórias verticais:
`APRENDA FAZENDO` (grupo de pessoas) · `COMPARTILHE CONHECIMENTO` (cubo wireframe) ·
`DESENVOLVA PROJETOS REAIS` (estrela/sparkle). Composição isométrica rosa/laranja/teal
(chevrons "»" extrudados + cubos) no canto inferior direito.

## Adaptação tablet (768–1279px)

Todas as decisões abaixo são **(proposta)** — o mockup mostra apenas desktop —, exceto o
fundo: **decidido (2026-08-23)** que a área de conteúdo é **branca com texto navy** também em
tablet.

- **Header (proposta)**: logo-chip + avatar permanecem; a navegação canônica
  (`BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`) colapsa em botão
  **hambúrguer** que abre painel lateral (drawer) da direita.
- **Sidebar teal (proposta)**: deixa de ser coluna. O título `BIBLIOTECA 3D` + descrição viram
  uma **faixa hero teal horizontal** no topo (composição isométrica reduzida à direita), e
  `CATEGORIAS` vira **faixa horizontal de chips roláveis** (`TODOS 1234`, `ACESSÓRIOS 236`, …)
  logo abaixo da faixa, com o contador dentro do chip.
- **Busca e filtros (proposta)**: input em largura total na primeira linha; os três dropdowns
  em segunda linha, distribuídos em 3 colunas iguais; o rótulo `FILTRAR POR:` é omitido.
- **Lista (proposta)**: grid de **2 → 1 coluna** de cards horizontais em largura total
  (thumbnail à esquerda, texto ao centro, ações à direita).
- **Paginação (proposta)**: mantém formato, reduz para `‹ 1 2 3 ... 124 ›`.
- **Alvos de toque (proposta)**: mínimo 44×44px em chips, dropdowns, download e curtida.
- **Footer (proposta)**: três pilares em uma linha; composição isométrica reduzida.

## Adaptação mobile (<768px)

Todas as decisões abaixo são **(proposta)**, exceto o fundo: **decidido (2026-08-23)** que a
área de conteúdo é **branca com texto navy** também em mobile.

- **Header (proposta)**: logo-chip compacto + avatar; navegação em **barra inferior fixa
  (bottom navigation)**; a ordem canônica completa
  (`BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`) fica no menu/drawer,
  com os destinos prioritários na barra (Biblioteca 3D, Projetos, Calendário, Aulas, Perfil);
  Instagram e Artigos ficam no menu/footer **(proposta)**.
- **Hero (proposta)**: faixa teal compacta com `BIBLIOTECA 3D` + descrição sobre o conteúdo
  branco (tratamento da faixa sobre fundo claro a detalhar com a designer); ilustração
  isométrica oculta abaixo de 390px.
- **Categorias (proposta)**: chips horizontais com rolagem lateral (scroll-snap), contador
  entre parênteses — ex.: `TODOS (1234)`. Alternativa: botão `CATEGORIAS` abrindo **drawer**
  inferior com a lista completa.
- **Busca e filtros (proposta)**: input de busca fixo no topo do conteúdo; botão
  `FILTRAR` abre bottom sheet com os três seletores (`Mais recentes`, `Todos os níveis`,
  `Todos os formatos`) e ação `APLICAR`.
- **Lista (proposta)**: **1 coluna**, card empilhado vertical — thumbnail em largura total
  (proporção 4:3), número `01` sobreposto no canto, título, descrição, linha de autoria e
  linha de ações (botão `BAIXAR` em largura total + `♥ n`).
- **Paginação (proposta)**: substituída por **carregar mais** / rolagem infinita, mantendo
  indicador textual `Página 1 de 124`.
- **Alvos de toque (proposta)**: mínimo 44×44px; espaçamento vertical de 12px entre cards.
- **Footer (proposta)**: pilares empilhados em 1 coluna, centralizados.

## Componentes

Todos observados no mockup, salvo indicação contrária.

> **Decidido (2026-08-23):** todos os componentes desta página são renderizados sobre **fundo
> branco com texto navy** (a página é uma das duas de fundo claro, com Aulas). As descrições
> "escuro/sobre navy" abaixo descrevem o mockup; a variante clara de cada componente
> (contorno, sombra, contraste) fica **(proposta)** a detalhar com a designer.

- `HeaderPrincipal` — logo-chip, nav caps na ordem canônica (`BIBLIOTECA 3D · PROJETOS ·
  CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`, itens alinhados), item ativo rosa sublinhado,
  bloco de conta.
- `SidebarPagina` (hero teal lateral) — título display, descrição, arte isométrica; convivência
  da faixa teal com o conteúdo branco **(proposta)**.
- `ListaCategorias` — item = ícone + rótulo caps + contador; estado ativo rosa.
- `CampoBusca` — input arredondado (escuro no mockup; versão clara sobre fundo branco
  **(proposta)**), ícone lupa, placeholder.
- `SeletorFiltro` (dropdown, 3 instâncias) — rótulo + chevron `⌄`.
- `CardModelo3D` — número, thumb, título, descrição, `SeloAutor`, `BotaoDownload`,
  `ContadorCurtidas` (♥ rosa + número; clicável **(proposta)**).
- `SeloAutor` — avatar pixel + @handle + `NÍVEL n`.
- `Paginacao` — setas, páginas, reticências, última página.
- `FooterPilares` — três pilares + arte isométrica.
- `EstadoVazio` / `Skeleton` / `Toast` **(proposta)** — ver Estados e interações.

## Modelo de conteúdo (CMS)

### Coleção `modelo3d`

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `titulo` | texto curto | sim | exibido em caps (ex.: `BOLSA VAZADA`) |
| `slug` | slug | sim | derivado do título **(proposta)** |
| `descricao_curta` | texto (máx. ~120 car.) | sim | 2 linhas no card |
| `descricao_completa` | rich text | não | página de detalhe **(proposta)** |
| `thumbnail` | mídia (imagem) | sim | `.png`, `.jpg`, `.webp` — render do modelo |
| `galeria` | mídia múltipla (imagem) | não | `.png`, `.jpg`, `.webp` **(proposta)** |
| `arquivos_modelo` | mídia múltipla (arquivo) | sim | `.stl`, `.3mf`, `.obj`, `.gltf`, `.glb`, `.zip` |
| `arquivo_preview_3d` | mídia (arquivo) | não | `.glb`/`.gltf` para visualizador web **(proposta)** |
| `documentacao` | mídia (arquivo) | não | `.pdf` (guia de impressão/montagem) **(proposta)** |
| `formatos` | multi-seleção derivada | sim | alimenta o filtro `Todos os formatos` |
| `categoria` | relação → `categoria` (1:n) | sim | Acessórios, Animais, Veículos, Decoração, Educação, Utilidades |
| `autor` | relação → `usuario` (n:1) | sim | fornece avatar, @handle e nível |
| `nivel_dificuldade` | seleção | sim | alimenta o filtro `Todos os níveis` — escala a definir **(proposta)** |
| `curtidas` | contador (derivado de `curtida`) | sim | exibido como `♥ n` |
| `downloads` | contador | não | métrica interna **(proposta)** |
| `publicado_em` | data/hora | sim | alimenta a ordenação `Mais recentes` |
| `status` | seleção (rascunho/em revisão/publicado) | sim | fluxo de moderação **(proposta)** |
| `parametros_impressao` | grupo (material, altura de camada, suporte) | não | **(proposta)** |
| `licenca` | seleção (ex.: CC BY-SA) | não | **(proposta)** |

### Coleção `categoria`

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `nome` | texto curto | sim | `Todos` é agregador virtual, não é registro |
| `slug` | slug | sim | |
| `icone` | mídia (SVG) ou chave de ícone | sim | ícone outline do mockup |
| `total_modelos` | contador derivado | sim | valores do mockup: 236 / 184 / 142 / 198 / 123 / 351 |
| `ordem` | número | não | ordem de exibição **(proposta)** |

### Coleção `usuario` (referenciada)

`handle` (texto, obrigatório) · `avatar_pixel` (imagem `.png`, obrigatório) · `nivel` (número,
derivado do XP) · `skills` (relação n:n) — definida em `pages/onboarding.md`.

### Coleção `curtida` **(proposta)**

`usuario` (relação, obrigatório) · `conteudo` (relação polimórfica → `modelo3d`/`projeto`/
`artigo`/`aula`, obrigatório) · `criado_em` (data/hora). Chave única (usuário + conteúdo).

## Ganchos de gamificação

- **Autoria visível**: todo card exibe `avatar pixel + @handle + NÍVEL n` — o nível vem do XP
  do autor (`gamification.md`), com **máximo 10**.
- **XP por publicar modelo 3D**: publicar um `modelo3d` aprovado concede **1 XP**
  (**decidido 2026-08-23**) na skill **Modelagem 3D**; se também conta para **Impressão 3D**
  quando houver parâmetros de impressão fica **(proposta)** — a economia é de 1 XP por ação,
  5 XP por nível.
- **Curtidas** (`♥ n`): visíveis a todos; curtir exige login **(proposta)**.
  **Decidido (2026-08-23):** curtidas **não geram XP** para o autor (`gamification.md`,
  questão 5 resolvida) — servem como reputação/popularidade, não como pontuação. Regras
  anti-farm gerais seguem em aberto (`gamification.md`, questão 2) **(proposta)**.
- **Download como progresso de missão (proposta)**: baixar + enviar foto do resultado avança
  missões como `IMPRESSÃO 3D` ("Modele e imprima um suporte para celular").
- **Filtro `Todos os níveis`**: interpretado como nível de **dificuldade do modelo**, e não
  nível do maker — confirmar (ver Questões em aberto).
- **CTA de publicação (proposta)**: para maker logado, botão `PUBLICAR MODELO` no topo da área
  principal, com indicação do XP a ganhar.
- **Contribuição ao Nível do Lab (proposta)**: XP de publicações soma ao XP coletivo exibido na
  home (`NÍVEL DO LAB`).

## Estados e interações

### Hover / foco

- Nav: item em hover fica claro/branco; item ativo mantém rosa + sublinhado.
  **Decidido (2026-08-23):** o realce de `AULAS` no mockup **não** era hover — é ruído de
  render; o estado de hover permanece como definição de design **(proposta)**, sem
  fundamento no mockup.
- Card de modelo: elevação e contorno rosa em hover **(proposta)**; card inteiro é link para a
  página de detalhe do modelo **(proposta)**.
- Botão de download: moldura teal preenchida em hover **(proposta)**.
- `♥`: contorno → preenchido rosa quando curtido **(proposta)**.
- Foco visível por teclado (anel rosa 2px) em input, dropdowns, chips, cards e paginação
  **(proposta)**; ordem de tabulação: busca → filtros → categorias → cards → paginação.

### Carregando

- Skeletons dos 10 cards (bloco de thumb + 3 barras de texto) preservando a numeração
  **(proposta)**; contadores de categoria em skeleton; troca de página mantém rolagem no topo
  da lista **(proposta)**.

### Vazio

- Busca/filtro sem resultados: ilustração isométrica + `Nenhum modelo encontrado.` e
  `Tente outra busca ou limpe os filtros.` + botão `LIMPAR FILTROS` **(proposta)**.
- Categoria sem modelos: `Ainda não há modelos nesta categoria.` + CTA `PUBLICAR MODELO`
  **(proposta)**.

### Erro

- Falha ao carregar a lista: `Não foi possível carregar os modelos.` + botão `TENTAR NOVAMENTE`
  **(proposta)**.
- Falha no download: toast `Falha no download. Tente novamente.` **(proposta)**.

### Deslogado × logado **(proposta, exceto o header do mockup)**

| Aspecto | Visitante (deslogado) | Maker (logado) |
|---|---|---|
| Header direito | botão `CRIAR CONTA` | avatar + `MAKER_X` / `NÍVEL 3` (mockup) |
| Navegar / buscar / filtrar | liberado | liberado |
| Ver curtidas | sim (somente leitura) | sim |
| Curtir | bloqueado → modal "Crie sua conta para curtir" | permitido |
| Baixar arquivos | **em aberto** (ver `gamification.md`, questão 6) | permitido |
| Publicar modelo | não | sim |
| Progresso de missão | não | sim |

## Questões em aberto

1. Visitante deslogado pode baixar arquivos sem conta? (espelha `gamification.md`, questão 6)
2. O filtro `Todos os níveis` refere-se à dificuldade do modelo ou ao nível do autor?
3. Quais valores compõem `Todos os formatos` (STL, 3MF, OBJ, GLTF/GLB, ZIP) e o que acontece
   quando um modelo tem vários arquivos?
4. Quais opções de ordenação além de `Mais recentes` (mais curtidos, mais baixados, A–Z)?
5. Existe página de detalhe do modelo? O card leva ao detalhe ou baixa direto?
6. A soma das categorias fecha exatamente com `TODOS 1234` (236+184+142+198+123+351), o que
   sugere **uma única categoria por modelo** — confirmar se a relação é 1:n ou n:n.
7. ~~Grafia `MINI LOBO GUÁRÁ` no mockup: corrigir para `MINI LOBO GUARÁ`?~~
   **Decidido (2026-08-23):** sim, usar `MINI LOBO GUARÁ`.
8. Quantos itens por página em tablet/mobile e paginação vs. rolagem infinita.
9. Quem valida a publicação de um modelo (moderação) e quais formatos são obrigatórios?
10. Licenciamento dos modelos publicados (atribuição, uso comercial).
11. ~~A navegação desta página traz `CALENDÁRIO`? O destaque em `AULAS` é hover ou intenção
    de design?~~ **Decidido (2026-08-23):** sim — ordem canônica
    `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`; o destaque/
    desalinhamento de `AULAS` é ruído de render e todos os itens ficam alinhados.
12. Tratamento da faixa/sidebar teal e dos cards sobre o **fundo branco** decidido para esta
    página (contornos, sombras, versão clara de busca e filtros) — a detalhar com a designer.
