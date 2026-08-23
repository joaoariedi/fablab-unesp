# Projetos

## Propósito

Vitrine dos **projetos realizados no lab pelos alunos e voluntários**. Serve para inspirar
("Conheça projetos incríveis desenvolvidos por nossos makers. Inspire-se!"), permitir
descoberta por categoria de fabricação e por busca textual, dar crédito público ao autor
(avatar + @handle + nível) e alimentar o loop de gamificação — publicar projeto gera XP e
curtidas reforçam a reputação do maker.

## Fonte de design

- `design/ChatGPT Image 18 de ago. de 2026, 11_28_34.png` — tela completa de Projetos
  (header, hero teal, tabs de filtro, busca, grid de 3 cards, footer de pilares).
- Apoio: `concept.md`, `visual-identity.md`, `gamification.md`.

## Estrutura da página — desktop (≥1280px)

### Header (faixa navy no topo)

- Logo-chip extrudado laranja "FAB ● LAB / CITE BAURU" à esquerda (hachura de sombra 3D).
- Navegação em caps display, na ordem do mockup:
  `BIBLIOTECA 3D` · `PROJETOS` · `INSTAGRAM` · `ARTIGOS` · `AULAS`
  - **Decidido (2026-08-23):** a navegação canônica de todas as páginas é
    `BIBLIOTECA 3D` · `PROJETOS` · `CALENDÁRIO` · `AULAS` · `INSTAGRAM` · `ARTIGOS`
    (`concept.md` / `visual-identity.md`) — a ordem do mockup acima fica como registro
    histórico e é superada.
  - Item ativo `PROJETOS` em **rosa**; demais em branco.
  - `AULAS` aparece levemente deslocado/rotacionado no mockup — **decidido (2026-08-23):**
    é **ruído de render**, não intenção de design; todos os itens ficam **alinhados**.
  - `CALENDÁRIO` não aparece neste mockup — **decidido (2026-08-23):** **entra** no header
    desta página, na posição canônica acima.
- À direita: avatar pixel em moldura clara + `MAKER_X` / `NÍVEL 3` + chevron `⌄` (menu da conta).

### Hero (faixa teal `#74B7A5`)

- Grid isométrico wireframe branco sutil ao fundo (cubos e hexágonos).
- Título display navy em duas linhas: `PROJETOS` / `DO LAB`.
- Parágrafo navy em três linhas: `Conheça projetos incríveis desenvolvidos por nossos makers.
  Inspire-se!`
- Chevrons duplos `»` à direita do parágrafo (ornamento): o primeiro rosa preenchido, o
  segundo teal, ambos com contorno navy.
- Composição isométrica à direita: letra **F** extrudada (rosa/laranja/amarelo/azul) e cubo
  navy com arestas rosa sobre slab teal.

### Barra de filtros e busca (sobre navy)

- Tabs de categoria em caps display, alinhadas à esquerda, na ordem exata:
  `TODOS` · `IMPRESSÃO 3D` · `CORTE A LASER` · `SERIGRAFIA` · `MÓVEIS` · `ELETRÔNICA`
  - Ativo: `TODOS`, em rosa com sublinhado rosa curto; inativos em branco sem sublinhado.
- À direita: campo de busca arredondado, fundo navy, borda rosa fina, placeholder
  `Buscar projetos...` à esquerda e ícone de lupa rosa alinhado à direita, dentro do campo.

### Grid de projetos

