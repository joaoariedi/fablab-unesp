# Minha Conta

## Propósito

Área do maker logado. **Decidido na rodada 3 (2026-08-23):** é aqui que vive a
**visualização das skills** — a página mostra uma **miniatura do avatar** com as **skills
logo abaixo** (a escolha de skills foi removida do cadastro; todas evoluem pelo jogo).
Demais conteúdos da página são **(proposta)** até haver mockup.

## Fonte de design

- **Sem mockup.** Conteúdo decidido pela designer na rodada 3 (resposta 1a): "ao entrar
  na opção minha conta, aparecerá uma miniatura do seu avatar e as skills embaixo".
- Apoio: `visual-identity.md` (padrões), `gamification.md` (skills, XP, pips) e
  `pages/onboarding.md` (avatar).

## Estrutura da página — desktop (≥1280px)

Tudo **(proposta)**, exceto o conteúdo decidido (miniatura do avatar + skills abaixo):

- **Header padrão** (chip laranja, nav canônica); acesso pela opção **Minha Conta** no
  bloco de conta (avatar + nome + chevron `⌄`).
- **Bloco do avatar (decidido)**: miniatura do avatar em pixel art (mesmo rosto usado nos
  cards); nome do maker (= `NOME DO AVATAR` do cadastro); **(proposta)** nível e XP total,
  botão `EDITAR AVATAR` reutilizando a tela de criação com `SALVAR`.
- **Bloco de skills (decidido)**: as 5 skills abaixo do avatar, cada uma com nome, ícone,
  `NÍVEL n` e barra de pips (10 níveis) — reuso do `SkillCard`.
- **(proposta)** Demais seções: meus projetos/modelos/artigos (com status de moderação),
  missões em andamento, dados pessoais (nome, data de nascimento, e-mail, vínculo UNESP,
  escolaridade, curso — campos do passo 2 do cadastro), privacidade/LGPD (exportar dados,
  excluir conta) e sair.

## Adaptação tablet (768–1279px)

**(proposta)** Blocos empilhados em largura total; skills em grid 3+2; barra compacta do
tablet (`PROJETOS · CALENDÁRIO · AULAS · ARTIGOS`) + menu.

## Adaptação mobile (<768px)

**(proposta)** Acesso pelo item **`PERFIL`** da barra inferior (decidido nas rodadas 2–3;
deslogado, `PERFIL` abre a tela de **login**). Avatar no topo, skills em lista de 1
coluna, demais seções em acordeão.

## Componentes

| Componente | Descrição | Origem |
|---|---|---|
| `AvatarMiniatura` | Miniatura pixel art do avatar (mesmo rosto dos cards) | decidido (rodada 3) |
| `SkillCard` | Nome, ícone, `NÍVEL n`, pips (10) — sem checkbox | reuso (onboarding antigo/gamification.md) |
| `BlocoDadosPessoais`, `ListaMeusConteudos`, `BotoesLgpd` | Seções adicionais | **(proposta)** |

## Modelo de conteúdo (CMS)

Sem coleções novas — a página lê `perfil_maker` (avatar, nome, skills com nível/XP) e as
coleções de conteúdo do próprio maker. Ver `pages/onboarding.md` (CMS) e
`gamification.md`.

## Ganchos de gamificação

- Exibe nível e XP por skill (pips de 10; 5 XP por nível) e **(proposta)** XP total,
  missões em andamento e conquistas futuras.
- Nenhuma ação desta página concede XP **(proposta)**.

## Estados e interações

- **Deslogado**: acesso leva à tela de **login** (decidido — comportamento do `PERFIL`).
- **(proposta)** Loading com skeleton; erro com `Tentar novamente`; edição de avatar
  reusa a tela de criação com `SALVAR`.

## Questões em aberto

1. O que mais compõe a página além de avatar + skills (meus conteúdos, missões, dados,
   LGPD)? Precisa de mockup da designer.
2. Skills começam no nível 1 ou 0? (espelha `gamification.md`).
3. Como o `@handle` dos cards convive com o nome do cadastro? (espelha
   `pages/onboarding.md`).
4. Existe página de perfil **pública** de um maker (ver perfil de outro usuário) além da
   Minha Conta privada?
