# Calendário

## Propósito

Reunir em um só lugar a **agenda de atividades do Fab Lab CITe Bauru** — oficinas, aulas
presenciais, mutirões, manutenções de máquina, prazos de missão e eventos abertos —
respondendo "o que acontece no lab, quando, onde e com quais máquinas". A página conecta a
agenda ao resto do sistema: cada evento pode exigir inscrição, apontar para uma **missão**,
uma **skill** e uma **máquina**, e ~~é o candidato natural para conceder **XP por presença**
(check-in), questão 4 em aberto do `gamification.md`~~.
**Decidido (PO, 2026-08-24):** o **check-in presencial fica fora do v1** — o calendário
**não concede XP** (questão 4 do `gamification.md`, encerrada). Os campos `xp_presenca` e a
coleção `presenca` ficam **reservados** no modelo de conteúdo, marcados como fora do
escopo v1, para revisitar com o jogo rodando.
**Decidido (PO, 2026-08-24) — acesso aberto:** a agenda, o detalhe do evento e o `.ics` são
**públicos**; conta é para publicar, curtir e pontuar.

> **A página inteira é (proposta).** Não existe mockup dedicado a Calendário; ela aparece
> apenas como item de navegação `CALENDÁRIO` no mockup do mapa isométrico da home e como
> linha "Calendário (calendário com atividades do fab lab)" no documento de estrutura
> original (docx removido em 2026-08-24; transcrição em `concept.md`).
>
> **Decidido (2026-08-23):** a *existência da seção no menu* deixou de ser proposta —
> `CALENDÁRIO` está **confirmado** na navegação canônica de todas as páginas, na ordem
> `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS` (desktop; nas
> versões compactas vale a barra decidida nas rodadas 2–3, com a **ordem corrigida na
> rodada 3** — ver Adaptação tablet/mobile). O que
> segue como proposta é apenas o **conteúdo/layout** desta página, ainda sem mockup dedicado.

## Fonte de design

- Documento de estrutura original (docx removido; transcrito em `concept.md`) — única fonte
  textual: item de menu "Calendário" e descrição "calendário com atividades do fab lab".
- `design/home-desktop.png` — mockup da home v2 (mapa
  isométrico pixel art), **única imagem** onde `CALENDÁRIO` aparece no header; dela vêm o
  rótulo de navegação e o padrão de header (o footer **não** aparece nessa imagem).
  **Decidido (2026-08-23):** esse header v2 é o canônico **quanto à navegação** — o
  `CALENDÁRIO` aparecer só nele não é divergência entre mockups, e sim a versão oficial da
  navegação. ~~**Rodada 2 (2026-08-23):** o **logo-chip** desse mockup (rosa) **não** é o
  canônico — vale o chip **laranja** (ver Header).~~ **Arte corrigida (2026-08-26):** o
  mockup passou a trazer o **chip laranja canônico**; a ressalva não se aplica mais.
- Padrões visuais herdados (hero teal, lista de cards escuros, chips de filtro, busca, footer
  de pilares): `visual-identity.md` e os mockups descritos em `pages/aulas.md`,
  `pages/projetos.md`.
- Regras de XP, skills, missões e curtidas: `gamification.md`.

## Estrutura da página — desktop (≥1280px)

Toda a estrutura abaixo é **(proposta)**, derivada dos padrões das demais telas.

> **Decidido (rodada 2, 2026-08-23):** o fundo desta página **permanece navy** `#191C37` —
> a exceção de fundo branco vale só para Biblioteca 3D e Aulas.

### Header (faixa navy no topo)

- Logo-chip extrudado **laranja** à esquerda, com o cubo isométrico **entre** `FAB` e `LAB`
  (`FAB ● LAB` / `CITE BAURU`), com hachura de sombra 3D.
  - **Decidido (rodada 2, 2026-08-23):** o chip canônico do header é a versão **laranja**,
    com o cubo isométrico **entre** `FAB` e `LAB` (como em `design/criar-conta-passo-1.png`).
  - **Arte corrigida (2026-08-26):** ~~no mockup do mapa (v2) o chip é **rosa**, com o cubo
    isométrico **à esquerda** de `FAB LAB` / `CITE BAURU`~~ — a designer reentregou
    `design/home-desktop.png` com o chip canônico, então o mockup e a decisão da rodada 2
    **passaram a concordar**.
  - **Decidido (rodada 3, 2026-08-23):** tocar no **logo leva à Home** (deixa de ser
    proposta) — vale em todos os tamanhos de tela.
