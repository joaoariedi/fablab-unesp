# The avatar builder's budget, measured once and written down

**T039 / FR-032, SC-011, CLR-004.** CLR-004 split this project's performance promise in two.
`scripts/lcp-budget.sh` keeps measuring the six public pages on every pull request and **does not
learn to sign in**; the avatar builder — the largest island in the product — gets a budget of its
own, taken on the same profile and enforced by nobody. The clarification prices that weakening
itself: *"a regression in the builder is caught by a measurement someone takes, not by CI. That is
a real weakening, and it is the reason the budget must be **recorded** rather than merely intended
— an unrecorded budget is not a budget."*

This is that record.

**Verdict: `/criar-conta` measures 1773 ms against the gate's own 2500 ms budget — 727 ms of
margin, and the largest paint is text.**

`apps/web/tests/avatar-budget.test.ts` holds this document against the gate script, against the
page module that decides what art the builder receives, and against the three collection sizes the
catalogue is fixed to, so it cannot quietly stop describing the tree it was taken from. It does not
re-measure: measuring needs a browser, a production build and a database nothing else shares.

## The profile it was measured on

Every value is `scripts/lcp-budget.sh`'s, and the test beside this file reads them out of that
script rather than trusting this table.

| Setting | Value | Where it is declared |
|---|---|---|
| Budget, per page | 2500 ms | `BUDGET_MS="${LCP_BUDGET_MS:-2500}"` |
| Runs per URL, median taken | 3 | `RUNS_PER_URL` |
| Download throughput | 1474.56 kbps (188,743 B/s) | `--throttling.downloadThroughputKbps` |
| Request latency | 562.5 ms | `--throttling.requestLatencyMs` |
| CPU slowdown | 4x | `--throttling.cpuSlowdownMultiplier` |
| Load cap | 45000 ms | `LCP_MAX_WAIT_MS` |
| Form factor | mobile, `--screenEmulation.mobile` | `THROTTLING` |

Run on 2026-09-12 with Lighthouse 12.8.2 / HeadlessChrome 152.0.7977.75, against a production
build served by `next start` on port 3100, over a scratch database (`fablab_avatar_lcp`) that the
test suite does not share — the same shape as the `Performance budget` CI job, on a developer
machine rather than a runner.

**The tree it came from**: `c91aa82`, with feature 004's phase 7 still in flight in the working
copy. The three modules that decide this page's weight were, by `sha256sum`:
`app/(frontend)/criar-conta/page.tsx` `b9683f9772cd`, `AvatarBuilder.tsx` `e2a036066c8b`,
`AvatarPreview.tsx` `cbaf000cf07f`. A measurement is a statement about a tree; naming it is what
lets the next person tell "the builder regressed" from "this is a different builder".

## What was measured, and how this run differs from the gate's own

Three differences, each of them deliberate and each of them a reason this is a record rather than a
gate:

1. **`/criar-conta` is not in `PAGES`, and must not be.** CLR-004 keeps the per-PR gate on the six
   public pages. The run below therefore **sources** `scripts/lcp-budget.sh` and calls its own
   `measure_url` and `assert_lcp_at_most` on this one page — the same throttling flags, the same
   median of three, the same report reader that refuses a non-numeric audit. Nothing was
   re-implemented, and nothing in the script was edited. If a future change adds this route to
   `PAGES`, the test beside this file fails, because the premise of the document has changed.
2. **The gate's seed does not write the avatar catalogue.** `apps/web/seed/index.ts` creates the
   organization and the dev master and stops; the 20 skin tones, 10 hair colours and 92 items are
   written by no seed today. Measuring without them would have been the exact trap
   `lcp-budget.sh`'s own header warns about — *"a gate that skips the seed passes HARDEST exactly
   when the content is missing"* — so the rows were inserted before the build (§ *Reproduce*), and
   the catalogue that was on the page is recorded below.
