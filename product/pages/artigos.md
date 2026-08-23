# Artigos

## Propósito

Espaço editorial do lab: **conteúdos, reflexões e referências** escritos pela comunidade maker
e pela equipe do Fab Lab CITe Bauru. Serve para (1) publicar textos autorais e materiais de
referência (ex.: coleção "Primeiros Passos"), (2) permitir descoberta por eixo temático e por
busca textual, (3) dar crédito público ao autor (avatar pixel + @handle + nível) e (4) alimentar
o loop de gamificação — **escrever artigos gera XP**, conforme regra central de
`gamification.md` ("assistir aulas, postar projetos e escrever artigos").

## Fonte de design

- `design/ChatGPT Image 18 de ago. de 2026, 11_40_02.png` — tela completa de Artigos
  (header, hero teal, tabs de categoria, busca, grid de 3 cards, footer de pilares).
- Apoio: `concept.md`, `visual-identity.md`, `gamification.md`.

## Estrutura da página — desktop (≥1280px)

### Header (faixa navy no topo)

- Logo-chip extrudado **laranja** "FAB ● LAB / CITE BAURU" à esquerda, com hachura de sombra 3D.
- Navegação em caps display; a ordem do mockup abaixo fica como **registro histórico** e é
  **superada** pela navegação canônica (ver decisão nos itens seguintes):
  `BIBLIOTECA 3D` · `PROJETOS` · `INSTAGRAM` · `ARTIGOS` · `AULAS`
  - Item ativo `ARTIGOS` em **rosa**; demais em branco.
  - `AULAS` aparece levemente deslocado/rotacionado no render — **Decidido (2026-08-23):**
    é ruído de render, não intenção de design; todos os itens ficam **alinhados**.
  - `CALENDÁRIO` não aparece neste mockup — **Decidido (2026-08-23):** vale a navegação
    canônica em todas as páginas, nesta ordem:
    `BIBLIOTECA 3D` · `PROJETOS` · `CALENDÁRIO` · `AULAS` · `INSTAGRAM` · `ARTIGOS`.
  - `INSTAGRAM` abre em nova aba (link externo) **(proposta)**.
- À direita: avatar pixel em moldura clara + `MAKER_X` / `NÍVEL 3` + chevron `⌄` (menu da conta).

### Hero (faixa teal — token `#74B7A5`; renderizado ~`#488D8B` no mockup)

- Grid isométrico wireframe branco sutil ao fundo (cubos e hexágonos).
- Título display navy: `ARTIGOS`.
- Parágrafo navy em duas linhas: `Conteúdos, reflexões e referências` /
  `para inspirar, aprender e transformar.`
- Chevrons duplos `»` abaixo/à direita do parágrafo, como ornamento de direção: o primeiro
  preenchido em rosa com contorno navy, o segundo apenas em contorno navy (vazado).
- Composição isométrica à direita: letra **F** extrudada (rosa/laranja/navy) e cubo navy com
  arestas rosa, apoiados no grid.

### Barra de filtros e busca (sobre navy)

- Tabs de categoria em caps display, alinhadas à esquerda, na ordem exata:
  `TODOS` · `CULTURA MAKER` · `EDUCAÇÃO` · `TECNOLOGIA` · `INOVAÇÃO SOCIAL`
  - Ativa: `TODOS`, em rosa com sublinhado rosa curto; inativas em branco, sem sublinhado.
  - Seleção única (uma categoria por vez), como no padrão de `projetos.md` **(proposta)**.
- À direita: campo de busca arredondado, fundo navy, borda clara fina, placeholder
  `Buscar artigos...` e ícone à direita, **dentro** do campo — no render é um círculo vazado
  de contorno claro/rosa, sem cabo de lupa; usar ícone de lupa na implementação **(proposta)**.

### Grid de artigos

