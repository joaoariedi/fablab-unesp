# Identidade Visual — Fab Lab CITe Bauru

> Transposição da proposta da designer (`design/identidade-visual-2.jpg` e
> `design/identidade-visual-3.jpg`) e dos padrões observados nos mockups de tela em
> `design/` (arquivos nomeados pela página que representam), atualizada com as
> **decisões da designer de 2026-08-23**.

## Paleta de cores

| Cor | Hex | Uso observado nos mockups |
|---|---|---|
| Navy (base) | `#191C37` | Fundo da UI, cards escuros, texto sobre claros, logo monocromático |
| Azul | `#3760AA` | Chips de logo, elementos gráficos, links/ícones |
| Verde-teal | `#74B7A5` | Fundo dos heros das páginas, detalhes de progresso |
| Amarelo | `#F8C810` | Destaques, XP/recompensas, ícones de missão, numeração |
| Laranja | `#EE703E` | Chip do logo no header, categorias, elementos isométricos |
| Rosa | `#EE9DC4` | CTAs primários, tags de categoria, títulos de card, acentos |
| Claro (`light`) | `#DCE7E3` | Fundo claro das pranchas; texto sobre fundo escuro (token extraído em 2026-08-25) |

> Nomes de token e assets de marca (banner/social do GitHub, gerados em 2026-08-25):
> [`brand/README.md`](brand/README.md).
>
> **Decidido (2026-08-23):** os hexes da identidade oficial acima são os **tokens web
> definitivos**. As divergências de tom nos renders dos mockups (ex.: teal do hero
> aparecendo ~`#478E90`) são artefato de render e devem ser ignoradas.

**Fundos de página (decidido 2026-08-23):** base navy `#191C37` no site em geral;
**Biblioteca 3D e Aulas usam fundo branco** na área de conteúdo — texto em navy. As telas
do **onboarding** também usam fundo claro (token exato **(proposta)**): a criação de avatar
(passo 1, dois mockups) e o **passo 2 — dados pessoais**, conforme `design/criar-conta-passo-2.jpg`
(2026-08-24).
A **Minha Conta** também usa fundo claro, conforme `design/minha-conta.jpg` (2026-08-24).
**Rodada 2 (decidido):** a **faixa/sidebar teal permanece** nessas páginas, e seus itens
funcionam como **tags de tema que filtram o conteúdo**; sobre o fundo branco os **cards
são brancos com contorno azul navy escuro e sombra**, e as **thumbnails dos modelos 3D
mantêm o fundo navy** dentro do card.

Pares de contraste recorrentes: texto navy sobre teal/claro; texto claro sobre navy; rosa e
amarelo como acento sobre navy. **Rodada 2 (decidido):** sobre **fundo branco, os textos
usam azul navy escuro** (não usar rosa em texto pequeno sobre branco) — resolve o risco
WCAG das páginas claras. Validar contraste WCAG AA restante (rosa sobre navy em texto
pequeno).

## Tipografia

| Fonte | Papel definido na prancha |
|---|---|
| **Aldo the Apache** | Logo, **logotipo ("CITE BAURU")**, títulos e subtítulos |
| ~~**Square Font**~~ | ~~Logotipo ("CITE BAURU"); pode ser usada em títulos e subtítulos~~ — **removida na rodada 7** |
| **Comfortaa** | Corpo de texto |

**Rodada 7 (decidido pela designer, 2026-08-27): a Square Font sai; a Aldo the Apache
assume o logotipo.** A prancha original usava duas fontes display para o lockup — Aldo em
`FAB ◆ LAB` e Square em `CITE BAURU`. Passa a ser **uma só**. A tipografia do produto fica
com **duas fontes no total**, ambas versionadas no repositório.

> **Ponto em aberto para a designer:** com as duas linhas do lockup na mesma fonte, a
> diferenciação entre `FAB ◆ LAB` e `CITE BAURU` passa a depender só de tamanho, peso e
> tracking. Definir esses valores ao revisar o `LogoChip` — a decisão da rodada 7 não os
> especifica.

Notas para web (arquivos **recebidos em 2026-08-23**, em `fonts/`):

- **Aldo the Apache** (`AldotheApache.ttf`) — Regular, de AJ Paglia. Versionada, com
  [`THIRD-PARTY-NOTICE.md`](fonts/THIRD-PARTY-NOTICE.md).
- **Comfortaa** (`Comfortaa-VariableFont_wght.ttf`) — variável (Light–Bold), licença OFL
  (Google Fonts) — uso web liberado.
- Na implementação: converter para WOFF2, `font-display: swap`, e definir fallbacks
  (display → sans condensada; corpo → `system-ui, sans-serif`).
- **Licenças:** ~~confirmação em espera (ISS-001)~~ **encerrada em 2026-08-27**. Comfortaa
  é OFL; a Aldo vai versionada com aviso de terceiros; a Square Font — a única com
  `All Rights Reserved` nos metadados — **deixou de ser usada**, o que resolve a pendência
  na origem em vez de contorná-la. Ver [backlog.md](../backlog.md) § ISS-001.

## Logo

- Logotipo "FAB ◆ LAB / CITE BAURU" com cubo isométrico entre as palavras.
- Versões em **chip retangular extrudado** (sombra 3D hachurada) sobre cada cor da paleta:
  azul, verde, amarelo, laranja, rosa e claro/outline.
