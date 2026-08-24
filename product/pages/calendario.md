# Calendário

## Propósito

Reunir em um só lugar a **agenda de atividades do Fab Lab CITe Bauru** — oficinas, aulas
presenciais, mutirões, manutenções de máquina, prazos de missão e eventos abertos —
respondendo "o que acontece no lab, quando, onde e com quais máquinas". A página conecta a
agenda ao resto do sistema: cada evento pode exigir inscrição, apontar para uma **missão**,
uma **skill** e uma **máquina**, e é o candidato natural para conceder **XP por presença**
(check-in), questão 4 em aberto do `gamification.md`.

> **A página inteira é (proposta).** Não existe mockup dedicado a Calendário; ela aparece
> apenas como item de navegação `CALENDÁRIO` no mockup do mapa isométrico da home e como
> linha "Calendário (calendário com atividades do fab lab)" na `ESTRUTURA SITE.docx`.
>
> **Decidido (2026-08-23):** a *existência da seção no menu* deixou de ser proposta —
> `CALENDÁRIO` está **confirmado** na navegação canônica de todas as páginas, na ordem
> `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS` (desktop; nas
> versões compactas vale a barra decidida nas rodadas 2–3, com a **ordem corrigida na
> rodada 3** — ver Adaptação tablet/mobile). O que
> segue como proposta é apenas o **conteúdo/layout** desta página, ainda sem mockup dedicado.

## Fonte de design

- `ESTRUTURA SITE.docx` — única fonte textual: item de menu "Calendário" e descrição
  "calendário com atividades do fab lab".
- `design/ChatGPT Image 18 de ago. de 2026, 12_43_11.png` — mockup da home v2 (mapa
  isométrico pixel art), **única imagem** onde `CALENDÁRIO` aparece no header; dela vêm o
  rótulo de navegação e o padrão de header (o footer **não** aparece nessa imagem).
  **Decidido (2026-08-23):** esse header v2 é o canônico **quanto à navegação** — o
  `CALENDÁRIO` aparecer só nele não é divergência entre mockups, e sim a versão oficial da
  navegação. **Rodada 2 (2026-08-23):** o **logo-chip** desse mockup (rosa) **não** é o
  canônico — vale o chip **laranja** (ver Header).
- Padrões visuais herdados (hero teal, lista de cards escuros, chips de filtro, busca, footer
  de pilares): `visual-identity.md` e os mockups descritos em `pages/aulas.md`,
  `pages/projetos.md`.
- Regras de XP, skills, missões e curtidas: `gamification.md`.

## Estrutura da página — desktop (≥1280px)

Toda a estrutura abaixo é **(proposta)**, derivada dos padrões das demais telas.

> **Decidido (rodada 2, 2026-08-23):** o fundo desta página **permanece navy** `#191C37` —
> a exceção de fundo branco vale só para Biblioteca 3D e Aulas.

### Header (faixa navy no topo)

- Logo-chip extrudado à esquerda — no mockup do mapa (v2) o chip é **rosa**, com o cubo
  isométrico **à esquerda** de `FAB LAB` / `CITE BAURU` (no v1 o chip é laranja e o cubo fica
  entre as palavras; ver `pages/home.md`).
  - **Decidido (rodada 2, 2026-08-23):** o chip canônico do header é a versão **laranja**,
    com o cubo isométrico **entre** `FAB` e `LAB` (como em `design/avatar-create.png`). O
    chip rosa do mockup do mapa fica como **registro de mockup**, não é o header oficial.
  - **Decidido (rodada 3, 2026-08-23):** tocar no **logo leva à Home** (deixa de ser
    proposta) — vale em todos os tamanhos de tela.
- Navegação canônica em caps display (v2 do mockup do mapa) — **confirmada pela designer em
  2026-08-23**, nesta ordem e com todos os itens **alinhados**:
  `BIBLIOTECA 3D` · `PROJETOS` · `CALENDÁRIO` · `AULAS` · `INSTAGRAM` · `ARTIGOS`
  - Item ativo `CALENDÁRIO` em **rosa** com sublinhado curto.
  - O `AULAS` torto/desalinhado em alguns mockups é **ruído de render**, não intenção de
    design.
- À direita: avatar pixel + `MAKER_X` / `NÍVEL 3` + chevron `⌄`.

### Hero (faixa teal `#74B7A5`)

