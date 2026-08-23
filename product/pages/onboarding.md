# Criar Conta (Onboarding)

## Propósito

Converter o visitante em **maker** cadastrado por meio de um fluxo curto de **3 passos**,
começando pela criação do **avatar em pixel art** e pela escolha das **5 skills iniciais**.
O passo 1 é deliberadamente lúdico: o usuário monta seu personagem antes de preencher
dados, reforçando a promessa gamificada ("Seu personagem maker, do seu jeito!").

## Fonte de design

- `design/ChatGPT Image 18 de ago. de 2026, 11_19_16.png` — **metade direita** da imagem
  (a metade esquerda é a home e não pertence a esta página). Mostra o **passo 1 de 3**
  em desktop.
- Apoio: `visual-identity.md` (paleta, tipografia, botões, pips) e `gamification.md`
  (skills iniciais, avatar, XP).
- **Passos 2 e 3 não possuem mockup** — toda a especificação deles é **(proposta)**.

## Estrutura da página — desktop (≥1280px)

Fundo geral **claro** (cinza muito claro; token exato **(proposta)**, ver `visual-identity.md`),
diferente das demais páginas (navy). Layout centralizado em coluna única com largura
máxima **(proposta)** de 1120px.

> **Decidido (2026-08-23):** os hexes da prancha de identidade são os **tokens web
> definitivos** (navy `#191C37`, azul `#3760AA`, teal `#74B7A5`, amarelo `#F8C810`, laranja
> `#EE703E`, rosa `#EE9DC4`); divergências de tom nos renders dos mockups são artefato e
> devem ser ignoradas. O tom exato do cinza de fundo desta página segue **(proposta)**.

### 1. Header do onboarding (barra navy, full-width)

- **Logo-chip rosa** extrudado à esquerda: ícone de cubo + `FAB LAB` / `CITE BAURU`.
- À direita: rótulo **`CRIAR CONTA`** seguido do **indicador de passos**: quadrados
  `1` `2` `3`; o passo atual (`1`) em **amarelo com texto navy**, os demais em outline claro.
- **Não há navegação principal** (Biblioteca 3D, Projetos, etc.) nesta tela — o fluxo é
  focado, sem escape pela nav.
  > **Decidido (2026-08-23):** a navegação canônica do site é
  > `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS` (nesta ordem, todos
  > os itens alinhados). Ela **não** aparece no onboarding — o header desta página segue sem
  > nav, por decisão de fluxo focado.

### 2. Cabeçalho da etapa

- Título display: **`CRIE SEU AVATAR`**.
- Subtítulo: **`Seu personagem maker, do seu jeito!`**.

### 3. Bloco de criação de avatar — duas colunas

**Coluna esquerda — Preview do avatar (~1/3 da largura)**

- Cartão claro com **fundo de grade quadriculada** (papel milimetrado).
- **Avatar em pixel art** de corpo inteiro sobre **plataforma isométrica teal**.
- **Botão de rotação** (ícone de duas setas circulares ⟳) no canto inferior **direito** do
  cartão, para girar o personagem — **decidido (2026-08-23): 4 direções** de rotação
  (ciclo de 4 frames isométricos).

**Coluna direita — Painel de customização (~2/3 da largura)**

- **Abas com ícone + rótulo**, na ordem: **`CORPO`** (ativa: ícone amarelo, rótulo em
  azul/navy com sublinhado), **`CABELO`**, **`ROSTO`**, **`ROUPAS`**, **`ACESSÓRIOS`**.
- Conteúdo da aba `CORPO` (única visível no mockup):
  - **`TOM DE PELE`** — 6 swatches quadrados em fileira, do mais claro ao mais escuro;
    o 4º está **selecionado** (contorno navy grosso + marcador circular no canto superior
    direito).
  - ~~**`CORPO`** — 4 miniaturas de silhueta (tipos de corpo); a 1ª selecionada com
    **contorno amarelo**.~~ — **REMOVIDO. Decidido (2026-08-23):** a seleção de **tipo de
    corpo** sai da customização (registro do mockup mantido acima).
  - ~~**`ALTURA`** — slider horizontal com **trilho azul**, **thumb amarelo** e botões
    **`‹`** e **`›`** nas extremidades para ajuste fino.~~ — **REMOVIDO. Decidido
    (2026-08-23):** o **slider de altura** sai da customização (registro do mockup mantido
    acima).

