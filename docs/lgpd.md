# Dados pessoais e LGPD

> **T040 / FR-030, US8.** O registro do que a plataforma coleta de uma pessoa, para quê, com
> que base legal, por quanto tempo, como o consentimento é retirado e o que exatamente a
> exclusão faz. A feature 004 é a primeira a guardar **dados pessoais** e a primeira a aceitar
> **credenciais**; a constituição (Princípio 5) torna a revisão de segurança obrigatória aqui, e
> a especificação registra que esta revisão é feita de substância — este documento é parte dela,
> não uma assinatura depois dela.
>
> **Este arquivo não é a Política de Privacidade.** O texto que a pessoa lê e aceita é a
> [ISS-002](backlog.md#iss-002--redigir-termos-de-uso-e-política-de-privacidade), da PO com
> validação jurídica institucional da UNESP. O que está aqui é a **leitura de referência da
> equipe**: o que o código realmente guarda e realmente apaga. Quando os dois discordarem, o
> código é o fato e este arquivo é o defeito.
>
> **Verificado por teste.** `apps/web/tests/accounts/lgpd-doc.test.ts` lê as colunas de
> `perfilMaker`, a constante `TERMS_VERSION`, a rota de exclusão e a lista
> `COLECOES_COM_AUTOR` **do código** e falha quando este documento para de descrevê-los. Um
> campo novo no perfil quebra o teste até ter linha na tabela abaixo — porque um dado pessoal
> coletado sem registro é exatamente a falha que um lint de markdown não enxerga.

## Dados coletados

Tudo o que uma pessoa entrega à plataforma, e onde cada coisa mora. Identidade é **global** (a
conta vale para toda a plataforma); o perfil é **por organização** (uma pessoa que faz em dois
labs tem um login e dois perfis — feature 002, CLR-002).

| Campo | Onde vive | O que é | Finalidade | Base legal |
|---|---|---|---|---|
| `email` | `users` (global) | Endereço de e-mail, é o login | Autenticar, recuperar senha, falar com a pessoa | Execução do serviço pedido pelo titular (LGPD art. 7º, V) |
| senha | `users` (global) | **Nunca em texto claro**: o Payload guarda um *hash* com salt e nunca devolve a senha; a plataforma não tem como lê-la | Autenticar | Execução do serviço pedido pelo titular (art. 7º, V) |
| `nome` | `perfilMaker` | Nome da pessoa, até 60 caracteres. **É público**: aparece na autoria de todo conteúdo que ela publica, e é também o nome do avatar (FR-011) | Creditar a autoria, identificar a pessoa no lab | Execução do serviço pedido pelo titular (art. 7º, V) |
| `handle` | `perfilMaker` | O `@nomesobrenome`, derivado do nome — não é digitado. **É público** | Endereçar o perfil, confirmar a exclusão | Execução do serviço pedido pelo titular (art. 7º, V) |
| `usuario` | `perfilMaker` | Referência à conta global por trás deste perfil | Ligar perfil e login | Execução do serviço pedido pelo titular (art. 7º, V) |
| `dataNascimento` | `perfilMaker` | Data de nascimento, só o dia (sem hora) | Perfil etário do público do lab, e a idade mínima que a ISS-002 vier a fixar | Consentimento (art. 7º, I) |
| `vinculoUnesp` | `perfilMaker` | Aluno(a), servidor(a), voluntário(a) externo(a) ou sem vínculo | Relatório institucional: quem o lab atende. O cadastro aceita **qualquer** e-mail (FR-009) justamente porque o vínculo é declarado aqui, e não inferido do domínio | Consentimento (art. 7º, I) |
| `escolaridade` | `perfilMaker` | Nível de escolaridade informado no passo 2 | Relatório institucional e desenho de oficinas | Consentimento (art. 7º, I) |
| `curso` | `perfilMaker` | Texto livre — o formulário sugere cursos, mas aceita qualquer um | Relatório institucional | Consentimento (art. 7º, I) |
| `avatarConfig` | `perfilMaker` | Base, tons de pele e cabelo e itens escolhidos no passo 1 | Desenhar o avatar nos cards e no ranking | Execução do serviço pedido pelo titular (art. 7º, V) |
| `avatarRender` | `perfilMaker` | Referência ao PNG composto no servidor a partir da configuração acima | Desenhar o avatar sem recompor a cada leitura | Execução do serviço pedido pelo titular (art. 7º, V) |
| `aceiteTermosEm` | `perfilMaker` | Quando a pessoa marcou o aceite no passo 2 | **Prova do consentimento** (art. 8º) | Cumprimento de obrigação legal (art. 7º, II) |
| `aceiteTermosVersao` | `perfilMaker` | **Qual** versão do texto foi aceita | Permitir exigir novo aceite de quem aceitou o texto antigo | Cumprimento de obrigação legal (art. 7º, II) |
| `skills` | `perfilMaker` | Nível e XP por skill do catálogo do lab. Atribuídas no cadastro, nível 0 — nunca escolhidas | Gamificação: o painel SUAS SKILLS | Execução do serviço pedido pelo titular (art. 7º, V) |

**Não coletado, e isso é uma decisão**: CPF, RG, número de matrícula, telefone, endereço e foto
da pessoa. Nenhum é pedido em lugar nenhum do cadastro. O `perfilMaker` também **não** ganha
`email` nem hash de senha — esses ficam no `users` global, que é o que significa "identidade é
da plataforma, papel é da organização".

**Não há rastreamento de terceiros**: nenhum analytics, nenhum pixel, nenhum CAPTCHA. A
especificação registra a recusa explícita de um CAPTCHA no cadastro (§ CLR-006): seria um
fornecedor de rastreio na frente de um formulário que coleta dados de estudantes sob a LGPD,
para defender uma fila de moderação que duas pessoas leem.

### Dados gerados pelo uso

Além do que a pessoa digita, o uso produz registros ligados à conta dela:

| Registro | Onde vive | O que é |
|---|---|---|
| Curtidas | `curtida` | Que conteúdo a pessoa curtiu. Apagadas na exclusão — ver abaixo |
| Progresso em aulas | `progressoAula` | Até onde a pessoa chegou em cada aula |
| Autoria | `artigo`, `aula`, `modelo3d` | O conteúdo que ela publicou, creditado ao perfil |

### Sobre as bases legais desta tabela

São as bases que o **produto assume hoje**, escritas aqui para que a discussão jurídica tenha um
ponto de partida concreto em vez de começar do zero. A ISS-002 pede validação jurídica
institucional, e a validação pode corrigir qualquer linha — em especial a fronteira entre
*execução do serviço* (o que a plataforma não consegue entregar sem o dado) e *consentimento* (o
que ela pede porque a UNESP quer saber). A distinção importa na prática: o que está sob
consentimento é o que uma pessoa pode retirar sem perder a conta.

## Retenção

**Por enquanto: enquanto a conta existir, e não mais do que isso — mas o prazo em número ainda
não existe, e ele é da ISS-002.**

A especificação é explícita ao dizer o que ficou de fora (§ CLR-003): *"o texto do que a pessoa
é informada na exclusão, e o prazo de retenção antes de a erasura se completar, pertencem aos
termos e à revisão jurídica da UNESP. Esta clarificação fixa o mecanismo para que a FR-031 seja
planejável; ela não escreve a política."* Inventar um prazo aqui seria este repositório
publicando política própria sobre dado de estudante — exatamente o que a ISS-002 existe para
impedir.

O que é **fato hoje**, e portanto pode ser registrado sem esperar ninguém:

- Não existe expurgo automático. Nenhuma rotina apaga perfis inativos, e nenhuma coluna marca
  um prazo. Um dado fica enquanto a pessoa mantiver a conta.
- A exclusão pedida pela pessoa é **imediata e em uma transação** — não há janela de
  arrependimento, e o § CLR-010 registra que um período de carência foi considerado e recusado
  (poria a conta num quarto estado que todo caminho de leitura teria de entender, e a janela de
  resposta da LGPD teria de acomodar a espera).
- Fora dos bancos, sobram os **backups** da infraestrutura e os **logs do servidor**. Nenhum dos
  dois tem política escrita, e nenhum dos dois é apagado pela exclusão descrita abaixo. Isto é
  uma lacuna conhecida, não um esquecimento.

**Quando a ISS-002 fechar**, o prazo entra nesta seção e o teste que guarda este arquivo falha de
propósito — ele checa que a ISS-002 ainda está ABERTA no [backlog](backlog.md) e exige que esta
seção a nomeie enquanto estiver. Fechar a pendência sem escrever o prazo quebra o build.

## Retirada do consentimento

**A rota é `/minha-conta/excluir`.** A pessoa entra assinada, lê os três resultados nomeados na
tela e digita o próprio `@handle` para confirmar (FR-031b, § CLR-010). Só então algo é apagado.
Digitar o handle é a fricção padrão para um ato irreversível, e torna impossível uma confirmação
acidental; a tela nomeia os três resultados porque a metade surpreendente é que **o trabalho
publicado fica**, e quem apaga esperando que seus projetos sumam foi enganado pelo silêncio.

Duas coisas que a retirada **não** é:

- **Não é um botão por campo.** Hoje não há como retirar o consentimento de `escolaridade`
  mantendo a conta: os campos do passo 2 são editáveis em Minha Conta (pode-se corrigir ou
  esvaziar o valor), mas a retirada formal do consentimento é a exclusão da conta. Se a
  validação jurídica separar as bases legais como a tabela acima propõe, isto vira uma pendência
  de produto.
- **Não é silenciosa quanto a novo aceite.** Quando o texto dos termos mudar, a constante
  `TERMS_VERSION` — hoje `0-iss-002`, declarada no passo 2 do cadastro — é incrementada, e quem
  aceitou a versão anterior tem `aceiteTermosVersao` diferente da corrente. É por isso que a
  versão é gravada **além** do carimbo de tempo: um horário sozinho só pode ser comparado com
  uma data de publicação que alguém lembra.

Pedidos que não têm rota (acesso/exportação, correção por terceiro, oposição) chegam pelo canal
de contato do lab e são atendidos à mão pela equipe, dentro do prazo legal. Ver *Direitos ainda
em aberto*.

## O que a exclusão faz

`apps/web/lib/accounts/deletion.ts`, em **uma transação**: ou os quatro efeitos acontecem, ou
nenhum. Nada é engolido — um erro sobe para quem chamou e a transação inteira volta atrás,
porque o estado parcial (curtidas apagadas com contadores intactos, autoria anulada com o perfil
ainda de pé) é irreparável e se parece com sucesso.

1. **O dado pessoal vai.** A linha de `perfilMaker` é apagada — com ela, todo campo que a pessoa
   digitou sobre si mesma: nome, handle, nascimento, vínculo, escolaridade, curso, avatar,
   carimbo de aceite e skills.
2. **O trabalho publicado fica, sem assinatura.** Em `artigo`, `aula` e `modelo3d`, o campo
   `autor` vira nulo e o documento continua publicado. O card passa a desenhar um **tombstone**
   (uma lápide: *"Maker removido"*) — que é um **estado de renderização**, nunca uma linha de
   perfil substituta, porque uma linha é algo a que se pode voltar a pendurar dados. O § CLR-003
   escolheu isso de propósito: a biblioteca pública do lab é feita dessas contribuições, e
   retirar o trabalho junto com a pessoa deixaria uma saída apagar em silêncio material didático
   de que o lab depende.
3. **As curtidas vão, e os contadores são recalculados.** Cada linha de `curtida` daquela conta é
   apagada e o contador de cada conteúdo tocado é **recomputado a partir das linhas
   sobreviventes**, não decrementado — um decremento carrega para sempre qualquer divergência
   anterior. Uma curtida é um ato de uma pessoa, não uma contribuição.
4. **A conta global só vai se nenhum outro lab a estiver usando.** Um login pode ter perfil em
   dois labs. A linha em `users` só é apagada quando não sobra perfil desta organização **e** não
   há vínculo com nenhuma outra — as duas contagens feitas dentro da mesma transação, para que
   dois labs apagando a mesma pessoa ao mesmo tempo se serializem em vez de os dois verem "ainda
   sobra um" e nenhum apagar.

**Pedir de novo não é erro.** Uma segunda exclusão do mesmo perfil não escreve nada e responde
que já foi feito (US8).

**O que a exclusão não alcança**: backups e logs de servidor (ver *Retenção*), e a cópia que o
conteúdo publicado é — o texto de um artigo escrito pela pessoa continua lá, sem o crédito. Se
alguém escreveu o próprio nome **dentro** de um artigo, essa menção não é apagada por esta rota.

## Direitos ainda em aberto

| Direito | Situação |
|---|---|
| Acesso / portabilidade (exportar os próprios dados) | **Em aberto por decisão registrada — § CLR-008.** A FR-031 ficou só com a exclusão: exportação não tinha formato, nem entrega, nem escopo definidos, e *"o que são os dados da pessoa"* é justamente o que a Política de Privacidade (ISS-002) define. O direito continua valendo independentemente do que esta feature implementa; até a rota existir, o pedido é atendido à mão pela equipe |
| Correção | Parcial: nome, dados do passo 2 e avatar são editáveis em Minha Conta. Não há rota para pedir correção de conteúdo publicado |
| Eliminação | Implementado — ver acima |
| Informação sobre compartilhamento | Nada é compartilhado com terceiros. Não há processador externo além da infraestrutura onde o sistema roda |
| Revisão de decisão automatizada | Não se aplica: não há decisão automatizada sobre pessoas. O XP e o nível são pontuação de uso, não avaliação |

## Quem vê estes dados

- **A própria pessoa**, em Minha Conta.
- **Qualquer visitante**, quanto a `nome`, `handle`, avatar e nível — são o bloco de autoria que
  todo card desenha. O resto do perfil **não** é público.
- **A equipe do lab**, pelo admin, e só a do próprio lab: a leitura de `perfilMaker` é uma
  restrição por organização, nunca um booleano — um booleano autorizaria a operação e entregaria
  junto a lista de makers do outro lab.
- **O papel `master`**, único que atravessa organizações. A lista de usuários da plataforma fica
  **escondida** do admin de organização de propósito: saber quais endereços têm conta é a
  enumeração que a especificação proíbe.

## Uma coisa que a equipe precisa saber sobre a exatidão destes dados

Na fase 1 **não há verificação de e-mail** (§ CLR-006, `EMAIL_VERIFICATION_REQUIRED`). Os
endereços são não confirmados: a plataforma guarda contas que talvez não consiga contactar, e um
e-mail digitado errado é irrecuperável pelo próprio dono. Para efeito de LGPD isso significa que
um `email` na base **não prova** que a pessoa que o digitou é a dona daquele endereço — o que
importa antes de responder a um pedido de titular só com base no endereço que chegou.
