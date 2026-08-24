# Fab Lab CITe Bauru — Conceito do Site

> Transposição do material de produto/design para documentação de referência.
> Fontes: `ESTRUTURA SITE.docx`, mockups em `design/`, proposta de identidade visual
> (`FabLab - Proposta de identidade visual-2.jpg` e `-3.jpg`) e pôsteres da cultura FabLab
> (`references/FabLab Posters.pdf` — Makers' Guide for Making, WeFab/Estúdio Arnold, 2016).

## Visão

O site do **Fab Lab CITe Bauru (UNESP)** é uma plataforma comunitária **gamificada** para a
cultura maker: um lugar onde alunos e voluntários publicam projetos, compartilham modelos 3D,
assistem aulas, escrevem artigos e evoluem como makers — com avatar próprio em pixel art,
skills, XP e missões, como em um jogo.

Slogan do hero: **"CRIE. EXPERIMENTE. TRANSFORME."**
Boas-vindas: *"Bem-vindo ao Fab Lab CITe Bauru. Aqui ideias ganham forma e você evolui como maker."*
CTA principal: **"COMECE A CRIAR"**.

## Pilares (footer em todas as páginas)

1. **Aprenda fazendo**
2. **Compartilhe conhecimento**
3. **Desenvolva projetos reais**

Valores herdados da cultura FabLab global (pôsteres de referência): espaço aberto
("Entre! Este é um espaço aberto."), documentação como memória coletiva ("Se você registrar
tudo o que fizer, o conhecimento fica."), colaboração entre pessoas, segurança no uso das
máquinas, reaproveitamento de materiais e iteração constante ("Mude seu pensamento. Mude de
novo. Mude mais uma vez.").

## Arquitetura de informação

Navegação principal (header, com logo-chip à esquerda e avatar do usuário à direita):

| Seção | Descrição (origem: ESTRUTURA SITE.docx) | Página |
|---|---|---|
| **Home** | Hero + missões em destaque + nível do lab + ranking + últimos projetos | [pages/home.md](pages/home.md) |
| **Biblioteca 3D** | Modelos 3D desenvolvidos por alunos, para explorar, baixar e imprimir | [pages/biblioteca-3d.md](pages/biblioteca-3d.md) |
| **Projetos** | Projetos realizados no lab pelos alunos | [pages/projetos.md](pages/projetos.md) |
| **Calendário** | Calendário de atividades do lab | [pages/calendario.md](pages/calendario.md) |
| **Aulas** | Cursos/tutoriais em vídeo para assistir | [pages/aulas.md](pages/aulas.md) |
| **Artigos** | Conteúdos, reflexões e referências | [pages/artigos.md](pages/artigos.md) |
| **Instagram** | Link externo, abre em nova aba | — |
| **Criar conta** | Onboarding em **2 passos** (1: criar avatar; 2: dados pessoais) — decidido na rodada 3 | [pages/onboarding.md](pages/onboarding.md) |
| **Minha Conta** | Perfil do maker: miniatura do avatar com as skills abaixo (rodada 3) | [pages/minha-conta.md](pages/minha-conta.md) |

> **Decidido (2026-08-23, designer):** navegação canônica **desktop** em todas as
> páginas, nesta ordem: `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM ·
> ARTIGOS` — Calendário e Aulas confirmados no menu principal. O item `AULAS` desalinhado
> em alguns mockups é ruído de render; tudo alinhado. **Rodadas 2–3:** nas versões
> compactas, `BIBLIOTECA 3D` e `INSTAGRAM` saem da barra e vivem no **menu** (botão no
> topo, à esquerda, com todas as abas) — **tablet**: `PROJETOS · CALENDÁRIO · AULAS ·
> ARTIGOS`; **mobile (barra inferior)**: `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS ·
> PERFIL` (ordem corrigida na rodada 3 para seguir a do desktop; logo → Home; `PERFIL`
> deslogado abre o login). A página Calendário segue sem mockup (spec marcada como
> proposta).

## Gamificação

Todos os voluntários têm um **personagem personalizável** (pixel art) e acumulam **skills**
como em um jogo: ao assistir aulas, postar projetos e escrever artigos ganham **pontos (XP)**.
Detalhamento completo em [gamification.md](gamification.md): missões, níveis por skill,
nível do usuário, nível coletivo do lab e ranking. As recompensas cosméticas de avatar
foram **adiadas** (decisão de 2026-08-23 — o v1 terá apenas itens fixos).

## Direção de arte

Duas camadas visuais complementares (detalhes em [visual-identity.md](visual-identity.md)):

1. **UI vetorial isométrica** — cards com contorno grosso, chips extrudados, elementos
   isométricos (cubos, plataformas, letra F), paleta da identidade sobre base navy.
2. **Mundo em pixel art** — **decidido (2026-08-23):** o hero da home **é** o mapa
   isométrico do lab estilo jogo (v2, substitui a faixa teal v1), com arte dedicada para
   mobile produzida pela designer; contêineres-estações (Impressoras 3D, Corte a Laser,
   Serigrafia, Cowork) e personagens pixel art; avatares dos usuários seguem esse estilo.

## Público

- **Visitante** — conhece o lab, navega conteúdo público, é convidado a criar conta.
- **Maker (aluno/voluntário logado)** — publica projetos/modelos/artigos, assiste aulas,
  ganha XP, evolui avatar e skills.
- **Equipe do lab (admin/moderação)** — gerencia conteúdo via CMS, valida publicações,
  cria missões, aulas e eventos do calendário.
- **Admin da organização** *(requisito multi-tenant, 2026-08-23)* — gerencia o perfil da
  sua organização (fablab/makerspace) e os usuários dela.
- **Master (plataforma)** *(requisito multi-tenant, 2026-08-23)* — cria e gerencia as
  contas de organizações e seus usuários admin, em painel master.

## Requisitos de plataforma

- **CMS** para artefatos de projetos: imagens, documentos e arquivos de múltiplas
  extensões (STL, 3MF, OBJ, GLTF/GLB, PDF, ZIP, imagens, vídeo via embed).
- **Responsivo em três tamanhos de tela** — mobile (<768px), tablet (768–1279px),
  desktop (≥1280px); mobile-first. Alvos de design: 390px, 834px, 1440px.
- **Frontend e backend separados no mesmo repositório** (monorepo).
- Conteúdo público indexável (SEO) em PT-BR; área logada gamificada.
- Armazenamento de objetos e banco intercambiáveis entre self-hosted e serviços
  gerenciados (ex.: MinIO ↔ S3). Análise em [tech-stack.md](tech-stack.md).
- **Multi-tenant** *(requisito de 2026-08-23)*: a plataforma poderá ser fornecida a
  outros fablabs/makerspaces. Usuários **master** criam e gerenciam contas de
  organizações e seus admins; **admins de organização** gerenciam o perfil e os usuários
  da própria organização. Estratégia técnica em [tech-stack.md](tech-stack.md).