- Grid isométrico wireframe branco sutil ao fundo.
- Título display navy: `CALENDÁRIO`.
- Parágrafo navy: `Veja o que vai rolar no lab e garanta seu lugar nas próximas atividades.`
- Chevrons duplos `»` rosa/navy como ornamento.
- Composição isométrica à direita: cubo navy com arestas rosa + estrela amarela de 4 pontas.

### Barra de controle (sobre navy)

- Título de seção à esquerda: `AGENDA DO LAB`.
- **Alternador de visualização** (chips display em caps, ativo em rosa sublinhado):
  `MÊS` · `LISTA`.
- **Navegação de período**: setas `‹` / `›`, rótulo do mês em caps (`AGOSTO 2026`) e botão
  outline `HOJE`.
- **Filtros por tipo de evento** (chips coloridos, multisseleção): `TODOS` · `OFICINA` ·
  `AULA PRESENCIAL` · `MUTIRÃO` · `MANUTENÇÃO` · `EVENTO ABERTO` · `PRAZO DE MISSÃO`.
- **Filtro por máquina/estação**: select `Todas as máquinas` — Impressoras 3D, Corte a Laser,
  Serigrafia, Bordado Digital, Cowork.
- **Busca**: input arredondado navy, borda rosa, lupa, placeholder `Buscar atividades...`.
- Link discreto à direita: `ASSINAR AGENDA (.ICS)`.

### Visão MÊS (padrão)

- Grade 7 × 5–6 células, cabeçalho de colunas em caps abreviado:
  `SEG` `TER` `QUA` `QUI` `SEX` `SÁB` `DOM`.
- Célula: número do dia no canto superior esquerdo; dias fora do mês em opacidade reduzida;
  **dia de hoje** com contorno rosa; dia selecionado com preenchimento navy claro.
- Dentro da célula, até **3 pílulas de evento** (cor do tipo + hora + título truncado), e
  `+ N mais` quando exceder — abre o painel lateral do dia.
- **Painel lateral do dia** (drawer à direita, 380px): data por extenso
  (`SÁBADO, 22 DE AGOSTO`) e a lista completa de `CardEvento` daquele dia.

### Visão LISTA

- Eventos agrupados por dia, em ordem cronológica ascendente, com cabeçalho de dia
  (`22 SÁB · AGOSTO`) fixo ao rolar.
- `CardEvento` horizontal (contorno fino claro, cantos arredondados, fundo navy):
  1. **Bloco de data** à esquerda: dia grande + mês em caps + faixa de horário `14:00–17:00`.
  2. **Chip de tipo** colorido: `OFICINA`, `MUTIRÃO`, etc.
  3. **Título** display claro em caps (ex.: `OFICINA DE CORTE A LASER`).
  4. **Descrição** em até 2 linhas.
  5. **Metadados** em linha, com ícones outline: 📍 local (`Fab Lab CITe — Sala 2`),
     🖨 máquinas envolvidas (`Corte a Laser`), 👤 responsável (avatar pixel + `@handle` +
     `NÍVEL n`), 👥 vagas (`12/20 vagas`), ⏱ duração (`3 h`).
  6. **Missão relacionada**: chip amarelo com ícone de missão (`DESAFIO CORTE LASER`).
  7. **Ações à direita**: botão primário `INSCREVER-SE` no **estilo canônico decidido em
     2026-08-23** — rosa preenchido, texto navy, sombra dura deslocada (a variante navy com
     contorno rosa foi descartada) — ou outline `INSCRITO ✓`, ou desabilitado `LOTADO`; e
     coração ♥ com contador de interesse.
- **Paginação**: `CARREGAR MAIS` centralizado ao fim da lista.

### Detalhe do evento

Rota `/calendario/<slug>` **(proposta)**; abre como página própria (e como modal quando
acionado a partir da grade).

- Cabeçalho: chip de tipo, título display, data/hora por extenso, local, status
  (`INSCRIÇÕES ABERTAS` · `LOTADO` · `ENCERRADO` · `CANCELADO`).
- Corpo: capa, descrição longa (rich text), `O QUE VOCÊ VAI FAZER`, `PRÉ-REQUISITOS`
  (aulas/skills), `O QUE LEVAR`, `MÁQUINAS ENVOLVIDAS`.
