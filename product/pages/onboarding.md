# Criar Conta (Onboarding)

## Propósito

Converter o visitante em **maker** cadastrado por um fluxo curto de passos, começando pela
criação do **avatar em pixel art**. O primeiro passo é deliberadamente lúdico: o usuário
monta seu personagem antes de preencher dados, reforçando a promessa gamificada
("Personalize seu personagem maker do seu jeito!").

## Fonte de design

- **`design/avatar-create.png`** (2026-08-23) — **fonte primária** da tela de criação de
  avatar, desktop. **Substitui** a metade direita de
  `design/ChatGPT Image 18 de ago. de 2026, 11_19_16.png`, que fica como **registro
  histórico** (era o "passo 1 de 3" com abas, tipos de corpo, altura e skills).
- Apoio: `visual-identity.md` (paleta, tipografia, botões) e `gamification.md` (avatar,
  skills, XP).
- **Demais passos do fluxo não possuem mockup** — especificação **(proposta)**.

## Estrutura da página — desktop (≥1280px)

Fundo geral **claro** (cinza muito claro/quase branco; token exato **(proposta)**), com
texto navy. Conteúdo em duas colunas: trilho esquerdo (~1/4) e painéis de customização
(~3/4).

### 1. Header (barra navy, padrão do site)

O novo mockup usa o **header padrão do site**, não mais um header de fluxo focado:

- **Logo-chip laranja** extrudado à esquerda, cubo isométrico entre `FAB` e `LAB`
  (`FAB ◆ LAB` / `CITE BAURU`). **Decidido (rodada 2, 2026-08-23):** a versão **laranja** é
  o **chip canônico do header** em todo o site — este mockup (`design/avatar-create.png`) é
  a referência; a variante rosa fica como registro de mockup.
- **Navegação canônica completa e alinhada**: `BIBLIOTECA 3D` · `PROJETOS` · `CALENDÁRIO` ·
  `AULAS` · `INSTAGRAM` · `ARTIGOS` — primeiro mockup que já renderiza a ordem decidida em
  2026-08-23.
- À direita: avatar pixel em moldura + `MAKER_X` / `NÍVEL 3` + chevron `⌄`.
  - O estado **logado** no header sugere que esta tela também serve como **`Editar avatar`**
    do perfil; para o cadastro de visitante, o bloco de conta vira `ENTRAR`/`CRIAR CONTA`
    **(proposta)**.

> **Superado pelo novo mockup:** o header anterior (chip rosa, rótulo `CRIAR CONTA`,
> indicador de passos `1 2 3`, sem navegação) era do mockup antigo. O **indicador de passos
> não aparece** no novo mockup — ver Questões em aberto.

### 2. Cabeçalho da etapa

- Título display navy: **`CRIE SEU AVATAR`**.
- Subtítulo: **`Personalize seu personagem maker do seu jeito!`** (copy nova; a antiga era
  "Seu personagem maker, do seu jeito!").

### 3. Trilho esquerdo (de cima para baixo)

1. **Preview do avatar** — cartão claro com fundo de **grade quadriculada**; avatar pixel
   art de corpo inteiro sobre **plataforma isométrica teal**; **botão de rotação** (⟳) no
   canto inferior direito — **4 direções** (decidido 2026-08-23).
2. **Card `XX OU XY`** — seletor da **base do corpo** com duas opções, `XX` e `XY`, cada
   uma com silhueta; `XX` selecionada com **contorno amarelo**. É um elemento **novo**: a
   base binária substitui os 4 tipos de corpo e o slider de altura removidos em 2026-08-23.
3. **`NOME DO AVATAR`** — campo de texto com placeholder `Digite um nome...` e contador
   **`0/20`** (máximo 20 caracteres).
4. **Botões**: secundário **`VOLTAR`** (navy, texto claro) e primário
   **`SALVAR E CONTINUAR →`** (rosa preenchido, texto navy, sombra dura — estilo canônico
   decidido em 2026-08-23; o rótulo mudou de `CONTINUAR` para `SALVAR E CONTINUAR`).

### 4. Painéis de customização (área direita)

O novo mockup **abandona as abas** (`CORPO/CABELO/ROSTO/ROUPAS/ACESSÓRIOS`) — todos os
painéis ficam **visíveis simultaneamente** dentro de **um único cartão-contêiner**: a
fileira `TONS DE CABELO` no topo, abaixo uma linha de três cards
(`TONS DE PELE` · `CABELO` · `ROSTO`) e outra de dois (`ROUPAS` · `ACESSÓRIOS`); a nota em
itálico fica **fora** do contêiner, no rodapé da página:

- **`TONS DE CABELO`** — fileira de **10 swatches** no topo: preto, quatro castanhos,
  bege/loiro, rosa, laranja, ciano e vermelho. **Cor de cabelo é separada do corte** —
  elemento novo.
- **Card `TONS DE PELE`** — grade **4×5** de swatches, do mais claro ao mais escuro;
  legenda **`20 opções`** (eram 6 no mockup antigo — superado).
- **Card `CABELO`** — grade de miniaturas de cortes; legenda **`30 opções`** (o render
  mostra 8×4 = 32 miniaturas; vale o rótulo — arte é ilustrativa).
- **Card `ROSTO`** — três fileiras com **`Ver mais ⌄`** cada:
  - **`OLHOS`** — duas fileiras, **5 + 4 = 9 opções visíveis** (a última célula da segunda
    fileira fica vazia) + `Ver mais ⌄`;
  - **`NARIZ`** — 5 opções visíveis + `Ver mais ⌄`;
  - **`BOCA`** — 5 opções visíveis + `Ver mais ⌄`.
  - Totais dos catálogos de rosto **não visíveis** — ver Questões em aberto.
- **Card `ROUPAS`** — três slots independentes:
  - **`PARTE DE CIMA` `(10 opções)`** — camisetas, moletons, jaqueta, regata e croppeds
    listrados (o render mostra apenas **9** miniaturas; vale o rótulo);
  - **`PARTE DE BAIXO` `(10 opções)`** — calças, bermudas, shorts e saias (10 miniaturas
    visíveis);
  - **`SAPATOS` `(10 opções)`** — chinelo, botas, tênis variados (o render mostra **11**
    miniaturas; vale o rótulo).
- **Card `ACESSÓRIOS`** — dois slots:
  - **`ÓCULOS` `(5 opções)`** — redondo de aro fino preto, óculos escuros pretos, armação
    quadrada rosa, redondo marrom, redondo de aro marrom com **lente azul**;
  - **`CHAPÉUS` `(5 opções)`** — gorro preto com pompom, bucket navy, boné azul, touca
    rosa com pompom, chapéu (fedora) preto.
- Nota de rodapé em itálico: **`As opções podem ser combinadas livremente. Solte sua
  criatividade!`** — combinação livre entre todos os slots.

### 5. Bloco de skills — fora desta tela

~~Bloco `ESCOLHA SUAS SKILLS INICIAIS` com 5 cards (nome, ícone, `NÍVEL 1`, pips,
checkbox).~~ **O novo mockup não contém a escolha de skills** — o bloco existia no mockup
antigo e deve viver em **outro passo do fluxo** (ou sair do cadastro); ver Questões em
aberto. As especificações do card de skill (pips de 10 níveis, `NÍVEL 1`) permanecem
válidas em `gamification.md` para onde quer que o bloco vá.

### 6. Demais passos do fluxo — (proposta), sem mockup

- **Passo seguinte — `SEUS DADOS`** (proposta): `Nome completo`, `@handle` (verificação de
  disponibilidade), `E-mail`, `Senha` + `Confirmar senha`, aceite de
  `Termos de uso e política de privacidade`.
- **Passo final — `VÍNCULO UNESP`** (proposta): tipo de vínculo (`Aluno`, `Servidor`,
  `Voluntário externo`), `Curso/Unidade`, `RA/matrícula` (opcional), e confirmação com
  resumo do avatar (+ skills, se mantidas no fluxo) e CTA `COMEÇAR A CRIAR` (proposta).

## Adaptação tablet (768–1279px)

Todas as decisões abaixo são **(proposta)** — o mockup é desktop —, **exceto a composição da
barra de navegação**, decidida na rodada 2.

- Header padrão colapsa como nas demais páginas. **Decidido (rodada 2, 2026-08-23):** a barra
  do tablet perde `BIBLIOTECA 3D` e `INSTAGRAM` e fica, nesta ordem: `PROJETOS` · `AULAS` ·
  `CALENDÁRIO` · `ARTIGOS`. Biblioteca 3D e Instagram continuam acessíveis fora da barra
  (menu/drawer **(proposta)**); Home pelo logo **(proposta)**. *(Nota: a ordem compacta
  inverte Aulas/Calendário em relação à desktop — resposta literal da designer, registrada
  como decidida.)*