- **3 colunas**, uma linha visível no mockup (3 cards), gutter uniforme.
- Card de projeto (contorno fino claro, cantos levemente arredondados, fundo navy):
  1. **Foto** do projeto ocupando o topo do card, sangrada de borda a borda (proporção
     medida no mockup ~3:2).
  2. **Chip de categoria** rosa com texto navy em caps, sobreposto no canto inferior esquerdo
     da foto: `IMPRESSÃO 3D`, `MÓVEIS`, `SERIGRAFIA`.
  3. **Título** em display claro caps: `LUMINÁRIA PARAMÉTRICA`, `CADEIRA ENCAIXE`,
     `CAMISETA GALÁXIA`.
  4. **Descrição** curta em duas linhas:
     - `Luminária decorativa impressa em 3D com design paramétrico e encaixes precisos.`
     - `Cadeira produzida em MDF cortado a laser, com design minimalista e modular.`
     - `Estampa autoral feita em serigrafia manual com tinta à base d''água.`
       *(o mockup exibe apóstrofo duplicado `d''água` — **decidido (2026-08-23):**
       corrigir para `d'água` na implementação)*
  5. **Rodapé do card** (separado por linha divisória): avatar pixel + `@laser.nick` /
     `NÍVEL 7`; `@print.lu` / `NÍVEL 6`; `@maker_jv` / `NÍVEL 5` — **decidido (2026-08-23):**
     esses níveis são **ilustrativos**; o nível máximo real é **10** (ver `gamification.md`).
     À direita, ícone de coração
     outline rosa + contador de curtidas (`32`, `28`, `19`) e, após divisória vertical, seta
     `→` rosa (ação principal do card; o destino — página de detalhe do projeto — é
     **(proposta)**, ver questão 4).
- **Paginação**: não visível no mockup. Adotar botão `CARREGAR MAIS` centralizado abaixo do
  grid, com scroll infinito como alternativa **(proposta)**.

### Footer (faixa navy mais clara)

- Três pilares com ícone outline claro à esquerda e rótulo em duas linhas caps, separados por
  divisórias verticais:
  - Ícone de grupo de pessoas — `APRENDA` / `FAZENDO`
  - Ícone de cubo wireframe — `COMPARTILHE` / `CONHECIMENTO`
  - Ícone de estrela/sparkle — `DESENVOLVA` / `PROJETOS REAIS`
- Composição isométrica rosa/teal/laranja no canto inferior direito.
- **(proposta)** Linha inferior com créditos institucionais UNESP, links legais e Instagram.

## Adaptação tablet (768–1279px)

Todas as decisões desta seção são **(proposta)** — o mockup mostra apenas desktop.

- **Header (proposta)**: logo-chip reduzido; navegação colapsa em menu **hambúrguer** à
  direita, mantendo visível apenas o bloco de avatar + `MAKER_X` / `NÍVEL 3`.
- **Hero (proposta)**: título e parágrafo mantêm-se à esquerda; a composição isométrica
  reduz para ~35% da largura; chevrons `»` ocultos.
- **Filtros (proposta)**: tabs viram **chips horizontais roláveis** (scroll-x, sem barra
  visível), com `TODOS` fixo no início; a busca desce para a linha abaixo, largura total.
- **Grid (proposta)**: **2 colunas**; card mantém todos os campos.
- **Footer (proposta)**: três pilares em uma linha com ícones menores; ornamento isométrico
  reduzido.
- **Alvos de toque (proposta)**: mínimo 44×44px para chips, coração, seta e itens de menu.

## Adaptação mobile (<768px)

Todas as decisões desta seção são **(proposta)**.

- **Header (proposta)**: logo-chip + avatar; navegação em **hambúrguer** abrindo drawer de
  tela cheia com os itens em display caps. Alternativa avaliada: **bottom navigation** com
  Home / Biblioteca 3D / Projetos / Aulas / Perfil.
- **Hero (proposta)**: empilhado — título, parágrafo e, abaixo, a arte isométrica centralizada
  e reduzida (ou omitida em telas <390px para preservar leitura).
- **Filtros (proposta)**: chips horizontais roláveis fixos abaixo do hero; busca em campo de
  largura total acima dos chips, com placeholder `Buscar projetos...` preservado.
- **Grid (proposta)**: **1 coluna**, cards empilhados em largura total; foto em 16:9;
  rodapé do card mantém avatar + @handle + nível na primeira linha e curtidas + seta na
  segunda, se necessário.
- **Footer (proposta)**: pilares empilhados verticalmente, ícone à esquerda do texto.
- **Alvos de toque (proposta)**: mínimo 44×44px; espaçamento vertical mínimo de 8px entre
  ações do card.

## Componentes

