# Login

## Propósito

Tela de entrada do maker: **login por e-mail + senha** (decidido na rodada 4,
2026-08-24). É o destino do item `PERFIL` da barra inferior quando deslogado, do link
`Fazer login` do passo 2 do cadastro e do botão `ENTRAR` do header deslogado
**(proposta)**.

## Fonte de design

- **Decisão do PO (2026-08-24): reusa o design do passo 2 do cadastro**
  (`design/criar-conta-passo-2.jpg`), **trocando apenas o formulário**. Não haverá
  mockup dedicado por ora; se a designer entregar um, ele atualiza esta spec.
- Base visual herdada: header padrão navy (chip laranja, nav canônica), fundo claro com
  ornamentos isométricos esmaecidos (impressora 3D, cubos, trilhas de circuito), card
  central claro com contorno navy e sombra suave.
- Apoio: `pages/onboarding.md` (§6 — a tela-mãe), `visual-identity.md`,
  `pages/minha-conta.md`.

## Estrutura da página — desktop (≥1280px)

Herdada do passo 2 (`criar-conta-passo-2.jpg`), com o formulário trocado:

- **Header padrão** (chip laranja, nav canônica desktop, sem botão de menu). Estado
  deslogado do bloco de conta: `ENTRAR`/`CRIAR CONTA` **(proposta)**.
- **Trilho esquerdo**: no passo 2 há o preview do avatar — **não se aplica ao visitante
  do login**. O que ocupa o espaço (ornamento isométrico, mascote pixel art, ou card
  centralizado sem trilho) é **(proposta)** — ver questão 3.
- **Card central** (mesmo estilo do passo 2):
  - Título display navy — copy **(proposta)**: `FAZER LOGIN` ou `ENTRAR` (o título da
    tela-mãe é `CRIAR CONTA`); subtítulo **(proposta)**.
  - **`EMAIL`** — ícone de envelope — `Digite seu e-mail`.
  - **`SENHA`** — ícone de cadeado — placeholder **(proposta)**: `Digite sua senha` —
    com **ícone de olho** (mostrar/ocultar), herdado do passo 2.
  - **Botão de submit** — herda o estilo do formulário da tela-mãe (**navy preenchido**
    no mockup; a divergência com o primário rosa canônico é a **questão 17 de
    `onboarding.md`** — vale para as duas telas); rótulo **(proposta)**: `ENTRAR →`.
  - Link inverso **(proposta)**, espelhando a tela-mãe: `Não tem uma conta?`
    `Criar conta` → passo 1 do cadastro.
  - **`Esqueci minha senha`** **(proposta)** — link para recuperação por e-mail;
    fluxo de recuperação inteiro **(proposta)**.

## Adaptação tablet (768–1279px)

**(proposta)** Herda o comportamento do passo 2: card central em largura maior; barra
compacta do tablet + botão de menu no topo (lado: questão 10 de `home.md`).

## Adaptação mobile (<768px)

**(proposta)** Card em largura total com margens; barra inferior visível (política do
cadastro, rodada 4); chegando pelo `PERFIL`, o retorno pós-login vai a **Minha Conta**;
chegando por outra origem, retorna à página de origem **(proposta)** — ver questão 2.

## Componentes

| Componente | Descrição | Origem |
|---|---|---|
| `FormField` (`EMAIL`) / `PasswordField` (`SENHA` + olho) | Reuso direto do passo 2 | `onboarding.md` §6 |
| `BotaoFormulario` | Submit — mesmo estilo da tela-mãe (questão 17 de `onboarding.md`) | herdado |
| `LinkCadastro` | `Não tem uma conta?` `Criar conta` (espelho do `LinkLogin`) | **(proposta)** |
| `LinkEsqueciSenha` | Recuperação de senha | **(proposta)** |

## Modelo de conteúdo (CMS)

Nenhuma coleção nova — autentica contra `usuario`/`perfil_maker` (`email` +
`senha_hash`, ver `onboarding.md`). Recuperação de senha usa e-mail transacional
**(proposta técnica)**.

## Ganchos de gamificação

Nenhum — login não concede XP (só as ações da economia pontuam, decidido 2026-08-23).

## Estados e interações

- **Erro de credencial** **(proposta)**: mensagem inline neutra (`E-mail ou senha
  incorretos`) — sem revelar qual dos dois falhou nem se o e-mail existe (consistente
  com a regra de convite multi-tenant de não revelar contas — `tech-stack.md`).
- **(proposta)** Rate limit de tentativas; loading no botão durante o submit; foco
  inicial no campo de e-mail; `Enter` submete.
- **Logado** acessando o login: redireciona para **Minha Conta** **(proposta)**.

## Questões em aberto

1. Copy do título/subtítulo e rótulo do botão (`ENTRAR`? `FAZER LOGIN`?) — definir com a
   designer junto da questão 17 de `onboarding.md` (estilo do botão de formulário).
2. Destino pós-login: sempre Minha Conta, ou retorna à página de origem?
3. O que ocupa o trilho esquerdo no lugar do preview do avatar (ornamento, mascote, ou
   card centralizado sem trilho)?
4. Fluxo de **recuperação de senha** (link, e-mail, tela de redefinição) — precisa de
   definição antes da feature 004.
5. "Lembrar de mim"/duração de sessão — política **(proposta técnica)**.
