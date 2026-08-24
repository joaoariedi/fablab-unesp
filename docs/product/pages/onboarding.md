# Criar Conta (Onboarding)

## Propósito

Converter o visitante em **maker** cadastrado por um fluxo curto de passos, começando pela
criação do **avatar em pixel art**. O primeiro passo é deliberadamente lúdico: o usuário
monta seu personagem antes de preencher dados, reforçando a promessa gamificada
("Personalize seu personagem maker do seu jeito!").

**Decidido (rodada 3, 2026-08-23):** o cadastro tem **2 passos** — **passo 1: criar o
avatar**; **passo 2: dados pessoais**. Não há escolha de skills em passo algum (ver §5) e o
antigo "passo 3 — vínculo UNESP" foi **absorvido pelo passo 2**.

## Fonte de design

- **`design/criar-conta-passo-1.png`** (2026-08-23) — **fonte primária** da tela de criação de
  avatar, desktop. **Substitui** a metade direita de
  `design/home-v1-criar-conta-v1.png`, que fica como **registro
  histórico** (era o "passo 1 de 3" com abas, tipos de corpo, altura e skills).
- **`design/criar-conta-passo-2.jpg`** (2026-08-24) — **fonte primária do passo 2** (dados
  pessoais), desktop; confirma os campos decididos nas rodadas 3–4 (ver §6).
- **Tela de login — design definido (decisão do PO, 2026-08-24):** a tela de **login por
  e-mail + senha** reusa o design do passo 2 (`design/criar-conta-passo-2.jpg`),
  **trocando o formulário** e **sem o trilho esquerdo** (card centralizado — rodada 5,
  2026-08-24: o preview do avatar não se aplica ao visitante) — spec em
  [login.md](login.md); o link `Fazer login`
  do passo 2 aponta para ela. (Se a designer entregar um mockup dedicado, ele atualiza a
  spec.)
- Apoio: `visual-identity.md` (paleta, tipografia, botões) e `gamification.md` (avatar,
  skills, XP).

## Estrutura da página — desktop (≥1280px)

Fundo geral **claro** (cinza muito claro/quase branco; token exato **(proposta)**), com
texto navy. No **passo 1**, conteúdo em duas colunas: trilho esquerdo (~1/4) e painéis de
customização (~3/4). No **passo 2** o layout é outro — trilho esquerdo só com o preview e
**card de formulário centrado** (~40% da largura), sobrando a faixa direita com os
ornamentos de fundo (ver §6).

### 1. Header (barra navy, padrão do site)

O novo mockup usa o **header padrão do site**, não mais um header de fluxo focado:

- **Logo-chip laranja** extrudado à esquerda, cubo isométrico entre `FAB` e `LAB`
  (`FAB ◆ LAB` / `CITE BAURU`). **Decidido (rodada 2, 2026-08-23):** a versão **laranja** é
  o **chip canônico do header** em todo o site — este mockup (`design/criar-conta-passo-1.png`) é
  a referência; a variante rosa fica como registro de mockup. **Decidido (rodada 3,
  2026-08-23):** tocar no **logo leva à Home** (não é mais proposta).
- **Navegação canônica completa e alinhada**: `BIBLIOTECA 3D` · `PROJETOS` · `CALENDÁRIO` ·
  `AULAS` · `INSTAGRAM` · `ARTIGOS` — primeiro mockup que já renderiza a ordem decidida em
  2026-08-23.
- À direita: avatar pixel em moldura + `MAKER_X` / `NÍVEL 3` + chevron `⌄`.
  **Rodada 4 (2026-08-24):** `MAKER_X` é rótulo **ilustrativo** — a UI real mostra o **nome
  da pessoa** (identificador `@nomesobrenome` quando exibido).
  - O estado **logado** no header sugere que esta tela também serve como **`Editar avatar`**
    do perfil; para o cadastro de visitante, o bloco de conta vira `ENTRAR`/`CRIAR CONTA`
    **(proposta)**.

> **Superado pelo novo mockup:** o header anterior (chip rosa, rótulo `CRIAR CONTA`,
> indicador de passos `1 2 3`, sem navegação) era do mockup antigo. O **indicador de passos
> não aparece** no novo mockup — ver a decisão abaixo (questão 11, fechada na rodada 4).
>
> **Decidido (rodada 4, 2026-08-24):** o **indicador de passos volta à tela**, agora com
> **2 passos** (`1 2`). O `1 2 3` do mockup antigo segue superado.

> **Decidido (rodada 4, 2026-08-24):** o **botão de menu existe só nas versões compactas**
> (tablet/mobile). No **desktop** as **6 abas ficam na barra**, **sem botão de menu** — como
> este mockup já mostra.

### 2. Cabeçalho da etapa

- Título display navy: **`CRIE SEU AVATAR`**.
- Subtítulo: **`Personalize seu personagem maker do seu jeito!`** (copy nova; a antiga era
  "Seu personagem maker, do seu jeito!").

### 3. Trilho esquerdo (de cima para baixo)

1. **Preview do avatar** — cartão claro com fundo de **grade quadriculada**; avatar pixel
   art de corpo inteiro sobre **plataforma isométrica teal**; **botão de rotação** (⟳) no
   canto inferior direito — **4 direções** (decidido 2026-08-23).
2. **Card da base do corpo** — seletor com duas opções, cada uma com silhueta; a primeira
   selecionada com **contorno amarelo**. É um elemento **novo**: a base binária substitui
   os 4 tipos de corpo e o slider de altura removidos em 2026-08-23.
   **Decidido (rodada 3, 2026-08-23):** os rótulos são **`F`** e **`M`** — o mockup
   `design/criar-conta-passo-1.png` mostra ~~`XX OU XY`~~, que fica como **registro superado**.
   **Apenas a `PARTE DE CIMA` varia por base** (`F` com peitos, `M` sem); todos os demais
   slots (cabelo, rosto, parte de baixo, sapatos, acessórios) são **únicos**, produzidos em
   versão única de sprite.