- **3 colunas**, uma linha visível no mockup (3 cards), gutter uniforme; cards de mesma altura.
- Card de artigo (contorno fino claro, cantos levemente arredondados, fundo navy):
  1. **Imagem de capa** ocupando o topo do card (proporção medida no mockup ~3:2 — 397×262px),
     sangrando de borda a borda. As três capas são **ilustrações** com texto embutido na arte
     (ex.: no primeiro card, `Práticas colaborativas em FAB LAB`,
     `Uma parceria entre a Rede FAB LAB BRASIL e a UNESP` e o selo
     `Coleção Primeiros Passos - vol.1`; no segundo, `FAÇA VOCÊ MESMO, COMPARTILHE
     CONHECIMENTO`; no terceiro, `+100 XP`) — texto de arte, não de interface. O `+100 XP`
     da arte é **ilustrativo** e está **superado**: a economia real é 1 XP por ação
     (decidido 2026-08-23, ver `gamification.md`).
  2. **Faixa de metadados** sobre a base da capa: **chip de categoria** rosa com texto navy em
     caps + **data** de publicação em caps ao lado, sobre fundo escuro translúcido:
     - `PUBLICAÇÃO` · `12 MAI 2024`
     - `CULTURA MAKER` · `28 ABR 2024`
     - `EDUCAÇÃO` · `05 MAI 2024`
     > `PUBLICAÇÃO` **não** consta nas tabs de categoria — tratar como categoria adicional
     > (material de referência/publicação institucional) ou como tipo de conteúdo distinto;
     > decisão pendente (ver Questões em aberto).
  3. **Título** em display claro caps, até duas linhas:
     - `PRÁTICAS COLABORATIVAS EM FAB LAB`
     - `CULTURA MAKER: FAZER, COMPARTILHAR, TRANSFORMAR`
     - `GAMIFICAÇÃO NA EDUCAÇÃO: JOGAR PARA APRENDER`
  4. **Resumo** em duas linhas, em texto corrido de cor clara (corpo em Comfortaa conforme
     `visual-identity.md` **(proposta)** — o render não permite confirmar a fonte):
     - `Volume 1 da coleção Primeiros Passos, uma parceria entre a Rede FAB LAB Brasil e a UNESP.`
     - `Como a cultura maker promove autonomia, criatividade e colaboração em comunidades e
       espaços educativos.`
     - `Estratégias e exemplos de como a gamificação pode tornar o aprendizado mais envolvente
       e significativo.`
  5. **Rodapé do card** (separado por linha divisória horizontal): avatar pixel + `@maker_x` /
     `NÍVEL 3`; `@print.lu` / `NÍVEL 6`; `@laser.nick` / `NÍVEL 7`. À direita, ícone de coração
     outline rosa + contador de curtidas (`24`, `31`, `18`) e, após divisória vertical, seta
     `→` clara que abre o artigo completo.
- **Paginação**: não visível no mockup. Adotar botão `CARREGAR MAIS` centralizado abaixo do
  grid, com scroll infinito como alternativa **(proposta)**.
- **CTA de publicação**: não visível no mockup. Para usuário logado, botão primário
  `ESCREVER ARTIGO` no topo direito da barra de filtros **(proposta de posicionamento)** —
  no estilo primário canônico (**decidido 2026-08-23**): rosa preenchido, texto navy, sombra
  dura deslocada.

### Footer (faixa navy mais clara)

- Três pilares com ícone outline claro à esquerda e rótulo em duas linhas caps, separados por
  divisórias verticais:
  - Ícone de grupo de pessoas — `APRENDA` / `FAZENDO`
  - Ícone de cubo wireframe — `COMPARTILHE` / `CONHECIMENTO`
  - Ícone de estrela/sparkle — `DESENVOLVA` / `PROJETOS REAIS`
- Composição isométrica rosa/teal/laranja/azul no canto inferior direito.
- **(proposta)** Linha inferior com créditos institucionais UNESP, links legais e Instagram.

## Adaptação tablet (768–1279px)

Todas as decisões desta seção são **(proposta)** — o mockup cobre apenas desktop.

- **Header (proposta)**: logo-chip reduzido; navegação colapsa em menu **hambúrguer** à direita
  do logo, abrindo drawer lateral; bloco de avatar mantém-se visível, mas exibe só o avatar e o
  chevron (esconde `MAKER_X` / `NÍVEL 3`).
- **Hero (proposta)**: mantém teal e título; composição isométrica reduz para ~35% da largura;
  parágrafo passa a até 3 linhas; chevrons `»` mantidos.
- **Tabs (proposta)**: viram **chips horizontais roláveis** (scroll-x, sem barra visível), com
  máscara de fade à direita indicando continuidade; chip ativo rosa preenchido.
- **Busca (proposta)**: desce para linha própria abaixo das tabs, largura 100%.
- **Grid (proposta)**: **2 colunas**; capa em ~16:10; título até 2 linhas com reticências;
  resumo limitado a 3 linhas.
- **Footer (proposta)**: três pilares permanecem em linha; ornamento isométrico reduzido.
- **Alvos de toque (proposta)**: mínimo 44×44px para chips, coração, seta e itens do drawer.

## Adaptação mobile (<768px)

Todas as decisões desta seção são **(proposta)**.

- **Header (proposta)**: logo-chip + hambúrguer; **navegação inferior fixa (bottom navigation)**
  com 5 itens (Home, Biblioteca 3D, Projetos, Artigos, Perfil) e o restante no drawer do
  hambúrguer; avatar/nível acessível pelo item Perfil.