- Trilho esquerdo vira **linha superior**: preview + (`XX OU XY` e `NOME DO AVATAR`
  empilhados ao lado); painéis de customização abaixo, em largura total.
- Painéis em 2 colunas (`TONS DE PELE` + `ROSTO`; `CABELO` largura total; `ROUPAS` e
  `ACESSÓRIOS` empilhados).
- `VOLTAR` / `SALVAR E CONTINUAR` permanecem ao final do conteúdo.
- Alvos de toque mínimos de **44×44px** (swatches e miniaturas).

## Adaptação mobile (<768px)

Todas as decisões abaixo são **(proposta)**, **exceto a composição da barra inferior**,
decidida na rodada 2.

- **Decidido (rodada 2, 2026-08-23):** a barra inferior do mobile tem **5 posições** —
  `PROJETOS` · `AULAS` · `CALENDÁRIO` · `ARTIGOS` · `PERFIL`; `BIBLIOTECA 3D` e `INSTAGRAM`
  saem da barra e ficam acessíveis pelo menu/drawer **(proposta)**; Home pelo logo
  **(proposta)**. *(Nota: a ordem compacta inverte Aulas/Calendário em relação à desktop —
  resposta literal da designer, registrada como decidida.)* Se o fluxo de cadastro
  **suprimir a barra inferior** (para não competir com `VOLTAR` / `SALVAR E CONTINUAR` da
  barra fixa de ação), isso segue **(proposta)** — ver Questões em aberto.
- Preview do avatar em faixa **sticky no topo** (~240px) com o botão ⟳ sobreposto, para o
  resultado ficar visível durante a customização.
- `XX OU XY` e `NOME DO AVATAR` logo abaixo do preview, empilhados.
- Painéis empilhados em **acordeão** (ou navegação por âncoras/chips: Pele · Cabelo ·
  Rosto · Roupas · Acessórios); swatches e miniaturas em grade com células ≥44×44px;
  fileiras longas (30 cabelos, 20 tons) com rolagem vertical dentro da seção.
- `Ver mais` do rosto expande inline.
- `VOLTAR` / `SALVAR E CONTINUAR` em **barra fixa inferior** (safe-area), primário com
  ~65% da largura.

## Componentes

| Componente | Descrição | Origem |
|---|---|---|
| `HeaderPrincipal` | Header padrão do site com navegação canônica completa no desktop; compacto (decidido rodada 2): tablet `PROJETOS · AULAS · CALENDÁRIO · ARTIGOS`, mobile em barra inferior de 5 posições `PROJETOS · AULAS · CALENDÁRIO · ARTIGOS · PERFIL`, com `BIBLIOTECA 3D` e `INSTAGRAM` fora da barra **(proposta: menu/drawer)** | mockup novo + decisão |
| `AvatarPreview` | Pixel art sobre grade + base isométrica teal + botão ⟳ (**4 direções**) | mockup + decisão |
| `SeletorBase` | Card `XX OU XY` com 2 silhuetas, seleção em contorno amarelo | mockup novo |
| `CampoNomeAvatar` | Input com placeholder `Digite um nome...` e contador `0/20` | mockup novo |
| `SwatchRow` | Swatches de cor (tons de pele 20, tons de cabelo 10); seleção por contorno **(proposta — nenhum swatch aparece selecionado no mockup)** | mockup novo |
| `PainelCatalogo` | Card claro com título caps + grade de miniaturas + legenda `(n opções)` | mockup novo |
| `LinhaVerMais` | Fileira de opções + link `Ver mais ⌄` (olhos, nariz, boca) | mockup novo |
| ~~`CustomizationTabs`~~ | ~~5 abas Corpo/Cabelo/Rosto/Roupas/Acessórios~~ — **superado**: painéis simultâneos | mockup antigo |
| ~~`StepIndicator`~~ | ~~Quadrados `1 2 3`~~ — ausente no mockup novo; ver questão 11 | mockup antigo |
| `SkillCard` | Nome, ícone, `NÍVEL 1`, pips (10) e checkbox — **fora desta tela** no mockup novo | mockup antigo + decisão |
| `ButtonSecondary` / `ButtonPrimary` | `VOLTAR` / `SALVAR E CONTINUAR →` (primário canônico) | mockup novo |
| `FormField`, `PasswordField`, `SelectField` | Passos seguintes | **(proposta)** |
| `ToastError` / `InlineError` | Feedback de validação | **(proposta)** |

