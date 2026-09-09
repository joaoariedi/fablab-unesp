# LCP, measured with the real hero in place

**T027 / SC-006.** `scripts/lcp-budget.sh` was built (T015), watched failing (T016) and wired
into CI (T017) while the Home still had **no hero**. T025 then added the largest asset in the
product and T026 built the page around it, so the number SC-006 promises had never been measured
against the thing that threatens it. This is that measurement: the gate, unmodified, run over
every public page with the delivered hero on disk.

`apps/web/tests/lcp-measurements.test.ts` holds this document against the gate script, the page
list and the files in `apps/web/public/hero`, so it cannot quietly stop describing the tree it
was taken from.

**Verdict: every page is inside the budget. `/` measures 2255 ms against 2500 ms.**

It did not start there. The first run of this gate, against the panoramic hero the Home shipped
with, measured **3360 ms** — 860 ms over. § *What the miss was made of, and what closed it*
records both numbers, because the arithmetic is the useful part: the fix was not "make the hero
smaller" in general, and the margin now is 245 ms rather than comfortable.

**This transcript is the run that matches the committed tree.** An earlier post-fix run measured
`/` at 2243 ms, before the mobile rule was given its own `aspect-ratio` — the two differ by
12 ms, which is the run-to-run variance of a median-of-three on a bandwidth-bound metric, and is
the reason the margin is quoted rather than the exact figure treated as a constant. The 2243 run
is not recorded here: a measurement taken from a tree that is not this one is a number nobody
can reproduce.

## The profile it was measured on

Every value is `scripts/lcp-budget.sh`'s, and the test beside this file reads them out of that
script rather than trusting the table.

| Setting | Value | Where it is declared |
|---|---|---|
| Budget, per page | 2500 ms | `BUDGET_MS="${LCP_BUDGET_MS:-2500}"` |
| Runs per URL, median taken | 3 | `RUNS_PER_URL` |
| Download throughput | 1474.56 kbps (188,743 B/s) | `--throttling.downloadThroughputKbps` |
| Request latency | 562.5 ms | `--throttling.requestLatencyMs` |
| CPU slowdown | 4x | `--throttling.cpuSlowdownMultiplier` |
| Load cap | 45000 ms | `LCP_MAX_WAIT_MS` |
| Form factor | mobile, `--screenEmulation.mobile` | `THROTTLING` |

Run on 2026-09-08 with Lighthouse 12.8.2 / HeadlessChrome 152.0.7977.75, against a production
build served by `next start`, on a database seeded by the gate itself and owned by nothing else
— the same shape as the `Performance budget` CI job, on a developer machine rather than a
runner. The metric is bandwidth-bound (see the waterfall), and the bandwidth is emulated
identically on both, so the miss is not an artefact of the host.

## The hero in place while it ran

| File | Bytes |
|---|---|
| cena-mobile-432.avif | 37,527 |
| cena-mobile-432.webp | 55,698 |
| mapa-1106.avif | 143,436 |
| mapa-1106.webp | 186,744 |
| mapa-834.avif | 95,615 |
| mapa-834.webp | 119,880 |

Two compositions, not one ladder. The `mapa-*` pair is the panoramic desktop art; the
`cena-mobile-*` pair is the dedicated vertical scene `home.md` § *Adaptação mobile* records as
**v2, oficial**, cropped from the delivered `design/home-mobile.png`. They are selected by
`<source media>` at `--bp-tablet`, and the two conditions partition every viewport exactly once.

The browser chose **`cena-mobile-432.avif`** at the emulated mobile viewport — 37,527 bytes.
On the first run there was no mobile art and it chose `mapa-834.avif` at 96,047 bytes on the
wire, which is where the 860 ms went.

## The run

```text
── applying migrations
── seeding published content in a resolvable organization
── building
── production server starting on port 3100 (pid 1712446)
── ready: http://127.0.0.1:3100/ answered 200 as Host: localhost (attempt 2/60)
── PASS  /                LCP 2255ms (budget 2500ms)
── PASS  /projetos        LCP 1759ms (budget 2500ms)
── PASS  /artigos         LCP 1760ms (budget 2500ms)
── PASS  /aulas           LCP 1758ms (budget 2500ms)
── PASS  /biblioteca-3d   LCP 1762ms (budget 2500ms)
── PASS  /calendario      LCP 1766ms (budget 2500ms)
── PASS: every public page is within the 2500ms LCP budget on the 4G profile.
```

## Per page, measured

Median of three runs, LCP only, never averaged across pages.

| Page | Median LCP (ms) | Budget (ms) | Verdict |
|---|---|---|---|
| / | 2255 | 2500 | within budget, by 245 ms |
| /projetos | 1759 | 2500 | within budget |
| /artigos | 1760 | 2500 | within budget |
| /aulas | 1758 | 2500 | within budget |
| /biblioteca-3d | 1762 | 2500 | within budget |
| /calendario | 1766 | 2500 | within budget |

