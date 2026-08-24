# Sistema de Gamificação

> Fonte primária: o documento de estrutura original ("Sistema de Gameficação" — docx
> transcrito integralmente na seção Regra central; arquivo removido em 2026-08-24) +
> elementos visíveis nos
> mockups (home e onboarding) + **decisões da designer (2026-08-23)**. Itens sem fonte
> direta estão marcados como **(proposta)**.

## Regra central (do documento de estrutura)

Todos os voluntários terão seu **personagem personalizável** e vão juntar **skills** como em
um jogo. Ao **assistir aulas**, **postar projetos** e **escrever artigos**, ganham **pontos**.

## Economia de XP — decidida em 2026-08-23

| Regra | Valor |
|---|---|
| XP por ação (assistir aula, publicar projeto, publicar modelo 3D, publicar artigo, concluir missão) | **1 XP** cada |
| Custo para subir de nível | **5 XP** por nível (curva linear) |
| Nível máximo | **10** (por enquanto) |
| Curtidas | **Não geram XP** |

- A curva (5 XP/nível) e o teto (10) valem para o nível do maker, as skills e o Nível do
  Lab — resposta única da designer; calibração fina pode voltar ao brainstorm.
- Ações fora da lista acima (ex.: ler artigo, receber curtida) **não pontuam**.
- **Rodada 5 (2026-08-24):** "assistir aula" conta ao **assistir o vídeo inteiro** — o
  1 XP é creditado na conclusão (100%).
- Os números dos mockups (`2450 XP`, `1250/2000 XP`, `NÍVEL 07`, autores níveis 1–7) são
  **ilustrativos** e não seguem essa economia; a UI real usa os valores desta tabela.
- A barra de pips das skills representa os **10 níveis** — o mockup mostra 6 segmentos,
  **superado** por esta decisão.

## Avatar — atualizado em 2026-08-23 (novo mockup `design/criar-conta-passo-1.png`)

- Pixel art em base isométrica com **4 direções de rotação** (botão ⟳ no preview).
- **Catálogo do novo mockup** (supera a resposta genérica "6 tons / 10 itens por aba" e o
  layout de abas do mockup antigo — agora é uma tela única com painéis simultâneos):
  - **Base do corpo `F` ou `M`** (rodada 3: rótulos trocados — o mockup mostra
    `XX OU XY`, superado). **Apenas a parte de cima varia por base** (`F` com peitos,
    `M` sem); os demais slots são únicos;
  - **Tons de pele: 20 opções**; **Tons de cabelo: 10 opções** (cor separada do corte);
  - **Cabelo: 30 opções** de corte;
  - **Rosto**: `OLHOS`, `NARIZ` e `BOCA` — **4 opções de cada, 12 no total** (rodada 3);
  - **Roupas** em 3 slots: `PARTE DE CIMA` (10), `PARTE DE BAIXO` (10), `SAPATOS` (10);
  - **Acessórios**: `ÓCULOS` (5) e `CHAPÉUS` (5).
  - **Rodada 3:** os **escritos de quantidade** da interface ("20 opções", "(10 opções)",
    "30 opções") **saem da UI** — mantém-se o desenho original; os números seguem valendo
    como tamanho de catálogo no CMS.
- **`NOME DO AVATAR`** — **decidido na rodada 3: é o nome da pessoa** informado no
  cadastro (mesmo valor). **Rodada 4 (2026-08-24):** limite ampliado de 20 para **60
  caracteres** (o contador `0/20` do mockup é registro); publicamente aparece **o nome da
  pessoa**, e o identificador segue o modelo **`@nomesobrenome`** (derivado do nome) —
  os handles fictícios dos mockups (`@laser.nick` etc.) são ilustrativos. Normalização
  (acentos/espaços) e colisões de nomes iguais: **(proposta)**.
- Combinação livre entre slots: "As opções podem ser combinadas livremente. Solte sua
  criatividade!"
- **Somente itens fixos por enquanto** — sem cosméticos de recompensa; a mecânica de
  desbloqueio fica para uma versão futura.
- Cards, ranking e header usam **o mesmo rosto do boneco** como miniatura.
- Produção dos sprites (roupas, cabelos etc.): **a própria designer**.
- **Rodada 3:** não há escolha de skills em nenhum passo do cadastro — ver a seção
  Skills e [pages/minha-conta.md](pages/minha-conta.md).

## Skills — atualizado na rodada 3 (2026-08-23)

As cinco skills:

1. **Modelagem 3D**
2. **Corte a Laser**
3. **Impressão 3D**
4. **Eletrônica**
5. **Design**

- **Não há escolha de skills no cadastro** (decidido na rodada 3 — supera o bloco
  "Escolha suas skills iniciais" do mockup antigo): todo maker evolui as skills **pelo
  jogo** — publicar modelos 3D, assistir aulas, publicar projetos — 1 ponto por tarefa
  (economia acima).
- A **visualização** das skills fica em **Minha Conta**: miniatura do avatar com as
  skills logo abaixo (ver [pages/minha-conta.md](pages/minha-conta.md)).
- Cada skill tem nível próprio (até **10**), exibido com barra segmentada em pips.
  **Decidido (rodada 4, 2026-08-24):** as skills começam no **nível 0** (barra de pips
  vazia); o "NÍVEL 1 com 1 pip" do mockup antigo é registro superado.
