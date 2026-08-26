# Home

## Propósito

Porta de entrada do site do Fab Lab CITe Bauru. Apresenta o lab ao visitante, converte em
cadastro ("COMECE A CRIAR") e, para o maker logado, funciona como painel gamificado:
missões em destaque, nível coletivo do lab, ranking e últimos projetos.
**Decidido (PO, 2026-08-24):** as seções do painel são **visíveis também ao visitante
deslogado** — só o **progresso pessoal** das missões (e curtir) exige conta.

## Fonte de design

- `design/home-v1-criar-conta-v1.png` — **metade esquerda** (home
  dashboard, hero v1). A metade direita é a tela de criação de conta e pertence a
  `pages/onboarding.md`.
- `design/home-desktop.png` — hero v2, mapa isométrico
  pixel art noturno do lab em tela cheia (desktop).
- **`design/home-mobile.png`** (2026-08-24, 864×1821) — **arte mobile dedicada do hero
  v2**, entregue pela designer (decisão da rodada 1 cumprida); fonte primária da Home
  mobile.
- Apoio: `concept.md`, `visual-identity.md`, `gamification.md`.

## Estrutura da página — desktop (≥1280px)

### Header (fundo navy; fixação no topo ao rolar **(proposta)**)

- Logo-chip extrudado à esquerda, sempre com letras navy: chip **laranja** com o cubo
  isométrico **entre** as palavras ("FAB [cubo] LAB / CITE BAURU").
  **Decidido (rodada 2, 2026-08-23):** o chip **canônico do header** é o **laranja com o cubo
  isométrico entre `FAB` e `LAB`** (como em `design/criar-conta-passo-1.png`).
  **Arte corrigida (2026-08-26):** a designer reentregou `design/home-desktop.png` com o chip
  canônico. ~~No v2 o chip era rosa, com o cubo (aresta teal) **à esquerda** de "FAB LAB /
  CITE BAURU"~~ — a divergência entre a arte e a decisão da rodada 2 **deixou de existir**,
  e nenhum mockup restante mostra o chip rosa no header.
- Navegação em caps display:
  - **Canônica (decidido 2026-08-23):** `BIBLIOTECA 3D` · `PROJETOS` · `CALENDÁRIO` · `AULAS` ·
    `INSTAGRAM` · `ARTIGOS`, nesta ordem e com todos os itens **alinhados** (o `AULAS` torto
    em alguns mockups é ruído de render).
  - Registro histórico dos mockups: o v1 (dashboard) mostrava apenas
    `BIBLIOTECA 3D` · `PROJETOS` · `INSTAGRAM` · `ARTIGOS`; o v2 (mapa) já trazia o conjunto
    completo, agora adotado como canônico.
- ~~**Decidido (rodada 3, 2026-08-23) — menu e logo:** o **botão de menu** fica **no topo, na
  extremidade esquerda da barra** — ou seja, **à esquerda do logo-chip** (mesma ordem descrita
  na adaptação mobile) —, e contém **todas as abas** (inclusive `BIBLIOTECA 3D` e
  `INSTAGRAM`).~~ **Decidido (rodada 4, 2026-08-24) — menu e logo:** o botão de menu existe
  **só nas versões compactas** (tablet/mobile); no **desktop as 6 abas ficam na barra, SEM
  botão de menu** (o texto da rodada 3 acima fica como registro). Nas versões compactas o
  menu segue no topo, ~~à extremidade esquerda~~ **à direita** da barra, com **todas as
  abas** (inclusive `BIBLIOTECA 3D` e `INSTAGRAM`); a `BIBLIOTECA 3D` fica **só dentro do
  menu**, sem atalho extra.
  Tocar/clicar no **logo leva à Home** (não é mais proposta) — em todos os tamanhos.
  **Decidido (rodada 5, 2026-08-24) — lado do botão de menu:** ele fica **à DIREITA** da
  barra, com o **logo do Fab Lab à esquerda** — confirma a arte `design/home-mobile.png` e
  **supera** a "extremidade esquerda" da rodada 3 (resolve a questão 10).
- À direita: avatar pixel em moldura + `MAKER_X` / `NÍVEL 3` + chevron `⌄` (abre o menu da
  conta **(proposta)** — o mockup mostra apenas o chevron). **Rodada 4 (2026-08-24):**
  `MAKER_X` é rótulo **ilustrativo** — a UI real mostra o **nome da pessoa** (identificador
  `@nomesobrenome` quando exibido).

### Hero — variante v1 (faixa teal) — **descartado (2026-08-23)**

> **Decidido (2026-08-23):** o hero v1 foi **descartado** e substituído pelo v2 (mapa pixel
> art). A descrição abaixo permanece apenas como **registro histórico do mockup**.

- Faixa teal (token `#74B7A5` da paleta; renderizado ~`#54A697` no mockup) com grid
  isométrico wireframe ao fundo.
- Título display navy em três linhas: `CRIE.` / `EXPERIMENTE.` / `TRANSFORME.`
- Parágrafo: `Bem-vindo ao Fab Lab CITe Bauru. Aqui ideias ganham forma e você evolui como maker.`
- Botão primário `COMECE A CRIAR →`: no v1 é **preenchido em navy com contorno e texto rosa**
  (seta clara) e sombra dura deslocada.