- Navegação canônica em caps display (v2 do mockup do mapa) — **confirmada pela designer em
  2026-08-23**, nesta ordem e com todos os itens **alinhados**:
  `BIBLIOTECA 3D` · `PROJETOS` · `CALENDÁRIO` · `AULAS` · `INSTAGRAM` · `ARTIGOS`
  - Item ativo `CALENDÁRIO` em **rosa** com sublinhado curto.
  - O `AULAS` torto/desalinhado em alguns mockups é **ruído de render**, não intenção de
    design.
  - **Decidido (rodada 4, 2026-08-24):** no **desktop não há botão de menu** — as 6 abas
    ficam na barra. O botão de menu existe **só nas versões compactas** (tablet/mobile),
    o que **supera** qualquer menção a botão de menu no header desktop.
- À direita: avatar pixel + `MAKER_X` / `NÍVEL 3` + chevron `⌄`.
  - **Decidido (rodada 4, 2026-08-24):** o rótulo exibido é o **nome da pessoa** e o
    identificador segue o modelo **`@nomesobrenome`** (derivado do nome, ex.:
    `@mariasilva`), com limite de **60 caracteres** para o nome. O `MAKER_X` do mockup é
    **registro superado**. Normalização (acentos/espaços) e colisão de homônimos seguem
    **(proposta)**.
  - **Decidido (rodada 4, 2026-08-24):** o bloco de conta leva a **Minha Conta**
    (`pages/minha-conta.md`) quando logado; deslogado, abre a tela de **login por e-mail +
    senha** (design da tela de login definido — ver `login.md`).

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
     - **Decidido (rodada 4, 2026-08-24):** o responsável aparece pelo **nome da pessoa**,
       com identificador no modelo **`@nomesobrenome`**. Os handles fictícios dos mockups
       (`@laser.nick`, `@print.lu`, `@maker_jv`) são **ilustrativos/superados**.
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
  canônico), ~~XP previsto (ex.: `+80 XP em Corte a Laser`)~~, missão relacionada,
  `ADICIONAR AO MEU CALENDÁRIO (.ICS)`, `COMPARTILHAR`.
  - **Decidido (2026-08-23):** a economia de XP é **1 XP por ação**, 5 XP por nível, teto
    de nível 10. O exemplo `+80 XP` é ilustrativo e está **superado**.
  - **Decidido (PO, 2026-08-24):** sem check-in no v1, **não há XP previsto** — o bloco de
    XP previsto **não aparece** na barra lateral do v1 (registro de mockup/proposta
    anterior; volta quando o check-in for aprovado).
- Rodapé: `MATERIAIS DE APOIO` (downloads), `QUEM VAI` (avatares dos inscritos) e, após o
  evento, `REGISTRO DA ATIVIDADE` com fotos e projetos gerados. Para a equipe do lab, bloco
  `CHECK-IN` com QR code e lista de presença — **fora do escopo v1 (PO, 2026-08-24)**,
  registrado aqui para a versão futura.

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
    **dentro do menu**, cujo botão fica ~~no topo, na extremidade esquerda da barra~~
    (**superado na rodada 5** — ver abaixo), e
    que contém **todas as abas** (a Biblioteca 3D fica **só no menu**, sem atalho extra).
    Home pelo logo (decidido).
  - **Decidido (rodada 4, 2026-08-24):** esse botão de menu existe **só nas versões
    compactas** (tablet/mobile) — confirma a interpretação anterior. ~~*Observação de design
    para o mockup futuro:* logo e botão de menu disputam a **extremidade esquerda**; o
    arranjo exato (logo à esquerda + menu ao lado, ou menu à esquerda + logo centralizado)
    fica para o mockup das versões compactas.~~ **Superado na rodada 5** — não há conflito
    posicional: logo à esquerda, botão de menu à direita.
  - **Decidido (rodada 5, 2026-08-24):** o botão de menu fica **no topo, à direita** da
    barra, com o **logo-chip laranja à esquerda** — supera a "extremidade esquerda" da
    rodada 3 e confirma a arte `design/home-mobile.png`.
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