> **Decidido (2026-08-23):** sem tipo de corpo e sem altura, a aba `CORPO` fica reduzida ao
> **tom de pele (6 opções)**. As abas **`CABELO`**, **`ROSTO`**, **`ROUPAS`** e
> **`ACESSÓRIOS`** têm **10 itens cada**, todos **itens fixos** — **sem cosméticos de
> recompensa** por enquanto (mecânica de desbloqueio adiada). Os sprites (roupas, cabelos
> etc.) serão produzidos pela **própria designer**.

### 4. Bloco "Escolha suas skills iniciais"

- Cartão navy full-width com título **`ESCOLHA SUAS SKILLS INICIAIS`** e subtítulo
  **`Você poderá evoluir todas com o tempo!`**.
- **Grid de 5 cards claros** em uma linha, cada um com:
  - Nome em caps: **`MODELAGEM 3D`**, **`CORTE A LASER`**, **`IMPRESSÃO 3D`**,
    **`ELETRÔNICA`**, **`DESIGN`**.
  - **Ícone outline** (cubo isométrico; laser; extrusora; trilhas de circuito; caneta/pen tool).
  - Rótulo **`NÍVEL 1`**.
  - **Barra de pips** com **6 segmentos**, o 1º preenchido. — **Decidido (2026-08-23):** a
    barra representa **10 níveis**, ou seja **10 pips** (o 1º preenchido); o mockup de 6
    segmentos fica como registro **superado**.
  - **Checkbox** quadrado vazio no rodapé do card (seleção da skill).

### 5. Rodapé de navegação do passo

- Botão secundário à esquerda: **`VOLTAR`** (navy, texto claro).
- Botão primário à direita: **`CONTINUAR →`** (rosa, texto navy, sombra dura deslocada) —
  **decidido (2026-08-23):** é exatamente o **estilo primário canônico do site** (rosa
  preenchido, texto navy, sombra dura deslocada); a variante navy com contorno rosa foi
  descartada.
- **Não há footer institucional** (três pilares) nesta página no mockup.

### 6. Passos 2 e 3 — (proposta), sem mockup

- **Passo 2 — `SEUS DADOS`** (proposta): `Nome completo`, `@handle` (com verificação de
  disponibilidade), `E-mail`, `Senha` + `Confirmar senha`, aceite de
  `Termos de uso e política de privacidade`.
- **Passo 3 — `VÍNCULO UNESP`** (proposta): tipo de vínculo (`Aluno`, `Servidor`,
  `Voluntário externo`), `Curso/Unidade`, `RA/matrícula` (opcional para externos),
  `E-mail institucional` (opcional), e **tela de confirmação** com resumo do avatar +
  skills escolhidas e CTA **`COMEÇAR A CRIAR`** (proposta).

## Adaptação tablet (768–1279px)

Todas as decisões abaixo são **(proposta)** — o mockup é desktop.

- Header mantém logo + `CRIAR CONTA` + passos `1 2 3`; se faltar espaço, oculta o rótulo
  textual e mantém apenas os quadrados numerados.
- Bloco de avatar passa a **empilhado**: preview no topo (largura total, altura ~380px),
  painel de customização abaixo.
- Abas `CORPO/CABELO/ROSTO/ROUPAS/ACESSÓRIOS` viram **chips horizontais roláveis** com
  ícone + rótulo, mantendo o item ativo sublinhado.
- Grid de skills **5 → 3 colunas** (2 linhas: 3 + 2).
- Botões `VOLTAR` / `CONTINUAR` permanecem lado a lado no rodapé do conteúdo.
- Alvos de toque mínimos de **44×44px** (swatches, checkbox). *(O slider de altura foi
  removido — ver decisão de 2026-08-23.)*

## Adaptação mobile (<768px)

Todas as decisões abaixo são **(proposta)**.

- Header compacto (56px): logo-chip reduzido + indicador de passos `1 2 3`; o rótulo
  `CRIAR CONTA` é omitido. **Sem hambúrguer** — fluxo focado, sem navegação.