## Modelo de conteúdo (CMS)

### `skill` (coleção — dados de referência)

Inalterada (ver versão anterior/`gamification.md`): `nome`, `slug`, `icone`, `descricao`,
`niveis_max` = **10**, `xp_por_nivel` = **5**, `inicial`, `ativa`. A **tela** onde as
skills iniciais são escolhidas está em aberto (questão 10).

### `avatar_item` (coleção — peças cosméticas)

> Somente **itens fixos** (decidido 2026-08-23) — sem campos de desbloqueio. Sprites
> produzidos pela designer. Catálogo por categoria conforme o novo mockup:

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `categoria` | enum | sim | `cabelo` (30), `olhos`, `nariz`, `boca` (totais a confirmar), `roupa_cima` (10), `roupa_baixo` (10), `sapatos` (10), `oculos` (5), `chapeus` (5) |
| `nome` | texto | sim | — |
| `sprite` | mídia | sim | `.png` pixel art (sem interpolação), `.webp` |
| `sprite_folhas` | mídia | não | spritesheet de rotação (.png + JSON) — **4 direções** |
| `compativel_base` | enum | não | `xx`, `xy`, `ambas` **(proposta — depende de como os sprites serão produzidos por base)** |
| `camada_z` | número | sim | ordem de composição **(proposta)** |
| `pintavel` | booleano | não | se aceita `tom_de_cabelo` (cortes de cabelo) **(proposta)** |

### `tom_de_pele` (coleção — **20 registros**)

`nome` (texto, sim), `hex` (cor, sim), `ordem` (número, sim). *(Eram 6 — superado pelo
novo mockup.)*

### `tom_de_cabelo` (coleção — **10 registros**) — nova

`nome` (texto, sim), `hex` (cor, sim), `ordem` (número, sim).

### `usuario` / `perfil_maker` (coleção)

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `handle` | texto único | sim | exibido como `@handle` |
| `nome_avatar` | texto (≤20) | sim | campo `NOME DO AVATAR` do mockup — relação com `@handle` em aberto (questão 12) |
| `nome_completo` / `email` / `senha_hash` | — | sim | **(proposta)** passos seguintes |
| `vinculo_unesp` / `curso_unidade` / `ra_matricula` | — | — | **(proposta)** |
| `avatar_config` | JSON | sim | `base` (`xx`/`xy`), `tom_pele`, `tom_cabelo`, e um item por slot: `cabelo`, `olhos`, `nariz`, `boca`, `roupa_cima`, `roupa_baixo`, `sapatos`, `oculos?`, `chapeu?` + direção do preview |
| `avatar_render` | mídia | não | PNG composto para cards/ranking (mesmo rosto — decidido 2026-08-23) **(proposta)** |
| `skills` | relação N:N → `skill` | sim | com `nivel` e `xp` por skill |
| `xp_total` / `nivel` | número | sim | derivados |
| `aceite_termos_em` | data/hora | sim | **(proposta)** |

> Uploads de projeto não ocorrem nesta página; pertencem a Projetos e Biblioteca 3D.

## Ganchos de gamificação

- **Avatar**: a configuração alimenta o avatar usado em toda a plataforma (header, cards,
  `RANKING MAKERS`) — miniatura com **o mesmo rosto do boneco** (decidido 2026-08-23).
- **Itens fixos, sem recompensa**: nenhum item aparece bloqueado/com cadeado (decidido
  2026-08-23 — mecânica de desbloqueio adiada). "As opções podem ser combinadas
  livremente."
- **Skills iniciais**: criadas em `NÍVEL 1` (pips de 10; 5 XP por nível, teto 10) — em
  **qual passo** isso acontece está em aberto (questão 10).
- **XP de boas-vindas (proposta)**: concluir o cadastro concede XP e conta para o Nível do
  Lab (números dos mockups são ilustrativos — economia real em `gamification.md`).
- Curtidas (♥) não têm papel nesta página.

## Estados e interações

- **Hover/foco (proposta)** — nenhum estado visível no mockup: swatches/miniaturas ganham
  contorno de foco (2px) navegável por teclado; `SALVAR E CONTINUAR` desloca a sombra dura.
