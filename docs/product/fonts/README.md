# Fontes da identidade

Status das fontes da identidade visual (ver `../visual-identity.md`).
Termos de terceiros: [`THIRD-PARTY-NOTICE.md`](THIRD-PARTY-NOTICE.md).

| Fonte | No repositório | Licença | Uso |
|---|---|---|---|
| **Comfortaa** | ✅ `Comfortaa-VariableFont_wght.ttf` + `OFL.txt` | [SIL OFL 1.1](OFL.txt) — redistribuição permitida com a licença junto | Corpo de texto |
| **Aldo the Apache** (AJ Paglia) | ✅ `AldotheApache.ttf` | "100% Free" no [dafont](https://www.dafont.com/aldo-the-apache.font); **sem texto de licença do autor** e **sem restrição declarada** em nenhum lugar — risco aceito e documentado no [aviso](THIRD-PARTY-NOTICE.md) | Logo, logotipo, títulos |

**São duas fontes, não três.** Toda a tipografia do produto está versionada aqui.

## SquareFont saiu do projeto (decisão da designer, 2026-08-27)

A SquareFont (Bou Fonts, 2011) desenhava o logotipo "CITE BAURU" na prancha original. A
designer decidiu **substituí-la pela Aldo the Apache**, que já cobria o logo e os títulos.

Isso encerra a pendência de licenciamento **na origem, e não por contorno**: a única fonte
cujos metadados diziam `© Bou Fonts. 2011. All Rights Reserved` simplesmente **não é mais
usada**. Não há mais fonte fora do repositório, nem passo de setup local, nem caminho de
build que dependa de arquivo ausente — e o CI passa a renderizar exatamente a mesma
tipografia que a produção.

> Registro da investigação que levou até aqui (2026-08-27): o rótulo do dafont **não é
> licença** — o FAQ do próprio site avisa que *"the licence mentioned above the download
> button is just an indication"*. Verificados os três lugares que o dafont indica, as duas
> fontes se separaram: o arquivo da Aldo não traz readme, o site do autor estava fora do ar
> e os metadados **não declaram restrição alguma**; os da SquareFont declaravam
> `All Rights Reserved`. Era essa assimetria que mantinha a SquareFont fora. A decisão da
> designer torna a assimetria irrelevante.

## `Square.ttf` continua no `.gitignore` — de propósito

As entradas de `.gitignore` para `Square.ttf` e `Squareo.ttf` **não foram removidas**, e o
motivo mudou de sinal: antes elas organizavam um setup local; agora elas evitam um commit
acidental de um binário `All Rights Reserved` em repositório público MIT — sem que ninguém
tenha qualquer razão para querer esse arquivo.

O risco é concreto: a versão anterior deste README **mandava** colocar `Square.ttf` nesta
pasta. Quem seguiu aquela instrução ainda tem o arquivo na árvore de trabalho. Pode apagá-lo.