- Composição isométrica à direita: letra **F** extrudada (rosa/laranja/amarelo/azul), cubo
  navy com aresta rosa sobre slab, estrela amarela de 4 pontas, chevrons duplos `»`.

### Hero — v2 (mapa pixel art em tela cheia) — **hero oficial (decidido 2026-08-23)**

> **Decidido (2026-08-23):** este é o hero **oficial** da Home, substituindo o v1.

- Cena isométrica noturna do lab ocupando a viewport inteira; texto sobreposto à esquerda.
- Mesmo título e parágrafo do v1, agora em branco (`CRIE.` / `EXPERIMENTE.`) e rosa
  (`TRANSFORME.`) sobre a cena.
- Mesmo rótulo de CTA, com o botão **rosa preenchido, texto navy** e sombra dura deslocada
  (teal no mockup). **Decidido (2026-08-23):** este é o estilo **canônico** do botão primário
  do site; a variante do v1 (navy com contorno rosa) foi descartada.
- Chevrons duplos abaixo do botão: o primeiro rosa, o segundo teal.
- Estações-contêiner rotuladas: `IMPRESSORAS 3D` (azul), `CORTE A LASER` (laranja),
  `SERIGRAFIA` (verde), `COWORK` (verde/deck). Anexo roxo/lilás com portas cinza `WC` e
  `DEPÓSITO`.
- Cenário: muro com bicicletas, jardins/canteiros, varal de lâmpadas, personagens pixel art
  (grupo conversando, pessoa soldando eletrônica, pessoa no banco com celular), lixeira de
  reciclagem, portão rosa, poste. *(PO, 2026-08-24: a divergência celular/tablet do
  personagem do banco entre as artes desktop/mobile é **aceita** — sem retoque.)*
- Placas: letreiro "FAB LAB CITE BAURU" no muro, marca no piso "FAB LAB CITE BAURU" com cubo,
  e placa tríplice `CRIAR` / `EXPERIMENTAR` / `TRANSFORMAR`. **Decidido (PO,
  2026-08-24):** a grafia unificada do quadro é a **imperativa**
  (`CRIE.` / `EXPERIMENTE.` / `TRANSFORME.`, como na arte mobile) — aplicar quando a
  arte desktop for retocada; até lá, a divergência é registro.
- Marca-d'água isométrica rosa/teal no canto superior direito.
- **(proposta)** As estações são hotspots clicáveis → página da estação/skill correspondente.

> **(proposta)** As seções de painel a seguir (`MISSÕES EM DESTAQUE`, `NÍVEL DO LAB`,
> `RANKING MAKERS`, `ÚLTIMOS PROJETOS`) permanecem **abaixo do hero v2**, na mesma página.
> A decisão da designer de 2026-08-23 tratou apenas do hero; esta é uma **interpretação a
> validar** no layout completo da Home.

### Seção "MISSÕES EM DESTAQUE"

- Cabeçalho da seção à esquerda; link à direita: `VER TODAS ›`.
- **Decidido (PO, 2026-08-24):** as missões em destaque são **globais e curadas pela
  equipe** (campo `destaque_home`), exibidas com o **progresso individual** do maker
  logado — resolve a questão 5. **Deslogado**, os cards aparecem normalmente (a missão é
  pública), porém **sem % pessoal**: a barra fica em 0% com convite ao login — resolve a
  questão 7.
- Grid de 3 cards (contorno colorido sobre navy), cada um com ícone outline, título, descrição
  e barra de progresso com % à esquerda:
  1. `DESAFIO CORTE LASER` — `Crie um chaveiro personalizado com corte a laser.` — `50%` (amarelo)
  2. `IMPRESSÃO 3D` — `Modele e imprima um suporte para celular.` — `30%` (laranja)
  3. `BORDADO DIGITAL` — `Personalize uma peça de tecido com bordado digital.` — `0%` (rosa)

### Faixa de 3 cards (mesma linha)

**Card `NÍVEL DO LAB`** — cubo isométrico rosa grande; rótulo `NÍVEL` + número `07`;
barra de progresso rosa; contador `1250 / 2000 XP`; bloco final
`Próxima recompensa:` / `Novo Acabamento de Avatar` com ícone de camiseta.
Os números (`07`, `1250 / 2000 XP`) são **ilustrativos do mockup**; a economia real
(1 XP por ação, 5 XP por nível, teto 10) está em [gamification.md](../gamification.md).
O bloco `Próxima recompensa:` é **registro do mockup**: os cosméticos de recompensa foram
**adiados (2026-08-23)** ~~e a recompensa coletiva substituta está em aberto
(gamification.md, questão 8)~~. **Decidido (PO, 2026-08-24): sem recompensa coletiva no
v1** — o card mostra apenas **nível + barra de progresso** como conquista coletiva; o
bloco `Próxima recompensa:` **não aparece no v1** e volta com os cosméticos (v2). Fecha a
questão 8 de [gamification.md](../gamification.md).