- **Seleção**: o **único** estado selecionado visível no mockup é o card `XX` do
  `XX OU XY`, com **contorno amarelo** (~`#F7CA62`). Nenhum swatch ou miniatura de
  catálogo aparece marcado — as células de `SAPATOS`, inclusive a do chinelo, têm todas o
  mesmo contorno cinza-azulado neutro. Que os demais slots adotem esse mesmo padrão de
  seleção é **(proposta)**. Toda mudança atualiza o preview em tempo real **(proposta)**.
- **`Ver mais`**: expande o catálogo completo da fileira (olhos/nariz/boca) inline ou em
  modal **(proposta)**.
- **`NOME DO AVATAR`**: contador `n/20` em tempo real; validação de conteúdo (palavrões,
  unicidade?) **(proposta — ver questão 12)**.
- **Loading**: skeleton no preview enquanto sprites carregam; `SALVAR E CONTINUAR` com
  spinner e desabilitado durante o envio **(proposta)**.
- **Vazio/Erro**: catálogo vazio → `Nenhum item disponível ainda`; falha de sprites →
  `Tentar novamente` **(proposta)**.
- **Deslogado (cadastro)**: header troca o bloco de conta por `ENTRAR`/`CRIAR CONTA`
  **(proposta)**; `VOLTAR` retorna à home **(proposta)**.
- **Logado (edição)**: o mockup mostra usuário logado — a tela reusada como
  `Editar avatar` do perfil, com `SALVAR` no lugar de `SALVAR E CONTINUAR` **(proposta)**.
- **Persistência (proposta)**: rascunho do avatar guardado localmente entre passos.

## Questões em aberto

1. Quantas skills o usuário pode marcar (o bloco de skills saiu desta tela — regra segue
   indefinida)?
2. Conteúdo definitivo dos passos seguintes — dados pessoais, vínculo UNESP, confirmação?
3. O cadastro exige e-mail institucional UNESP ou aceita externos/comunidade?
4. ~~Quais opções existem em `CABELO`, `ROSTO`, `ROUPAS` e `ACESSÓRIOS`?~~
   **Superado pelo novo mockup (2026-08-23):** cabelo 30 + 10 cores; roupas 3×10;
   acessórios 5+5; pele 20. Restam os **totais de `OLHOS`/`NARIZ`/`BOCA`** (o `Ver mais`
   indica mais que os visíveis — 9 olhos, 5 narizes, 5 bocas) — ver questão 13.
5. ~~Rotação: 2, 4 ou 8 direções?~~ **Decidido (2026-08-23): 4 direções.**
6. ~~Altura/tipo de corpo?~~ **Removidos (2026-08-23)**; o novo mockup introduz a base
   `XX OU XY` no lugar — ver questão 14.
7. Cadastro concede XP inicial? Quanto, e conta para o Nível do Lab?
8. Há login social/SSO da UNESP como alternativa ao formulário?
9. Onde o `VOLTAR` leva — home ou tela de escolha entrar/cadastrar?
10. **Nova:** para onde foi a **escolha de skills iniciais** — outro passo do fluxo, o
    perfil pós-cadastro, ou saiu do onboarding?
11. **Nova:** o fluxo continua em passos (o botão diz `SALVAR E CONTINUAR`), mas o
    **indicador `1 2 3` sumiu** — quantos passos existem e o indicador volta?
12. **Nova:** `NOME DO AVATAR` (≤20) é o mesmo que o `@handle` público, um apelido
    separado do boneco, ou vira o nome de exibição?
13. **Nova:** totais dos catálogos de `OLHOS`, `NARIZ` e `BOCA` (o mockup mostra 9 olhos
    em duas fileiras, 5 narizes e 5 bocas, cada bloco com `Ver mais`).
14. **Nova:** a base `XX OU XY` — confirmar nomenclatura/rótulos dessa escolha e se os
    itens de roupa variam por base (impacta a produção de sprites em 2 versões).
15. **Nova (rodada 2):** durante o fluxo de cadastro em mobile, a **barra inferior de
    navegação** (`PROJETOS · AULAS · CALENDÁRIO · ARTIGOS · PERFIL`) fica visível ou é
    suprimida em favor da barra fixa de ação (`VOLTAR` / `SALVAR E CONTINUAR`)? A
    composição da barra já está decidida; só o comportamento dentro do fluxo está em aberto.
