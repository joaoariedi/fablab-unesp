# Identidade Visual — Fab Lab CITe Bauru

> Transposição da proposta da designer (`design/FabLab - Proposta de identidade visual-2.jpg`
> e `-3.jpg`) e dos padrões observados nos mockups de tela (`design/ChatGPT Image *.png`),
> atualizada com as **decisões da designer de 2026-08-23**.

## Paleta de cores

| Cor | Hex | Uso observado nos mockups |
|---|---|---|
| Navy (base) | `#191C37` | Fundo da UI, cards escuros, texto sobre claros, logo monocromático |
| Azul | `#3760AA` | Chips de logo, elementos gráficos, links/ícones |
| Verde-teal | `#74B7A5` | Fundo dos heros das páginas, detalhes de progresso |
| Amarelo | `#F8C810` | Destaques, XP/recompensas, ícones de missão, numeração |
| Laranja | `#EE703E` | Chip do logo no header, categorias, elementos isométricos |
| Rosa | `#EE9DC4` | CTAs primários, tags de categoria, títulos de card, acentos |

> **Decidido (2026-08-23):** os hexes da identidade oficial acima são os **tokens web
> definitivos**. As divergências de tom nos renders dos mockups (ex.: teal do hero
> aparecendo ~`#478E90`) são artefato de render e devem ser ignoradas.

**Fundos de página (decidido 2026-08-23):** base navy `#191C37` no site em geral;
**Biblioteca 3D e Aulas usam fundo branco** na área de conteúdo — texto em navy; o
tratamento exato de sidebar/faixa teal nessas páginas será detalhado com a designer na
feature de design system **(proposta)**.

Pares de contraste recorrentes: texto navy sobre teal/claro; texto claro sobre navy; rosa e
amarelo como acento sobre navy. Validar contraste WCAG AA nos tokens (especialmente rosa
sobre navy em texto pequeno e os textos sobre o fundo branco das páginas claras).

## Tipografia

| Fonte | Papel definido na prancha |
|---|---|
| **Aldo the Apache** | Logo e logotipo; pode ser usada em títulos e subtítulos |
| **Square Font** | Logotipo ("CITE BAURU"); pode ser usada em títulos e subtítulos |
| **Comfortaa** | Corpo de texto |

Notas para web (atualizado 2026-08-23):
- **Aldo the Apache** — confirmada; a designer possui o arquivo da fonte.
- **"Square Font"** — confirmada; o arquivo será enviado pela designer
  **(pendente de recebimento — guardar em `product/fonts/` quando chegar)**.
- **Comfortaa** — confirmada para corpo (disponível no Google Fonts).
- Definir fallbacks: display → sans condensada; corpo → `system-ui, sans-serif`.
- Conferir a licença web dos arquivos quando recebidos.

## Logo

- Logotipo "FAB ◆ LAB / CITE BAURU" com cubo isométrico entre as palavras.
- Versões em **chip retangular extrudado** (sombra 3D hachurada) sobre cada cor da paleta:
  azul, verde, amarelo, laranja, rosa e claro/outline.
- Versão monocromática navy para fundos claros.
- No header do site o chip aparece inclinado/extrudado (laranja ou rosa nos mockups).

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
  **oficial** e substitui a faixa teal (v1); para mobile a designer produzirá **arte
  dedicada**.
- **Base escura**: páginas internas sobre navy `#191C37` com faixa hero teal `#74B7A5`
  (título display + composição isométrica F + cubo) — **exceto Biblioteca 3D e Aulas,
  com fundo branco** (decidido 2026-08-23).
- **Cards** com contorno fino claro/colorido, cantos levemente arredondados, título em
  display rosa/claro, corpo em Comfortaa; tag de categoria em chip rosa; rodapé do card com
  avatar pixel (mesmo rosto do boneco em miniatura) + @handle + nível + curtidas (♥) + ação.
- **Botões (decidido 2026-08-23)**: primário canônico = **rosa preenchido, texto navy,
  sombra dura deslocada** (estilo do hero v2); a variante navy com contorno rosa do mockup
  v1 foi **descartada**. Secundário: outline claro sobre navy; sobre fundo branco, outline
  navy **(proposta)**.
- **Barras de progresso**: pips das skills representam **10 níveis** (decidido; o mockup
  mostra 6 segmentos — superado); contínuas com % para missões e XP.
- **Chips/tabs de filtro**: texto display em caps, item ativo sublinhado/rosa.
- **Busca**: input arredondado com ícone de lupa (escuro sobre navy; claro nas páginas de
  fundo branco **(proposta)**).
- **Navegação (decidido 2026-08-23)**: itens do menu nesta ordem — `BIBLIOTECA 3D ·
  PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS` — todos **alinhados**; o item
  `AULAS` torto em alguns mockups é ruído de render, não intenção de design.
- **Footer institucional**: três pilares com ícones outline (Aprenda fazendo / Compartilhe
  conhecimento / Desenvolva projetos reais) + composição isométrica no canto.
- **Pixel art**: avatares dos usuários em pixel art isométrico com **4 direções**; o hero
  da home é o mapa do lab em pixel art noturno (contêineres-estações, personagens, jardim).

## Tom de voz

PT-BR, imperativo e convidativo, frases curtas em caps para display
("CRIE. EXPERIMENTE. TRANSFORME."), microcopy amigável e gamificada
("Seu personagem maker, do seu jeito!", "Você poderá evoluir todas com o tempo!").