- **Hero (proposta)**: composição isométrica vira faixa decorativa reduzida ou é omitida abaixo
  de 390px; título `ARTIGOS` e parágrafo centralizados/à esquerda em bloco único.
- **Tabs (proposta)**: chips horizontais roláveis fixos abaixo do hero (sticky ao rolar);
  alternativa: botão `FILTRAR` abrindo **drawer** de categorias em lista.
- **Busca (proposta)**: campo full-width acima dos chips; ícone de lupa aciona teclado.
- **Grid (proposta)**: **1 coluna**, cards empilhados com espaçamento de 16px; capa em 16:9;
  rodapé do card mantém avatar + @handle + nível à esquerda e coração + seta à direita, com o
  card inteiro clicável.
- **Footer (proposta)**: pilares empilhados verticalmente, ícone acima do rótulo, centralizados.
- **Alvos de toque (proposta)**: mínimo 44×44px; espaçamento vertical mínimo de 8px entre alvos.

## Componentes

| Componente | Descrição | Reuso |
|---|---|---|
| `HeaderPrincipal` | Logo-chip, nav em caps, bloco de conta (avatar/nível/chevron) | Todas as páginas |
| `HeroTeal` | Faixa teal, título display, parágrafo, chevrons `»`, arte isométrica | Projetos, Biblioteca 3D, Aulas |
| `TabsCategoria` | Tabs caps com item ativo rosa sublinhado; chips roláveis em telas menores **(proposta)** | Projetos, Biblioteca 3D |
| `CampoBusca` | Input arredondado escuro com ícone de lupa e placeholder | Projetos, Biblioteca 3D |
| `CardArtigo` | Capa + chip categoria + data + título + resumo + rodapé de autor/curtidas/seta | Exclusivo desta página |
| `AutorInline` | Avatar pixel + `@handle` + `NÍVEL n` | Todos os cards do site |
| `BotaoCurtir` | Coração outline rosa + contador | Projetos, Aulas, Biblioteca 3D |
| `BotaoCarregarMais` **(proposta)** | Botão outline centralizado abaixo do grid | Listagens |
| `FooterPilares` | Três pilares com ícones + ornamento isométrico | Todas as páginas |

## Modelo de conteúdo (CMS)

### Coleção `artigo`

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `titulo` | texto curto | sim | Exibido em caps display no card |
| `slug` | slug (único) | sim | Gerado do título **(proposta)** |
| `resumo` | texto longo (máx. ~160 caracteres) | sim | Duas linhas no card |
| `corpo` | rich text / markdown | sim | Conteúdo do artigo; imagens inline **(proposta)** |
| `capa` | mídia (imagem) | sim | `.jpg`, `.png`, `.webp`; ~3:2 (como no mockup), mín. 1200×800px **(proposta)** |
| `categoria` | relação → `categoria_artigo` | sim | Uma por artigo |
| `data_publicacao` | data | sim | Formato exibido `12 MAI 2024` |
| `autor` | relação → `usuario` | sim | Alimenta avatar + @handle + nível |
| `anexos` | mídia múltipla | não | `.pdf`, `.zip`, `.stl`, `.3mf`, `.obj`, `.gltf`, `.glb` — para publicações e materiais de apoio **(proposta)** |
| `link_externo` | URL | não | Publicações hospedadas fora do site **(proposta)** |
| `curtidas` | inteiro (derivado) | sim | Contador exibido no card |
| `tags` | lista de texto | não | Busca e relacionados **(proposta)** |
| `status` | enum `rascunho`/`em_revisao`/`publicado` | sim | Moderação da equipe do lab **(proposta)** |
| `tempo_leitura` | inteiro (min, derivado) | não | **(proposta)** |
| `xp_concedido` | inteiro | não | XP creditado ao autor na publicação **(proposta)** |

### Coleção `categoria_artigo`

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `nome` | texto curto | sim | `CULTURA MAKER`, `EDUCAÇÃO`, `TECNOLOGIA`, `INOVAÇÃO SOCIAL`, `PUBLICAÇÃO` |
| `slug` | slug | sim | Filtro na URL (`?categoria=educacao`) **(proposta)** |
| `ordem` | inteiro | sim | Ordem das tabs; `TODOS` é estado virtual, não é registro **(proposta)** |
| `cor_chip` | cor | não | Padrão rosa da identidade **(proposta)** |

### Relações com `usuario` (definida em outras páginas)

Campos consumidos aqui: `handle` (`@maker_x`), `avatar_pixel` (imagem), `nivel` (inteiro).

