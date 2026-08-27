# Fontes da identidade

Status das três fontes da identidade visual (ver `../visual-identity.md`).
Termos de terceiros: [`THIRD-PARTY-NOTICE.md`](THIRD-PARTY-NOTICE.md).

| Fonte | No repositório | Licença | Uso |
|---|---|---|---|
| **Comfortaa** | ✅ `Comfortaa-VariableFont_wght.ttf` + `OFL.txt` | [SIL OFL 1.1](OFL.txt) — redistribuição permitida com a licença junto | Corpo de texto |
| **Aldo the Apache** (AJ Paglia) | ✅ `AldotheApache.ttf` | "100% Free" no [dafont](https://www.dafont.com/aldo-the-apache.font); **sem texto de licença do autor** e **sem restrição declarada** em nenhum lugar — risco aceito e documentado no [aviso](THIRD-PARTY-NOTICE.md) | Logo, títulos |
| **SquareFont** (Bou Fonts, 2011) | ❌ **não redistribuída** | dafont diz "100% Free", mas os metadados da própria fonte dizem `© Bou Fonts. 2011. All Rights Reserved` | Logotipo, títulos |

## Por que SquareFont continua fora (revisado 2026-08-27)

A decisão de 2026-08-25 mantinha **as duas** fontes fora do repositório por não haver texto
de licença. Ao revisar, procuramos nos três lugares que o próprio dafont indica — e os
resultados foram **diferentes para cada fonte**:

- **Aldo the Apache:** o arquivo baixado traz **só o `.ttf`** (sem readme), o site do autor
  estava **fora do ar**, e os metadados embutidos **não declaram restrição alguma** — nem
  copyright, nem licença. Nada proíbe; a única indicação publicada é permissiva.
- **SquareFont:** os metadados embutidos afirmam **`All Rights Reserved`**. É provavelmente
  o texto padrão do FontCreator que o autor não editou, mas é a **única declaração autoral
  existente** — e ela diz o contrário de "livre".

Daí a assimetria: Aldo entra com aviso de terceiros; SquareFont fica fora até haver
confirmação do autor.

> **O rótulo do dafont não é uma licença.** O FAQ do próprio site avisa: *"The licence
> mentioned above the download button is just an indication. Please look at the readme-files
> in the archives or check the indicated author's website for details, and contact him/her if
> in doubt."*

## Como obter SquareFont (setup local)

1. Baixe: <https://www.dafont.com/squarefont.font>
2. Coloque `Square.ttf` (e, se quiser a variante vazada, `Squareo.ttf`) nesta pasta — ambos
   estão no `.gitignore`.
3. Sem esses arquivos o build **funciona**: a tipografia cai no fallback declarado
   (display → sans condensada). Essa é a condição normal do CI, que não tem como obtê-los.

*(Caminho definitivo: permissão por escrito — AJ Paglia via [ajpaglia.com](https://ajpaglia.com),
Bou Fonts via dafont — trocaria toda a inferência acima por um documento e permitiria
versionar a SquareFont também. Alternativa: substituir por similar OFL, decisão com a
designer.)*