- Barra lateral: card de inscrição (vagas, prazo, `INSCREVER-SE` no estilo primário
  canônico), XP previsto (ex.: `+80 XP em Corte a Laser`), missão relacionada,
  `ADICIONAR AO MEU CALENDÁRIO (.ICS)`, `COMPARTILHAR`.
  - **Decidido (2026-08-23):** a economia de XP é **1 XP por ação**, 5 XP por nível, teto
    de nível 10. O exemplo `+80 XP` é ilustrativo e está **superado**; se o check-in vier a
    conceder XP (questão 1 abaixo, ainda em aberto), o rótulo seria `+1 XP em Corte a
    Laser`.
- Rodapé: `MATERIAIS DE APOIO` (downloads), `QUEM VAI` (avatares dos inscritos) e, após o
  evento, `REGISTRO DA ATIVIDADE` com fotos e projetos gerados. Para a equipe do lab, bloco
  `CHECK-IN` com QR code e lista de presença.

### Footer (faixa navy mais clara)

- Três pilares com ícone outline: `APRENDA` / `FAZENDO` · `COMPARTILHE` / `CONHECIMENTO` ·
  `DESENVOLVA` / `PROJETOS REAIS` + composição isométrica no canto.

## Adaptação tablet (768–1279px)

Todas **(proposta)**.