3. **`NOME DO AVATAR`** — campo de texto com placeholder `Digite um nome...` e contador
   ~~`0/20` (máximo 20 caracteres)~~ — **registro do mockup**.
   **Decidido (rodada 4, 2026-08-24):** o limite passa de 20 para **60 caracteres**; o
   contador real é **`0/60`**. **Decidido (rodada 3, 2026-08-23):** é o **nome da
   pessoa** informado no passo 2 (mesmo campo/valor) — não é um apelido separado do boneco.
   **Decidido (rodada 4, 2026-08-24):** publicamente aparece o **nome da pessoa**; o
   identificador segue o modelo **`@nomesobrenome`**, **derivado do nome** (ex.:
   `@mariasilva`) — não é digitado pelo usuário. Os handles dos mockups (`@laser.nick`,
   `@print.lu`, `@maker_jv`) são **ilustrativos/superados**. Normalização (acentos/espaços)
   e colisões de homônimos seguem **(proposta)** — ver questão 12.
4. **Botões**: secundário **`VOLTAR`** (navy, texto claro) e primário
   **`SALVAR E CONTINUAR →`** (rosa preenchido, texto navy, sombra dura — estilo canônico
   decidido em 2026-08-23; o rótulo mudou de `CONTINUAR` para `SALVAR E CONTINUAR`).
   **Decidido (PO, 2026-08-24):** o `VOLTAR` **deste passo leva à Home** (ver §6 e
   questão 9).

### 4. Painéis de customização (área direita)

O novo mockup **abandona as abas** (`CORPO/CABELO/ROSTO/ROUPAS/ACESSÓRIOS`) — todos os
painéis ficam **visíveis simultaneamente** dentro de **um único cartão-contêiner**: a
fileira `TONS DE CABELO` no topo, abaixo uma linha de três cards
(`TONS DE PELE` · `CABELO` · `ROSTO`) e outra de dois (`ROUPAS` · `ACESSÓRIOS`); a nota em
itálico fica **fora** do contêiner, no rodapé da página:

> **Decidido (rodada 3, 2026-08-23):** os **escritos de quantidade** da interface
> ("20 opções", "(10 opções)", "30 opções") **saem da UI** — o desenho original dos painéis
> se mantém, apenas sem essas legendas. Os números descritos abaixo continuam valendo como
> **tamanho de catálogo no CMS**.

- **`TONS DE CABELO`** — fileira de **10 swatches** no topo: preto, quatro castanhos,
  bege/loiro, rosa, laranja, ciano e vermelho. **Cor de cabelo é separada do corte** —
  elemento novo.
- **Card `TONS DE PELE`** — grade **4×5** de swatches, do mais claro ao mais escuro;
  catálogo de **20 opções** (eram 6 no mockup antigo — superado).
- **Card `CABELO`** — grade de miniaturas de cortes; catálogo de **30 opções** (o render
  mostra 8×4 = 32 miniaturas; vale o total do catálogo — arte é ilustrativa).
- **Card `ROSTO`** — três fileiras (`OLHOS`, `NARIZ`, `BOCA`).
  **Decidido (rodada 3, 2026-08-23):** **4 opções de cada — 12 no total**.
  ~~Registro do mockup: `OLHOS` em duas fileiras com 5 + 4 = 9 opções visíveis, `NARIZ` 5 e
  `BOCA` 5, cada bloco com `Ver mais ⌄`.~~ Com 4 opções por categoria, todas cabem numa
  fileira e o link `Ver mais ⌄` perde função. **Decidido (rodada 4, 2026-08-24):** a
  **remoção do `Ver mais ⌄`** das fileiras de `OLHOS`/`NARIZ`/`BOCA` está **confirmada**
  (não é mais proposta decorrente).
- **Card `ROUPAS`** — três slots independentes:
  - **`PARTE DE CIMA`** — catálogo de **10**: camisetas, moletons, jaqueta, regata e
    croppeds listrados (o render mostra apenas **9** miniaturas; vale o total do catálogo).
    **Decidido (rodada 3, 2026-08-23):** é o **único slot que varia por base** — cada peça
    tem versão `F` (com peitos) e `M`;
  - **`PARTE DE BAIXO`** — catálogo de **10**: calças, bermudas, shorts e saias (10
    miniaturas visíveis);
  - **`SAPATOS`** — catálogo de **10**: chinelo, botas, tênis variados (o render mostra
    **11** miniaturas; vale o total do catálogo).
- **Card `ACESSÓRIOS`** — dois slots:
  - **`ÓCULOS`** — catálogo de **5**: redondo de aro fino preto, óculos escuros pretos,
    armação quadrada rosa, redondo marrom, redondo de aro marrom com **lente azul**;
  - **`CHAPÉUS`** — catálogo de **5**: gorro preto com pompom, bucket navy, boné azul,
    touca rosa com pompom, chapéu (fedora) preto.
- Nota de rodapé em itálico: **`As opções podem ser combinadas livremente. Solte sua
  criatividade!`** — combinação livre entre todos os slots.

### 5. Bloco de skills — fora do cadastro

~~Bloco `ESCOLHA SUAS SKILLS INICIAIS` com 5 cards (nome, ícone, `NÍVEL 1`, pips,
checkbox).~~ **O novo mockup não contém a escolha de skills.**

**Decidido (rodada 3, 2026-08-23):** **não existe escolha de skills em nenhum passo do
cadastro** — o bloco do mockup antigo está definitivamente **superado**. Todo maker recebe
as 5 skills automaticamente e as evolui **pelo jogo** (publicar modelos 3D, assistir aulas,
publicar projetos — **1 ponto por tarefa**, economia em `gamification.md`). A
**visualização** das skills fica em **Minha Conta** — miniatura do avatar com as skills
logo abaixo (spec em [minha-conta.md](minha-conta.md)). As especificações do card de skill
(pips de 10 níveis, `NÍVEL n`) permanecem válidas em `gamification.md`, agora sem checkbox.

