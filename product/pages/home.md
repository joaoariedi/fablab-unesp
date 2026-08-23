# Home

## Propósito

Porta de entrada do site do Fab Lab CITe Bauru. Apresenta o lab ao visitante, converte em
cadastro ("COMECE A CRIAR") e, para o maker logado, funciona como painel gamificado:
missões em destaque, nível coletivo do lab, ranking e últimos projetos.

## Fonte de design

- `design/ChatGPT Image 18 de ago. de 2026, 11_19_16.png` — **metade esquerda** (home
  dashboard, hero v1). A metade direita é a tela de criação de conta e pertence a
  `pages/onboarding.md`.
- `design/ChatGPT Image 18 de ago. de 2026, 12_43_11.png` — hero v2, mapa isométrico
  pixel art noturno do lab em tela cheia.
- Apoio: `concept.md`, `visual-identity.md`, `gamification.md`.

## Estrutura da página — desktop (≥1280px)

### Header (fundo navy; fixação no topo ao rolar **(proposta)**)

- Logo-chip extrudado à esquerda, sempre com letras navy: no v1 chip laranja e cubo isométrico
  **entre** as palavras ("FAB [cubo] LAB / CITE BAURU"); no v2 chip rosa e cubo (aresta teal)
  **à esquerda** de "FAB LAB / CITE BAURU".
- Navegação em caps display:
  - **Canônica (decidido 2026-08-23):** `BIBLIOTECA 3D` · `PROJETOS` · `CALENDÁRIO` · `AULAS` ·
    `INSTAGRAM` · `ARTIGOS`, nesta ordem e com todos os itens **alinhados** (o `AULAS` torto
    em alguns mockups é ruído de render).
  - Registro histórico dos mockups: o v1 (dashboard) mostrava apenas
    `BIBLIOTECA 3D` · `PROJETOS` · `INSTAGRAM` · `ARTIGOS`; o v2 (mapa) já trazia o conjunto
    completo, agora adotado como canônico.
- À direita: avatar pixel em moldura + `MAKER_X` / `NÍVEL 3` + chevron `⌄` (abre o menu da
  conta **(proposta)** — o mockup mostra apenas o chevron).

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
  reciclagem, portão rosa, poste.
- Placas: letreiro "FAB LAB CITE BAURU" no muro, marca no piso "FAB LAB CITE BAURU" com cubo,
  e placa tríplice `CRIAR` / `EXPERIMENTAR` / `TRANSFORMAR`.
- Marca-d'água isométrica rosa/teal no canto superior direito.
- **(proposta)** As estações são hotspots clicáveis → página da estação/skill correspondente.

> **(proposta)** As seções de painel a seguir (`MISSÕES EM DESTAQUE`, `NÍVEL DO LAB`,
> `RANKING MAKERS`, `ÚLTIMOS PROJETOS`) permanecem **abaixo do hero v2**, na mesma página.
> A decisão da designer de 2026-08-23 tratou apenas do hero; esta é uma **interpretação a
> validar** no layout completo da Home.

### Seção "MISSÕES EM DESTAQUE"

- Cabeçalho da seção à esquerda; link à direita: `VER TODAS ›`.
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
**adiados (2026-08-23)** e a recompensa coletiva substituta está em aberto (gamification.md,
questão 8).

**Card `RANKING MAKERS`** — lista top-5 com posição em dois dígitos, avatar pixel, @handle e XP:
`01 @laser.nick 2450 XP` · `02 @print.lu 2130 XP` · `03 @maker_jv 1890 XP` ·
`04 @bia.tech 1750 XP` · `05 @projeto_ana 1420 XP`; link rodapé `VER RANKING COMPLETO`.
Os valores de XP são **ilustrativos do mockup**; a economia real está em
[gamification.md](../gamification.md).

**Card `ÚLTIMOS PROJETOS`** — imagem de capa (luminária iluminada), título
`Luminária Paramétrica`, autoria `por @laser.nick`, curtidas `♡ 32`; link rodapé
`VER MAIS PROPLETOS` (**typo no mockup** — decidido em 2026-08-23: o site usa
`VER MAIS PROJETOS`). **Decidido (2026-08-23):** o card é um **carrossel** de vários
projetos; o mockup mostra apenas um slide.

### Footer institucional (navy)

Três pilares com ícones outline, em linha: `APRENDA FAZENDO` · `COMPARTILHE CONHECIMENTO` ·
`DESENVOLVA PROJETOS REAIS`; separadores verticais entre os pilares e composição de slabs
isométricos rosa/azul no canto direito. A faixa do rodapé usa um navy mais claro que o fundo
da página.