- **Header**: ~~nav colapsa em hambúrguer quando os 6 itens não couberem~~; bloco de conta
  reduz a avatar + `NÍVEL 3`.
  - **Decidido (rodada 2, 2026-08-23):** a barra do tablet mostra 4 itens, com
    `CALENDÁRIO` ativo em rosa. `BIBLIOTECA 3D` e `INSTAGRAM` **saem da barra**.
    ~~Ordem `PROJETOS · AULAS · CALENDÁRIO · ARTIGOS`; a ordem compacta inverte
    Aulas/Calendário em relação à desktop — é a resposta literal da designer e fica
    assim.~~ **Superado na rodada 3.**
  - **Decidido (rodada 3, 2026-08-23):** a ordem segue a do desktop ("mantenha a ordem das
    abas da página inicial") — barra do tablet:
    `PROJETOS` · `CALENDÁRIO` · `AULAS` · `ARTIGOS`. `BIBLIOTECA 3D` e `INSTAGRAM` ficam
    **dentro do menu**, cujo botão fica **no topo, na extremidade esquerda da barra**, e
    que contém **todas as abas** (a Biblioteca 3D fica **só no menu**, sem atalho extra).
    Home pelo logo (decidido).
  - Logo-chip **laranja** canônico (ver Header desktop).
- **Hero**: composição isométrica reduz ~40%; parágrafo em 2 linhas.
- **Barra de controle**: quebra em duas linhas — linha 1: `MÊS`/`LISTA` + navegação de mês +
  `HOJE`; linha 2: chips de tipo em faixa **rolável horizontalmente** + busca a ~50%.
- **Visão MÊS**: grade 7 colunas mantida, células mais baixas com no máximo **2 pílulas** e
  `+ N mais`; painel do dia vira **drawer sobreposto** (não empurra a grade).
- **Visão LISTA**: 1 coluna; bloco de data à esquerda mantido; ações migram para a linha
  inferior do card, alinhadas à direita.
- **Detalhe**: barra lateral desce para **abaixo** do corpo; card de inscrição vira barra
  fixa no rodapé da viewport. Alvos de toque mínimos de 44×44px em setas, chips e botões.

## Adaptação mobile (<768px)

Todas **(proposta)**.

- **Header**: logo-chip **laranja** + avatar; navegação em **barra inferior fixa**.
  ~~(Home · Biblioteca · Projetos · Calendário · Perfil), item ativo em rosa;
  `Artigos`/`Instagram`/`Aulas` em drawer "Mais".~~
  - **Decidido (rodada 2, 2026-08-23):** a barra inferior tem 5 posições, com `CALENDÁRIO`
    ativo em rosa. `BIBLIOTECA 3D` e `INSTAGRAM` **saem da barra**.
    ~~Ordem `PROJETOS · AULAS · CALENDÁRIO · ARTIGOS · PERFIL`.~~ **Superado na rodada 3.**
  - **Decidido (rodada 3, 2026-08-23):** a ordem segue a do desktop — barra inferior:
    `PROJETOS` · `CALENDÁRIO` · `AULAS` · `ARTIGOS` · `PERFIL`. `BIBLIOTECA 3D` e
    `INSTAGRAM` ficam **dentro do menu**, com botão **no topo, na extremidade esquerda da
    barra**, contendo **todas as abas** (Biblioteca 3D só no menu). Home pelo logo
    (decidido). **`PERFIL` deslogado abre a tela de login.**
- **Hero**: composição isométrica omitida; título menor; parágrafo em até 4 linhas.
- **Visão padrão**: **`LISTA`** passa a ser a visão inicial (grade mensal é pouco legível em
  390px); `MÊS` fica disponível como faixa compacta de **7 dias roláveis** (strip semanal)
  com ponto colorido indicando dias com evento.
- **Filtros**: chips de tipo em faixa rolável horizontal; filtro de máquina e busca dentro de
  um **bottom sheet** `FILTROS` com contador de filtros ativos.
- **Card de evento**: empilhado — chip de tipo + data/hora no topo, título, descrição
  (2 linhas), metadados em duas linhas com ícones, botão `INSCREVER-SE` em largura total.
- **Detalhe**: página inteira rolável; capa 16:9; barra fixa inferior com `INSCREVER-SE` e
  XP previsto.
- **Alvos de toque**: mínimo 44×44px, espaçamento vertical mínimo de 8px; `CARREGAR MAIS` em
  largura total (alternativa: scroll infinito por mês).

## Componentes

| Componente | Descrição | Reuso |
|---|---|---|
| `HeaderPrincipal` | Logo-chip **laranja** (canônico, decidido rodada 2) com **logo → Home** (rodada 3), nav em caps na ordem desktop `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`; compacta (ordem corrigida na rodada 3) — tablet `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS`, mobile em barra inferior de 5 posições `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS · PERFIL` (`PERFIL` deslogado → login), com `BIBLIOTECA 3D` e `INSTAGRAM` **no menu** (botão no topo, à esquerda, com todas as abas); bloco de conta | Todas as páginas |
| `HeroSecao` | Faixa teal, título display, parágrafo, chevrons, composição isométrica | Todas as seções |
| `AlternadorVisao` **(proposta)** | Chips `MÊS` / `LISTA` | Exclusivo |
| `NavegadorMes` **(proposta)** | `‹` `AGOSTO 2026` `›` + `HOJE` | Exclusivo |
| `ChipsFiltroTipo` | Chips coloridos multisseleção de tipo de evento | Projetos, Biblioteca 3D |
| `CampoBusca` | Input navy, borda rosa, lupa, `Buscar atividades...` | Todas as listagens |
| `GradeMes` **(proposta)** | Grade 7×N com `PilulaEvento` e `+ N mais` | Exclusivo |
| `PilulaEvento` **(proposta)** | Hora + título truncado, cor por tipo | Exclusivo |
| `CardEvento` **(proposta)** | Data, tipo, título, descrição, metadados, missão, ações | Exclusivo (reuso previsto em bloco "próximos eventos" na Home, que ainda não existe) |
| `PainelDia` **(proposta)** | Drawer com eventos do dia selecionado | Exclusivo |
| `BotaoInscricao` **(proposta)** | `INSCREVER-SE` no primário canônico (rosa preenchido, texto navy, sombra dura deslocada — decidido 2026-08-23) / outline `INSCRITO ✓` / `LOTADO` | Missões |
| `ChipMissao` **(proposta)** | Chip amarelo com ícone de missão | Home, Projetos |
| `AutorInline` | Avatar pixel + `@handle` + `NÍVEL n` | Aulas, Projetos, Artigos |
| `BotaoCurtida` | Coração outline rosa + contador | Todas as listagens |
| `CheckinQR` **(proposta)** | QR code do evento + lista de presença (equipe do lab) | Exclusivo |
| `FooterPilares` | Três pilares + composição isométrica | Todas as páginas |

## Modelo de conteúdo (CMS)

### Coleção `evento` **(proposta)**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `titulo` | texto curto | sim | exibido em caps |
| `slug` | slug | sim | derivado do título |
| `tipo` | enum | sim | oficina · aula presencial · mutirão · manutenção · evento aberto · prazo de missão |
| `descricao_curta` | texto (≤140 car.) | sim | 2 linhas no card |
| `descricao_longa` | rich text | não | página de detalhe |
| `o_que_vai_fazer` | rich text / lista | não | bloco `O QUE VOCÊ VAI FAZER` no detalhe |
| `o_que_levar` | rich text / lista | não | bloco `O QUE LEVAR` no detalhe |
| `capa` | imagem | não | `.jpg` `.png` `.webp` `.svg`; 16:9 |
| `inicio_em` | data-hora | sim | com fuso `America/Sao_Paulo` |
| `fim_em` | data-hora | sim | deriva a duração exibida |
| `dia_inteiro` / `recorrencia` | booleano / texto (RRULE) | não | oculta o horário; eventos semanais/mensais |
| `local` | relação → `local` | sim | sala/estação do lab ou externo |
| `maquinas` | relação múltipla → `maquina` | não | Impressoras 3D, Corte a Laser, Serigrafia, Bordado Digital |
| `responsavel` | relação → `usuario` | sim | avatar, `@handle`, `NÍVEL n` |
| `skill` | relação → `skill` | não | destino do XP |
| `missao_relacionada` | relação → `missao` | não | chip amarelo no card |
| `aulas_prerequisito` | relação múltipla → `aula` | não | pré-requisitos |
| `vagas_total` | inteiro | não | vazio = sem limite; alimenta `12/20 vagas` |
| `inscricao_obrigatoria` / `prazo_inscricao` | booleano / data-hora | sim / não | controlam `BotaoInscricao` |
| `xp_presenca` | inteiro | não | XP concedido no check-in |
| `materiais` | lista de arquivos | não | `.pdf` `.zip` `.stl` `.3mf` `.obj` `.gltf` `.glb` `.svg` `.dxf` |
| `galeria_pos_evento` | lista de imagens | não | `.jpg` `.png` `.webp` |
| `projetos_gerados` | relação múltipla → `projeto` | não | registro da atividade |
| `status` | enum | sim | rascunho · publicado · cancelado · concluído. Os rótulos `INSCRIÇÕES ABERTAS` · `LOTADO` · `ENCERRADO` são **derivados** de `prazo_inscricao`, `vagas_total` e `fim_em`; só `CANCELADO` vem deste campo |
| `publico_alvo` | enum | não | aberto ao público · somente makers · equipe |

### Coleções relacionadas **(proposta)**

- `local` — `nome` (`Fab Lab CITe — Sala 2`), `descricao`, `mapa` (`.png` `.svg`), `capacidade`.
- `maquina` — `nome`, `estacao`, `icone` (`.svg`), `skill` relacionada, `manutencao_ate`.
- `inscricao` — `usuario` × `evento` (única por par), `status` (inscrito · lista de espera ·
  cancelado), `inscrito_em`.
- `presenca` — `usuario` × `evento`, `checkin_em`, `metodo` (QR code · manual pela equipe),
  `xp_creditado` (booleano, anti-farm).
- `curtida` — `usuario` × `evento`, alimenta o contador de interesse.

## Ganchos de gamificação

Todos **(proposta)**, alinhados ao `gamification.md`.

- **XP por presença** — check-in no evento credita `xp_presenca` na `skill` do evento.
  Responde à questão 4 em aberto do `gamification.md` ("XP por atividades presenciais
  (check-in via calendário? QR code no lab?)"), que **segue em aberto**. **(proposta)** Se
  aprovado, o valor é **1 XP**, pela economia decidida em 2026-08-23 (1 XP por ação); o
  exemplo `+80 XP` acima é ilustrativo e está superado. Regra anti-farm: um crédito por par
  `usuario`×`evento`, validado por `presenca.xp_creditado`.
- **Skills** — o XP evolui a barra segmentada em pips da skill correspondente; Serigrafia e
  Bordado Digital aparecem como tipo de evento antes de virarem skills.
- **Níveis** — nível do responsável no card; nível do usuário no header (`MAKER_X` /
  `NÍVEL 3`); XP de presença soma ao **Nível do Lab** coletivo.
- **Missões** — evento com `missao_relacionada` mostra chip amarelo e participar avança a
  barra de progresso; eventos `PRAZO DE MISSÃO` marcam o fim da janela.
- **Curtidas** — ♥ com contador funciona como "tenho interesse" e ordena os destaques na home.
- **Recompensas** — ~~sequência de presenças (ex.: 4 atividades no mês) desbloqueia item
  cosmético de avatar.~~ **Decidido (2026-08-23):** os cosméticos de recompensa foram
  **adiados** (só itens fixos de avatar por enquanto); qual recompensa substitui o item
  cosmético segue **em aberto** — ver [gamification.md](../gamification.md).
- **Exibição** — XP previsto aparece **antes** da participação; toast `+1 XP em Corte a
  Laser` após o check-in confirmado (**decidido 2026-08-23:** 1 XP por ação; o `+80 XP` dos
  exemplos anteriores é ilustrativo).

## Estados e interações

Todos **(proposta)**.

- **Hover/focus**: célula do dia realça o fundo; pílula de evento ganha contorno rosa e
  tooltip com título completo, horário e local; `CardEvento` eleva-se e o título vira rosa;
  `INSCREVER-SE` (já rosa preenchido pelo primário canônico) aprofunda a sombra dura
  deslocada. Foco de teclado com anel visível de
  2px; grade navegável por setas do teclado (`↑↓←→` entre dias, `Enter` abre o painel do dia).
- **Loading**: skeleton da grade (35 células cinza com 2 barras) ou 5 `CardEvento` esqueleto;
  troca de mês mantém a grade anterior esmaecida com spinner, sem saltar o scroll.
- **Vazio**: mês sem eventos → "Nenhuma atividade programada para AGOSTO 2026." +
  `VER PRÓXIMO MÊS`; filtro sem resultado → "Nenhuma atividade com esses filtros." +
  `LIMPAR FILTROS`; agenda inteira vazia → convite `SUGERIR UMA ATIVIDADE`.
- **Erro**: "Não foi possível carregar a agenda." + `TENTAR NOVAMENTE`; falha de inscrição →
  toast "Não foi possível concluir sua inscrição.", botão volta ao estado anterior.
- **Deslogado**: agenda, filtros, busca e detalhe visíveis (conteúdo público indexável);
  `INSCREVER-SE` e ♥ abrem modal "Crie sua conta para participar e ganhar XP" com CTA
  `COMECE A CRIAR`; XP previsto exibido como convite; `.ICS` continua disponível. No
  mobile, o item `PERFIL` da barra inferior **abre a tela de login** (decidido na
  rodada 3).
- **Logado**: botões refletem o estado real (`INSCRITO ✓`, `LISTA DE ESPERA`, `LOTADO`);
  filtro extra `MINHAS INSCRIÇÕES`; badge de presença nos eventos já frequentados; lembrete
  de evento próximo no topo da página.
- **Equipe do lab**: ações inline de editar/cancelar evento, abrir `CHECK-IN` com QR code e
  marcar presença manualmente; evento `CANCELADO` aparece tachado com aviso a todos.

## Questões em aberto

1. Check-in presencial concede XP? E por QR code no lab, código do responsável ou
   confirmação manual? (Questão 4 do `gamification.md` — **segue em aberto**.)
   **(proposta)** O *quanto* já não é mais dúvida: pela economia decidida em 2026-08-23
   (1 XP por ação), se aprovado o check-in valeria **1 XP**.
2. Inscrição é obrigatória para todos os eventos ou só para os de vaga limitada? Há lista de
   espera e política de no-show?
3. Visão inicial no desktop é `MÊS` ou `LISTA`? A `ESTRUTURA SITE.docx` diz apenas
   "calendário".
4. Os tipos de evento propostos são os corretos? Faltam categorias (visita escolar,
   residência, feira)?
5. O calendário integra com Google Calendar / feed `.ics` público, ou é fechado no site?
6. Quem cria eventos — apenas a equipe do lab, ou makers podem propor atividades?
7. Reserva de máquina (agendar a impressora para uso individual) entra nesta página ou é um
   módulo separado?
8. Eventos passados ficam acessíveis como arquivo com galeria/registro, ou somem da agenda?
9. Há eventos externos/online (link de transmissão) além dos presenciais?
10. ~~`CALENDÁRIO` é confirmado na navegação canônica de todas as páginas? (Divergência
    registrada em `concept.md`.)~~
    **Decidido (2026-08-23):** sim — `CALENDÁRIO` está confirmado na navegação canônica de
    **todas** as páginas, na ordem oficial `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS ·
    INSTAGRAM · ARTIGOS`, com todos os itens alinhados. Não há mais divergência entre
    mockups: o header v2 é o canônico.