**Decidido (rodada 4, 2026-08-24):** as 5 skills criadas automaticamente começam no
**nível 0** — barra de pips **vazia**. O `NÍVEL 1` com 1 pip do mockup antigo é **registro
superado**.

### 6. Passo 2 — `CRIAR CONTA` (dados pessoais) — mockup `design/criar-conta-passo-2.jpg`

**Decidido (rodada 3, 2026-08-23):** o fluxo tem **2 passos** e o passo 2 reúne os dados
pessoais **e** o vínculo com a UNESP. **Mockup entregue em 2026-08-24** — estrutura:

- **Trilho esquerdo**: o **preview do avatar** criado no passo 1 permanece visível —
  cartão claro de grade quadriculada com ornamentos de "janela" (três quadradinhos no
  topo à esquerda e **marca de canto** em L no topo à direita), avatar sobre base
  isométrica teal e botão ⟳ no canto inferior direito. É o **único** elemento do trilho —
  o seletor de base e o `NOME DO AVATAR` ficam só no passo 1.
- **Fundo claro** com ornamentos isométricos em linha esmaecida (impressora 3D, cubos,
  trilhas de circuito) como marca-d'água.
- **Card central claro** e **centrado na página**, com contorno navy fino, cantos
  arredondados e sombra suave — o tom do card é **praticamente o mesmo do fundo**
  (~`#F2F2F2` sobre `#EFEFEF`); quem separa os dois é o contorno, não o preenchimento
  (token exato **(proposta)**):
  - Título display navy **`CRIAR CONTA`** + subtítulo
    `Preencha os dados abaixo para criar sua conta.`
  - Campos na ordem do mockup — rótulos caps navy; inputs com ícone à esquerda:
    1. **`NOME COMPLETO`** — ícone de pessoa — `Digite seu nome completo`. Confirma
       **nome completo** (≤60 — rodada 4); é também o `NOME DO AVATAR` (rodada 3).
    2. **`DATA DE NASCIMENTO`** — ícone de calendário — `DD / MM / AAAA` + segundo ícone
       de calendário à direita (date picker; comportamento **(proposta)**).
    3. **`EMAIL`** — ícone de envelope — `Digite seu e-mail`.
       **Decidido (PO, 2026-08-24):** aceita **qualquer e-mail** — **não** se exige
       e-mail institucional da UNESP; o vínculo é informado no campo próprio
       (`VÍNCULO COM UNESP`, abaixo). Ver questão 3.
    4. **`VÍNCULO COM UNESP`** — ícone de instituição — `Selecione seu vínculo` +
       chevron `⌄` (select; lista de opções **(proposta)**).
    5. **`ESCOLARIDADE`** — ícone de capelo — `Selecione sua escolaridade` + chevron `⌄`
       (select; lista **(proposta)**).
    6. **`CURSO`** — ícone de livro — **`Digite ou selecione seu curso`** + chevron `⌄`
       — **combobox** (texto livre OU seleção; detalhe novo do mockup).
    7. **`SENHA`** — ícone de cadeado — `Crie uma senha` + **ícone de olho**
       (mostrar/ocultar). **Sem `Confirmar senha`** no mockup (segue **(proposta)**,
       assim como regras de força).
  - Botão **`CRIAR CONTA →`** ~~em **navy preenchido com texto claro**~~ — **registro
    superado**. **Decidido (rodada 5, 2026-08-24):** os botões de **formulário** (criar
    conta, login) usam o **rosa canônico** — rosa preenchido, texto navy, sombra dura
    deslocada (`visual-identity.md`); o navy do mockup não vira token (questão 17
    resolvida).
  - **Checkbox de aceite dos termos** — **decidido (rodada 5, 2026-08-24):** entra no
    formulário do passo 2, com **link para os termos**; é gate do cadastro (LGPD). Os
    termos básicos ainda **serão redigidos** — **ISS-002** em [backlog.md](../../backlog.md)
    (recomenda-se validação jurídica da UNESP). **Decidido (PO, 2026-08-24):** o link dos
    termos abre em **nova aba** — o preenchimento do formulário não é interrompido.
    Posição exata e microcopy **(proposta)** — questão 19 resolvida.
  - Botão **`VOLTAR`** — **decidido (rodada 5, 2026-08-24):** **será adicionado ao passo 2**,
    para retornar ao passo 1 e ajustar o avatar (primeira parte da questão 9).
    **Decidido (PO, 2026-08-24):** o `VOLTAR` **do passo 1** leva à **Home** (segunda
    parte da questão 9 — resolvida).
  - Abaixo do botão: **`Já tem uma conta?` `Fazer login`** (link azul) → tela de login.

**Divergências do mockup com decisões/propostas** (prevalecem as decisões — ver
Questões em aberto):

- **CTA em navy preenchido, sem a sombra dura deslocada**, em vez do primário canônico
  **rosa** (decidido 2026-08-23, `visual-identity.md`). ~~A questão 17 reabre o ponto
  (estilo próprio de formulário × rosa canônico).~~ **Decidido (rodada 5, 2026-08-24):**
  vale o **rosa canônico** também nos formulários (criar conta, login) — o navy do mockup
  fica como **registro superado**.
- **Sem indicador de passos** `1 2` no mockup — a decisão da rodada 4 (o indicador volta)
  prevalece. **Confirmado (rodada 5, 2026-08-24):** o indicador `1 2` **entra na tela
  final** (questão 18 resolvida).
- **Sem botão `VOLTAR`** — **decidido (rodada 5, 2026-08-24):** o `VOLTAR` **será
  adicionado ao passo 2**; ~~segue em aberto apenas **para onde leva o `VOLTAR` do passo 1**
  (questão 9, segunda parte)~~ — **Decidido (PO, 2026-08-24):** o `VOLTAR` do passo 1 leva
  à **Home**.
- **Sem aceite de termos/LGPD** — ~~permanece **(proposta)**~~ **decidido (rodada 5,
  2026-08-24):** o **checkbox de aceite entra** no formulário do passo 2, com link para os
  termos; redação dos termos básicos rastreada em **ISS-002**
  ([backlog.md](../../backlog.md)).

