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
- **Sem trilho esquerdo** — **decidido (rodada 5, 2026-08-24): card centralizado, sem
  coluna** (o preview do avatar do passo 2 não se aplica ao visitante).
- **Card central** (mesmo estilo do passo 2):
  - Título display navy — **decidido (PO, 2026-08-24): `ENTRAR`**; botão `ENTRAR →`.
    Subtítulo — **decidido (PO, 2026-08-24):** `Bem-vindo de volta, maker!`
  - **`EMAIL`** — ícone de envelope — `Digite seu e-mail`.
  - **`SENHA`** — ícone de cadeado — placeholder **(proposta)**: `Digite sua senha` —
    com **ícone de olho** (mostrar/ocultar), herdado do passo 2.
  - **Botão de submit** — **decidido (rodada 5, 2026-08-24): rosa canônico** (rosa
    preenchido, texto navy, sombra dura); o navy do mockup do passo 2 é registro
    superado (resolve a questão 17 de `onboarding.md` para as duas telas). Rótulo
    **(proposta)**: `ENTRAR →` — a resposta da rodada 5 sobre a copy foi ambígua
    ("não") e o PO decidiu: **`ENTRAR`** (questão 1 fechada).
  - Link inverso **(proposta)**, espelhando a tela-mãe: `Não tem uma conta?`
    `Criar conta` → passo 1 do cadastro.
  - **`Esqueci minha senha`** — **decidido (rodada 5, 2026-08-24): o link entra**; o
    fluxo de recuperação (e-mail, tela de redefinição) segue **(proposta)** — questão 4.

## Adaptação tablet (768–1279px)

**(proposta)** Herda o comportamento do passo 2: card central em largura maior; barra
compacta do tablet + botão de menu no topo **à direita** (rodada 5; logo à esquerda).

## Adaptação mobile (<768px)

**(proposta)** Card em largura total com margens; barra inferior visível (aparece ao
rolar — rodada 5). **Decidido (PO, 2026-08-24) — pós-login:** retorna à **página de
origem**; quem abriu o login diretamente (ou pelo `PERFIL`) cai na **Minha Conta**.

## Componentes

| Componente | Descrição | Origem |
|---|---|---|
| `FormField` (`EMAIL`) / `PasswordField` (`SENHA` + olho) | Reuso direto do passo 2 | `onboarding.md` §6 |
| `BotaoFormulario` | Submit — **rosa canônico** (decidido rodada 5; navy do mockup superado) | decidido |
| `LinkCadastro` | `Não tem uma conta?` `Criar conta` (espelho do `LinkLogin`) | **(proposta)** |
| `LinkEsqueciSenha` | Recuperação de senha — link decidido (rodada 5); fluxo **(proposta)** | decidido + proposta |

## Modelo de conteúdo (CMS)

Nenhuma coleção nova — autentica contra `usuario`/`perfil_maker` (`email` +
`senha_hash`, ver `onboarding.md`). Recuperação de senha usa e-mail transacional
**(proposta técnica)**.

## Ganchos de gamificação

Nenhum — login não concede XP (só as ações da economia pontuam, decidido 2026-08-23).

## Estados e interações

- **Erro de credencial** **(proposta)**: mensagem inline neutra (`E-mail ou senha
  incorretos`) — sem revelar qual dos dois falhou nem se o e-mail existe (consistente
  com a regra de convite multi-tenant de não revelar contas — `docs/tech-stack.md`).
- **(proposta)** Rate limit de tentativas; loading no botão durante o submit; foco
  inicial no campo de e-mail; `Enter` submete.
- **Logado** acessando o login: redireciona para **Minha Conta** **(proposta)**.

## Questões em aberto

1. ~~Copy do título/botão?~~ **Decidido (PO, 2026-08-24): `ENTRAR` / `ENTRAR →`**
   (resolve a ambiguidade da rodada 5); subtítulo **`Bem-vindo de volta, maker!`**
   (PO, 2026-08-24). Fechada.
2. ~~Destino pós-login?~~ **Decidido (PO, 2026-08-24):** retorna à **página de
   origem**; acesso direto ao login leva à **Minha Conta**.
3. ~~O que ocupa o trilho esquerdo?~~ **Decidido (rodada 5): card centralizado, sem
   coluna.**
4. Fluxo de **recuperação de senha** — o **link está decidido** (rodada 5); o fluxo
   (e-mail, tela de redefinição) precisa de definição antes da feature 004.
5. "Lembrar de mim"/duração de sessão — política **(proposta técnica)**.