## What the miss was made of, and what closed it

The five listing pages all land within 6 ms of each other at ~1760 ms, and on the Home that same
~1762 ms is the **First Contentful Paint**. Their LCP element is text, so it paints the moment
the document does; the Home's LCP element is the hero image, which then has to arrive.

Lighthouse's phase breakdown for the Home's LCP element on the **first** run, when the element
was `<img src="/hero/mapa-834.avif">` at 96,047 bytes:

| Phase | Time | Share |
|---|---|---|
| TTFB | 585 ms | 17% |
| Load delay | 586 ms | 17% |
| **Load time** | **2160 ms** | **64%** |
| Render delay | 22 ms | 1% |

2160 ms to transfer 96 KB is ~44 KB/s on a 188 KB/s link, and the waterfall said why: the hero
did not get the link to itself.

| Resource | Transfer |
|---|---|
| Document | 13,995 B |
| Scripts (9 chunks) | 142,415 B |
| Fonts (`aldo-the-apache`, `comfortaa`) | 86,702 B |
| Hero (`mapa-834.avif`) | 96,047 B |
| **Total before LCP** | **~339 KB** |

339 KB at 188,743 B/s is 1.8 s of wire time on top of a 585 ms first byte. The hero request
itself started at 1171 ms — the preload scanner working exactly as T025 intended — and then
shared the link with 229 KB of JavaScript and fonts.

**So the miss was never "the hero is too big" in the abstract.** It was that the largest image in
the product was competing with everything else on the page for a 188 KB/s link, and the honest
levers were the ~229 KB of script and font bytes ahead of it, or a hero small enough to finish
inside what the budget had left — roughly 40 KB, i.e. a mobile-width derivative behind a
`<source media>`.

### The fix, and why it beat the arithmetic

The second lever was already owed: `home.md` § *Adaptação mobile* records a dedicated vertical
hero as **v2, oficial** with the art delivered on 2026-08-24, and strikes out the panoramic crop
the page had shipped. Cropping the scene out of `design/home-mobile.png` at 432w gives **37,527
bytes** of AVIF, and wiring it behind `(max-width: 833px)` — with the preload hint carrying the
same condition, so a phone does not fetch the panorama it will never paint — is one change that
was both the missing requirement and the named lever.

Linear arithmetic predicted a 310 ms saving (58,520 fewer bytes at 188,743 B/s), which would have
left the Home at ~3050 ms and still over. The measured saving was **1105 ms**. Contention is not
linear: a hero that finishes early stops competing, so the scripts and fonts behind it also
arrive sooner, and the LCP element is no longer waiting on a queue it was itself lengthening.

A second lever was measured and **not spent**: `comfortaa.woff2` is a 79,872-byte variable font,
and a Latin + pt-BR subset keeping the whole 300–700 axis is 27,900 bytes — a 52 KB saving with
no visual change, OFL-permitted. It is recorded here rather than applied, because the budget is
met without it and it belongs to feature 001's asset set. It is the first thing to reach for if
this margin is ever lost.

## The margin, stated plainly

257 ms, or about 10%. That is real but not generous, and three ordinary changes would eat it:

- **another above-the-fold image on the Home** — there is currently exactly one;
- **a client component added to the Home**, which grows the 142 KB of scripts ahead of the LCP
  element;
- **a third webfont**, or dropping `font-display: swap` on either of the two.

The gate is what notices, and it runs on every pull request (`Performance budget` in
`ci.yml`) — but only advisorily until that context is a required status check. That is the
outstanding repo-admin action tracked in `.specify/specs/003-paginas-publicas/tasks.md` §
*Outstanding, and not executable by a run*.

Reproduce with a database the test suite does not share:

```sh
DATABASE_URI=postgres://fablab:fablab@localhost:55432/fablab_lcp \
PAYLOAD_SECRET=any-string-of-at-least-32-characters-will-do \
CHROME_PATH=$(ls -d ~/.cache/puppeteer/chrome-headless-shell/*/*/chrome-headless-shell | head -1) \
PORT=3100 bash scripts/lcp-budget.sh
```

Both extra variables are needed and neither is optional, which the first version of this line
omitted — running it as written fails at `── applying migrations`, because Payload refuses to
load a config without `PAYLOAD_SECRET` and Lighthouse refuses to start without a browser it can
find. CI supplies the first two from `ci.yml` § `env:` and gets Chrome from the `ubuntu-latest`
image, so the gap only shows on a developer machine — which is exactly where a reproduce line is
read. Measured on 2026-09-08 by running it.
