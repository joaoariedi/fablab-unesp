# Modelo de Conteúdo

> O que o site inteiro renderiza: projetos, modelos 3D, aulas, artigos e eventos, com suas
> categorias, a mídia que carregam e a fila de revisão que decide o que fica público.
>
> **O contrato é o produto, não este arquivo.** Cada campo nasce de uma tabela *Modelo de
> conteúdo* das especificações de página em `product/pages/` (por exemplo,
> [home.md](product/pages/home.md)); a
> feature `002-cms-conteudo` implementa esse contrato e sua especificação
> (`.specify/specs/002-cms-conteudo/`) guarda o rastro de cada decisão. Aqui fica a leitura
> de referência: o que existe, por que está escopado assim e onde vive no código.
>
> Convenção de nomes (constituição, Princípio 4): **rótulos e conteúdo em PT-BR, código em
> inglês**. Os slugs são PT-BR em camelCase (`categoriaProjeto`), porque são identificadores
> de conteúdo, não de código.

## As coleções

Treze coleções de conteúdo, mais as três coleções de mídia que a decisão D1 exigiu. Todas
são **por organização** — um segundo lab não herda o vocabulário nem os arquivos do CITe.

| Coleção | O que guarda | Origem |
|---|---|---|
| `projeto` | Projeto publicado por um maker: capa, galeria, arquivos, descrição rica | [projetos.md](product/pages/projetos.md) |
| `modelo3d` | Peça da biblioteca 3D, com `formatos` derivado dos arquivos enviados | [biblioteca-3d.md](product/pages/biblioteca-3d.md) |
| `aula` | Aula da trilha de formação | [aulas.md](product/pages/aulas.md) |
| `artigo` | Artigo editorial do lab | [artigos.md](product/pages/artigos.md) |
| `evento` | Evento de agenda, ligado a `local`, `maquina` e `aula` | [calendario.md](product/pages/calendario.md) |
| `categoriaProjeto` `categoriaArtigo` `categoriaModelo` | O vocabulário de cada listagem | FR-002 |
| `local` `maquina` | Recursos físicos do lab que um evento reserva | [calendario.md](product/pages/calendario.md) |
| `perfilMaker` | Autoria que o conteúdo exibe: `nome` e `handle` | [minha-conta.md](product/pages/minha-conta.md) |
| `curtida` | Curtida de um usuário autenticado em um conteúdo | FR-017 |
| `progressoAula` | Progresso de um usuário em uma aula | FR-003 |
| `midiaImagem` `midiaModelo3d` `midiaDocumento` | Os bytes enviados, um por grupo de upload | decisão D1 |

`users` e `organizations` continuam **globais**, como na feature 000: identidade é da
plataforma, papel é da organização.

## Escopo: por organização, declarado e verificado

Toda coleção é declarada `scoped` ou `global` em `apps/web/lib/tenancy/scope-registry.ts`,
com uma linha de justificativa. `tests/tenancy/registry.test.ts` falha **nas duas direções**
— coleção fora do registro e registro sem coleção — de modo que quem adicionar uma coleção
em 2027 é parado pela CI, não pela sorte da revisão.

`perfilMaker` é escopada de propósito (CLR-002): nível, XP e habilidades são por
organização, então quem faz em dois labs tem **um login e dois perfis**. Colocar esses
campos no `usuario` global funcionaria até existir o segundo lab — exatamente a falha que a
feature 000 existe para evitar.

Toda relação entre duas coleções escopadas carrega o validador compartilhado
`sameTenant` (`apps/web/lib/tenancy/same-tenant-validator.ts`), porque o plugin de
multi-tenancy não faz isso: na feature 000 uma linha da organização A foi apontada para uma
linha da organização B e a escrita passou. A única exceção é `perfilMaker.usuario`, cujo
alvo é global e portanto não tem tenant para comparar.