- Preview do avatar vira faixa **sticky no topo** (~260px) para permanecer visível
  enquanto o usuário customiza; botão de rotação sobreposto no canto.
- Abas de customização como **chips horizontais roláveis** fixos abaixo do preview.
- `TOM DE PELE`: 6 swatches em grid 6 colunas (mínimo 44×44px).
  ~~`CORPO`: 4 miniaturas em grid 2×2. `ALTURA`: slider full-width, botões `‹` `›` com 44px.~~
  **Decidido (2026-08-23):** tipo de corpo e altura **removidos**; as abas `CABELO`, `ROSTO`,
  `ROUPAS` e `ACESSÓRIOS` mostram seus **10 itens** em grid de miniaturas (mínimo 44×44px).
- Skills: **1 coluna** (cards empilhados) ou carrossel horizontal; alternativa aceitável é
  lista compacta com ícone à esquerda, `NÍVEL 1` + pips à direita e checkbox na borda.
- `VOLTAR` / `CONTINUAR` numa **barra fixa inferior** (safe-area), `CONTINUAR` em destaque
  ocupando ~65% da largura.

## Componentes

| Componente | Descrição | Origem |
|---|---|---|
| `OnboardingHeader` | Barra navy com logo-chip e rótulo `CRIAR CONTA` | mockup |
| `StepIndicator` | Quadrados `1` `2` `3`, ativo amarelo | mockup |
| `AvatarPreview` | Canvas pixel art sobre grade + base isométrica + botão ⟳ (**4 direções**, decidido 2026-08-23) | mockup + decisão |
| `CustomizationTabs` | 5 abas com ícone: Corpo/Cabelo/Rosto/Roupas/Acessórios — **10 itens por aba** em Cabelo/Rosto/Roupas/Acessórios (decidido 2026-08-23) | mockup + decisão |
| `SwatchRow` | 6 amostras de tom de pele, seleção com contorno + marcador | mockup |
| ~~`VariantGrid`~~ | ~~4 miniaturas de tipo de corpo, seleção em amarelo~~ — **REMOVIDO (decidido 2026-08-23)** | mockup (superado) |
| ~~`RangeSlider`~~ | ~~Altura, trilho azul + thumb amarelo + botões `‹` `›`~~ — **REMOVIDO (decidido 2026-08-23)** | mockup (superado) |
| `ItemGrid` | Grade de miniaturas dos **10 itens** da aba (cabelo/rosto/roupas/acessórios), seleção com contorno | decisão 2026-08-23 |
| `SkillCard` | Nome, ícone, `NÍVEL 1`, pips (**10**, decidido 2026-08-23 — mockup mostrava 6) e checkbox | mockup + decisão |
| `ButtonSecondary` / `ButtonPrimary` | `VOLTAR` / `CONTINUAR →` (primário canônico: rosa preenchido, texto navy, sombra dura) | mockup + decisão |
| `FormField`, `PasswordField`, `SelectField` | Passos 2 e 3 | **(proposta)** |
| `ToastError` / `InlineError` | Feedback de validação | **(proposta)** |

## Modelo de conteúdo (CMS)

### `skill` (coleção — dados de referência)

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `nome` | texto | sim | `Modelagem 3D`, `Corte a Laser`, `Impressão 3D`, `Eletrônica`, `Design` |
| `slug` | texto único | sim | — |
| `icone` | mídia | sim | `.svg`, `.png` (outline, monocromático) |
| `descricao` | texto longo | não | tooltip **(proposta)** |
| `niveis_max` | número | sim | **10** (decidido 2026-08-23; o mockup mostrava 6 pips — superado) |
| `xp_por_nivel` | número | não | **5 XP por nível** (decidido 2026-08-23), ver `gamification.md` |
| `inicial` | booleano | sim | se aparece no passo 1 **(proposta)** |
| `ativa` | booleano | sim | **(proposta)** — Serigrafia/Bordado Digital futuros |

### `avatar_item` (coleção — peças cosméticas)