## Adaptação tablet (768–1279px)

Todas as decisões abaixo são **(proposta)** — o mockup só cobre desktop.

- Header: logo + nav reduzida a `BIBLIOTECA 3D`, `PROJETOS`, `ARTIGOS`; demais itens
  (`CALENDÁRIO`, `AULAS`, `INSTAGRAM`) em menu "⋯ MAIS"; avatar mantém nome e nível.
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

Todas as decisões abaixo são **(proposta)**.

- Header: logo-chip + avatar; navegação colapsa em **menu hambúrguer** que abre drawer
  full-screen com os itens em lista display; `INSTAGRAM` marcado como link externo.
- Hero (v2, oficial) — **decidido (2026-08-23):** mobile recebe **arte nova dedicada**
  produzida pela designer (não é recorte automático do mapa desktop nem fallback para o v1).
  Sobre ela: título display reduzido (mantendo as 3 linhas), parágrafo e botão
  `COMECE A CRIAR →` em largura total. A otimização técnica de peso do arquivo entregue é
  tarefa de implementação (ver questão 8, já decidida).
- ~~Hero v1: título display reduzido (mantendo as 3 linhas), parágrafo, botão
  `COMECE A CRIAR →` em largura total; composição isométrica como ornamento de fundo recortado.~~
  ~~Hero v2: substituir o mapa panorâmico por recorte vertical (crop 3:4) ou fallback estático
  do v1 se o peso da imagem exceder o orçamento de performance.~~
  **Decidido (2026-08-23):** superado pela arte mobile dedicada; mantido como registro.
- Missões: 3 → 1 coluna; opção de carrossel horizontal com snap e indicadores de página.
- Cards `NÍVEL DO LAB` / `RANKING MAKERS` / `ÚLTIMOS PROJETOS`: empilhados em 1 coluna,
  nesta ordem; ranking mostra top-3 com "Ver ranking completo" expandindo os demais.
- Footer: pilares empilhados em 1 coluna, ícone à esquerda do texto.
- Barra de navegação inferior fixa **(proposta, alternativa ao hambúrguer)**: Home, Projetos,
  Biblioteca 3D, Perfil.

## Componentes

| Componente | Uso na Home | Observações |
|---|---|---|
| `HeaderNav` | topo | logo-chip, itens caps na ordem canônica `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS` (decidido 2026-08-23, todos alinhados), `UserChip` (avatar + nome + nível + chevron) |
| ~~`HeroBanner` (v1)~~ | ~~faixa teal~~ | **descartado (2026-08-23)** — registro do mockup v1 |
| `HeroPixelMap` | hero oficial, tela cheia | cena pixel art + hotspots **(proposta)**; arte mobile dedicada da designer |
| `ButtonPrimary` | `COMECE A CRIAR →` | estilo único: **rosa preenchido, texto navy, sombra dura deslocada** (decidido 2026-08-23). O estilo navy com contorno rosa existiu no mockup v1 e foi **descartado** |
| `SectionHeader` | `MISSÕES EM DESTAQUE` + `VER TODAS ›` | título caps + link à direita |
| `MissionCard` | 3 cards | ícone, título, descrição, `ProgressBar` com % |
| `LabLevelCard` | `NÍVEL DO LAB` | cubo, nível, barra, `X / Y XP`, próxima recompensa |
| `RankingList` | `RANKING MAKERS` | linhas posição/avatar/@handle/XP + link rodapé |
| `LatestProjectCard` | `ÚLTIMOS PROJETOS` | capa, título, `por @autor`, `♡ n`, link rodapé |
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
| destaque_home | booleano | sim | controla os 3 cards da seção |
| ordem_destaque | inteiro | não | — |
| anexo_comprovacao | arquivo (JPG, PNG, PDF, STL, 3MF, ZIP) | não **(proposta)** | envio do maker |
| progresso_percentual | inteiro (derivado, não editável no CMS) | sim | por maker → `Maker` (exibido como `50%` / `30%` / `0%`) **(proposta)** |

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
| handle | texto (`@nome`) | sim | único |
| nome_exibicao | texto curto | sim | exibido no `UserChip` (ex.: `MAKER_X`) |
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
`proxima_recompensa_titulo` (texto, sim — ex.: `Novo Acabamento de Avatar`) ·
`proxima_recompensa_icone` (imagem SVG/PNG, sim).