`payload-locked-documents` — a coleção interna do Payload que registra "alguém está editando
isto" — nomeia documentos por coleção e id, e o plugin não a escopa. Cada coleção de
conteúdo declara `lockDocuments: false`, então nenhuma linha é escrita e não há id de A para
B enumerar (FR-018, CLR-004). **O custo está precificado, não descoberto depois**: o aviso de
edição simultânea não existe nessas coleções, e dois membros da equipe no mesmo admin podem
sobrescrever um ao outro em silêncio.

## A fila de revisão

`rascunho → em_revisao → publicado` em `projeto`, `modelo3d`, `aula` e `artigo`. `evento`
tem o conjunto próprio que o calendário exige (`rascunho · publicado · cancelado ·
concluido`).

- **Qualquer maker autenticado submete; só a equipe do lab publica.** A transição para
  `publicado` é barrada por acesso de campo, não por convenção de tela.
- **A aprovação é carimbada uma vez por documento e nunca apagada** — `aprovadoEm` e
  `aprovacaoRegistrada`, na mesma escrita da transição (`apps/web/lib/content/review.ts`).
  Despublicar e republicar não gera um segundo carimbo.
- **Esta feature não concede XP nenhum** (CLR-001). A feature 005 lê o carimbo e credita o
  ledger, de modo que conteúdo aprovado antes dela creditar corretamente quando ela chegar,
  sem backfill.

## Leitura pública

Só `publicado` é listável publicamente; `rascunho` e `em_revisao` ficam com o autor e a
equipe. O site público não tem sessão, e o acesso escopado da feature 000 recusa quem não
está autenticado — então o caminho anônimo é um cliente próprio,
`getPublicScopedPayload(host)` em `apps/web/lib/tenancy/public-payload.ts`, que resolve a
organização **pelo host** e filtra por status.

Ele passa **ao lado** do acesso de coleção, não através dele, e a razão é medida: o plugin
de multi-tenancy soma `tenant IN (organizações do usuário)` ao que a função de acesso
devolver. Um ramo "público" escrito no acesso de coleção seria anulado para o visitante
autenticado de outro lab e recusado antes de rodar para uma conta recém-criada sem
vínculo — que veria *menos* que um visitante deslogado.

Duas regras de produto moram nesse caminho: **downloads são abertos e contados** (sem conta,
FR-015/FR-016) e **curtida exige conta** — não existe curtida anônima (FR-017).

## Mídia e upload

Os bytes passam pelo Node e são gravados no armazenamento compatível com S3 pelo adaptador
(decisão D1, 2026-09-06 — `clientUploads` está desligado, porque com ele ligado o Payload
retorna antes de `checkFileRestrictions` e todo limite por campo fica inerte).

**Três coleções de mídia, uma por grupo** (`image`, `model3d`, `document`), porque cada
botão que o Payload oferece para formato e tamanho é *por coleção*: uma coleção única só
poderia carregar a união das três listas de formatos e o maior dos três limites — um campo
de imagem de capa aceitando um arquivo de 200 MB. O campo declara o **grupo**, não a
extensão, porque `.svg` é legitimamente imagem e documento.

As três regras que valem para todo upload:

1. **Formatos e limites têm uma fonte só.** Os limites são os de [tech-stack.md](tech-stack.md)
   § Storage e as extensões são as de FR-011; ambos vivem em código em
   `apps/web/lib/uploads/limits.ts`, e `tests/uploads/limits.test.ts` lê os documentos e
   falha se eles divergirem. Aumentar um limite é uma mudança de documentação primeiro.
2. **A chave do objeto é gerada, nunca escolhida por quem envia** (FR-013). O nome original
   é metadado; nenhum caminho e nenhuma segunda extensão sobrevivem até o bucket.
3. **O conteúdo é conferido pelos bytes iniciais e nunca interpretado** (CLR-003). Um `.glb`
   é verificado como *contêiner*, jamais como *modelo*: rodar um parser binário sobre
   entrada hostil historicamente rende mais vulnerabilidade do que o problema que resolveria.
   O preview 3D é do cliente.