- **Decidido (PO, 2026-08-24): o catálogo de skills é dinâmico e por organização** — o
  **admin da organização** pode **adicionar e remover** skills; as 5 acima são o catálogo
  inicial (seed do CITe). **Remover uma skill não altera o XP de ninguém**: a remoção é
  **desativação** (`ativa: false`) — o ledger de XP é imutável, o `xp_total` do maker não
  muda e, se a skill for reativada, o progresso reaparece. Skill nova entra no **nível 0**
  para todos.
- Bordado Digital e Serigrafia aparecem como categorias de missão/conteúdo e são
  candidatas naturais a entrar pelo catálogo administrável.

## Nível do Lab e Ranking

- **Nível do Lab (coletivo)**: XP agregado da comunidade (card "Nível do Lab" na home).
  A recompensa coletiva mostrada no mockup ("Novo Acabamento de Avatar") está **adiada**
  junto com os cosméticos. **Decidido (PO, 2026-08-24): sem recompensa no v1** — o card
  mostra nível + barra como conquista coletiva; recompensa chega com os cosméticos (v2).
- **Ranking Makers**: top makers por XP total (ex. ilustrativo do mockup: 01 @laser.nick …
  05 @projeto_ana), com link "Ver ranking completo".
- **Multi-tenant (2026-08-23)**: toda a gamificação é **por organização** — ledger de XP,
  ranking, nível do lab e a tabela `regrasXp` são escopados por org (a tabela é copiada do
  padrão CITe ao criar cada organização). XP **não soma** entre labs; features de rede
  (ranking cross-lab etc.) dependem de decisão de produto (`docs/tech-stack.md` → Multi-tenancy).

## Missões

Cards de "Missões em destaque" na home, com ícone, descrição e barra de progresso em %:

| Missão (exemplo do mockup) | Descrição | Progresso |
|---|---|---|
| Desafio Corte Laser | Crie um chaveiro personalizado com corte a laser | 50% |
| Impressão 3D | Modele e imprima um suporte para celular | 30% |
| Bordado Digital | Personalize uma peça de tecido com bordado digital | 0% |

Link "Ver todas" → catálogo de missões **(proposta de página)**.
**Decidido (PO, 2026-08-24):** as missões em destaque da Home são **globais, curadas
pela equipe**, com **progresso individual** do maker logado (deslogado vê a missão sem
% pessoal, com convite ao login).
Missão concluída concede **1 XP** na skill correspondente (economia acima); recompensas
cosméticas de missão estão **adiadas**. **Decidido (PO, 2026-08-24):** conclusão
**validada pela equipe** na fila de revisão (questão 2) — o anexo de comprovação
(foto/arquivo) segue **(proposta)** de formato.

## Curtidas e social

- Curtidas (♥) em projetos, modelos 3D, artigos e aulas — **não geram XP** (decidido
  2026-08-23). **Decidido (PO, 2026-08-24): curtir exige login** (sem curtidas anônimas;
  atribuição sempre a uma conta).
- Conteúdo sempre atribuído ao autor: avatar pixel (mesmo rosto em miniatura) + nome/
  identificador + nível. **Rodada 4:** o identificador segue o modelo `@nomesobrenome`;
  os handles fictícios dos mockups são ilustrativos.

## Questões em aberto (para /speckit.brainstorm e /speckit.clarify)

1. ~~Tabela de XP por ação e curva de níveis (individual e do lab).~~
   **Decidido (2026-08-23):** 1 XP por ação; 5 XP por nível; nível máximo 10.
2. ~~Quem valida missões e publicações (fluxo de moderação)?~~ **Decidido (PO,
   2026-08-24):** **fila de revisão** — rascunho → em revisão → publicado pela equipe
   (fila do admin); o **1 XP credita na aprovação**. Anti-farm: idempotência por conteúdo
   (já decidida); sem limite diário no v1.
3. ~~Passos 2 e 3 do cadastro (dados pessoais? vínculo UNESP? confirmação?).~~
   **Decidido (rodada 3, 2026-08-23):** cadastro em **2 passos** — avatar → dados
   pessoais (nome, data de nascimento, e-mail, vínculo UNESP, escolaridade, curso).
   **Decidido (rodada 4, 2026-08-24):** o passo 2 ganha **senha** (login por e-mail +
   senha) — 7 campos, conforme o mockup `design/criar-conta-passo-2.jpg` e
   [pages/onboarding.md](pages/onboarding.md) §6.
4. ~~XP por atividades presenciais?~~ **Decidido (PO, 2026-08-24): fora do v1** — o
   calendário não concede XP por enquanto (campo reservado; revisitar com o jogo rodando).
5. ~~Curtidas geram XP para o autor? Limites?~~ **Decidido (2026-08-23):** não geram XP.
6. ~~Visitante não logado pode baixar modelos/assistir aulas?~~ **Decidido (PO,
   2026-08-24): tudo aberto** — downloads e aulas públicos; conta é para **publicar,
   curtir e pontuar** (XP). Downloads anônimos são contados.
7. ~~Skills novas entram quando?~~ **Decidido (PO, 2026-08-24):** v1 com as **5**;
   Serigrafia/Bordado entram quando houver aulas/missões para alimentá-las. **Mecanismo
   (PO, 2026-08-24):** o catálogo de skills é **administrável pelo admin da organização**
   (adicionar/remover, sem alterar o XP dos makers — remoção é desativação).
8. ~~Qual recompensa coletiva do Nível do Lab?~~ **Decidido (PO, 2026-08-24): sem
   recompensa no v1** — o card mostra nível + barra como conquista coletiva; recompensa
   chega com a mecânica de cosméticos (v2).