> **Decidido (2026-08-23):** somente **itens fixos** — **10 por aba** (`cabelo`, `rosto`,
> `roupas`, `acessorios`). Sem cosméticos de recompensa por enquanto; os campos de
> desbloqueio ficam **adiados**. Sprites produzidos pela designer.

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `categoria` | enum | sim | `cabelo`, `rosto`, `roupas`, `acessorios` — **10 itens cada** (o valor `corpo` cai com a remoção de tipo de corpo/altura) |
| `nome` | texto | sim | — |
| `sprite` | mídia | sim | `.png` (pixel art, sem interpolação), `.webp` |
| `sprite_folhas` | mídia | não | spritesheet de rotação `.png` + JSON de frames — **4 direções** (decidido 2026-08-23) |
| `camada_z` | número | sim | ordem de composição **(proposta)** |
| ~~`desbloqueio`~~ | enum | — | ~~`inicial`, `nivel`, `missao`, `recompensa_lab`~~ — **ADIADO (2026-08-23)**: todos os itens são fixos/iniciais |
| ~~`nivel_minimo`~~ | número | — | **ADIADO (2026-08-23)** junto com a mecânica de desbloqueio |

### `tom_de_pele` (coleção — 6 registros)

`nome` (texto, sim), `hex` (cor, sim), `ordem` (número, sim).

### ~~`tipo_corpo` (coleção — 4 registros)~~ — REMOVIDA

~~`nome` (texto, sim), `miniatura` (mídia `.png`/`.svg`, sim), `ordem` (número, sim).~~

**Decidido (2026-08-23):** a seleção de tipo de corpo foi removida do avatar; a coleção não
existe. (Não há coleção equivalente para altura — o slider também foi removido.)

### `usuario` / `perfil_maker` (coleção)

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `handle` | texto único | sim | exibido como `@handle` |
| `nome_completo` | texto | sim | **(proposta)** passo 2 |
| `email` | e-mail único | sim | **(proposta)** passo 2 |
| `senha_hash` | texto | sim | **(proposta)** |
| `vinculo_unesp` | enum | sim | `aluno`/`servidor`/`voluntario_externo` **(proposta)** passo 3 |
| `curso_unidade` | texto | não | **(proposta)** |
| `ra_matricula` | texto | não | **(proposta)** |
| `avatar_config` | JSON | sim | tom de pele + itens por categoria (cabelo, rosto, roupas, acessórios) + direção do preview. ~~tipo de corpo, altura~~ **removidos (2026-08-23)** |
| `avatar_render` | mídia | não | PNG gerado para uso em cards/ranking **(proposta)** |
| `skills` | relação N:N → `skill` | sim | com `nivel` e `xp` por skill |
| `xp_total` / `nivel` | número | sim | derivados |
| `aceite_termos_em` | data/hora | sim | **(proposta)** |

> Uploads de projeto (imagens, PDF, STL, 3MF, OBJ, GLTF/GLB, ZIP) **não** ocorrem nesta
> página; pertencem às páginas de Projetos e Biblioteca 3D.

## Ganchos de gamificação

- **Skills iniciais**: as skills selecionadas (checkbox) são criadas no perfil em
  **`NÍVEL 1`** com a barra de **10 pips** (um por nível, decidido 2026-08-23 — o mockup
  mostrava 6) com 1 pip preenchido — estado inicial visível já no cadastro. Cada nível custa
  **5 XP**; o teto é o **nível 10** (ver `gamification.md`).
- **Avatar**: a configuração escolhida alimenta o avatar pixel art usado em toda a
  plataforma (header, rodapé dos cards, `RANKING MAKERS`) — cards e ranking usam **o mesmo
  rosto do boneco** em miniatura (decidido 2026-08-23).
- **XP de boas-vindas (proposta)**: concluir o cadastro concede XP inicial e contribui para
  o **Nível do Lab** coletivo (`1250 / 2000 XP` na home — **Decidido (2026-08-23):** os
  números de XP dos mockups são **ilustrativos**; a economia real é 1 XP por ação e 5 XP por
  nível, ver `gamification.md`).
- **Missões (proposta)**: ao final do passo 3, sugerir a primeira missão correspondente à
  skill escolhida (ex.: `Desafio Corte Laser`).
