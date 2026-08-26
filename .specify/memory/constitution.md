# Project Constitution
<!-- Version: 1.2.0 | Date: 2026-08-25 -->
<!-- Updated by /speckit.constitution -->

Governing principles for the Fab Lab CITe Bauru platform. Every spec, plan and pull
request is checked against these. They codify decisions already recorded in
`docs/tech-stack.md`, `docs/product/` and `docs/sdd-strategy.md` — when this file and a
decision record disagree, the dated decision record wins and this file is amended.

**Amendment policy.** A substantive change to a principle or constraint **bumps the minor
version** and is logged under [Amendments](#amendments) with its date and source. The
amended text also carries an inline `(amended <date>: …)` note so the reasoning stays
readable where the rule lives. Editorial changes — typos, rewrapping, formatting — bump
nothing and are not logged. **Cite this file by section, never by line number:** an
amendment shifts every line below it, and stale line citations still read as authoritative.

## Principles

1. **Locked stack, swappable services** — Next.js (App Router/RSC) with **Payload CMS 3
   embedded in the same app**, TypeScript end to end, PostgreSQL, and S3-compatible
   object storage. Swapping self-hosted for managed (MinIO ↔ S3/R2, local Postgres ↔
   Neon/Supabase/RDS) happens through **environment configuration only, never a code
   change**. Adding a runtime, service or container requires written justification
   against what the workspace already does; Colyseus.js (realtime) and Phaser.js
   (game-specific interactivity) are pre-sanctioned for future needs and **out of v1
   scope**. Next, Payload and the multi-tenant plugin are version-pinned and upgraded
   only in a dedicated sprint.

2. **Tenancy is a property of the data, never a deploy mode** — there is no
   `TENANCY_MODE` flag and no conditional tenancy branch: a sovereign installation is a
   deploy with exactly one organization and no master user. Every collection is declared
   `scoped` or `global` in a versioned registry, and CI fails on a collection missing
   from it. Access control on scoped collections **returns a query constraint, never a
   boolean**. No code outside `lib/tenancy/` calls `payload.find/findByID/create/update/
   delete` or raw SQL — everything passes through `getTenantScopedPayload(req)`, enforced
   by an **import boundary plus syntax rules covering `req.payload`** (amended 2026-08-25:
   method-name matching is defeated by aliasing, and `req.payload` reaches every hook with
   no import at all). Payload's Local API skips access control by default, so the dangerous
   call carries no suspicious flag. Operations with no request tenant use the explicit-tenant
   system client inside `lib/tenancy/`. Every relationship between scoped
   collections uses the shared same-tenant validator. **Identity is global, role is per
   organization.**

3. **Pure game rules over an immutable ledger** — `packages/game` holds the XP, level and
   mission rules as plain TypeScript: no Payload imports, no IO, and `tenantId` always an
   explicit argument. XP is granted **inside the same transaction as the action that
   caused it**, with `idempotencyKey = (tenant, user, action, ref)` enforced by a unique
   index. The XP ledger is **append-only**: removing a skill deactivates it
   (`ativa: false`) and never rewrites history or changes anyone's totals. Tunable
   economy values (`regrasXp`) live as per-organization data seeded on organization
   creation — retuning XP is an edit, not a deploy.

4. **Design and content fidelity** — the specs in `docs/product/` are the contract and
   the mockups are the visual source of truth. Identity values are **CSS custom
   properties** resolved from the organization record: **zero hexadecimal literals in
   components** (this is what keeps per-organization co-branding cheap). Mobile-first
   across three breakpoints (390 / 834 / 1440 design targets). **Client components only
   where interactivity is real** — avatar builder, 3D preview, likes, interactive bars —
   and public pages carry a performance budget (**LCP ≤ 2.5s** on a mid-range 4G device)
   measured in feature 003. Site content is **PT-BR**; code, commits and code comments
   are **English**. Decisions are dated, `(proposta)` marks what is not yet decided, and
   superseded content is struck through, **never deleted**.

5. **Enumerated verification gates, enforced by CI** — "ready" is defined by a command
   list, not by feeling. Every pull request must pass these as **merge-blocking** checks:
   secret scanning; format/lint; type check; the test suite (**every feature ships tests,
   every bug fix ships a regression test**); build; and — from feature 000 — the
   **cross-tenant isolation harness** (a user of organization A gets zero rows or 403 on
   every surface of organization B, demonstrated failing before passing). Security review
   is mandatory on upload and authentication surfaces. **No completion is claimed without
   fresh evidence** from these commands. The gate set starts at the docs stage (secrets,
   markdown, link integrity) and **grows with each feature, never shrinking**.

## Tech Stack

- **Language:** TypeScript (Node 22 LTS)
- **Framework:** Next.js (App Router / RSC) with Payload CMS 3 embedded — admin at
  `/admin`
- **Database:** PostgreSQL 16 (Payload Postgres/Drizzle adapter)
- **Object storage:** S3-compatible — MinIO self-hosted ↔ S3/R2 managed
- **Multi-tenancy:** `@payloadcms/plugin-multi-tenant` (row-level, shared database)
- **3D preview:** `@google/model-viewer` (GLB/GLTF) + `three` loaders (STL/OBJ/3MF)
- **Monorepo:** pnpm workspaces — `apps/web`, `packages/game`, `packages/ui`, `infra/`
- **Testing:** to be fixed in feature 001 (candidates: Vitest for pure rules and
  integration, Playwright for end-to-end) — **(proposta)**
- **Deploy:** Docker Compose on a campus VM; images built in CI; Caddy for TLS
- **CI:** GitHub Actions — docs-stage gates now (secret scan, markdown lint, link
  integrity), growing per feature

## Architecture Constraints

- **Monorepo layout:** `apps/web` (Next + Payload), `packages/game` (pure rules),
  `packages/ui` (tokens + components), `infra/` (compose, Caddy, backups, runbooks).
  "Frontend and backend separated" means **package separation, not process separation**.
- **Uploads:** presigned PUT to object storage, then **post-upload verification**
  (`HeadObject` + magic-byte sniffing of the first kilobytes); files land as
  draft/quarantine until moderated. Browser-reported MIME is never trusted.
- **Storage keys:** a single constructor, `org/<slug>/…`; organization quota is validated
  **when the presigned URL is issued**, with a periodic reconciliation job against the
  bucket prefix.
- **Moderation:** draft → in review → published by the lab team; **XP credits on
  approval**. Human moderation is the accepted antivirus for public downloads; ClamAV
  becomes mandatory before hosting an external tenant.
- **Routing:** one subdomain per organization; path-based tenancy is prohibited.
  The **proxy layer** (Next 16's `proxy.ts`, formerly `middleware.ts`) performs **header
  hygiene only** — it strips any inbound tenant header and forwards the host on the
  **request** headers; host→organization resolution is a **cached server-side lookup, never a
  database call in the proxy**. Falls back to the single organization when only one exists.
  *(Amended 2026-08-25 twice — see Amendments 1.1.0 and 1.2.0. The rule is unchanged; two of
  its original justifications were measured and found wrong.)*
- **LGPD:** deletion operates per `(tenant, user)` and purges draft/version history and
  the storage prefix; terms acceptance gates signup; export produces a documented
  artifact. **No external tenant before a signed legal instrument** (controller/operator,
  DPO, incident notification, explicit no-SLA policy).
- **v1 exclusions:** no realtime, no canvas game engine, no reward cosmetics, no billing.
  Pre-rendered art plus DOM/CSS with `image-rendering: pixelated`.
- **Code quality limits:** functions under 50 lines, files under 500 lines of code,
  cyclomatic complexity ≤ 10.

## References

- **Product specs:** `docs/product/` — `concept.md`, `gamification.md`,
  `visual-identity.md`, `pages/*.md`
- **Architecture:** `docs/tech-stack.md`, `docs/tech-stack-benchmark.md`
- **Roadmap:** `docs/sdd-strategy.md` (features 000–007)
- **Contributor process:** `CONTRIBUTING.md` (branch model, SemVer, changelog),
  `CHANGELOG.md`
- **Open items:** `docs/backlog.md`
- **Global engineering rules:** the maintainer's `.claude/rules/` (code quality, git
  workflow, LLM security, agent workflow) — referenced, not duplicated here.

## Amendments

Substantive changes only, newest first. See the **Amendment policy** in the preamble.

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-08-25 | **Principle 2 — enforcement mechanism.** Linting by **method name** replaced by an **import boundary plus syntax rules covering `req.payload`**. Name matching is defeated by aliasing (`const p = await getPayload(); p.find()`), `req.payload` reaches every hook with no import at all, and raw SQL has no method name. Source: feature 000 plan review, round 2 |
| 1.1.0 | 2026-08-25 | **Architecture Constraints — routing.** Host→organization resolution moved **out of middleware** to a cached server-side lookup; middleware does header hygiene only. The Edge runtime cannot hold a Postgres connection, and `NextResponse.next()` response headers never reach the server. Source: feature 000 plan, Sketch 4 |
| 1.2.0 | 2026-08-25 | **Architecture Constraints — routing, correction.** Spike S9 measured two claims from 1.1.0 and both were wrong. `NextResponse.next()` response headers **do** reach the server (readable via `headers()` in a Route Handler *and* an RSC) as well as the client — leaky in both directions, not inert. And the Edge-runtime argument no longer binds: Next 16 renames `middleware` to **`proxy`**, which runs on **`nodejs`**. The constraint stands on its own merits — no per-request database round trip in the proxy — and gains a new reason: spike S8 shows the cached path cannot be tested at all without an injected seam. Source: feature 000 spike, S8 + S9 |
| 1.0.0 | 2026-08-25 | Ratified — five principles, tech stack, architecture constraints |