**Decidido (rodada 4, 2026-08-24):** **não há campo `@handle` digitado** no passo 2 — ✓ o
mockup confirma; o identificador `@nomesobrenome` é **derivado do nome**; normalização e
colisão de homônimos seguem **(proposta)**.

> ~~**Passo final — `VÍNCULO UNESP`** (proposta): tipo de vínculo (`Aluno`, `Servidor`,
> `Voluntário externo`), `Curso/Unidade`, `RA/matrícula` (opcional), e confirmação com
> resumo do avatar.~~ **Superado (rodada 3):** absorvido pelo passo 2 acima; o antigo
> passo 3 deixa de existir. Os valores de `Vínculo com a UNESP`, `Escolaridade` e `Curso`
> (listas de opções) seguem **(proposta)**.

## Adaptação tablet (768–1279px)

Todas as decisões abaixo são **(proposta)** — o mockup é desktop —, **exceto a barra de
navegação**: composição decidida na rodada 2; **ordem, menu e logo → Home** na rodada 3; e a
**posição do botão de menu** (topo, à direita, com o logo à esquerda) na rodada 5.

- Header padrão colapsa como nas demais páginas. **Decidido (rodada 2, 2026-08-23):** a barra
  do tablet perde `BIBLIOTECA 3D` e `INSTAGRAM`. **Ordem corrigida na rodada 3
  (2026-08-23)** — "mantenha a ordem das abas da página inicial", ou seja, a ordem relativa
  do desktop: `PROJETOS` · `CALENDÁRIO` · `AULAS` · `ARTIGOS`.
  ~~*(Nota: a ordem compacta inverte Aulas/Calendário em relação à desktop — resposta
  literal da designer, registrada como decidida.)*~~ — **superada pela rodada 3.**
  ~~**Decidido (rodada 3):** o **botão de menu fica no topo, na extremidade esquerda da
  barra**~~ — **superado. Decidido (rodada 5, 2026-08-24):** o botão de menu fica no
  **topo, à direita** da barra, com o **logo do Fab Lab à esquerda** (confirma
  `design/home-mobile.png`). Ele contém **todas as abas** (inclusive `BIBLIOTECA 3D` e
  `INSTAGRAM`); a
  Biblioteca 3D fica **só no menu**, sem atalho extra. Tocar no **logo leva à Home**
  (decidido — não é mais proposta). **Confirmado (rodada 4, 2026-08-24):** o botão de menu
  existe **só nas versões compactas** (tablet/mobile) — no desktop as 6 abas ficam na barra.
- Trilho esquerdo vira **linha superior**: preview + (seletor de base `F`/`M` e
  `NOME DO AVATAR` empilhados ao lado); painéis de customização abaixo, em largura total.
- Painéis em 2 colunas (`TONS DE PELE` + `ROSTO`; `CABELO` largura total; `ROUPAS` e
  `ACESSÓRIOS` empilhados).
- `VOLTAR` / `SALVAR E CONTINUAR` permanecem ao final do conteúdo.
- Alvos de toque mínimos de **44×44px** (swatches e miniaturas).

## Adaptação mobile (<768px)

Todas as decisões abaixo são **(proposta)**, **exceto a barra inferior e o header**:
composição decidida na rodada 2; **ordem, menu, logo → Home e `PERFIL` deslogado** na
rodada 3; a **visibilidade da barra durante o cadastro** na rodada 4; e o **menu à direita
com o logo à esquerda**, a **barra que aparece ao rolar** e o **avatar pequeno no header
logado** na rodada 5.

- **Decidido (rodada 2, 2026-08-23):** a barra inferior do mobile tem **5 posições**;
  `BIBLIOTECA 3D` e `INSTAGRAM` saem da barra. **Ordem corrigida na rodada 3
  (2026-08-23)**, seguindo a ordem relativa do desktop: `PROJETOS` · `CALENDÁRIO` ·
  `AULAS` · `ARTIGOS` · `PERFIL`.
  ~~*(Nota: a ordem compacta inverte Aulas/Calendário em relação à desktop — resposta
  literal da designer, registrada como decidida.)*~~ — **superada pela rodada 3.**
  **Decidido (rodada 3):** `BIBLIOTECA 3D` e `INSTAGRAM` ficam **no menu** — botão no
  ~~**topo, extremidade esquerda da barra**~~ **topo, à direita da barra, com o logo à
  esquerda** (**rodada 5, 2026-08-24** — supera a extremidade esquerda da rodada 3 e
  confirma `design/home-mobile.png`), com **todas as abas** (Biblioteca 3D só ali,
  sem atalho extra); **logo leva à Home**; o item **`PERFIL` deslogado abre a tela de
  login** (login por **e-mail + senha** — rodada 4; spec em [login.md](login.md)) —
  **Decidido (PO, 2026-08-24):** quem entra por aí cai na
  **[Minha Conta](minha-conta.md)**. **Confirmado (rodada 4, 2026-08-24):** o botão de menu
  é exclusivo das versões compactas.
  ~~Se o fluxo de cadastro **suprimir a barra inferior** (para não competir com `VOLTAR` /
  `SALVAR E CONTINUAR` da barra fixa de ação), isso segue **(proposta)**.~~
  **Decidido (rodada 4, 2026-08-24):** durante o cadastro no mobile a **barra inferior
  aparece** — não é suprimida; convive com a barra fixa de ação (questão 15 resolvida).
  **Decidido (rodada 5, 2026-08-24):** a barra inferior **aparece ao rolar a página** —
  não fica fixa desde o primeiro paint (a arte da home apenas a **omitiu**).
- **Header mobile — decidido (rodada 5, 2026-08-24):** logo do Fab Lab à **esquerda**,
  botão de menu à **direita**; quando o usuário está **logado**, o **avatar entra bem
  pequeno no header mobile** (além do item `PERFIL` na barra inferior). No cadastro de
  visitante o bloco de conta segue como `ENTRAR`/`CRIAR CONTA` **(proposta)**.
