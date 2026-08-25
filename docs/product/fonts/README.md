# Fontes da identidade

Status das três fontes da identidade visual (ver `../visual-identity.md`):

| Fonte | Arquivo no repositório | Licença | Uso |
|---|---|---|---|
| **Comfortaa** | `Comfortaa-VariableFont_wght.ttf` + `OFL.txt` | [SIL OFL 1.1](OFL.txt) — redistribuição permitida com a licença junto | Corpo de texto |
| **Aldo the Apache** (AJ Paglia) | **não redistribuída aqui** | Listada como "100% Free" no [dafont](https://www.dafont.com/aldo-the-apache.font); sem arquivo de licença do autor | Logo, títulos |
| **SquareFont** (Bou Fonts, 2011) | **não redistribuída aqui** | Listada como "100% Free" no [dafont](https://www.dafont.com/squarefont.font); sem arquivo de licença do autor | Logotipo, títulos |

## Por que Aldo the Apache e SquareFont não estão no repositório

As duas fontes são gratuitas para uso (categoria **"100% Free"** no dafont, com uso
comercial reportado pelos agregadores), mas os autores **não publicam um texto de
licença** — logo, o direito de **redistribuição** num repositório público não está
documentado. A postura adotada (2026-08-25, resolução da ISS-001):

- **Usar no site: sim** — o build converte para WOFF2 e o site serve as fontes
  (uso amparado pela listagem "100% Free").
- **Redistribuir os TTFs neste repositório público: não** — os arquivos foram removidos
  (inclusive do histórico do git).

## Como obter os arquivos (setup local)

1. Baixe **Aldo the Apache**: <https://www.dafont.com/aldo-the-apache.font>
2. Baixe **SquareFont**: <https://www.dafont.com/squarefont.font>
3. Coloque `AldotheApache.ttf` e `Square.ttf` nesta pasta (estão no `.gitignore`).

*(Melhoria futura: permissão por escrito dos autores — AJ Paglia via
[ajpaglia.com](https://ajpaglia.com), Bou Fonts via dafont — permitiria versionar os
arquivos; alternativa: substituir por similares OFL, decisão com a designer.)*