| Componente | Descrição | Reuso |
|---|---|---|
| `HeaderPrincipal` | Logo-chip, nav caps, bloco de conta (avatar/@nome/nível/chevron) | Todas as páginas |
| `HeroFaixa` | Faixa teal com título display, parágrafo, arte isométrica | Projetos, Biblioteca 3D, Aulas, Artigos |
| `TabsFiltro` | Tabs caps com ativo em rosa sublinhado; vira chips roláveis em telas menores **(proposta)** | Listagens |
| `CampoBusca` | Input arredondado navy, borda rosa, placeholder + ícone de lupa | Listagens |
| `CardProjeto` | Foto, chip de categoria, título, descrição, rodapé de autor, curtidas, seta | Projetos, Home |
| `ChipCategoria` | Chip rosa, texto navy caps | Projetos, Biblioteca 3D |
| `AutorInline` | Avatar pixel + `@handle` + `NÍVEL n` | Cards e listas |
| `BotaoCurtir` | Coração outline rosa + contador | Projetos, Modelos, Artigos, Aulas |
| `FooterPilares` | Três pilares + ornamento isométrico | Todas as páginas |
| `BotaoCarregarMais` | **(proposta)** paginação incremental | Listagens |

> **Decidido (2026-08-23):** todo botão primário desta página (`PUBLICAR PROJETO`,
> `CARREGAR MAIS`, `LIMPAR FILTROS`, `TENTAR NOVAMENTE`, `CRIAR CONTA`) usa o estilo
> canônico do site — **rosa preenchido, texto navy, sombra dura deslocada**. A variante
> navy com contorno rosa foi descartada. Ações secundárias (ex.: `ENTRAR`) ficam em
> outline claro sobre navy **(proposta)**.

## Modelo de conteúdo (CMS)

### Coleção `projeto`

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `titulo` | texto curto | sim | exibido em caps no card |
| `slug` | slug | sim | derivado do título; URL `/projetos/{slug}` |
| `descricao_curta` | texto (máx. ~120 caracteres) | sim | 2 linhas no card |
| `descricao_completa` | rich text | não **(proposta)** | página de detalhe |
| `imagem_capa` | mídia (`.jpg`, `.jpeg`, `.png`, `.webp`) | sim | usada no card |
| `galeria` | lista de mídia (`.jpg`, `.png`, `.webp`) | não **(proposta)** | detalhe |
| `categoria` | relação → `categoria_projeto` | sim | alimenta o chip e as tabs |
| `autor` | relação → `maker` | sim | avatar + @handle + nível |
| `curtidas` | inteiro (derivado de `curtida`) | sim | contador exibido no card |
| `arquivos` | lista de arquivos (`.stl`, `.3mf`, `.obj`, `.gltf`, `.glb`, `.zip`, `.pdf`, `.svg`, `.dxf`) | não **(proposta)** | downloads do projeto |
| `materiais` | lista de texto | não **(proposta)** | ex.: MDF 6mm, PLA |
| `maquinas_utilizadas` | relação múltipla → `estacao` | não **(proposta)** | ex.: Corte a Laser |
| `skills_relacionadas` | relação múltipla → `skill` | não **(proposta)** | concede XP na skill |
| `missao_relacionada` | relação → `missao` | não **(proposta)** | projeto entregue como missão |
| `status` | enum `rascunho` / `em_revisao` / `publicado` | sim **(proposta)** | moderação da equipe |
| `data_publicacao` | data/hora | sim | ordenação padrão (mais recentes) **(proposta)** |
| `destaque` | booleano | não **(proposta)** | replica na Home |

### Coleção `categoria_projeto`

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `nome` | texto curto | sim | `Impressão 3D`, `Corte a Laser`, `Serigrafia`, `Móveis`, `Eletrônica` |
| `slug` | slug | sim | filtro em query string `?categoria=` **(proposta)** |
| `cor_chip` | enum da paleta | não **(proposta)** | rosa é o padrão no mockup |

> `TODOS` é estado de filtro da UI, não um registro de categoria.

### Coleções referenciadas (definidas em outras páginas)

- `maker` — `handle` (`@laser.nick`), `avatar` (pixel art, `.png`), `nivel`, `xp`.
- `curtida` — relação `maker` × `projeto`, única por par **(proposta)**.
- `skill`, `missao`, `estacao` — ver `gamification.md`.

## Ganchos de gamificação