**Card `RANKING MAKERS`** — lista top-5 com posição em dois dígitos, avatar pixel, @handle e XP:
`01 @laser.nick 2450 XP` · `02 @print.lu 2130 XP` · `03 @maker_jv 1890 XP` ·
`04 @bia.tech 1750 XP` · `05 @projeto_ana 1420 XP`; link rodapé `VER RANKING COMPLETO`.
Os valores de XP são **ilustrativos do mockup**; a economia real está em
[gamification.md](../gamification.md).
**Decidido (rodada 4, 2026-08-24):** os handles do mockup (`@laser.nick`, `@print.lu`,
`@maker_jv`, `@bia.tech`, `@projeto_ana`) são **ilustrativos/superados** — publicamente
aparece o **nome da pessoa** e o identificador segue o modelo **`@nomesobrenome`** (derivado
do nome, ex.: `@mariasilva`). Normalização (acentos/espaços) e colisão de homônimos:
**(proposta)** — ver [gamification.md](../gamification.md).
**Decidido (PO, 2026-08-24):** cada linha do ranking é **clicável** e leva ao **perfil
público do maker** (versão enxuta: avatar, nome, skills e conteúdos publicados) — spec
futura, junto das features 004/005.

**Card `ÚLTIMOS PROJETOS`** — imagem de capa (luminária iluminada), título
`Luminária Paramétrica`, autoria `por @laser.nick` (handle **ilustrativo** — na UI real a
autoria mostra o **nome da pessoa** + identificador `@nomesobrenome`, rodada 4),
curtidas `♡ 32`; link rodapé
`VER MAIS PROPLETOS` (**typo no mockup** — decidido em 2026-08-23: o site usa
`VER MAIS PROJETOS`). **Decidido (2026-08-23):** o card é um **carrossel** de vários
projetos; o mockup mostra apenas um slide.
**Decidido (PO, 2026-08-24):** a **autoria do card é clicável** → **perfil público do
maker** (versão enxuta) — spec futura, junto das features 004/005.
O coração do card **exige login** para curtir (ver "Ganchos de gamificação").

### Footer institucional (navy)

Três pilares com ícones outline, em linha: `APRENDA FAZENDO` · `COMPARTILHE CONHECIMENTO` ·
`DESENVOLVA PROJETOS REAIS`; separadores verticais entre os pilares e composição de slabs
isométricos rosa/azul no canto direito. A faixa do rodapé usa um navy mais claro que o fundo
da página.

## Adaptação tablet (768–1279px)

Salvo onde indicado como decidido, as decisões abaixo são **(proposta)** — o mockup só cobre
desktop.