- **Header**: logo-chip **laranja à esquerda** + **botão de menu à direita** (rodada 5) +
  avatar (**bem pequeno** quando logado — rodada 5); navegação em ~~**barra inferior fixa**~~
  **barra inferior que aparece ao rolar** (rodada 5 — ver abaixo).
  ~~(Home · Biblioteca · Projetos · Calendário · Perfil), item ativo em rosa;
  `Artigos`/`Instagram`/`Aulas` em drawer "Mais".~~
  - **Decidido (rodada 2, 2026-08-23):** a barra inferior tem 5 posições, com `CALENDÁRIO`
    ativo em rosa. `BIBLIOTECA 3D` e `INSTAGRAM` **saem da barra**.
    ~~Ordem `PROJETOS · AULAS · CALENDÁRIO · ARTIGOS · PERFIL`.~~ **Superado na rodada 3.**
  - **Decidido (rodada 3, 2026-08-23):** a ordem segue a do desktop — barra inferior:
    `PROJETOS` · `CALENDÁRIO` · `AULAS` · `ARTIGOS` · `PERFIL`. `BIBLIOTECA 3D` e
    `INSTAGRAM` ficam **dentro do menu**, com botão ~~no topo, na extremidade esquerda da
    barra~~ (**superado na rodada 5** — ver abaixo), contendo **todas as abas**
    (Biblioteca 3D só no menu). Home pelo logo
    (decidido). **`PERFIL` deslogado abre a tela de login.**
  - **Decidido (rodada 4, 2026-08-24):** o login é por **e-mail + senha** (design da tela
    de login definido — ver `login.md`); **`PERFIL` logado abre a Minha Conta**
    (`pages/minha-conta.md`). O botão de menu segue existindo **só nas compactas** —
    ~~mesma observação posicional (logo × menu na extremidade esquerda) do tablet.~~
    **Superado na rodada 5.**
  - **Decidido (rodada 5, 2026-08-24):** botão de menu **no topo, à direita** da barra, com
    o **logo à esquerda** — confirma `design/home-mobile.png` e encerra o suposto conflito
    posicional entre logo e menu.
  - **Decidido (rodada 5, 2026-08-24):** a **barra inferior aparece ao rolar** a página —
    ela foi apenas **omitida** da arte da home, e **não** fica fixa sobre o hero desde o
    primeiro paint.
  - **Decidido (rodada 5, 2026-08-24):** logado, o **avatar do usuário entra bem pequeno no
    header mobile**, além do item `PERFIL` na barra inferior.
- **Hero**: composição isométrica omitida; título menor; parágrafo em até 4 linhas.
- **Visão padrão**: **`LISTA`** passa a ser a visão inicial (grade mensal é pouco legível em
  390px); `MÊS` fica disponível como faixa compacta de **7 dias roláveis** (strip semanal)
  com ponto colorido indicando dias com evento.
- **Filtros**: chips de tipo em faixa rolável horizontal; filtro de máquina e busca dentro de
  um **bottom sheet** `FILTROS` com contador de filtros ativos.
- **Card de evento**: empilhado — chip de tipo + data/hora no topo, título, descrição
  (2 linhas), metadados em duas linhas com ícones, botão `INSCREVER-SE` em largura total.
- **Detalhe**: página inteira rolável; capa 16:9; barra fixa inferior com `INSCREVER-SE`
  ~~e XP previsto~~ (**sem XP previsto no v1** — PO, 2026-08-24).
- **Alvos de toque**: mínimo 44×44px, espaçamento vertical mínimo de 8px; `CARREGAR MAIS` em
  largura total (alternativa: scroll infinito por mês).

## Componentes