- **Publicar projeto concede XP** ao autor — regra central do `gamification.md` ("postar
  projetos" gera pontos). **Decidido (2026-08-23):** publicar projeto vale **1 XP**;
  subir de nível custa **5 XP** e o nível máximo é **10** (economia em `gamification.md`).
- **(proposta)** O XP é creditado na(s) `skills_relacionadas` do projeto (ex.: projeto de
  serigrafia evolui a skill correspondente), e apenas quando `status = publicado` — evitando
  farm por rascunhos.
- **Exibição de nível**: cada card mostra `NÍVEL 7` / `NÍVEL 6` / `NÍVEL 5` junto ao @handle,
  reforçando a progressão pública do autor (valores **ilustrativos**; escala real de 1 a 10).
- **Curtidas (♥)**: contador visível por card (`32`, `28`, `19`). **Decidido (2026-08-23):**
  curtidas **não geram XP** para o autor — são apenas sinal social/reputação.
- **(proposta)** Projeto vinculado a uma `missao` marca progresso da missão na Home ao ser
  aprovado pela equipe do lab.
- **(proposta)** CTA para maker logado sem projetos: botão `PUBLICAR PROJETO` na barra de
  filtros, com microcopy gamificada ("Publique e ganhe XP" — 1 XP por projeto publicado).
  **Decidido (2026-08-23):** quando existir, usa o **estilo primário canônico** — rosa
  preenchido, texto navy, sombra dura deslocada (`visual-identity.md`).

## Estados e interações

- **Hover/focus (proposta)**: card eleva levemente e ganha contorno rosa; a seta `→` desliza
  para a direita; tabs inativas passam a rosa no hover e mostram o sublinhado no focus;
  campo de busca intensifica a borda rosa no focus. Foco sempre visível via `outline` de 2px
  (navegação por teclado, WCAG AA).
- **Curtir (proposta)**: coração preenche em rosa com micro-animação e o contador incrementa
  otimisticamente; falha de rede reverte e exibe toast.
- **Loading (proposta)**: skeletons de card (retângulo de foto + duas linhas de texto),
  mantendo o grid de 3/2/1 colunas; busca com debounce de 300ms.
- **Vazio (proposta)**: quando um filtro ou busca não retorna resultados —
  `Nenhum projeto encontrado.` + `Tente outra categoria ou limpe a busca.` + botão
  `LIMPAR FILTROS`, com ornamento isométrico.
- **Erro (proposta)**: `Não foi possível carregar os projetos.` + botão `TENTAR NOVAMENTE`.
- **Deslogado (proposta)**: header troca o bloco de conta por botões `ENTRAR` e
  `CRIAR CONTA`; grid, filtros e busca permanecem públicos (SEO); clicar no coração abre
  convite ao cadastro (~~"Crie sua conta para curtir e ganhar XP"~~ — **decidido
  (2026-08-23):** curtidas **não geram XP**, então a microcopy passa a
  "Crie sua conta para curtir e evoluir como maker"); download de arquivos pode
  exigir conta (ver questão 6 de `gamification.md`).
- **Logado (proposta)**: coração reflete o estado do maker (curtido/não curtido); aparece o
  CTA `PUBLICAR PROJETO`; projetos próprios em revisão exibem selo `EM REVISÃO`.

## Questões em aberto

1. Há paginação, `CARREGAR MAIS` ou scroll infinito? Quantos projetos por página?
2. Ordenação padrão do grid: mais recentes, mais curtidos ou curadoria da equipe?
3. As tabs de categoria são fixas (5 + `TODOS`) ou administráveis pelo CMS?
4. Existe página de detalhe do projeto (destino da seta `→`)? Qual seu layout?
5. Projeto permite anexar arquivos fabricáveis (STL/DXF/SVG) ou isso é exclusivo da
   Biblioteca 3D?
6. Quem publica: qualquer maker logado com moderação posterior, ou só a equipe do lab?
7. ~~Quanto XP vale publicar um projeto, e curtidas creditam XP ao autor?~~
   **Decidido (2026-08-23):** publicar projeto = **1 XP**; **curtidas não creditam XP**
   (economia completa em `gamification.md`: 5 XP por nível, nível máximo 10).
8. Filtro combinado (categoria + busca + skill/máquina) faz parte do escopo?
9. ~~`CALENDÁRIO` entra no header desta página, conforme o `concept.md`?~~
   **Decidido (2026-08-23):** sim — navegação canônica
   `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`, todos alinhados.