- Preview do avatar em faixa **sticky no topo** (~240px) com o botão ⟳ sobreposto, para o
  resultado ficar visível durante a customização.
- Seletor de base (`F`/`M`) e `NOME DO AVATAR` logo abaixo do preview, empilhados.
- Painéis empilhados em **acordeão** (ou navegação por âncoras/chips: Pele · Cabelo ·
  Rosto · Roupas · Acessórios); swatches e miniaturas em grade com células ≥44×44px;
  fileiras longas (30 cabelos, 20 tons) com rolagem vertical dentro da seção.
- ~~`Ver mais` do rosto expande inline.~~ Sem função com **4 opções por categoria**
  (rodada 3) — **remoção confirmada (rodada 4, 2026-08-24)**.
- `VOLTAR` / `SALVAR E CONTINUAR` em **barra fixa inferior** (safe-area), primário com
  ~65% da largura.

## Componentes

| Componente | Descrição | Origem |
|---|---|---|
| `HeaderPrincipal` | Header padrão do site com navegação canônica completa no desktop; compacto (ordem corrigida na rodada 3): tablet `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS`, mobile em barra inferior de 5 posições `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS · PERFIL`; `BIBLIOTECA 3D` e `INSTAGRAM` **no menu** | mockup novo + decisão |
| `BotaoMenu` / `MenuCompleto` | Botão no **topo, à direita** da barra, com o **logo à esquerda** (rodada 5; ~~extremidade esquerda~~ da rodada 3 superada); abre **todas as abas** (inclusive `BIBLIOTECA 3D` e `INSTAGRAM`); logo → Home. **Só nas versões compactas** (tablet/mobile) — no desktop não existe botão de menu | decidido (rodadas 3–5) |
| `AvatarPreview` | Pixel art sobre grade + base isométrica teal + botão ⟳ (**4 direções**) | mockup + decisão |
| `SeletorBase` | Card com 2 silhuetas rotuladas **`F`** e **`M`** (rodada 3; ~~`XX OU XY`~~ do mockup superado), seleção em contorno amarelo; afeta **só** `PARTE DE CIMA` | mockup novo + decisão |
| `CampoNomeAvatar` | Input com placeholder `Digite um nome...` e contador **`0/60`** (rodada 4; ~~`0/20`~~ do mockup é registro); **é o nome da pessoa** do passo 2 (rodada 3) | mockup novo + decisão |
| `SwatchRow` | Swatches de cor (tons de pele 20, tons de cabelo 10); seleção por contorno **(proposta — nenhum swatch aparece selecionado no mockup)** | mockup novo |
| `PainelCatalogo` | Card claro com título caps + grade de miniaturas; **sem legenda de quantidade** (rodada 3 — ~~`(n opções)`~~ sai da UI) | mockup novo + decisão |
| ~~`LinhaVerMais`~~ | ~~Fileira de opções + link `Ver mais ⌄` (olhos, nariz, boca)~~ — sem função com 4 opções por categoria (rodada 3); **remoção confirmada (rodada 4)** | mockup novo |
| ~~`CustomizationTabs`~~ | ~~5 abas Corpo/Cabelo/Rosto/Roupas/Acessórios~~ — **superado**: painéis simultâneos | mockup antigo |
| `StepIndicator` | Indicador de passos — **volta à tela com 2 passos `1 2`** (decidido na rodada 4; **confirmado na rodada 5** para a tela final); ~~quadrados `1 2 3`~~ do mockup antigo superados | mockup antigo + decisão (rodadas 3–5) |
| ~~`SkillCard`~~ | ~~Nome, ícone, `NÍVEL 1`, pips (10) e checkbox~~ — **fora do cadastro** (rodada 3); vive em [minha-conta.md](minha-conta.md), sem checkbox e com **nível inicial 0** (rodada 4) | mockup antigo + decisão |
| `ButtonSecondary` / `ButtonPrimary` | `VOLTAR` / `SALVAR E CONTINUAR →` (primário canônico) | mockup novo |
| `FormField`, `SelectField`, `DateField` | Campos do passo 2 com ícone à esquerda (pessoa, calendário, envelope, instituição, capelo, livro); `CURSO` é **combobox** (`Digite ou selecione seu curso`) | decidido (rodada 3) + mockup `criar-conta-passo-2.jpg` |
| `PasswordField` | `SENHA` — `Crie uma senha` + ícone de **olho** (mostrar/ocultar) | decidido (rodada 4) + mockup |
| `BotaoFormulario` | `CRIAR CONTA →` — **rosa canônico** (rosa preenchido, texto navy, sombra dura), decidido na **rodada 5**; ~~navy preenchido, texto claro~~ do mockup é registro superado | mockup + decisão (rodada 5) |
| `LinkLogin` | `Já tem uma conta?` `Fazer login` (azul) → tela de login | mockup `criar-conta-passo-2.jpg` |
| `CheckboxTermos` | Aceite de termos de uso e política de privacidade, com **link para os termos** — **decidido (rodada 5): entra no formulário do passo 2** (gate do cadastro); ~~ausente no mockup~~. Redação dos termos: **ISS-002** em [backlog.md](../../backlog.md). Link abre em **nova aba** (PO, 2026-08-24). Posição e microcopy **(proposta)** | decidido (rodada 5 + PO 2026-08-24) |
| `ToastError` / `InlineError` | Feedback de validação | **(proposta)** |

## Modelo de conteúdo (CMS)

### `skill` (coleção — dados de referência)

Campos (ver `gamification.md`): `nome`, `slug`, `icone`, `descricao`, `niveis_max` =
**10**, `xp_por_nivel` = **5**, `ativa`.
**Decidido (rodada 3, 2026-08-23):** as skills **não são escolhidas no cadastro** — as
skills **ativas** da organização são atribuídas **automaticamente** ao criar o perfil
(nível 0) e evoluem pelo jogo; a **visualização** fica em [minha-conta.md](minha-conta.md).
**Decidido (PO, 2026-08-24):** a coleção é **por organização** e o **catálogo é
administrável** pelo admin da org (adicionar/remover; as 5 são o seed do CITe). Remover =
**desativar** (`ativa: false`) — o ledger de XP é imutável e o `xp_total` não muda; skill
nova entra no nível 0 para todos (o campo ~~`inicial`~~ perde função — todas as ativas
são atribuídas).