| Componente | Descrição | Reuso |
|---|---|---|
| `HeaderPrincipal` | Logo-chip **laranja** (canônico, decidido rodada 2) com **logo → Home** (rodada 3), nav em caps na ordem desktop `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`; compacta (ordem corrigida na rodada 3) — tablet `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS`, mobile em barra inferior de 5 posições `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS · PERFIL` (`PERFIL` deslogado → login por **e-mail + senha**; logado → **Minha Conta**, rodada 4) que **aparece ao rolar** (rodada 5), com `BIBLIOTECA 3D` e `INSTAGRAM` **no menu** (botão no topo, **à direita**, com o logo à esquerda — rodada 5, supera "à esquerda" da rodada 3 —, com todas as abas) — botão de menu **só nas compactas**, sem menu no desktop (rodada 4); bloco de conta com **nome da pessoa** + `@nomesobrenome` (rodada 4); no mobile logado, **avatar bem pequeno no header** (rodada 5) | Todas as páginas |
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
| `AutorInline` | Avatar pixel + **nome da pessoa** + identificador `@nomesobrenome` + `NÍVEL n` (rodada 4; os `@handle` fictícios dos mockups são ilustrativos/superados) | Aulas, Projetos, Artigos |
| `BotaoCurtida` | Coração outline rosa + contador | Todas as listagens |
| `CheckinQR` **(proposta — fora do v1, PO 2026-08-24)** | QR code do evento + lista de presença (equipe do lab) | Exclusivo |
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
| `responsavel` | relação → `usuario` | sim | avatar, **nome** (≤60 car.) + identificador `@nomesobrenome`, `NÍVEL n` (rodada 4) |
| `skill` | relação → `skill` | não | ~~destino do XP~~ classificação/filtro do evento — **sem XP no v1 (PO, 2026-08-24)**; volta a ser destino de XP só se o check-in for aprovado |
| `missao_relacionada` | relação → `missao` | não | chip amarelo no card |
| `aulas_prerequisito` | relação múltipla → `aula` | não | pré-requisitos |
| `vagas_total` | inteiro | não | vazio = sem limite; alimenta `12/20 vagas` |
| `inscricao_obrigatoria` / `prazo_inscricao` | booleano / data-hora | sim / não | controlam `BotaoInscricao` |
| `xp_presenca` | inteiro | não | **Reservado — fora do escopo v1 (PO, 2026-08-24):** o calendário não concede XP; campo fica no modelo, sem uso na UI do v1 |
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
  `xp_creditado` (booleano, anti-farm). **Reservada — fora do escopo v1 (PO, 2026-08-24):**
  sem check-in presencial no v1; a coleção fica especificada para a versão futura.
- `curtida` — `usuario` × `evento`, alimenta o contador de interesse.

## Ganchos de gamificação

Todos **(proposta)**, alinhados ao `gamification.md`.

- **XP por presença** — ~~check-in no evento credita `xp_presenca` na `skill` do evento~~
  **Decidido (PO, 2026-08-24): fora do v1** — a questão 4 do `gamification.md` está
  encerrada: o calendário **não concede XP**. Registro para a versão futura: se o check-in
  for aprovado, o valor é **1 XP** (economia de 2026-08-23) creditado na `skill` do evento,
  com anti-farm de um crédito por par `usuario`×`evento`, validado por
  `presenca.xp_creditado`; o exemplo `+80 XP` acima é ilustrativo e está superado.
- **Skills** — o XP evolui a barra segmentada em pips da skill correspondente (o XP aqui é
  o de presença: **sem efeito no v1**, PO 2026-08-24); Serigrafia e
  Bordado Digital aparecem como tipo de evento antes de virarem skills.
- **Níveis** — nível do responsável no card; nível do usuário no header (**nome da pessoa** /
  `NÍVEL n`; o `MAKER_X` / `NÍVEL 3` do mockup é registro superado — rodada 4); ~~XP de
  presença soma ao **Nível do Lab** coletivo~~ — **sem XP de presença no v1 (PO,
  2026-08-24)**; no v1 o Nível do Lab recebe apenas o XP das ações já decididas.