As coleções de conteúdo guardam **relacionamentos com as coleções de mídia**, não chaves de
texto (decisão D3 **revista em 2026-09-07**, opção ii). A escolha original — chave de texto —
era correta enquanto o caminho pré-assinado existia, porque a coluna servia aos dois
mecanismos; a decisão D1 removeu esse caminho e a T023b criou coleções de mídia cujos uploads
são documentos comuns do Payload, e a partir daí uma chave solta virou uma chave estrangeira
sem restrição — exatamente a relação "por string" que o validador `sameTenant` existe para
impedir em todo o resto do schema.

`projeto.imagemCapa` e `galeria` apontam para `midiaImagem`; `arquivos` é polimórfico sobre
`midiaModelo3d` e `midiaDocumento`, porque um projeto anexa malhas *e* documentos, e cada
grupo carrega seu próprio limite de tamanho.

As coleções de mídia **não recebem declaração de leitura pública**, e isso é deliberado: a
rota de download alcança o documento de mídia *através* do conteúdo publicado que o lista
(`depth: 1`), então a alcançabilidade é a regra de acesso — um arquivo é público exatamente
quando um conteúdo publicado o referencia. Declarar as coleções de mídia legíveis tornaria
enumeráveis os arquivos de todo rascunho.

Trocar MinIO por S3/R2 é configuração de ambiente, nunca código (Princípio 1, FR-019).

## Valores derivados

| Campo | Derivado de | Quando |
|---|---|---|
| `curtidas` | contagem de linhas de `curtida` | na mesma transação da curtida |
| `downloads` | incremento por download servido | na mesma transação do download |
| `totalModelos` na categoria | contagem de `modelo3d` | na mesma transação do publicar/despublicar |
| `formatos` no `modelo3d` | extensões dos arquivos do próprio documento | ao salvar |

Os quatro seguem **uma** estratégia (`apps/web/lib/content/counters.ts`): o valor é
**guardado na coluna**, não contado a cada leitura — uma grade de vinte cards emitiria vinte
`count(*)` — e é mantido **dentro da transação da escrita que o causou**, porque a falha
oposta é silenciosa: a curtida comita, a recontagem não, e o número fica errado para sempre
sem nada reclamar.

O que isso não previne está nomeado em vez de ignorado: um contador guardado envelhece se
uma linha de origem for criada ou apagada por um caminho que essa função não vê (exclusão em
massa no admin, migração, SQL manual). A mitigação é o teste de reconciliação
(`apps/web/tests/content/counters.test.ts`), que recalcula cada contador a partir das linhas
de origem na CI.

## Onde isso vive no código

| Caminho | O que faz |
|---|---|
| `apps/web/collections/content/` | As coleções de conteúdo e suas categorias |
| `apps/web/collections/Media.ts` | As três coleções de mídia, geradas a partir dos grupos |
| `apps/web/lib/tenancy/scope-registry.ts` | A declaração `scoped`/`global` de cada coleção |
| `apps/web/lib/tenancy/public-payload.ts` | O caminho de leitura anônima |
| `apps/web/lib/content/review.ts` | O carimbo de aprovação idempotente |
| `apps/web/lib/content/counters.ts` | A estratégia única dos contadores |
| `apps/web/lib/content/downloads.ts` | O download anônimo, servido e contado |
| `apps/web/lib/uploads/limits.ts` | Grupos, extensões e limites, como constantes nomeadas |

## O que este modelo **não** inclui

- **As páginas públicas que renderizam tudo isto** são da feature 003. O texto rico é
  Lexical (o editor padrão do Payload, escolhido para que a equipe publique sem linha de
  comando), então o renderizador de 003 se planeja em torno de JSON, não de markdown.
- **Cadastro, login e construtor de avatar** são da feature 004. O `perfilMaker` já existe
  com `nome` e `handle`; 004 acrescenta o avatar.
- **`skill`, `missao`, `estacao`, XP e níveis** são da feature 005, junto com os campos de
  relacionamento que apontam para elas (decisão D2): o Payload recusa um `relationTo` que
  nomeia coleção inexistente, então a declaração não pode preceder o alvo.
- **O calendário não dá XP no v1** (FR-023): `xp_presenca` existe no modelo e não é usado.
