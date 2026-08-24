# Backlog — pendências fora do fluxo de features

Itens que não pertencem a nenhuma feature em andamento, mas não podem ser esquecidos.
Um item por seção, com ID sequencial; ao resolver, registrar a data e mover para o final
(seção "Resolvidos").

## ISS-001 — Licenças das fontes Aldo the Apache e SquareFont

- **Status:** EM ESPERA (2026-08-24 — decisão do product owner: não cobrar a designer
  por ora; o lembrete sai das próximas rodadas de perguntas).
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

## Resolvidos

*(vazio)*
