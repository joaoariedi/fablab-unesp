# Minha Conta

## Propósito

Área do maker logado: o **avatar** (preview com rotação), o painel **SUAS SKILLS** e os
quatro blocos de conteúdo do maker — **Meus Projetos**, **Meus Modelos 3D**, **Artigos** e
**Cursos Assistidos**. A escolha de skills não existe no cadastro (rodada 3); aqui é onde
elas são **visualizadas** e acompanhadas.

## Fonte de design

- **`design/minha-conta.jpg`** (2026-08-24) — **fonte primária**, desktop. Entregue pela
  designer conforme prometido na rodada 4.
- Decisões: rodada 3 (avatar + skills aqui) e rodada 4 (composição; skills nível 0; nome
  + `@nomesobrenome`; login e-mail + senha).
- Apoio: `visual-identity.md`, `gamification.md`, `pages/onboarding.md`, `pages/aulas.md`.

> **Divergências do mockup com decisões anteriores** (registradas — prevalecem as
> decisões até a designer dizer o contrário; ver Questões em aberto):
> 1. A barra de pips das skills tem **6 segmentos** no mockup (contados: 6 por card, o
>    1º preenchido, nos 5 cards); decidido (2026-08-23, economia de XP — nível máximo
>    **10**): a barra representa **10 níveis**.
> 2. Os cards mostram **`NÍVEL 1` com 1 pip preenchido**; decidido (rodada 4,
>    2026-08-24): skills **começam no nível 0** (barra vazia) — leitura: o estado do
>    mockup é ilustrativo.
> 3. Cada skill card tem um **checkbox vazio** no rodapé — a seleção de skills foi
>    removida do produto; a função desse checkbox é desconhecida (possível vestígio do
>    mockup antigo).

## Estrutura da página — desktop (≥1280px)

Fundo **claro** (cinza muito claro, como o onboarding; token exato **(proposta)**), texto
navy.

### Header (barra navy, padrão do site)

- Logo-chip **laranja** com cubo entre `FAB` e `LAB` (canônico ✓).
- Navegação canônica completa e alinhada: `BIBLIOTECA 3D` · `PROJETOS` · `CALENDÁRIO` ·
  `AULAS` · `INSTAGRAM` · `ARTIGOS` (✓ conforme decidido; sem botão de menu no desktop).
- À direita: avatar em moldura (busto/rosto do boneco) + `MAKER_X` / `NÍVEL 3` + chevron
  `⌄`. `MAKER_X` e `NÍVEL 3` são **ilustrativos** (mesma leitura de `pages/aulas.md`) —
  a UI real mostra o **nome da pessoa** (identificador `@nomesobrenome`, rodada 4) e o
  nível real (faixa 1–10).

### Título

- Display navy: **`MINHA CONTA`**.

### Bloco superior — avatar + skills

- **Card do avatar** (esquerda, ~1/5): fundo de grade quadriculada, avatar pixel art de
  corpo inteiro sobre plataforma isométrica teal, **botão de rotação** (⟳, setas
  circulares) no canto inferior direito — as **4 direções** vêm da decisão de 2026-08-23
  (`gamification.md`), não do desenho. *Não há botão `EDITAR AVATAR` no mockup — a
  entrada de edição segue **(proposta)**.*
- **Painel `SUAS SKILLS`** (card navy, restante da largura):
  - Título **`SUAS SKILLS`** + subtítulo **`Você poderá evoluir todas com o tempo!`**
    (microcopy herdada do mockup antigo do onboarding).
  - **5 cards claros**: `MODELAGEM 3D`, `CORTE A LASER`, `IMPRESSÃO 3D`, `ELETRÔNICA`,
    `DESIGN` — cada um com ícone outline (cubo; laser; extrusora; trilhas de circuito;
    caneta), rótulo `NÍVEL 1` e barra de pips (6 segmentos, 1º preenchido, no mockup) e
    **checkbox vazio** no rodapé.
  - **Vale a decisão**: pips representando **10 níveis** e estado inicial **nível 0**
    (mockup ilustrativo — ver divergências acima); checkbox sem função definida.

### Fileira inferior — 4 cards de conteúdo

Cards claros com ícone navy à esquerda do título (pasta cheia; cubo outline; artigo/livro;
capelo), título caps, descrição em duas linhas e chevron `›` no topo à direita (ação de
abrir a lista completa **(proposta)**):