3. **It is signed out.** Step 1 of the signup flow has no session by construction (FR-003), which
   is what makes the builder measurable at all without teaching a nine-minute gate to authenticate.

## The run

```text
── seeding the avatar catalogue (20 + 10 + 92 rows; the seed does not write these yet)
      c      | count
-------------+-------
 tomDePele   |    20
 tomDeCabelo |    10
 avatarItem  |    92
── building
── production server starting on port 3100 (pid 1035893)
── ready: http://127.0.0.1:3100/criar-conta answered 200 as Host: localhost (attempt 2/60)
── PASS  /criar-conta     LCP 1773ms (budget 2500ms)
```

The three samples were **1886 / 1767 / 1773 ms**; 1773 is the middle one, and never the mean — the
mean would re-import the outlier the median exists to discard (`median_of_three`). The 113 ms
spread between the first sample and the other two is the cold-cache first run, and it is quoted
here for the same reason `docs/lcp-measurements.md` quotes its 12 ms: the margin is the number to
trust, not the exact figure.

## The catalogue that was on the page

| Collection | Rows | Held to |
|---|---|---|
| tomDePele | 20 | `TOTAL_TONS_DE_PELE` |
| tomDeCabelo | 10 | `TOTAL_TONS_DE_CABELO` |
| avatarItem | 92 | `LINHAS_AVATAR`, summed |

92 and not 82: `roupaCima` stores each of its ten pieces twice, once per base (FR-004), which is
the difference between `CATEGORIAS_AVATAR` (options offered) and `LINHAS_AVATAR` (rows stored).
The builder drew all nine pickers full, and the served document was 79,180 bytes of HTML.

## Picker and preview sheet bytes, counted separately

| Sheet | Rows drawing it | Bytes on the wire |
|---|---|---|
| Picker sprites — `sprite`, one direction, drawn by every thumbnail | 92 | 0 B |
| Preview sheets — `spriteFolhas`, four directions, pulled only for chosen pieces | 0 of 9 slots at first paint | 0 B |

**Both are zero, and that is a measurement rather than an omission.** `avatarItem.sprite` and
`spriteFolhas` are `relationship` columns, and this page reads the catalogue at `depth: 0` and maps
it through `itensDoBuilder`, which emits `id`, `nome`, `slot`, `camadaZ` and `base` — and no art.
Lighthouse agrees from the other side: **0 image requests, 0 image bytes**, on a page drawing 92
thumbnails. The builder renders a row with no picker art as its name alone, which is FR-007's
*"that slot only"* degradation, and it is why the catalogue is operable before the art exists.

So this is a **baseline**, and it is the useful half of counting the two sheets apart. The trap the
island's own docblock names is that a thumbnail rendering `spriteFolhas ?? sprite` looks identical
on screen — frame 0 of a four-frame sheet is the same picture — while costing four times the
bytes, across 92 rows rather than the handful in the preview. When the art lands, these two rows
are what tell a picker regression from a preview one; a single combined figure could not.

## What the page actually shipped

Transfer sizes from the median run's `network-requests`, which is where the 0 B above is measured.

| Resource | Requests | Transferred |
|---|---|---|
| Document | 1 | 16,354 B |
| Script | 9 | 149,482 B |
| Font | 2 | 86,702 B |
| Stylesheet | 1 | 1,202 B |
| Image | 0 | 0 B |
| Other | 1 | 74 B |
| **Total** | **14** | **253,814 B** |

The builder island's own chunk is **22,029 B on disk / 8,300 B on the wire** — identified by
grepping the built chunks for `aria-label="Girar o avatar"`, which only `AvatarBuilder` emits. The
chunk's filename is a build hash and is deliberately not recorded: the method reproduces, the name
does not.

## Where the 1773 ms went, and what the margin is made of

The LCP element is the `<h1>CRIE SEU AVATAR</h1>`, so **LCP equals FCP** on this page — 1773 ms in
both audits. Lighthouse's phase breakdown for the median run:

| Phase | Time | Share |
|---|---|---|
| TTFB | 588 ms | 33% |
| Load delay | 0 ms | 0% |
| Load time | 0 ms | 0% |
| Render delay | 1185 ms | 67% |

Nothing has to *arrive* before this paint — the largest element is text the document already
carries — so the whole of the 1185 ms is the browser getting to first paint behind 86,702 B of font
and 149,482 B of script on a 188,743 B/s link. The Home's five listing siblings land at ~1760 ms
for the same reason (`docs/lcp-measurements.md` § *Per page, measured*), and this page is within
15 ms of them: **the builder, today, costs essentially nothing over a listing page.**

**The margin is 727 ms, or 29%.** At the profile's 188,743 B/s that is roughly **137 KB** of
additional transfer ahead of the paint before the budget is spent — which is the arithmetic the
first sprite export has to be checked against, because 137 KB across 92 picker thumbnails is about
**1.5 KB each**. Three changes would eat it:

- **picker art heavier than ~1.5 KB per thumbnail**, or thumbnails that reach for `spriteFolhas`
  and pay four frames for one visible direction;
- **a preview that becomes the LCP element** — once the composed avatar is drawn at 192 px it is a
  candidate, and then load time stops being 0 ms and the phase table above stops applying;
- **more client JavaScript**, since 149,482 B of script is already the single largest item ahead of
  a paint that is otherwise free.

The unspent lever is the same one `docs/lcp-measurements.md` records and declines to use:
`comfortaa.woff2` is 80,304 B of the 86,702 B of font here, and a Latin + pt-BR subset keeping the
whole 300–700 axis measured 27,900 bytes in feature 003 — a ~52 KB saving with no visual change.
It belongs to feature 001's asset set, and it is the first thing to reach for if this margin goes.

## The gap this measurement found

**The avatar catalogue has no seed.** `pnpm --filter @fablab/web seed` writes the organization and
the dev master; the 122 catalogue rows are written by nothing, so a freshly built machine serves
`/criar-conta` with nine empty pickers. That is a live hole under CLR-004's own logic — an empty
builder measures magnificently — and it is recorded here rather than fixed, because the seed is not
T039's file. Anyone re-measuring must insert the rows first, as below.

## Reproduce

The gate is **sourced, never edited**: `scripts/lcp-budget.sh` hands over its functions when it is
sourced rather than executed, which is how its own tests exercise the median and the report reader.

```sh
export PORT=3100 LCP_HOST=localhost
export DATABASE_URI=postgres://fablab:fablab@localhost:55432/fablab_avatar_lcp
export PAYLOAD_SECRET=any-string-of-at-least-32-characters-will-do
export CHROME_PATH=$(ls -d ~/.cache/puppeteer/chrome-headless-shell/*/*/chrome-headless-shell | head -1)

source scripts/lcp-budget.sh          # functions only: main() runs only when executed
WORKDIR=$(mktemp -d)

pnpm --filter @fablab/web migrate --force-accept-warning
pnpm --filter @fablab/web seed
# then insert 20 tom_de_pele, 10 tom_de_cabelo and 92 avatar_item rows (see the gap above);
# avatar_item.sprite_id is NOT NULL, so one midia_imagem row has to exist for them to point at.
pnpm --filter @fablab/web build

start_server
wait_for_http_200 "http://127.0.0.1:${PORT}/criar-conta"
assert_lcp_at_most "$BUDGET_MS" /criar-conta "$(measure_url /criar-conta)"
```

All four environment variables are required and none is optional: Payload refuses to load a config
without `PAYLOAD_SECRET`, Lighthouse refuses to start without a browser it can find, and pointing
`DATABASE_URI` at the development database would have the test suite destroy the seeded host
domains mid-run — at which point every route 404s and Lighthouse scores an error page at a
magnificent LCP.