### `avatar_item` (coleção — peças cosméticas)

> Somente **itens fixos** (decidido 2026-08-23) — sem campos de desbloqueio. Sprites
> produzidos pela designer. Catálogo por categoria conforme o novo mockup:

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `categoria` | enum | sim | `cabelo` (30), `olhos` (**4**), `nariz` (**4**), `boca` (**4**) — totais decididos na rodada 3 —, `roupa_cima` (10), `roupa_baixo` (10), `sapatos` (10), `oculos` (5), `chapeus` (5). Os totais são **catálogo de CMS**; não aparecem como legenda na UI (rodada 3) |
| `nome` | texto | sim | — |
| `sprite` | mídia | sim | `.png` pixel art (sem interpolação), `.webp` |
| `sprite_folhas` | mídia | não | spritesheet de rotação (.png + JSON) — **4 direções** |
| `compativel_base` | enum | não | `f`, `m` — **decidido (rodada 3):** aplica-se **apenas a `roupa_cima`**, o único slot que varia por base; nas demais categorias o campo fica vazio (sprite único) |
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
| `handle` | texto único | sim | exibido como `@handle`. **Decidido (rodada 4):** é **derivado do `nome`** no modelo `@nomesobrenome` (ex.: `@mariasilva`) — **não é digitado** no cadastro; normalização (acentos/espaços/maiúsculas) e desempate de homônimos **(proposta)** |
| `nome_avatar` | texto (**≤60** — rodada 4; ~~≤20~~) | sim | campo `NOME DO AVATAR` — **decidido (rodada 3): mesmo valor do `nome` da pessoa** (passo 2) |
| `nome` | texto (**≤60** — rodada 4) | sim | passo 2 — **decidido (rodada 3)**; alimenta também `nome_avatar` e o `handle` derivado (rodada 4); é o que aparece publicamente |
| `data_nascimento` / `email` | data / e-mail | sim | passo 2 — **decidido (rodada 3)**; o `email` é o **identificador de login** (rodada 4). **Decidido (PO, 2026-08-24):** aceita **qualquer e-mail** — sem exigência de domínio institucional UNESP (o vínculo vive em `vinculo_unesp`) |
| `vinculo_unesp` / `escolaridade` / `curso` | enum/texto | sim | passo 2 — **decidido (rodada 3)**; listas de opções **(proposta)**; `curso` é **combobox** — texto livre ou seleção (mockup 2026-08-24) |
| `senha_hash` | texto | sim | **decidido (rodada 4):** login por **e-mail + senha**; campo `Senha` no passo 2. Algoritmo/parâmetros de hash **(proposta)** |
| ~~`curso_unidade` / `ra_matricula`~~ | — | — | ~~antigo passo 3~~ — absorvidos por `curso` / `vinculo_unesp`; `ra_matricula` segue **(proposta)** |
| `avatar_config` | JSON | sim | `base` (**`f`/`m`** — rodada 3), `tom_pele`, `tom_cabelo`, e um item por slot: `cabelo`, `olhos`, `nariz`, `boca`, `roupa_cima` (variante por base), `roupa_baixo`, `sapatos`, `oculos?`, `chapeu?` + direção do preview |
| `avatar_render` | mídia | não | PNG composto para cards/ranking (mesmo rosto — decidido 2026-08-23) **(proposta)** |
| `skills` | relação N:N → `skill` | sim | com `nivel` e `xp` por skill — **criada automaticamente** no cadastro (rodada 3: não há escolha), **`nivel` inicial = 0** (rodada 4), exibida em Minha Conta |
| `xp_total` / `nivel` | número | sim | derivados |
| `aceite_termos_em` | data/hora | sim | **decidido (rodada 5, 2026-08-24):** o **checkbox de aceite entra no passo 2** (com link para os termos), então o carimbo é gravado no cadastro. Versão/URL dos termos a definir com a redação — **ISS-002** em [backlog.md](../../backlog.md) |

> Uploads de projeto não ocorrem nesta página; pertencem a Projetos e Biblioteca 3D.

## Ganchos de gamificação

- **Avatar**: a configuração alimenta o avatar usado em toda a plataforma (header, cards,
  `RANKING MAKERS`) — miniatura com **o mesmo rosto do boneco** (decidido 2026-08-23).
- **Itens fixos, sem recompensa**: nenhum item aparece bloqueado/com cadeado (decidido
  2026-08-23 — mecânica de desbloqueio adiada). "As opções podem ser combinadas
  livremente."
- **Skills iniciais**: **decidido (rodada 3)** — criadas **automaticamente** com o perfil,
  sem escolha do usuário, e evoluídas pelo jogo (1 ponto por tarefa). **Decidido (rodada 4,
  2026-08-24): nível inicial 0** — barra de pips **vazia** (pips de 10; 5 XP por nível, teto
  10); o `NÍVEL 1` do mockup antigo é registro superado. A visualização é em
  [minha-conta.md](minha-conta.md).
- **XP de boas-vindas (proposta)**: concluir o cadastro concede XP e conta para o Nível do
  Lab (números dos mockups são ilustrativos — economia real em `gamification.md`).
- Curtidas (♥) não têm papel nesta página.

## Estados e interações

- **Hover/foco (proposta)** — nenhum estado visível no mockup: swatches/miniaturas ganham
  contorno de foco (2px) navegável por teclado; `SALVAR E CONTINUAR` desloca a sombra dura.
