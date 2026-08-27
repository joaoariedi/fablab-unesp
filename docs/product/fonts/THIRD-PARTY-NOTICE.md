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
| **Used for** | Display type and the logotype |

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

## Not redistributed here

**SquareFont / SquareFont Outline** (`Square.ttf`, `Squareo.ttf`, © Bou Fonts 2011) are
**deliberately excluded** and remain in `.gitignore`. dafont lists them "100% Free", but the
fonts' own embedded metadata says:

> `Typeface © Bou Fonts. 2011. All Rights Reserved`

That is the only author-authored statement that exists for them, and it says the opposite of
permissive. It may well be untouched FontCreator boilerplate — it usually is — but this
notice cannot rest a redistribution decision on a guess about which fields an author edited.
Fetch them locally per [`README.md`](README.md).

## Comfortaa

`Comfortaa-VariableFont_wght.ttf` is under the **SIL Open Font License 1.1**, included as
[`OFL.txt`](OFL.txt). That one is a real grant, and it is what the other two would look like
if their authors published terms.

## The durable fix

Written permission from AJ Paglia and from Bou Fonts would replace every inference above with
a document, and would let SquareFont be versioned normally too. Until then this file is the
honest record of what is known.