- Versão monocromática navy para fundos claros.
- **Chip canônico do header (decidido na rodada 2):** a versão **laranja**, com o cubo
  isométrico entre `FAB` e `LAB` (como em `design/criar-conta-passo-1.png`). A variante rosa do
  mockup do mapa fica como registro; as demais cores do chip seguem valendo para
  pôsteres/materiais.

## Elementos gráficos (shapes)

Vocabulário isométrico da prancha, usado como ornamento e ícone:

- Cubo isométrico **preenchido** e **wireframe**
- Plataforma/base isométrica (slab)
- Pirâmides/tetraedros (outline e preenchido)
- Círculos (preenchido e outline)
- Estrelas/sparkles de 4 pontas
- Letra **F isométrica extrudada** (multicolorida no hero) e formas em L
- Setas/chevrons duplos "»" (rosa/teal) como marcador de direção
- Linhas de grid isométrico ao fundo (wireframe sutil sobre teal ou navy)

## Direção de arte da UI (padrões dos mockups + decisões)

- **Hero da home (decidido 2026-08-23):** o mapa isométrico em pixel art (v2) é o hero
  **oficial** e substitui a faixa teal (v1); a **arte mobile dedicada foi entregue**
  (`design/home-mobile.png`, 2026-08-24) — recomposição vertical com texto e CTA abaixo
  da cena.
- **Base escura**: páginas internas sobre navy `#191C37` com faixa hero teal `#74B7A5`
  (título display + composição isométrica F + cubo) — **exceto Biblioteca 3D e Aulas,
  com fundo branco** (decidido 2026-08-23).
- **Cards** com contorno fino claro/colorido, cantos levemente arredondados, título em
  display rosa/claro, corpo em Comfortaa; tag de categoria em chip rosa; rodapé do card com
  avatar pixel (mesmo rosto do boneco em miniatura) + @handle + nível + curtidas (♥) + ação.
- **Botões (decidido 2026-08-23)**: primário canônico = **rosa preenchido, texto navy,
  sombra dura deslocada** (estilo do hero v2); a variante navy com contorno rosa do mockup
  v1 foi **descartada**. Secundário: outline claro sobre navy; sobre fundo branco, outline
  navy **(proposta)**. **Rodada 5 (2026-08-24):** botões de **formulário** (criar conta,
  login) também usam o **rosa canônico** — o navy preenchido do mockup do passo 2 fica
  como registro superado.
- **Barras de progresso**: pips das skills representam **10 níveis** (decidido; o mockup
  mostra 6 segmentos — superado); contínuas com % para missões e XP.
- **Chips/tabs de filtro**: texto display em caps, item ativo sublinhado/rosa. Chips de
  **status** (ex.: `Público` na Minha Conta): **teal `#74B7A5`** da paleta — **rodada 5:**
  o verde saturado fora da paleta do mockup foi trocado pelo teal.
- **Busca**: input arredondado com ícone de lupa (escuro sobre navy; claro nas páginas de
  fundo branco **(proposta)**).
- **Navegação (decidido 2026-08-23)**: itens do menu **desktop** nesta ordem —
  `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS` — todos
  **alinhados**; o item `AULAS` torto em alguns mockups é ruído de render. O mockup
  `design/criar-conta-passo-1.png` já renderiza essa navegação canônica alinhada.
- **Navegação compacta (rodadas 2–3)**: `BIBLIOTECA 3D` e `INSTAGRAM` **saem da barra**
  em tablet e mobile. **Ordem corrigida na rodada 3** ("mantenha a ordem das abas da
  página inicial" — segue a ordem relativa do desktop): barra do **tablet**
  `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS`; barra inferior do **mobile** (5 posições)
  `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS · PERFIL`.
- **Menu (rodadas 3–5)**: botão de menu no **topo, à direita** da barra, com o **logo à
  esquerda** — **decidido na rodada 5 (2026-08-24)**, superando a "extremidade esquerda"
  da rodada 3 e confirmando a arte `design/home-mobile.png`. Contém **todas as abas**
  (inclusive Biblioteca 3D e Instagram — a Biblioteca fica **só no menu**, sem atalho
  extra). Tocar no **logo leva à Home**. `PERFIL` deslogado **abre a tela de login**
  (login por **e-mail + senha**, rodada 4); logado, abre **Minha Conta** *(ver
  `pages/minha-conta.md`)*. **Decidido (rodada 4, 2026-08-24):** o botão de menu existe
  **só nas versões compactas** (tablet/mobile) — no desktop as 6 abas ficam na barra, sem
  botão de menu. **Rodada 5:** no mobile, a **barra inferior aparece ao rolar a página**
  (a arte da home apenas a omitiu) e o **avatar do usuário entra bem pequeno no header**
  quando logado.
- **Footer institucional**: três pilares com ícones outline (Aprenda fazendo / Compartilhe
  conhecimento / Desenvolva projetos reais) + composição isométrica no canto.
- **Pixel art**: avatares dos usuários em pixel art isométrico com **4 direções**; o hero
  da home é o mapa do lab em pixel art noturno (contêineres-estações, personagens, jardim).

## Tom de voz

PT-BR, imperativo e convidativo, frases curtas em caps para display
("CRIE. EXPERIMENTE. TRANSFORME."), microcopy amigável e gamificada
("Personalize seu personagem maker do seu jeito!", "Você poderá evoluir todas com o
tempo!", "As opções podem ser combinadas livremente. Solte sua criatividade!").