- **Seleção**: o **único** estado selecionado visível no mockup é a primeira opção do
  seletor de base (rotulada ~~`XX`~~ → **`F`** na rodada 3), com **contorno amarelo**
  (~`#F7CA62`). Nenhum swatch ou miniatura de
  catálogo aparece marcado — as células de `SAPATOS`, inclusive a do chinelo, têm todas o
  mesmo contorno cinza-azulado neutro. Que os demais slots adotem esse mesmo padrão de
  seleção é **(proposta)**. Toda mudança atualiza o preview em tempo real **(proposta)**.
- ~~**`Ver mais`**: expande o catálogo completo da fileira (olhos/nariz/boca) inline ou em
  modal **(proposta)**.~~ Sem função com **4 opções por categoria** (rodada 3) — **remoção
  confirmada (rodada 4, 2026-08-24)**.
- **Seleção da base**: trocar entre `F` e `M` altera **apenas** a variante da
  `PARTE DE CIMA`; os demais slots permanecem como estão (rodada 3).
- **`NOME DO AVATAR`**: contador **`n/60`** em tempo real (rodada 4; ~~`n/20`~~ superado);
  como o valor é o **nome da pessoa** (rodada 3), os dois campos ficam sincronizados entre
  os passos. O identificador `@nomesobrenome` é **derivado** desse nome (rodada 4) —
  normalização, colisão de homônimos e validação de conteúdo (palavrões) seguem
  **(proposta — ver questão 12)**.
- **Loading**: skeleton no preview enquanto sprites carregam; `SALVAR E CONTINUAR` com
  spinner e desabilitado durante o envio **(proposta)**.
- **Vazio/Erro**: catálogo vazio → `Nenhum item disponível ainda`; falha de sprites →
  `Tentar novamente` **(proposta)**.
- **Deslogado (cadastro)**: header troca o bloco de conta por `ENTRAR`/`CRIAR CONTA`
  **(proposta)**; ~~`VOLTAR` retorna à home **(proposta)**~~ — **Decidido (PO,
  2026-08-24):** o `VOLTAR` do **passo 1** leva à **Home** (no passo 2 ele volta ao passo
  1). `ENTRAR` leva à **tela de login por e-mail + senha** (decidido na rodada 4; **design
  da tela de login definido** — ver [login.md](login.md); título/botão **`ENTRAR`** /
  **`ENTRAR →`**, e o **pós-login retorna à página de origem** — decisões do PO,
  2026-08-24).
- **Indicador de passos**: visível nos dois passos, com `1 2` (decidido na rodada 4 e
  **confirmado na rodada 5, 2026-08-24** — entra na tela final); o passo corrente em
  destaque **(proposta de estilo)**. *Nenhum dos dois mockups renderiza o indicador — a
  decisão prevalece (questão 18 resolvida).*
- **Aceite de termos (rodada 5, 2026-08-24)**: o checkbox é **obrigatório** para concluir
  o cadastro; o link abre os termos de uso/política de privacidade (redação em **ISS-002**,
  [backlog.md](../../backlog.md)). ~~Comportamento do link (nova aba × modal)~~ —
  **Decidido (PO, 2026-08-24):** o link abre em **nova aba**. O estado do CTA enquanto o
  aceite não é marcado segue **(proposta)**.
- **Senha**: ícone de olho alterna a visibilidade (mockup `criar-conta-passo-2.jpg`).
- **`Fazer login`**: link do passo 2 leva à tela de login (e-mail + senha; design
  definido por reuso do passo 2 — ver [login.md](login.md)). **Decidido (PO,
  2026-08-24):** lá o título/botão é **`ENTRAR`** / **`ENTRAR →`**; após entrar, o maker
  volta à **página de origem** — quem abriu o login direto (ou pelo `PERFIL`) cai na
  **Minha Conta**.
- **Logado (edição)**: o mockup mostra usuário logado — a tela reusada como
  `Editar avatar` do perfil, com `SALVAR` no lugar de `SALVAR E CONTINUAR` **(proposta)**.
- **Persistência (proposta)**: rascunho do avatar guardado localmente entre passos.

## Questões em aberto

1. ~~Quantas skills o usuário pode marcar (o bloco de skills saiu desta tela — regra segue
   indefinida)?~~ **Decidido (rodada 3, 2026-08-23):** **nenhuma** — não há escolha de
   skills no cadastro; todas evoluem pelo jogo e são vistas em Minha Conta.
2. ~~Conteúdo definitivo dos passos seguintes — dados pessoais, vínculo UNESP,
   confirmação?~~ **Decidido (rodada 3, 2026-08-23):** passo 2 = nome, data de nascimento,
   e-mail, vínculo com a UNESP, escolaridade, curso (vínculo absorvido aqui).
   **Decidido (rodada 4, 2026-08-24):** o passo 2 **ganha campo de senha** — login por
   **e-mail + senha**. **Decidido (rodada 5, 2026-08-24):** o **aceite de termos** entra no
   passo 2 (checkbox com link — ISS-002); a **tela de confirmação** segue **(proposta)**.
3. ~~O cadastro exige e-mail institucional UNESP ou aceita externos/comunidade?~~
   **Decidido (PO, 2026-08-24):** aceita **qualquer e-mail** — **não** há exigência de
   domínio institucional; o vínculo com a UNESP é declarado no campo próprio
   (`VÍNCULO COM UNESP`) do passo 2. Coerente com o **acesso aberto** do concept
   ([concept.md](../concept.md)): a conta serve para publicar, curtir e pontuar.
4. ~~Quais opções existem em `CABELO`, `ROSTO`, `ROUPAS` e `ACESSÓRIOS`?~~
   **Superado pelo novo mockup (2026-08-23):** cabelo 30 + 10 cores; roupas 3×10;
   acessórios 5+5; pele 20. ~~Restam os **totais de `OLHOS`/`NARIZ`/`BOCA`**~~ —
   **fechado na rodada 3 (2026-08-23): 4 de cada, 12 no total** (ver questão 13).