### `HomeSettings` (singleton) **(proposta)**
~~`variante_hero` (enum: `dashboard` | `mapa_pixel`)~~ — **removido/obsoleto (2026-08-23):**
o hero v2 é o único, não há variante a escolher · `hero_titulo` · `hero_texto` ·
`hero_cta_label` / `hero_cta_url` · `mapa_imagem` (PNG/WEBP) ·
`mapa_imagem_mobile` (PNG/WEBP — arte dedicada da designer) ·
`pilares` (repetível: `titulo`, `icone` SVG/PNG).

## Ganchos de gamificação

- **Exibe XP individual** no `UserChip` (`MAKER_X` / `NÍVEL 3`) e no ranking (`2450 XP`) —
  números **ilustrativos do mockup**; economia real em [gamification.md](../gamification.md).
- **Exibe XP coletivo** no card `NÍVEL DO LAB` (`NÍVEL 07`, `1250 / 2000 XP`) —
  números **ilustrativos do mockup**. ~~Recompensa cosmética coletiva ao subir de nível
  (`Novo Acabamento de Avatar`).~~ **Decidido (2026-08-23):** os cosméticos de recompensa
  foram **adiados** (só itens fixos de avatar por enquanto); a recompensa coletiva
  alternativa segue **em aberto** — ver [gamification.md](../gamification.md).
- **Missões**: barra de progresso por missão (`50%`, `30%`, `0%`); concluir concede
  **1 XP** na skill correspondente (decidido 2026-08-23 — ver
  [gamification.md](../gamification.md)); `VER TODAS ›` leva ao catálogo de missões
  **(proposta)**.
- **Skills**: a Home não edita skills, apenas as referencia via ícone/categoria das missões.
- **Curtidas**: contador `♡ 32` no card de projeto; **curtidas não geram XP** (decidido
  2026-08-23 — ver [gamification.md](../gamification.md)); curtir a partir da Home exige login
  **(proposta)**; o clique no coração é otimista com rollback em erro **(proposta)**.
- **Não concede XP por visitar a Home** — a página é vitrine e painel. **Decidido
  (2026-08-23):** só pontuam as ações da lista de economia (assistir aula, publicar projeto,
  publicar modelo 3D, publicar artigo, concluir missão); as demais não pontuam.

## Estados e interações

- **Hover/focus**: itens de nav ganham sublinhado rosa; cards elevam a sombra dura em 2px;
  botão primário desloca-se para a sombra; foco visível com outline amarelo `#F8C810` de 2px
  em todos os elementos interativos **(proposta, acessibilidade)**.
- **Deslogado**: `UserChip` é substituído por botões `ENTRAR` e `CRIAR CONTA` **(proposta)**;
  as missões aparecem sem progresso pessoal (0% ou rótulo "Faça login para participar")
  **(proposta)**; CTA do hero permanece `COMECE A CRIAR →` apontando ao onboarding.
- **Logado**: `UserChip` com avatar, `MAKER_X`, `NÍVEL 3` e menu no chevron (Perfil, Meus
  projetos, Sair) **(proposta)**; missões mostram o progresso real do maker; CTA do hero muda
  para `CONTINUAR CRIANDO` **(proposta)**.
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
   **Decidido (2026-08-23):** navegação canônica em todas as páginas —
   `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`, itens alinhados.
3. ~~O typo `VER MAIS PROPLETOS` deve ser corrigido para `VER MAIS PROJETOS` — confirmar.~~
   **Decidido (2026-08-23):** é typo do mockup; usar `VER MAIS PROJETOS`.
4. ~~O card `ÚLTIMOS PROJETOS` mostra 1 projeto ou é carrossel de vários?~~
   **Decidido (2026-08-23):** é carrossel de vários projetos.
5. Missões na Home são globais ou personalizadas por maker (progresso individual)?
6. ~~XP por ação e curva de níveis (individual e do lab) — pendente em `gamification.md`.~~
   **Decidido (2026-08-23):** 1 XP por ação, 5 XP por nível, nível máximo 10, curtidas não
   geram XP — ver [gamification.md](../gamification.md).
7. Visitante deslogado vê progresso de missões e pode curtir?
8. ~~Peso/entrega do mapa pixel art em mobile (imagem única vs. tiles vs. fallback).~~
   **Decidido (2026-08-23):** mobile usa **arte nova dedicada** produzida pela designer — não
   há recorte automático nem fallback para o v1. (A otimização técnica do arquivo entregue
   segue como tarefa de implementação.)
9. ~~Estilo canônico do `ButtonPrimary`: navy com contorno rosa (v1) ou rosa preenchido com
   texto navy (v2)?~~ **Decidido (2026-08-23):** rosa preenchido, texto navy, sombra dura
   deslocada (estilo v2); a variante v1 foi descartada.