- ~~**Recompensas cosméticas (proposta)**: itens de `avatar_item` bloqueados aparecem no
  painel com cadeado e o texto do nível necessário.~~ **Adiado (2026-08-23):** somente itens
  fixos por enquanto — **nenhum item aparece bloqueado/com cadeado** no painel.
- Curtidas (♥) não têm papel nesta página.

## Estados e interações

- **Hover/foco (proposta)** — nenhum estado de hover é visível no mockup estático: abas
  ganham sublinhado; swatches/miniaturas ganham contorno de foco visível (2px) navegável
  por teclado (`Tab`/setas); `CONTINUAR` desloca a sombra dura.
- **Seleção**: tom de pele = contorno navy grosso + marcador; ~~tipo de corpo = contorno
  amarelo~~ (**removido em 2026-08-23**; reaproveitar o contorno amarelo para os itens das
  abas `CABELO`/`ROSTO`/`ROUPAS`/`ACESSÓRIOS` é **(proposta)** — a designer não definiu o
  estilo de seleção dos itens); skill = checkbox marcado **(proposta** — no
  mockup os 5 checkboxes estão vazios**)**.
  Toda mudança **atualiza o preview em tempo real (proposta)**.
- **Limite de skills (proposta)**: mínimo 1 e máximo 3 selecionadas; ao atingir o máximo,
  as demais ficam esmaecidas com aviso `Você já escolheu 3 skills`. **Regra a confirmar.**
- **Loading**: skeleton no cartão de preview enquanto sprites carregam; `CONTINUAR` entra
  em estado ocupado com spinner e fica desabilitado durante o envio **(proposta)**.
- **Vazio**: se o catálogo de itens de uma aba estiver vazio, mostrar
  `Nenhum item disponível ainda` **(proposta)**.
- **Erro**: falha ao carregar sprites → aviso com ação `Tentar novamente`; erros de
  validação dos passos 2/3 em mensagem inline abaixo do campo; e-mail/handle já usados →
  `Este @handle já está em uso` **(proposta)**.
- **Deslogado (padrão)**: fluxo completo disponível; `VOLTAR` no passo 1 retorna à home
  **(proposta)**.
- **Logado**: acesso a `/criar-conta` redireciona para o perfil; a edição do avatar reusa
  o mesmo painel em `Editar avatar`, sem indicador de passos e com botão `SALVAR`
  **(proposta)**.
- **Persistência (proposta)**: rascunho do avatar guardado localmente entre passos, para
  que `VOLTAR` no passo 2 não perca a customização.

## Questões em aberto

1. Quantas skills o usuário pode marcar no passo 1 (o mockup mostra checkboxes, sem regra visível)?
2. Conteúdo definitivo dos passos 2 e 3 — dados pessoais, vínculo UNESP, confirmação por e-mail?
3. O cadastro exige e-mail institucional UNESP ou aceita externos/comunidade?
4. ~~Quais opções existem em `CABELO`, `ROSTO`, `ROUPAS` e `ACESSÓRIOS` (o mockup só abre `CORPO`)?~~
   **Decidido (2026-08-23):** **10 itens por aba**, todos fixos (sem cosméticos de
   recompensa); a arte dos sprites será produzida pela designer.
5. ~~A rotação do avatar tem quantas direções (2, 4 ou 8 frames)?~~
   **Decidido (2026-08-23):** **4 direções**.
6. ~~`ALTURA` altera de fato o sprite ou é apenas escala? Faixa de valores?~~
   **Decidido (2026-08-23):** pergunta sem objeto — o **slider de altura foi removido**
   (assim como a seleção de tipo de corpo).
7. Cadastro concede XP inicial? Quanto, e conta para o Nível do Lab?
8. Há login social/SSO da UNESP como alternativa ao formulário?
9. Onde o `VOLTAR` do passo 1 leva — home ou tela de escolha entrar/cadastrar?
10. ~~A barra mostra **6 pips** — o nível máximo por skill é 6, ou a barra é apenas uma janela
    de progresso? (`gamification.md` registra "8 segmentos nos mockups" — divergência a corrigir.)~~
    **Decidido (2026-08-23):** a barra representa **os 10 níveis** — 10 pips, nível máximo 10,
    5 XP por nível. A divergência com `gamification.md` já foi corrigida a montante.