- ~~Header: logo + nav reduzida a `BIBLIOTECA 3D`, `PROJETOS`, `ARTIGOS`; demais itens
  (`CALENDÁRIO`, `AULAS`, `INSTAGRAM`) em menu "⋯ MAIS".~~
  ~~**Decidido (rodada 2, 2026-08-23):** a barra do tablet é `PROJETOS` · `AULAS` ·
  `CALENDÁRIO` · `ARTIGOS`, nesta ordem.~~ *(A nota da rodada 2 sobre "ordem invertida
  Aulas/Calendário — resposta literal da designer" está **superada**.)*
  **Decidido (rodada 3, 2026-08-23):** "mantenha a ordem das abas da página inicial" — a barra
  do tablet segue a **ordem relativa do desktop**: `PROJETOS` · `CALENDÁRIO` · `AULAS` ·
  `ARTIGOS`. `BIBLIOTECA 3D` e `INSTAGRAM` **saem da barra** e ficam **no menu** (botão no
  topo, ~~à esquerda~~ **à direita** — **decidido na rodada 5, 2026-08-24**, com o logo à
  esquerda; a menção "à esquerda" da rodada 3 está **superada** —, com todas as abas);
  **Home pelo logo** (decidido). Avatar mantém nome e nível.
- Hero (v2, oficial): mapa recortado no centro de interesse (contêineres), altura ~70vh, texto
  sobreposto com painel de contraste navy 60%. Se a designer entregar arte dedicada de tablet,
  ela substitui o recorte.
- ~~Hero v1: 2 colunas viram 1 — texto em cima, composição isométrica abaixo, reduzida a ~60%.~~
  **Decidido (2026-08-23):** hero v1 descartado — adaptação mantida apenas como registro.
- Missões: grid 3 → 2 colunas; o terceiro card quebra para a linha seguinte em largura total.
- Faixa de cards: 3 → 2 colunas (`NÍVEL DO LAB` + `RANKING MAKERS` na primeira linha,
  `ÚLTIMOS PROJETOS` em largura total abaixo, com capa em 16:9).
- Footer: pilares 3 → 3 em linha compacta (ícone acima do texto) ou 2+1 se faltar espaço.
- Alvos de toque mínimos de 44×44px.

## Adaptação mobile (<768px)

Salvo onde indicado como decidido, as decisões abaixo são **(proposta)**.

- **Header (mockup `home-mobile.png`)**: **logo-chip laranja à esquerda** (cubo entre
  `FAB` e `LAB` — canônico ✓) e **botão hambúrguer rosa à direita** (três traços). **Sem
  avatar/`UserChip`** no header do mockup.
  - ~~**Divergência com a rodada 3**: a decisão dizia menu "no topo, na **extremidade
    esquerda** da barra"; a arte da designer o coloca **à direita** — ver questão 10
    (registrado; a arte é mais recente que a resposta). **Até a resposta, a decisão da
    rodada 3 (esquerda) prevalece** na spec.~~
    **Decidido (rodada 5, 2026-08-24):** vale a **arte** — o botão de menu fica **no topo,
    à DIREITA** da barra, com o **logo à esquerda**; a resposta da rodada 3 ("extremidade
    esquerda") está **superada** (resolve a questão 10).
  - **Decidido (rodada 2, 2026-08-23):** a navegação principal do mobile é a **barra
    inferior fixa** (ver abaixo — **rodada 5:** ela **aparece ao rolar**);
    `BIBLIOTECA 3D` e `INSTAGRAM` ficam **fora da barra**,
    no drawer do menu (`INSTAGRAM` como link externo); **Home pelo logo** (decidido).
  - A ausência do avatar no header mobile fica registrada como **desenho da arte**.
    **Decidido (rodada 5, 2026-08-24):** no estado **logado**, o **avatar do usuário entra
    bem pequeno no header mobile** (além do item `PERFIL` da barra inferior) — resolve a
    questão 12. Deslogado, o header segue só com logo + botão de menu.
- **Hero (v2, oficial) — arte mobile dedicada ENTREGUE** (`design/home-mobile.png`,
  2026-08-24): recomposição **vertical** da cena noturna — anexo `WC`/`DEPÓSITO` e
  bicicletas no topo; contêineres reorganizados (`IMPRESSORAS 3D` azul à esquerda,
  `CORTE A LASER` laranja ao centro, `SERIGRAFIA` verde abaixo à esquerda, `COWORK` verde
  à direita); personagens (grupo conversando, pessoa soldando no chão, pessoa no banco com
  tablet), marca no piso "FAB LAB CITE BAURU", placa rosa no gradil, portão rosa, lixeira
  de reciclagem, quadro no gradil com `CRIE.` / `EXPERIMENTE.` / `TRANSFORME.` em
  rosa/teal/amarelo e a marca-d'água isométrica rosa/teal no alto à direita (mantida do
  desktop).
  - **Bloco de texto ABAIXO da cena** (sobre fundo navy escuro), não sobreposto:
    `CRIE.` / `EXPERIMENTE.` (branco) / `TRANSFORME.` (rosa); parágrafo em 3 linhas
    (`Bem-vindo ao Fab Lab CITe Bauru. Aqui ideias ganham forma e você evolui como
    maker.`); botão `COMECE A CRIAR →` **rosa preenchido/texto navy** (canônico ✓) em
    **largura parcial** (~38% da largura da arte: 325 de 864px), com os chevrons duplos
    `»` (rosa + teal) à direita — supera a proposta anterior de botão em largura total.
  - A otimização técnica de peso do arquivo é tarefa de implementação (questão 8, decidida).
- ~~Hero v1: título display reduzido (mantendo as 3 linhas), parágrafo, botão
  `COMECE A CRIAR →` em largura total; composição isométrica como ornamento de fundo recortado.~~
  ~~Hero v2: substituir o mapa panorâmico por recorte vertical (crop 3:4) ou fallback estático
  do v1 se o peso da imagem exceder o orçamento de performance.~~
  **Decidido (2026-08-23):** superado pela arte mobile dedicada; mantido como registro.
- Missões: 3 → 1 coluna; opção de carrossel horizontal com snap e indicadores de página.
- Cards `NÍVEL DO LAB` / `RANKING MAKERS` / `ÚLTIMOS PROJETOS`: empilhados em 1 coluna,
  nesta ordem; ranking mostra top-3 com "Ver ranking completo" expandindo os demais.
- Footer: pilares empilhados em 1 coluna, ícone à esquerda do texto.
- ~~Barra de navegação inferior fixa **(proposta, alternativa ao hambúrguer)**: Home, Projetos,
  Biblioteca 3D, Perfil.~~
  ~~**Decidido (rodada 2, 2026-08-23):** a barra inferior fixa é a navegação do mobile, com
  **5 posições**: `PROJETOS` · `AULAS` · `CALENDÁRIO` · `ARTIGOS` · `PERFIL`.~~ *(A ordem
  invertida Aulas/Calendário da rodada 2 está **superada**.)*
  **Decidido (rodada 3, 2026-08-23):** a barra inferior fixa é a navegação do mobile, com
  **5 posições**, na ordem relativa do desktop: `PROJETOS` · `CALENDÁRIO` · `AULAS` ·
  `ARTIGOS` · `PERFIL`. **Home pelo logo**; `BIBLIOTECA 3D` e `INSTAGRAM` pelo **menu**.
  **Deslogado, o item `PERFIL` abre a tela de login**; logado, leva a
  [Minha Conta](minha-conta.md). **Decidido (rodada 4, 2026-08-24):** o login é por
  **e-mail + senha** (design da tela de login definido — ver `login.md`).
  **Decidido (rodada 5, 2026-08-24):** a barra ~~é fixa desde o primeiro paint~~ **aparece
  ao rolar** a página — ela não cobre o hero na abertura.
  - **Nota do mockup `home-mobile.png`**: a arte da Home mobile **não desenha a barra
    inferior** (a arte cobre uma tela inteira e termina no bloco de texto, sem faixa de
    navegação no rodapé). **Decidido (rodada 5, 2026-08-24):** a barra foi apenas
    **OMITIDA da arte** — ela **existe** e **aparece ao rolar** a página; **não** fica
    fixa sobre o hero desde o primeiro paint (resolve a questão 11).

## Componentes

| Componente | Uso na Home | Observações |
|---|---|---|
| `HeaderNav` | topo | logo-chip **laranja com cubo entre `FAB` e `LAB`** (canônico, decidido rodada 2), itens caps na ordem canônica desktop `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS` (decidido 2026-08-23, todos alinhados), `UserChip` (avatar + nome + nível + chevron; a arte `home-mobile.png` **não traz `UserChip`** no header — **decidido rodada 5:** logado, o **avatar entra bem pequeno no header mobile**). **Decidido (rodada 4):** **sem botão de menu no desktop** — as 6 abas ficam na barra; o botão de menu (com **todas as abas**) existe **só nas versões compactas**, no topo ~~à esquerda~~ **à direita**, com o **logo à esquerda** (**decidido rodada 5, 2026-08-24**, confirmando a arte `home-mobile.png` e superando a rodada 3). Compacto (decidido rodada 3, ordem do desktop): tablet `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS`; `BIBLIOTECA 3D` e `INSTAGRAM` só no menu; logo → Home |
| `MenuDrawer` | **só nas versões compactas** (tablet/mobile), botão no topo ~~à esquerda~~ **à direita** da barra, com o logo à esquerda (decidido rodada 4 + **rodada 5, 2026-08-24**, confirmando a arte `home-mobile.png`) | lista com **todas as abas** (`BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`), `INSTAGRAM` como link externo (decidido rodada 3) |
| `BottomNav` | mobile, no rodapé — **decidido rodada 5 (2026-08-24):** **aparece ao rolar** a página (não fica fixa sobre o hero desde o primeiro paint); a arte `home-mobile.png` apenas a **omitiu** | 5 posições `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS · PERFIL` (decidido rodada 3); `PERFIL` deslogado abre o **login** (**e-mail + senha** — rodada 4; design definido — ver `login.md`), logado abre `Minha Conta`; **pós-login por `PERFIL` → `Minha Conta`** (decidido PO, 2026-08-24 — login aberto a partir de outra página retorna à origem) |
| ~~`HeroBanner` (v1)~~ | ~~faixa teal~~ | **descartado (2026-08-23)** — registro do mockup v1 |
| `HeroPixelMap` | hero oficial, tela cheia | cena pixel art + hotspots **(proposta)**; arte mobile dedicada **entregue** (`design/home-mobile.png`, 2026-08-24) — texto e CTA abaixo da cena no mobile |
| `ButtonPrimary` | `COMECE A CRIAR →` | estilo único: **rosa preenchido, texto navy, sombra dura deslocada** (decidido 2026-08-23). O estilo navy com contorno rosa existiu no mockup v1 e foi **descartado** |
| `SectionHeader` | `MISSÕES EM DESTAQUE` + `VER TODAS ›` | título caps + link à direita |
| `MissionCard` | 3 cards | ícone, título, descrição, `ProgressBar` com % — **missões globais curadas** (`destaque_home`) com **progresso individual** do maker logado; **deslogado**: 0% + convite ao login (decidido PO, 2026-08-24) |
| `LabLevelCard` | `NÍVEL DO LAB` | cubo, nível, barra, `X / Y XP` ~~, próxima recompensa~~ — **sem bloco de recompensa no v1** (decidido PO, 2026-08-24; volta com os cosméticos em v2) |
| `RankingList` | `RANKING MAKERS` | linhas posição/avatar/nome + `@nomesobrenome`/XP + link rodapé (handles do mockup são ilustrativos — rodada 4); **linhas clicáveis → perfil público do maker** (decidido PO, 2026-08-24; spec futura) |
| `LatestProjectCard` | `ÚLTIMOS PROJETOS` | capa, título, `por <nome>` + `@nomesobrenome` (rodada 4) — **autoria clicável → perfil público** (decidido PO, 2026-08-24), `♡ n` (**curtir exige login**), link rodapé |
| `PillarsFooter` | rodapé | 3 pilares com ícones outline + arte isométrica |

## Modelo de conteúdo (CMS)

### `Missao`

| Campo | Tipo | Obrigatório | Relações |
|---|---|---|---|
| titulo | texto curto | sim | — |
| descricao | texto | sim | — |
| icone | imagem (SVG, PNG) | sim | — |
| skill | referência | sim | → `Skill` |
| xp_recompensa | inteiro | sim **(proposta)** | — (economia decidida em 2026-08-23: **1 XP fixo** por missão concluída — ver [gamification.md](../gamification.md)) |
| destaque_home | booleano | sim | controla os 3 cards da seção — **curadoria da equipe** (decidido PO, 2026-08-24: missões da Home são **globais e curadas**) |
| ordem_destaque | inteiro | não | — |
| anexo_comprovacao | arquivo (JPG, PNG, PDF, STL, 3MF, ZIP) | não **(proposta)** | envio do maker |
| progresso_percentual | inteiro (derivado, não editável no CMS) | sim | **por maker** → `Maker` (exibido como `50%` / `30%` / `0%`) — **decidido (PO, 2026-08-24):** progresso é **individual** do maker logado; **sem sessão** não há valor pessoal (exibe 0% + convite ao login) |

### `Projeto` (consumido pelo card `ÚLTIMOS PROJETOS`)

| Campo | Tipo | Obrigatório | Relações |
|---|---|---|---|
| titulo | texto curto | sim | — |
| capa | imagem (JPG, PNG, WEBP) | sim | — |
| autor | referência | sim | → `Maker` |
| curtidas | inteiro (derivado) | sim | — |
| publicado_em | data | sim | ordena "últimos" |
| arquivos | múltiplos arquivos (STL, 3MF, OBJ, GLTF/GLB, PDF, ZIP, SVG, DXF) | não | — |

### `Maker`

| Campo | Tipo | Obrigatório | Relações |
|---|---|---|---|
| handle | texto (`@nomesobrenome`, derivado do nome — decidido rodada 4) | sim | único (normalização e colisão de homônimos **(proposta)**) |
| nome_exibicao | texto curto | sim | **é o nome da pessoa** (rodada 4); exibido no `UserChip` (o `MAKER_X` do mockup é ilustrativo) |
| avatar_pixel | imagem (PNG) | sim | gerado no onboarding |
| nivel | inteiro (derivado do XP) | sim | — |
| xp_total | inteiro | sim | alimenta `RANKING MAKERS` |
| skills | referências múltiplas | não | → `Skill` (com nível por skill) |

### `Skill`

`nome` (texto, sim) · `icone` (SVG/PNG, sim) · ~~`nivel_maximo` (inteiro, **(proposta)**)~~
**Decidido (2026-08-23):** `nivel_maximo` = **10** (por enquanto), 5 XP por nível — ver
[gamification.md](../gamification.md).

### `NivelDoLab` (singleton)

`nivel_atual` (inteiro, sim) · `xp_atual` (inteiro, sim) · `xp_meta` (inteiro, sim) ·
~~`proxima_recompensa_titulo` (texto, sim — ex.: `Novo Acabamento de Avatar`) ·
`proxima_recompensa_icone` (imagem SVG/PNG, sim)~~.
**Decidido (PO, 2026-08-24):** **sem recompensa coletiva no v1** — os campos
`proxima_recompensa_*` ficam **reservados** (não exibidos, opcionais) e voltam a ser
usados com os cosméticos (v2).

### `HomeSettings` (singleton) **(proposta)**

~~`variante_hero` (enum: `dashboard` | `mapa_pixel`)~~ — **removido/obsoleto (2026-08-23):**
o hero v2 é o único, não há variante a escolher · `hero_titulo` · `hero_texto` ·
`hero_cta_label` / `hero_cta_url` · `mapa_imagem` (PNG/WEBP) ·
`mapa_imagem_mobile` (PNG/WEBP — arte dedicada **entregue**: `design/home-mobile.png`,
864×1821) ·
`pilares` (repetível: `titulo`, `icone` SVG/PNG).

## Ganchos de gamificação

- **Exibe XP individual** no `UserChip` (`MAKER_X` / `NÍVEL 3`) e no ranking (`2450 XP`) —
  números **ilustrativos do mockup**; economia real em [gamification.md](../gamification.md).
- **Exibe XP coletivo** no card `NÍVEL DO LAB` (`NÍVEL 07`, `1250 / 2000 XP`) —
  números **ilustrativos do mockup**. ~~Recompensa cosmética coletiva ao subir de nível
  (`Novo Acabamento de Avatar`).~~ **Decidido (2026-08-23):** os cosméticos de recompensa
  foram **adiados** (só itens fixos de avatar por enquanto); ~~a recompensa coletiva
  alternativa segue **em aberto**~~ **Decidido (PO, 2026-08-24): sem recompensa coletiva
  no v1** — o card mostra só nível + barra; recompensa chega com os cosméticos (v2).
  Fecha a questão 8 de [gamification.md](../gamification.md).
- **Missões**: barra de progresso por missão (`50%`, `30%`, `0%`); concluir concede
  **1 XP** na skill correspondente (decidido 2026-08-23 — ver
  [gamification.md](../gamification.md)); `VER TODAS ›` leva ao catálogo de missões
  **(proposta)**. **Decidido (PO, 2026-08-24):** missões da Home são **globais e curadas
  pela equipe**, com **progresso individual** do maker logado; o **1 XP** credita na
  **aprovação** pela equipe (fila de revisão — ver
  [gamification.md](../gamification.md), questão 2).
- **Skills**: a Home não edita skills, apenas as referencia via ícone/categoria das missões.
  **Rodada 4 (2026-08-24):** as skills começam no **nível 0** (pips vazios) — ver
  [gamification.md](../gamification.md); a **exibição** das skills fica em
  [Minha Conta](minha-conta.md), não na Home.
- **Curtidas**: contador `♡ 32` no card de projeto; **curtidas não geram XP** (decidido
  2026-08-23 — ver [gamification.md](../gamification.md)); **decidido (PO, 2026-08-24):
  curtir a partir da Home exige login** — sem sessão, o clique no coração abre o
  **convite de cadastro/login** (não existe curtida anônima); o clique no coração é
  otimista com rollback em erro **(proposta)**.
- **Acesso aberto (PO, 2026-08-24):** todo o conteúdo linkado da Home é **legível sem
  conta** (projetos, artigos, aulas e download de modelos 3D); a conta é exigida apenas
  para **publicar, curtir e pontuar** — ver [concept.md](../concept.md).
- **Não concede XP por visitar a Home** — a página é vitrine e painel. **Decidido
  (2026-08-23):** só pontuam as ações da lista de economia (assistir aula, publicar projeto,
  publicar modelo 3D, publicar artigo, concluir missão); as demais não pontuam.

## Estados e interações

- **Hover/focus**: itens de nav ganham sublinhado rosa; cards elevam a sombra dura em 2px;
  botão primário desloca-se para a sombra; foco visível com outline amarelo `#F8C810` de 2px
  em todos os elementos interativos **(proposta, acessibilidade)**.
- **Deslogado**: `UserChip` é substituído por botões `ENTRAR` e `CRIAR CONTA` (a existência
  dos dois botões no header segue **(proposta)**; a copy do login é **`ENTRAR`** —
  decidido pelo PO, ver [login.md](login.md));
  ~~as missões aparecem sem progresso pessoal (0% ou rótulo "Faça login para participar")
  **(proposta)**~~ **Decidido (PO, 2026-08-24):** as missões são **visíveis a todos**, mas
  **sem % pessoal** — barra em 0% com **convite ao login**; **curtir exige login** (o
  coração abre o convite de cadastro/login, sem curtida anônima). Ler, assistir aulas e
  baixar modelos 3D **não exigem conta** (acesso aberto). CTA do hero permanece
  `COMECE A CRIAR →` apontando ao onboarding.
  **Decidido (rodada 3, 2026-08-23):** no mobile, o item **`PERFIL`** da barra inferior
  **abre a tela de login** quando não há sessão (resolve a lacuna sobre o comportamento de
  `PERFIL` deslogado); com sessão, leva a [Minha Conta](minha-conta.md).
  **Decidido (rodada 4, 2026-08-24):** essa tela de login é por **e-mail + senha** — o passo 2
  do cadastro ganha campo de senha (ver [onboarding.md](onboarding.md)); design do login
  definido — ver [login.md](login.md).
  **Decidido (PO, 2026-08-24) — destino pós-login:** quem entra a partir da Home (ou de
  qualquer ação que peça login, como curtir) **retorna à página de origem**; quem abre o
  login **diretamente** — inclusive pelo item `PERFIL` da barra inferior — cai na
  [Minha Conta](minha-conta.md).
- **Logado**: `UserChip` com avatar, **nome da pessoa** (`MAKER_X` é rótulo ilustrativo do
  mockup — rodada 4), `NÍVEL 3` e menu no chevron — **rodada 5 (via Minha Conta):** o
  menu do chevron concentra **editar avatar, dados pessoais e sair** (ver
  [minha-conta.md](minha-conta.md), questão 9); itens adicionais (Meus projetos etc.)
  **(proposta)**; missões mostram o progresso real do maker; CTA do hero muda
  para `CONTINUAR CRIANDO` **(proposta)**.
  **Decidido (rodada 5, 2026-08-24) — mobile logado:** o **avatar entra bem pequeno no
  header** (ao lado do logo/botão de menu), somando-se ao item `PERFIL` da barra inferior.
- **Loading**: skeletons com o contorno dos cards (3 missões, 3 cards da faixa) e barra de
  progresso neutra; o hero é estático e renderiza imediatamente **(proposta)**.
- **Vazio**: sem missões em destaque → "Nenhuma missão ativa no momento"; ranking sem dados →
  "Ainda sem makers no ranking"; sem projetos → "Nenhum projeto publicado ainda" com CTA
  `PUBLICAR PROJETO` **(proposta)**.
- **Erro**: cada card falha isoladamente com "Não foi possível carregar" + botão
  `TENTAR NOVAMENTE`; a Home nunca quebra inteira por falha de um bloco **(proposta)**.
- **Mapa pixel art (v2)**: hotspots com tooltip do nome da estação no hover e navegação por
  teclado entre eles; `prefers-reduced-motion` desativa qualquer animação da cena **(proposta)**.

## Questões em aberto

1. ~~Qual variante de hero é a canônica — v1 (faixa teal) ou v2 (mapa pixel art)? São
   alternativas ou v2 é hero de campanha/sazonal?~~
   **Decidido (2026-08-23):** o v2 (mapa pixel art) é o hero oficial e **substitui** o v1.
2. ~~A navegação final inclui `CALENDÁRIO` e `AULAS` (v2) ou é a lista curta do v1?~~
   **Decidido (2026-08-23):** navegação canônica **desktop** em todas as páginas —
   `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`, itens alinhados.
   **Rodada 2 (2026-08-23):** nas versões compactas `BIBLIOTECA 3D` e `INSTAGRAM` saem da
   barra — ver "Adaptação tablet" e "Adaptação mobile".
   **Rodada 3 (2026-08-23):** as barras compactas seguem a **ordem do desktop** — tablet
   `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS`, mobile `PROJETOS · CALENDÁRIO · AULAS ·
   ARTIGOS · PERFIL`; menu no topo ~~à esquerda~~ **à direita** (rodada 5) com todas as
   abas; logo → Home; `PERFIL`
   deslogado abre o login.
   **Rodada 4 (2026-08-24):** o botão de menu existe **só nas versões compactas** — no
   **desktop** as 6 abas ficam na barra, **sem botão de menu**; o login é por
   **e-mail + senha**.
   **Rodada 5 (2026-08-24):** nas versões compactas o botão de menu fica **à direita** da
   barra (logo à esquerda) — supera a "esquerda" da rodada 3; a barra inferior do mobile
   **aparece ao rolar** e o **avatar entra bem pequeno no header mobile** quando logado.
3. ~~O typo `VER MAIS PROPLETOS` deve ser corrigido para `VER MAIS PROJETOS` — confirmar.~~
   **Decidido (2026-08-23):** é typo do mockup; usar `VER MAIS PROJETOS`.
4. ~~O card `ÚLTIMOS PROJETOS` mostra 1 projeto ou é carrossel de vários?~~
   **Decidido (2026-08-23):** é carrossel de vários projetos.
5. ~~Missões na Home são globais ou personalizadas por maker (progresso individual)?~~
   **Decidido (PO, 2026-08-24):** são **globais e curadas pela equipe** (campo
   `destaque_home`), exibidas com o **progresso individual** do maker logado — não há
   missão personalizada por maker no v1.
6. ~~XP por ação e curva de níveis (individual e do lab) — pendente em `gamification.md`.~~
   **Decidido (2026-08-23):** 1 XP por ação, 5 XP por nível, nível máximo 10, curtidas não
   geram XP — ver [gamification.md](../gamification.md).
7. ~~Visitante deslogado vê progresso de missões e pode curtir?~~
   **Decidido (PO, 2026-08-24):** **vê as missões** (elas são públicas), mas **sem % pessoal**
   — barra em 0% com convite ao login; **não pode curtir** — o coração abre o convite de
   cadastro/login (sem curtida anônima). Ler, assistir aulas e baixar modelos 3D seguem
   **abertos** — ver [concept.md](../concept.md) e [gamification.md](../gamification.md).
8. ~~Peso/entrega do mapa pixel art em mobile (imagem única vs. tiles vs. fallback).~~
   **Decidido (2026-08-23):** mobile usa **arte nova dedicada** produzida pela designer — não
   há recorte automático nem fallback para o v1. (A otimização técnica do arquivo entregue
   segue como tarefa de implementação.)
9. ~~Estilo canônico do `ButtonPrimary`: navy com contorno rosa (v1) ou rosa preenchido com
   texto navy (v2)?~~ **Decidido (2026-08-23):** rosa preenchido, texto navy, sombra dura
   deslocada (estilo v2); a variante v1 foi descartada.
10. ~~**Nova (mockup `home-mobile.png`):** o **botão de menu** aparece **à direita** do
    header na arte mobile — a rodada 3 decidiu "extremidade **esquerda**". A arte é mais
    recente que a resposta: qual posição vale?~~
    **Decidido (rodada 5, 2026-08-24):** vale a arte — o botão de menu das versões
    compactas fica no **topo, à DIREITA** da barra, com o **logo do Fab Lab à esquerda**;
    a resposta da rodada 3 ("extremidade esquerda") está **superada**.
11. ~~**Nova (mockup `home-mobile.png`):** a **barra inferior** decidida (5 posições) **não
    aparece na arte** — ela sobrepõe o hero (fixa), surge ao rolar, ou foi só omitida do
    desenho?~~
    **Decidido (rodada 5, 2026-08-24):** foi apenas **omitida da arte** — a barra inferior
    **existe** e **aparece ao rolar** a página (não fica fixa sobre o hero desde o
    primeiro paint).
12. ~~**Nova (mockup `home-mobile.png`):** o header mobile da arte **não tem avatar/
    `UserChip`** — como o estado logado aparece no mobile (só via `PERFIL` da barra
    inferior)?~~
    **Decidido (rodada 5, 2026-08-24):** o **avatar do usuário logado entra bem pequeno no
    header mobile**, além do item `PERFIL` da barra inferior.
