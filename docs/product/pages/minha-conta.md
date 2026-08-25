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

> **Divergências do mockup — resolvidas na rodada 5 (2026-08-24):**
>
> 1. Barra de pips com 6 segmentos no mockup → a designer **confirmou a atualização do
>    desenho**: barra com **10 segmentos** e estado inicial **vazio (nível 0)**.
> 2. `NÍVEL 1` com 1 pip no mockup → ilustrativo; vale o **nível 0** (rodada 4).
> 3. Checkbox nos skill cards → **sobra do desenho antigo — sai**.

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
  (`gamification.md`), não do desenho. *Não há botão `EDITAR AVATAR` no mockup —
  **decidido (rodada 5, 2026-08-24):** a entrada de edição, os dados pessoais e o sair
  ficam no **menu do chevron `⌄` ao lado do avatar**, no header.*
- **Painel `SUAS SKILLS`** (card navy, restante da largura):
  - Título **`SUAS SKILLS`** + subtítulo **`Você poderá evoluir todas com o tempo!`**
    (microcopy herdada do mockup antigo do onboarding).
  - **Cards de skill** — no mockup, os 5 do catálogo inicial: `MODELAGEM 3D`,
    `CORTE A LASER`, `IMPRESSÃO 3D`, `ELETRÔNICA`, `DESIGN` — cada um com ícone outline
    (cubo; laser; extrusora; trilhas de circuito; caneta), rótulo `NÍVEL n` e barra de
    pips. Registro do mockup: 6 segmentos com o 1º preenchido e checkbox vazio no rodapé.
    **PO (2026-08-24):** o conjunto exibido é o **catálogo ativo da organização** —
    dinâmico (o admin da org adiciona/remove skills; remoção não altera XP), então o
    painel deve acomodar N cards, não 5 fixos.
  - **Decidido (rodada 5, 2026-08-24):** o desenho será atualizado — barra com **10
    pips** e estado inicial **vazio (nível 0)**; o **checkbox sai** (sobra do desenho
    antigo).

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
   - *Token do chip:* **decidido (rodada 5, 2026-08-24):** o chip de status usa o
     **teal `#74B7A5`** da paleta — o verde saturado (~`#1B9C6B`) do mockup foi trocado.
3. **`ARTIGOS`** — `Leia artigos e tutoriais sobre tecnologia, design e inovação.`
   - Item do mockup (registro): imagem, chip laranja `IMPRESSÃO 3D`, data `20/05/2025`,
     título `Como calibrar sua impressora 3D`, resumo `Dicas práticas para melhorar a
     qualidade das suas impressões.` e link **`Ler artigo completo →`**.
   - **Decidido (rodada 5, 2026-08-24):** a Minha Conta mostra sempre as **"minhas
     coisas"** — este card lista **os artigos que o próprio maker escreveu e postou**
     ("meus artigos"); o conteúdo de recomendação do mockup é ilustrativo. Descrição e
     link do card devem refletir isso **(proposta de microcopy)**.
4. **`CURSOS ASSISTIDOS`** — `Acompanhe seu progresso nos cursos que você já assistiu.`
   - Item de exemplo: thumbnail de vídeo com botão play, **barra de reprodução** e tempo
     **`12:45 / 25:30`**, chip azul `ELETRÔNICA`, título `Introdução à Arduino`,
     metadados **`25:30 | Básico`** e **barra de progresso com `60% concluído`**.
   - **Confirma dois campos que já estavam como (proposta)** em `pages/aulas.md` — e
     ajusta os dois: `nivel_dificuldade` — **decidido (rodada 5,
     2026-08-24):** vocabulário **`Básico · Intermediário · Avançado`** (o "Iniciante"
     da proposta antiga sai); e `progresso_aula` previa
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
  topo **à direita** (rodada 5; logo à esquerda).
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
| `SkillCard` | Nome, ícone, `NÍVEL n`, pips (10; inicial vazio) — **sem checkbox** (rodada 5) | mockup + decisões |
| `CardConteudoConta` | Ícone + título + descrição + chevron `›` | mockup |
| `EstadoVazioCriar` | Borda tracejada + `+` + rótulo (`Criar novo projeto`) | mockup |
| `ItemMeuModelo` | Foto, título, chip de status (`Público`), kebab `⋮` | mockup |
| `ItemMeuArtigo` | Imagem, chip de categoria, data, título, resumo, link — conteúdo do maker (rodada 5; visual do item de artigo do mockup) | mockup + decisão |
| `ItemCursoProgresso` | Thumb com play + barra de reprodução + tempo, chip, título, `duração \| dificuldade`, barra `n% concluído` | mockup |

## Modelo de conteúdo (CMS)

- Sem coleções novas; a página lê `perfil_maker` (avatar, nome ≤60, `@nomesobrenome`,
  skills nível/XP), coleções de conteúdo filtradas por autor e o progresso de aulas.
- **Ajustes trazidos pelo mockup** (a aplicar nas coleções correspondentes):
  - `aula.nivel_dificuldade` — já existia como **(proposta)** em `pages/aulas.md`;
    **decidido (rodada 5, 2026-08-24):** vocabulário **`Básico · Intermediário ·
    Avançado`**;
  - `progresso_aula` — já existia como **(proposta)** em `pages/aulas.md`
    (`percentual_assistido`, `concluida_em`); o mockup acrescenta a **posição de
    reprodução** (`12:45`), campo **novo**;
  - status de visibilidade do modelo 3D exibido como chip (`Público`) — já coberto pelo
    status editorial (rascunho/em revisão/publicado), mapeamento **(proposta)**.

## Ganchos de gamificação

- Skills com pips (10 níveis; início no nível 0 — decisões vigentes) e `NÍVEL n`.
- **Cursos assistidos** materializa o acompanhamento do XP de aulas (1 XP por aula) —
  **decidido (rodada 5, 2026-08-24):** o crédito acontece ao **assistir o vídeo inteiro**
  (100%); supera a proposta de ≥90%/botão `CONCLUIR AULA` de `pages/aulas.md`.
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
4. ~~Existe página de perfil pública de um maker?~~ **Decidido (PO, 2026-08-24): sim,
   versão enxuta** — avatar, nome, skills e conteúdos publicados; reusa componentes
   desta página (spec futura, features 004/005).
5. ~~Quando o "curso assistido" credita o 1 XP?~~ **Decidido (rodada 5, 2026-08-24):**
   ao **assistir o vídeo inteiro** (100%); o rastreio de posição continua para retomar a
   reprodução.
6. ~~Qual a função do **checkbox** nos skill cards?~~ **Decidido (rodada 5):** sobra do
   desenho antigo — **sai**.
7. ~~A barra de pips segue com 6 segmentos no desenho?~~ **Decidido (rodada 5):** o
   desenho será atualizado — **10 pips**, estado inicial **vazio** (nível 0).
8. ~~O card `ARTIGOS` é de leitura/recomendação?~~ **Decidido (rodada 5):** a Minha
   Conta mostra as **"minhas coisas"** — o card é **meus artigos** (o conteúdo de
   recomendação do mockup é ilustrativo).
9. ~~Onde ficam `EDITAR AVATAR`, dados pessoais e sair?~~ **Decidido (rodada 5):** no
   **menu do chevron `⌄` ao lado do avatar** no header.
10. ~~Rótulo de dificuldade `Básico` × enum proposto?~~ **Decidido (rodada 5):**
    vocabulário **`Básico · Intermediário · Avançado`**.
11. ~~Chip `Público` com verde fora da paleta?~~ **Decidido (rodada 5):** troca pelo
    **teal `#74B7A5`** da paleta.
