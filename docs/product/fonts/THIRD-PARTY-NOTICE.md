# Third-party notice — bundled fonts

This repository is licensed **MIT** (see [`LICENSE`](../../../LICENSE)). The font files in
this directory are **third-party works and are NOT covered by that licence.** They are
redistributed here under the terms described below, and the MIT grant does not extend to
them.

## Aldo the Apache — `AldotheApache.ttf`

| | |
|---|---|
| **Author** | AJ Paglia (`www.ajpaglia.com`, listed in the font's own metadata) |
| **Source** | <https://www.dafont.com/aldo-the-apache.font> |
| **Stated category** | **"100% Grátis" / "100% Free"** on dafont |
| **Author licence text** | **None found** — see the evidence below |
| **Used for** | Display type, the logo and the logotype — **all non-body type** since 2026-08-27 |

### The evidence, stated plainly (checked 2026-08-27)

We looked in all three places a licence could be, and record what was actually there:

1. **dafont's category** says *100% Free*. But dafont's own FAQ disclaims it: *"The licence
   mentioned above the download button is just an indication. Please look at the readme-files
   in the archives or check the indicated author's website for details, and contact him/her if
   in doubt."* So this is an indication, not a grant.
2. **The download archive** (`aldo_the_apache.zip`) contains **only `AldotheApache.ttf`** —
   no readme, no licence file.
3. **The author's website** (`ajpaglia.com`) was **unreachable** when checked.
4. **The font's embedded metadata** names AJ Paglia as author and designer and carries **no
   copyright string, no licence description and no licence URL** — no restriction is asserted.

### Why redistribution here is judged acceptable

The author asserts **no restriction** anywhere we can find, and the only published indication
of intent — dafont's category — is permissive. Absence of a restriction is weaker than an
explicit grant, and this notice exists so that nobody mistakes one for the other: **this is a
documented, deliberate risk acceptance, not a licence.**

If AJ Paglia (or anyone acting for them) objects, remove `AldotheApache.ttf` and open an
issue — the design system is built to fall back to a condensed sans, so removing it degrades
the typography without breaking the build.

Since 2026-08-27 that fallback covers **more** of the identity than before: Aldo replaced
SquareFont in the logotype, so it is now the only non-body face. An objection would degrade
the whole display layer rather than half of it. The build still survives; the brand would
look generic until a replacement is chosen.

## SquareFont — no longer used at all

**SquareFont / SquareFont Outline** (`Square.ttf`, `Squareo.ttf`, © Bou Fonts 2011) drew the
"CITE BAURU" logotype in the original design board. **The designer replaced it with Aldo the
Apache on 2026-08-27**, so it is not merely un-redistributed — it is **not part of the
product**. There is no local setup step and no reason for anyone to hold a copy.

This closed the licensing question at its source. The fonts' own embedded metadata said:

> `Typeface © Bou Fonts. 2011. All Rights Reserved`

That was the only author-authored statement that existed for them, and it said the opposite
of permissive. Dropping the face is a stronger resolution than any inference about whether
that string was untouched FontCreator boilerplate.

Both filenames **stay in `.gitignore`**, with the reason inverted: they no longer stage a
local setup, they prevent an accidental commit of an All-Rights-Reserved binary into a public
MIT repository — by someone who followed the old instructions and still has the file.

## Comfortaa

`Comfortaa-VariableFont_wght.ttf` is under the **SIL Open Font License 1.1**, included as
[`OFL.txt`](OFL.txt). That one is a real grant, and it is what the other two would look like
if their authors published terms.

## The durable fix

Written permission from AJ Paglia would replace the inference above with a document. Bou
Fonts is no longer relevant — that font left the project. Until then this file is the honest
record of what is known about the one face that needs it.