1. **`MEUS PROJETOS`** — `Acompanhe e gerencie todos os projetos que você criou.`
   - Estado vazio visível no mockup: caixa de borda tracejada com **`+`** e
     **`Criar novo projeto`** — o CTA de publicação mora aqui.
2. **`MEUS MODELOS 3D`** — `Veja e gerencie seus modelos 3D publicados.`
   - Item de exemplo: foto do modelo, título `Bolsa Geométrica`, **chip de status verde
     `Público`** e menu kebab `⋮` (três pontos verticais; ações do item **(proposta)**:
     editar/despublicar/excluir).
   - *Atenção ao token:* o verde saturado desse chip (~`#1B9C6B`) **não está na paleta**
     de `visual-identity.md` (o verde canônico é o teal `#74B7A5`) — token do chip de
     status **(proposta)**, confirmar com a designer (questão 11).
3. **`ARTIGOS`** — `Leia artigos e tutoriais sobre tecnologia, design e inovação.`
   - **Nota:** o mockup mostra um card de **leitura/recomendação** de artigos (não "meus
     artigos"): imagem, chip laranja `IMPRESSÃO 3D`, data `20/05/2025`, título
     `Como calibrar sua impressora 3D`, resumo `Dicas práticas para melhorar a qualidade
     das suas impressões.` e link **`Ler artigo completo →`**. Supera a leitura
     "meus artigos" da resposta da rodada 4 — registrar como decidido pelo mockup.
4. **`CURSOS ASSISTIDOS`** — `Acompanhe seu progresso nos cursos que você já assistiu.`
   - Item de exemplo: thumbnail de vídeo com botão play, **barra de reprodução** e tempo
     **`12:45 / 25:30`**, chip azul `ELETRÔNICA`, título `Introdução à Arduino`,
     metadados **`25:30 | Básico`** e **barra de progresso com `60% concluído`**.
   - **Confirma dois campos que já estavam como (proposta)** em `pages/aulas.md` — e
     ajusta os dois: `nivel_dificuldade` estava proposto com o enum
     `Iniciante · Intermediário · Avançado`, mas o mockup escreve **`Básico`**
     (vocabulário divergente — questão 10); e `progresso_aula` previa
     `percentual_assistido`/`concluida_em`, ao que o mockup acrescenta a **posição de
     reprodução** (`12:45`). A duração aparece como **`25:30`** (mm:ss), e não como o
     `duracao_min` (`n min`) da coleção `aula`.
   - *Números ilustrativos:* `12:45 / 25:30` equivale a 50%, mas o rótulo diz
     `60% concluído` — no desenho posição e percentual não se derivam um do outro.

- Sem footer institucional visível no recorte do mockup **(proposta: manter o footer
  padrão)**; sem botões `VOLTAR`/`SALVAR` (não é um fluxo).

## Adaptação tablet (768–1279px)

Todas **(proposta)** — o mockup é desktop:

- Barra compacta do tablet (`PROJETOS · CALENDÁRIO · AULAS · ARTIGOS`) + botão de menu no
  topo à esquerda.
- Avatar + painel de skills empilhados (avatar no topo); skills em grid 3+2.
- Cards de conteúdo em grid 2×2.

## Adaptação mobile (<768px)

Todas **(proposta)**:

- Acesso pelo item **`PERFIL`** da barra inferior (deslogado → tela de **login**,
  e-mail + senha; design do login definido — ver `login.md`).
- Avatar no topo (compacto), painel de skills em lista vertical; cards de conteúdo
  empilhados em 1 coluna.

## Componentes

| Componente | Descrição | Origem |
|---|---|---|
| `AvatarPreview` | Grade + base isométrica teal + ⟳ (4 direções) — reuso do onboarding | mockup |
| `PainelSkills` | Card navy com título/subtítulo + 5 `SkillCard` | mockup |
| `SkillCard` | Nome, ícone, `NÍVEL n`, pips (10 por decisão; 6 no mockup), checkbox (função indefinida) | mockup + decisões |
| `CardConteudoConta` | Ícone + título + descrição + chevron `›` | mockup |
| `EstadoVazioCriar` | Borda tracejada + `+` + rótulo (`Criar novo projeto`) | mockup |
| `ItemMeuModelo` | Foto, título, chip de status (`Público`), kebab `⋮` | mockup |
| `ItemArtigoRecomendado` | Imagem, chip de categoria, data, título, resumo, `Ler artigo completo →` | mockup |
| `ItemCursoProgresso` | Thumb com play + barra de reprodução + tempo, chip, título, `duração \| dificuldade`, barra `n% concluído` | mockup |

## Modelo de conteúdo (CMS)

- Sem coleções novas; a página lê `perfil_maker` (avatar, nome ≤60, `@nomesobrenome`,
  skills nível/XP), coleções de conteúdo filtradas por autor e o progresso de aulas.
- **Ajustes trazidos pelo mockup** (a aplicar nas coleções correspondentes):
  - `aula.nivel_dificuldade` — já existia como **(proposta)** em `pages/aulas.md`; o
    mockup confirma o campo mas usa **`Básico`**, fora do enum proposto
    (`Iniciante · Intermediário · Avançado`) — alinhar vocabulário (questão 10);
  - `progresso_aula` — já existia como **(proposta)** em `pages/aulas.md`
    (`percentual_assistido`, `concluida_em`); o mockup acrescenta a **posição de
    reprodução** (`12:45`), campo **novo**;
  - status de visibilidade do modelo 3D exibido como chip (`Público`) — já coberto pelo
    status editorial (rascunho/em revisão/publicado), mapeamento **(proposta)**.

## Ganchos de gamificação

- Skills com pips (10 níveis; início no nível 0 — decisões vigentes) e `NÍVEL n`.
- **Cursos assistidos** materializa o acompanhamento do XP de aulas (1 XP por aula); o
  progresso (`60% concluído`) sugere crédito ao **concluir** — `pages/aulas.md` já propõe
  **≥90% do vídeo ou `CONCLUIR AULA`**; regra exata ainda em aberto (questão 5).
- `Criar novo projeto` é a porta do XP de publicação (1 XP ao publicar; o crédito **após
  moderação** é **(proposta)** — o fluxo de moderação segue em aberto,
  `gamification.md` questão 2).

## Estados e interações

- **Deslogado**: rota leva à tela de **login** (e-mail + senha; design definido — ver `login.md`).
- **Vazio (decidido pelo mockup em Meus Projetos)**: borda tracejada + `+ Criar novo
  projeto`; padrão análogo para modelos/cursos **(proposta)**.
- **(proposta)** Hover nos cards; kebab `⋮` com ações do item; chevron `›` abrindo a
  lista completa da seção; loading com skeleton; erro com `Tentar novamente`.

## Questões em aberto

1. ~~O que compõe a página?~~ **Decidido (rodada 4 + mockup 2026-08-24).** Layout agora
   tem fonte primária.
2. ~~Skills começam no nível 1 ou 0?~~ **Decidido (rodada 4): nível 0.** O mockup mostra
   `NÍVEL 1`/1 pip — tratado como ilustrativo (divergência registrada).
3. ~~Nome × @handle~~ **Decidido (rodada 4):** nome da pessoa + `@nomesobrenome`;
   normalização/homônimos **(proposta)**.
4. Existe página de perfil **pública** de um maker além da Minha Conta privada?
5. Quando o "curso assistido" credita o 1 XP — ao concluir (100%)? O progresso parcial do
   mockup (60%) sugere rastreio de posição; regra exata a definir.
6. **Nova (mockup):** qual a função do **checkbox** nos skill cards? A seleção de skills
   foi removida do produto — vestígio do mockup antigo ou ação nova?
7. **Nova (mockup):** a barra de pips segue com **6 segmentos** no desenho — confirmar a
   atualização para **10** (decisão de 2026-08-23, nível máximo 10) ou a designer prefere
   manter 6 como "janela" visual?
8. **Nova (mockup):** o card `ARTIGOS` é de **leitura/recomendação** (não "meus
   artigos") — confirmar que "meus artigos publicados" não aparece na Minha Conta.
9. **Nova (mockup):** onde fica a entrada **`EDITAR AVATAR`** (não há botão no mockup)?
   E onde ficam dados pessoais/LGPD/sair — no menu do chevron `⌄` do header?
10. **Nova (mockup):** o rótulo de dificuldade da aula é **`Básico`** no desenho, fora do
    enum proposto em `pages/aulas.md` (`Iniciante · Intermediário · Avançado`) — qual
    vocabulário vale?
11. **Nova (mockup):** o chip `Público` usa um **verde saturado fora da paleta** de
    `visual-identity.md` — entra como token novo (estado/status) ou vira teal `#74B7A5`?