- **Missões** — evento com `missao_relacionada` mostra chip amarelo e ~~participar avança a
  barra de progresso~~; eventos `PRAZO DE MISSÃO` marcam o fim da janela.
  **Decidido (PO, 2026-08-24):** sem check-in no v1 não há registro de participação, então
  o evento **não avança sozinho** a barra da missão — o chip apenas aponta a missão
  relacionada; o avanço automático volta com o check-in.
- **Curtidas** — ♥ com contador funciona como "tenho interesse" e ordena os destaques na home.
- **Recompensas** — ~~sequência de presenças (ex.: 4 atividades no mês) desbloqueia item
  cosmético de avatar.~~ **Decidido (2026-08-23):** os cosméticos de recompensa foram
  **adiados** (só itens fixos de avatar por enquanto); ~~qual recompensa substitui o item
  cosmético segue **em aberto**~~ **Decidido (PO, 2026-08-24): sem recompensa no v1** — a
  recompensa chega junto com os cosméticos (v2), e a sequência de presenças depende do
  check-in, que está fora do v1 — ver [gamification.md](../gamification.md).
- **Exibição** — ~~XP previsto aparece **antes** da participação; toast `+1 XP em Corte a
  Laser` após o check-in confirmado~~ **Decidido (PO, 2026-08-24):** sem check-in no v1,
  **não há XP previsto nem toast de XP** no calendário; o padrão fica registrado para a
  versão futura (1 XP por ação, decidido em 2026-08-23; o `+80 XP` é ilustrativo).

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
  `INSCREVER-SE` e ♥ abrem modal ~~"Crie sua conta para participar e ganhar XP"~~ **"Crie
  sua conta para participar"** (sem promessa de XP — o calendário não concede XP no v1, PO
  2026-08-24) com CTA
  `COMECE A CRIAR`; ~~XP previsto exibido como convite~~ (**sem XP previsto no v1** — PO,
  2026-08-24, decisão de check-in fora do v1); `.ICS` continua disponível. No
  mobile, o item `PERFIL` da barra inferior **abre a tela de login** (decidido na
  rodada 3). **Decidido (rodada 4, 2026-08-24):** o login é por **e-mail + senha** (o
  passo 2 do cadastro ganha campo de senha); design da tela de login **definido** — ver `login.md`.
- **Logado**: botões refletem o estado real (`INSCRITO ✓`, `LISTA DE ESPERA`, `LOTADO`);
  filtro extra `MINHAS INSCRIÇÕES`; ~~badge de presença nos eventos já frequentados~~
  (**fora do v1** — sem check-in no v1, PO 2026-08-24); lembrete
  de evento próximo no topo da página. **Decidido (rodada 4, 2026-08-24):** logado, o
  destino do `PERFIL` (mobile) e do bloco de conta (desktop/tablet) é a **Minha Conta** —
  ver [pages/minha-conta.md](minha-conta.md).
- **Equipe do lab**: ações inline de editar/cancelar evento, ~~abrir `CHECK-IN` com QR code e
  marcar presença manualmente~~ (**fora do v1** — PO, 2026-08-24; especificação mantida para
  a versão futura); evento `CANCELADO` aparece tachado com aviso a todos.

## Questões em aberto

1. ~~Check-in presencial concede XP? E por QR code no lab, código do responsável ou
   confirmação manual? (Questão 4 do `gamification.md` — segue em aberto.)~~
   **Decidido (PO, 2026-08-24): check-in presencial fica fora do v1** — o calendário **não
   concede XP** e não há fluxo de check-in (QR code, código do responsável ou marcação
   manual) na primeira versão. Os campos `xp_presenca` e a coleção `presenca` permanecem
   **reservados** no modelo de conteúdo. Encerra a questão 4 do `gamification.md`; o
   *quanto* (1 XP, pela economia de 2026-08-23) e o *como* (QR code · manual) ficam como
   registro para quando o tema voltar, com o jogo rodando.
2. Inscrição é obrigatória para todos os eventos ou só para os de vaga limitada? Há lista de
   espera e política de no-show?
3. Visão inicial no desktop é `MÊS` ou `LISTA`? O documento de estrutura original diz apenas
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
