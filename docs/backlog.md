# Backlog — pendências fora do fluxo de features

Itens que não pertencem a nenhuma feature em andamento, mas não podem ser esquecidos.
Um item por seção, com ID sequencial; ao resolver, registrar a data e mover para o final
(seção "Resolvidos").

## ISS-001 — Licenças das fontes Aldo the Apache e SquareFont

- **Status:** RESOLVIDA (2026-08-25) — ver seção Resolvidos.
- **O quê:** os arquivos `product/fonts/AldotheApache.ttf` (AJ Paglia) e
  `product/fonts/Square.ttf` (© Bou Fonts 2011) vieram **sem arquivo de licença**;
  fontes desses acervos costumam ser "free for personal use". Comfortaa é OFL — ok.
- **Por que importa:** publicar webfonts sem licença confirmada em site institucional da
  UNESP é risco jurídico; a tipografia display é parte central da identidade.
- **Gate:** resolver **antes do lançamento público**. NÃO bloqueia a feature 001 nem o
  desenvolvimento (usar os arquivos em dev, com fallbacks definidos).
- **Como resolver:** confirmar a licença com a designer/autores (dafont/site do autor) ou
  obter autorização por escrito.
- **Plano B:** substituir por fontes OFL visualmente próximas (display quadrada/condensada
  do Google Fonts) — decisão com a designer se a licença não se confirmar.

## ISS-002 — Redigir Termos de Uso e Política de Privacidade

- **Status:** ABERTO (2026-08-24 — rodada 5: a designer pediu o checkbox de aceite no
  formulário do cadastro com "termos básicos normalmente usados nesses casos").
- **O quê:** redigir termos de uso + política de privacidade básicos, cobrindo LGPD:
  dados coletados no cadastro (nome, data de nascimento, e-mail, vínculo, escolaridade,
  curso), finalidade, direitos do titular, exclusão/anonimização (ver correção nº 7 de
  `tech-stack.md`).
- **Gate:** antes do lançamento; o checkbox de aceite entra na **feature 004** junto com
  o formulário.
- **Nota:** recomendável **validação jurídica institucional (UNESP)** — site
  institucional tratando dados de alunos; um texto "básico" não dispensa revisão.

## Resolvidos

- **ISS-001 (2026-08-25, revisada em 2026-08-27):** pesquisa confirmou as duas fontes como
  **"100% Free"** no dafont, porém **sem texto de licença dos autores** — uso no site
  liberado, redistribuição evitada; TTFs removidos do repo e do histórico ao abrir o
  código (MIT); Comfortaa (OFL) permanece com a licença.
  **Revisão (2026-08-27, decisão do PO):** ao verificar os três lugares que o próprio
  dafont indica, as duas fontes se separaram. O **arquivo baixado não traz readme** em
  nenhuma delas e o **site do autor da Aldo estava fora do ar**, mas os **metadados
  embutidos** divergem: a Aldo **não declara restrição alguma**, enquanto a SquareFont diz
  `© Bou Fonts. 2011. All Rights Reserved`. Também ficou registrado que o rótulo do dafont
  é, pelo FAQ do próprio site, **"just an indication"** — não é licença.
  **Resultado:** `AldotheApache.ttf` passa a ser versionado com
  [`product/fonts/THIRD-PARTY-NOTICE.md`](product/fonts/THIRD-PARTY-NOTICE.md), que declara
  o risco aceito e que o MIT do repositório **não** cobre a fonte; a **SquareFont continua
  fora**. Permissão por escrito dos autores segue como o caminho definitivo.