5. ~~Rotação: 2, 4 ou 8 direções?~~ **Decidido (2026-08-23): 4 direções.**
6. ~~Altura/tipo de corpo?~~ **Removidos (2026-08-23)**; o novo mockup introduz a base
   binária no lugar, com rótulos **`F` e `M`** (rodada 3) — ver questão 14.
7. Cadastro concede XP inicial? Quanto, e conta para o Nível do Lab?
8. Há login social/SSO da UNESP como alternativa ao formulário? *(O método base já está
   decidido na rodada 4: **e-mail + senha**; um SSO adicional segue em aberto.)*
9. ~~O mockup do passo 2 (`criar-conta-passo-2.jpg`) **não tem botão `VOLTAR`** — como o
   usuário retorna ao passo 1 para ajustar o avatar?~~ **Decidido (rodada 5, 2026-08-24):**
   o botão **`VOLTAR` será adicionado ao passo 2**. ~~**Segue em aberto:** no passo 1, para
   onde o `VOLTAR` leva — home ou tela de escolha entrar/cadastrar?~~ **Decidido (PO,
   2026-08-24):** o `VOLTAR` do **passo 1 leva à Home** — não existe tela intermediária de
   escolha entrar/cadastrar.
10. ~~**Nova:** para onde foi a **escolha de skills iniciais** — outro passo do fluxo, o
    perfil pós-cadastro, ou saiu do onboarding?~~ **Decidido (rodada 3, 2026-08-23):**
    **saiu do cadastro** — não há escolha em passo algum; skills evoluem pelo jogo e a
    **visualização** vive em **Minha Conta** ([minha-conta.md](minha-conta.md)).
11. ~~**Nova:** o fluxo continua em passos (o botão diz `SALVAR E CONTINUAR`), mas o
    **indicador `1 2 3` sumiu** — quantos passos existem e o indicador volta?~~
    **Decidido (rodada 3, 2026-08-23):** são **2 passos** (avatar → dados pessoais).
    ~~Se o indicador de passos volta à UI segue **(proposta)**.~~ **Decidido (rodada 4,
    2026-08-24):** o indicador **volta à tela**, com **2 passos (`1 2`)**.
12. ~~**Nova:** `NOME DO AVATAR` (≤20) é o mesmo que o `@handle` público, um apelido
    separado do boneco, ou vira o nome de exibição?~~ **Decidido (rodada 3, 2026-08-23):**
    é o **nome da pessoa** informado no cadastro (mesmo campo/valor). ~~**Segue em aberto**
    como esse nome convive com o `@handle` exibido nos cards.~~ **Decidido (rodada 4,
    2026-08-24):** publicamente aparece **o nome da pessoa**; o identificador segue o modelo
    **`@nomesobrenome`**, derivado do nome (ex.: `@mariasilva`), e **não é digitado** no
    cadastro — os handles dos mockups são ilustrativos. O **limite do nome passa a 60
    caracteres**. **Continuam (proposta):** regras de normalização (acentos, espaços,
    maiúsculas) e desempate de **homônimos**.
13. ~~**Nova:** totais dos catálogos de `OLHOS`, `NARIZ` e `BOCA`~~ **Decidido (rodada 3,
    2026-08-23): 4 opções de cada, 12 no total** (o mockup mostrava 9 olhos, 5 narizes e
    5 bocas com `Ver mais` — superado).
14. ~~**Nova:** a base `XX OU XY` — confirmar nomenclatura/rótulos dessa escolha e se os
    itens de roupa variam por base~~ **Decidido (rodada 3, 2026-08-23):** (a) rótulos
    **`F` e `M`**; (b) **apenas a `PARTE DE CIMA` varia por base** (`F` com peitos, `M`
    sem) — demais slots com sprite único.
15. ~~**Nova (rodada 2) — em aberto:** durante o fluxo de cadastro em mobile, a **barra
    inferior de navegação** (`PROJETOS · CALENDÁRIO · AULAS · ARTIGOS · PERFIL`) fica
    visível ou é suprimida em favor da barra fixa de ação (`VOLTAR` /
    `SALVAR E CONTINUAR`)?~~ **Decidido (rodada 4, 2026-08-24):** a barra inferior
    **aparece** durante o cadastro no mobile.
16. ~~**Nova (rodada 4):** a **tela de login** (e-mail + senha) ganha spec própria quando o
    mockup prometido pela designer chegar — recuperação de senha, erros de credencial e
    link para o cadastro seguem **(proposta)**.~~ **Resolvido (PO, 2026-08-24):** a spec
    existe — [login.md](login.md), por **reuso do design do passo 2** trocando o
    formulário (sem trilho esquerdo); recuperação de senha, erros de credencial e link
    para o cadastro seguem **(proposta)** lá.
17. ~~**Nova (mockup `criar-conta-passo-2.jpg`):** o CTA **`CRIAR CONTA →`** aparece em
    **navy preenchido com texto claro** — diverge do primário canônico. Formulários têm um
    estilo próprio de botão, ou vale o rosa canônico?~~ **Decidido (rodada 5, 2026-08-24):**
    vale o **rosa canônico** (rosa preenchido, texto navy, sombra dura) nos formulários de
    **criar conta e login** — o navy do mockup é **registro superado**.
18. ~~**Nova (mockup `criar-conta-passo-2.jpg`):** o **indicador de passos `1 2`** (decidido
    na rodada 4) **não aparece** no mockup do passo 2 — confirmar que entra na tela
    final.~~ **Confirmado (rodada 5, 2026-08-24):** o indicador `1 2` **entra na tela final**.
19. ~~**Nova (mockup `criar-conta-passo-2.jpg`):** o **aceite de termos/política de
    privacidade** segue ausente no desenho — confirmar a inclusão no passo 2.~~
    **Decidido (rodada 5, 2026-08-24):** o **checkbox de aceite entra** no formulário do
    passo 2, com **link para os termos**. Os termos básicos **serão redigidos** —
    **ISS-002** em [backlog.md](../../backlog.md), com recomendação de **validação jurídica
    da UNESP**. **Decidido (PO, 2026-08-24):** o link dos termos abre em **nova aba**.
