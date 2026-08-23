# Sistema de Gamificação

> Fonte primária: `ESTRUTURA SITE.docx` ("Sistema de Gameficação") + elementos visíveis nos
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
- Os números dos mockups (`2450 XP`, `1250/2000 XP`, `NÍVEL 07`, autores níveis 1–7) são
  **ilustrativos** e não seguem essa economia; a UI real usa os valores desta tabela.
- A barra de pips das skills representa os **10 níveis** — o mockup mostra 6 segmentos,
  **superado** por esta decisão.

## Avatar — atualizado em 2026-08-23 (novo mockup `design/avatar-create.png`)

- Pixel art em base isométrica com **4 direções de rotação** (botão ⟳ no preview).
- **Catálogo do novo mockup** (supera a resposta genérica "6 tons / 10 itens por aba" e o
  layout de abas do mockup antigo — agora é uma tela única com painéis simultâneos):
  - **Base do corpo `XX OU XY`** (2 opções) — no lugar dos 4 tipos de corpo e do slider
    de altura, removidos;
  - **Tons de pele: 20 opções**; **Tons de cabelo: 10 opções** (cor separada do corte);
  - **Cabelo: 30 opções** de corte;
  - **Rosto**: `OLHOS`, `NARIZ` e `BOCA` escolhidos separadamente (cada fileira tem
    `Ver mais` — totais a confirmar);
  - **Roupas** em 3 slots: `PARTE DE CIMA` (10), `PARTE DE BAIXO` (10), `SAPATOS` (10);
  - **Acessórios**: `ÓCULOS` (5) e `CHAPÉUS` (5).
- **`NOME DO AVATAR`** próprio, até **20 caracteres** (relação com o `@handle` em aberto).
- Combinação livre entre slots: "As opções podem ser combinadas livremente. Solte sua
  criatividade!"
- **Somente itens fixos por enquanto** — sem cosméticos de recompensa; a mecânica de
  desbloqueio fica para uma versão futura.
- Cards, ranking e header usam **o mesmo rosto do boneco** como miniatura.
- Produção dos sprites (roupas, cabelos etc.): **a própria designer**.
- A **escolha das skills iniciais saiu desta tela** no novo mockup — em qual passo ela
  acontece está em aberto (`pages/onboarding.md`, questão 10).

## Skills

Cinco skills iniciais escolhidas no cadastro ("Escolha suas skills iniciais — você poderá
evoluir todas com o tempo!"):

1. **Modelagem 3D**
2. **Corte a Laser**
3. **Impressão 3D**
4. **Eletrônica**
5. **Design**

Cada skill tem nível próprio (1 a **10**), exibido com barra segmentada em pips.
**(proposta)** Bordado Digital e Serigrafia aparecem como categorias de missão/conteúdo e
podem virar skills futuras.

## Nível do Lab e Ranking

- **Nível do Lab (coletivo)**: XP agregado da comunidade (card "Nível do Lab" na home).
  A recompensa coletiva mostrada no mockup ("Novo Acabamento de Avatar") está **adiada**
  junto com os cosméticos de recompensa — definir recompensa alternativa **(em aberto)**.
- **Ranking Makers**: top makers por XP total (ex. ilustrativo do mockup: 01 @laser.nick …
  05 @projeto_ana), com link "Ver ranking completo".
- **Multi-tenant (2026-08-23)**: toda a gamificação é **por organização** — ledger de XP,
  ranking, nível do lab e a tabela `regrasXp` são escopados por org (a tabela é copiada do
  padrão CITe ao criar cada organização). XP **não soma** entre labs; features de rede
  (ranking cross-lab etc.) dependem de decisão de produto (tech-stack.md → Multi-tenancy).

## Missões

Cards de "Missões em destaque" na home, com ícone, descrição e barra de progresso em %:

| Missão (exemplo do mockup) | Descrição | Progresso |
|---|---|---|
| Desafio Corte Laser | Crie um chaveiro personalizado com corte a laser | 50% |
| Impressão 3D | Modele e imprima um suporte para celular | 30% |
| Bordado Digital | Personalize uma peça de tecido com bordado digital | 0% |

Link "Ver todas" → catálogo de missões **(proposta de página)**.
Missão concluída concede **1 XP** na skill correspondente (economia acima); recompensas
cosméticas de missão estão **adiadas**. **(proposta)** Conclusão validada pela equipe do
lab (anexar foto/arquivo do resultado).

## Curtidas e social

- Curtidas (♥) em projetos, modelos 3D, artigos e aulas — **não geram XP** (decidido
  2026-08-23).
- Conteúdo sempre atribuído ao autor: avatar pixel (mesmo rosto em miniatura) + @handle +
  nível.

## Questões em aberto (para /speckit.brainstorm e /speckit.clarify)

1. ~~Tabela de XP por ação e curva de níveis (individual e do lab).~~
   **Decidido (2026-08-23):** 1 XP por ação; 5 XP por nível; nível máximo 10.
2. Quem valida missões e publicações (fluxo de moderação) e regras anti-farm.
3. Passos 2 e 3 do cadastro (dados pessoais? vínculo UNESP? confirmação?).
4. XP por atividades presenciais (check-in via calendário? QR code no lab?).
5. ~~Curtidas geram XP para o autor? Limites?~~ **Decidido (2026-08-23):** não geram XP.
6. Visitante não logado pode baixar modelos/assistir aulas sem conta?
7. Skills novas (Serigrafia, Bordado Digital) entram quando?
8. Qual recompensa coletiva substitui o item de avatar ao subir o Nível do Lab, já que os
   cosméticos de recompensa foram adiados?
