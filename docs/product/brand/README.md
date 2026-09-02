# Fab Lab CITe Bauru — tokens da identidade visual

Extraídos das pranchas "FabLab Proposta de identidade visual 2 e 3" que estão neste
projeto (`../design/identidade-visual-2.jpg` e `-3.jpg`). Servem como fonte única para o
site, o README do repositório e peças gráficas. Canon complementar:
[`../visual-identity.md`](../visual-identity.md).

## Paleta

| Token     | Hex       | Uso |
|-----------|-----------|-----|
| `navy`    | `#191C37` | Cor institucional, fundos escuros, contornos, tipografia sobre claro |
| `blue`    | `#3760AA` | Acento primário |
| `green`   | `#74B7A5` | Acento |
| `yellow`  | `#F8C810` | Acento / destaque |
| `orange`  | `#EE703E` | Acento |
| `pink`    | `#EE9DC4` | Acento / CTA nos mockups do site |
| `light`   | `#DCE7E3` | Fundo claro das pranchas; texto sobre fundo escuro |

## Tipografia

- **Aldo the Apache** — logo, **logotipo**, títulos e subtítulos.
- ~~**Square Font** — logotipo; pode ser usada em títulos e subtítulos.~~ **Removida em
  2026-08-27** (decisão da designer): a Aldo the Apache assume o logotipo. Ver
  [`../visual-identity.md`](../visual-identity.md) § Tipografia.
- **Comfortaa** — corpo de texto (disponível no Google Fonts e no pacote Debian
  `fonts-comfortaa`).

São **duas** fontes. Ambas versionadas em [`../fonts/`](../fonts/).

## Elementos gráficos

Cubo sólido, cubo vazado (wireframe), pirâmide sólida e vazada, laje/plataforma
isométrica, círculo, brilho de 4 pontas e a forma impossível em "F". Projeção isométrica
clássica (eixos a 30°), contorno em `navy`, preenchimento chapado.

## Header do GitHub (repositório do site)

Gerados em 25/08/2026:

- `fablab-github-social-1280x640.png/.svg` — social preview do repositório
  (Settings → General → Social preview). **Nota:** o GitHub **esconde essa seção em
  repositórios privados** que nunca tiveram preview — ela só aparece (e o preview só é
  servido) quando o repositório for **público**; fazer o upload do PNG nesse momento.
- `fablab-github-banner-1280x320.svg` + PNG @2x (`fablab-github-banner-2560x640.png`) —
  topo do README.

Composição: fundo `navy` com malha isométrica, logotipo vetorizado a partir da prancha de
identidade (traçado com potrace, não depende da fonte instalada), plataforma isométrica
com os sólidos da marca nas cinco cores da paleta, barra de paleta e assinatura em
Comfortaa (subset embutido em base64 nos SVGs, então renderizam igual em qualquer
máquina).