## Ganchos de gamificação

- **XP por escrever artigo** — regra central de `gamification.md`; XP creditado ao autor quando
  o artigo passa a `publicado`. **Decidido (2026-08-23):** publicar artigo vale **1 XP**
  (subir de nível custa 5 XP; nível máximo 10).
- **Skill associada** — artigo pode declarar a skill que exercita (Modelagem 3D, Corte a Laser,
  Impressão 3D, Eletrônica, Design), creditando XP naquela skill **(proposta)**.
- **Exibição de nível** — cada card exibe `NÍVEL n` do autor ao lado do `@handle`, reforçando a
  progressão pública (níveis 3, 6 e 7 no mockup — **ilustrativos**; o nível máximo real é
  **10**, decidido 2026-08-23).
- **Curtidas (♥)** — contador por artigo (`24`, `31`, `18`); curtir exige login **(proposta)**.
  **Decidido (2026-08-23):** curtidas **não geram XP** para o autor.
- **Missões** — missões de conteúdo (ex.: "publique um artigo sobre seu projeto") podem apontar
  para esta página; o card de artigo publicado marca progresso da missão **(proposta)**.
- ~~**Ler artigo** — micro-XP por leitura concluída de artigo institucional **(proposta)**,
  sujeito a regras anti-farm ainda não definidas.~~
  **Decidido (2026-08-23):** **ler artigo não pontua** — ações fora da lista da economia de XP
  (assistir aula, publicar projeto, publicar modelo 3D, publicar artigo, concluir missão) não
  geram XP.

## Estados e interações

### Hover / foco

- Tabs: hover clareia o texto; foco por teclado exibe outline rosa de 2px **(proposta)**.
- Card: hover eleva o card (sombra dura deslocada) e destaca a borda em rosa; a seta `→` desliza
  levemente à direita **(proposta)**. Card inteiro é link; coração é alvo independente.
- Coração: hover preenche em rosa; ao curtir, animação de preenchimento e incremento do contador
  **(proposta)**.
- Foco visível obrigatório em todos os alvos interativos (WCAG AA) **(proposta)**.

### Carregando

- Skeletons com a silhueta do card (capa, duas linhas de título, duas de resumo, rodapé),
  3/2/1 por linha conforme breakpoint **(proposta)**.
- Busca com debounce de ~300ms e indicador sutil dentro do campo **(proposta)**.

### Vazio

- Sem resultados de busca/filtro: mensagem `Nenhum artigo encontrado.` + ação
  `Limpar filtros` **(proposta)**.
- Categoria sem conteúdo: convite `Seja o primeiro a escrever sobre isso.` para logados
  **(proposta)**.

### Erro

- Falha de carregamento: bloco com `Não foi possível carregar os artigos.` + botão
  `Tentar novamente` **(proposta)**.
- Capa quebrada: placeholder isométrico da identidade no lugar da imagem **(proposta)**.

### Deslogado vs logado **(proposta)**

| Aspecto | Visitante (deslogado) | Maker (logado) |
|---|---|---|
| Leitura dos artigos | Livre (conteúdo público, indexável) | Livre |
| Bloco de conta no header | Botão `CRIAR CONTA` no lugar do avatar | Avatar + `MAKER_X` / `NÍVEL 3` + chevron |
| Curtir | Clique abre convite para criar conta | Curtida registrada, contador atualiza |
| `ESCREVER ARTIGO` | Não exibido | Exibido, leva ao editor |
| XP | Não acumula | Acumula por publicação/missões |

## Questões em aberto

1. `PUBLICAÇÃO` é uma categoria a mais nas tabs (que não a exibem) ou um **tipo de conteúdo**
   distinto de artigo (material institucional, com PDF)? Afeta o modelo de CMS.
2. ~~Quanto XP vale publicar um artigo, e existe XP por leitura ou por curtida recebida?~~
   **Decidido (2026-08-23):** publicar artigo vale **1 XP**; **não** há XP por leitura nem por
   curtida recebida.
3. Fluxo de moderação: quem aprova artigos antes de `publicado` e com quais critérios?
4. Editor de artigos: rich text no próprio site ou submissão via CMS pela equipe?
5. Artigos podem referenciar projetos, aulas e modelos 3D (relações cruzadas)? Como exibir?
6. Ordenação padrão do grid — mais recentes, mais curtidos ou curadoria manual?
7. A busca cobre corpo do texto e tags, ou apenas título e resumo?
8. Paginação definitiva: `CARREGAR MAIS`, scroll infinito ou páginas numeradas?
9. Visitante deslogado pode baixar anexos (PDF/arquivos) sem conta?
