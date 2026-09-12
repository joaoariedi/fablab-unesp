import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PerfilMaker } from '../../collections/content/PerfilMaker'
import { Users } from '../../collections/Users'
import { COLECOES_COM_AUTOR } from '../../lib/accounts/deletion'

/**
 * T040 / FR-030, US8 — **the LGPD record, held to the code it describes.**
 *
 * FR-030 asks that *what personal data is collected, on what basis, for how long, and how
 * consent is withdrawn* be recorded *"in the product docs, not only in code"*. `docs/lgpd.md`
 * is that record, and a record about personal data is the one document in this repo whose
 * staleness is a legal exposure rather than a documentation smell: a person reads it to decide
 * whether to hand over their date of birth, and the lab would answer a titular's request out of
 * it. Nothing else in the tree can notice when it stops being true — markdown lint and link
 * integrity cannot detect a column that was added after the table was written.
 *
 * This file can, and it follows the pattern `content-model-doc.test.ts` and
 * `avatar-budget.test.ts` already established: **every claim asserted here is read out of the
 * code, never retyped**, so the failure arrives when the tree moves rather than when a reader
 * happens to look.
 *
 * ── The five ways this particular record goes stale ─────────────────────────────────────────
 *
 *   1. **A column is added.** `perfilMaker` is where every field a person typed about themselves
 *      lives; a new one that the doc does not name is personal data collected without a record.
 *   2. **The terms are rewritten.** `TERMS_VERSION` is what `aceiteTermosVersao` stamps, so a
 *      doc quoting the superseded version describes a consent nobody gave.
 *   3. **ISS-002 closes.** The retention period is the half of this document the PO and UNESP
 *      legal review still owe (spec § CLR-003); while the backlog says ABERTO the doc must say
 *      so too, and the day it closes this test fails rather than leaving the gap unrecorded.
 *   4. **Deletion learns a fourth collection.** `COLECOES_COM_AUTOR` is the list whose byline
 *      survives an erasure. A collection added there and not here is work the record says is
 *      erased and is not.
 *   5. **Export gets built.** CLR-008 moved the right of access out of 004 and made this
 *      document where the obligation is recorded as outstanding. A route that implements it
 *      turns that paragraph into a false statement in the other direction.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const RECORD = join(ROOT, 'docs', 'lgpd.md')
const BACKLOG = join(ROOT, 'docs', 'backlog.md')
const STEP_TWO = join(ROOT, 'apps', 'web', 'app', '(frontend)', 'criar-conta', 'dados', 'page.tsx')
const DELETION_PAGE = join(ROOT, 'apps', 'web', 'app', '(frontend)', 'minha-conta', 'excluir', 'page.tsx')

/**
 * The record, or the empty string when it is absent.
 *
 * Read defensively for the reason `avatar-budget.test.ts` records: a `readFileSync` throw at
 * module scope aborts the whole file and vitest reports it as an unhandled error — the one
 * shape a missing deliverable must NOT have, since a missing document would then be indistinct
 * from a broken suite.
 */
const DOC = existsSync(RECORD) ? readFileSync(RECORD, 'utf8') : ''

/** One declaration out of a module, so the record cannot quote a value the tree stopped using. */
function fromSource(file: string, pattern: RegExp, what: string): string {
  const found = readFileSync(file, 'utf8').match(pattern)
  if (!found?.[1]) {
    throw new Error(
      `${file} no longer declares ${what} in the shape /${pattern.source}/. docs/lgpd.md quotes ` +
        'that value; if the module changed, this test must be taught the new spelling and the ' +
        'record updated to match.',
    )
  }
  return found[1]
}

/** The version stamped into `aceiteTermosVersao` on every account created today (FR-012). */
const TERMS_VERSION = fromSource(STEP_TWO, /export const TERMS_VERSION = '([^']+)'/, 'TERMS_VERSION')

/** The route consent is withdrawn on (FR-031b, CLR-010). */
const EXCLUIR_PATH = fromSource(DELETION_PAGE, /export const EXCLUIR_PATH = '([^']+)'/, 'EXCLUIR_PATH')

/**
 * Which cell of a § Dados coletados row carries the legal basis.
 *
 * `| Campo | Onde vive | O que é | Finalidade | Base legal |` — zero-based, so the fifth column
 * is index 4. Asserted against the real header below, so a reordered table fails here rather
 * than quietly checking the wrong cell.
 */
const COLUNA_BASE_LEGAL = 4

/** Every top-level field `perfilMaker` stores — the personal data this feature collects. */
const CAMPOS_DO_PERFIL = PerfilMaker.fields.flatMap((field) =>
  'name' in field && typeof field.name === 'string' ? [field.name] : [],
)

/** A code span anywhere in the document — for claims that are about the prose, not the table. */
const nomeia = (identificador: string): boolean => DOC.includes(`\`${identificador}\``)

/**
 * A field's **row in the § Dados coletados table**, or `null`.
 *
 * `nomeia` is not enough for the table's claim and the difference was measured: it searches the
 * whole document, and `nome`, `handle`, `escolaridade` and `aceiteTermosVersao` all appear as
 * code spans in the surrounding prose. Each of their rows — field, purpose **and** legal basis —
 * could be deleted whole with 23/23 still green. The docblock above `nomeia` claimed to prevent
 * exactly that ("`nome` incidentally in prose is not a record") and did not.
 *
 * A row is a table line whose FIRST cell names the field, which is what "recorded" means here.
 */
function linhaColetada(campo: string): string[] | null {
  const coletados = secao(/Dados coletados/i)
  for (const linha of coletados.split('\n')) {
    if (!linha.trim().startsWith('|')) continue
    const celulas = linha.split('|').slice(1, -1).map((c) => c.trim())
    if (celulas[0] === `\`${campo}\``) return celulas
  }
  return null
}

/** The body of one `##` section, so a claim is asserted where it belongs and not anywhere at all. */
function secao(titulo: RegExp): string {
  const cabecalhos = [...DOC.matchAll(/^## .*$/gm)]
  const inicio = cabecalhos.find((h) => titulo.test(h[0]))
  if (!inicio) return ''
  const proximo = cabecalhos.find((h) => (h.index ?? 0) > (inicio.index ?? 0))
  return DOC.slice(inicio.index ?? 0, proximo?.index ?? DOC.length)
}

describe('docs/lgpd.md records what the code actually collects (FR-030)', () => {
  it('exists at all — FR-030 asks for a record and the record is the deliverable', () => {
    expect(DOC.length, 'docs/lgpd.md is missing or empty').toBeGreaterThan(0)
  })

  it.each(CAMPOS_DO_PERFIL)('gives `%s` a row in § Dados coletados, with a legal basis', (campo) => {
    const linha = linhaColetada(campo)
    expect(
      linha,
      `perfilMaker stores \`${campo}\` and the § Dados coletados table has no row for it. A ` +
        'column added to the profile is personal data collected without a record — add its ' +
        'row, with its purpose and legal basis, in the same change. (Naming it in the prose ' +
        'elsewhere is not a record, which is what the earlier whole-document search allowed.)',
    ).not.toBeNull()

    // Per field, not per table. The header-only check that shipped here asserted
    // `/\|\s*Base legal\s*\|/` against the section — so every legal-basis CELL in the table
    // could be blanked and all 23 cases stayed green, leaving FR-030's "on what basis" half
    // completely unguarded. Measured by blanking them.
    const base = linha?.[COLUNA_BASE_LEGAL]
    expect(
      base,
      `\`${campo}\` is recorded with an empty "Base legal" cell. FR-030 asks on what basis each ` +
        'field is collected, and a row that names a field and no basis records half the ' +
        'obligation — the half that is not the legal one.',
    ).toBeTruthy()
  })

  it('records that the credential lives on the global `users` row, not on the profile', () => {
    // "Identity is global, role is per organization" is also a data-protection statement: the
    // e-mail and the password hash are one row shared by every lab, so an erasure in one lab
    // cannot assume it owns them. `deletion.ts` asks that question last for exactly this reason.
    expect(Users.auth, 'Users no longer declares auth; this section describes a shape that moved').toBeTruthy()
    expect(nomeia('users'), 'the record does not say where the account itself lives').toBe(true)
    expect(nomeia('email'), 'the record does not name the e-mail address as collected data').toBe(true)
    expect(
      /hash/i.test(DOC),
      'the record does not say the password is stored as a hash by Payload rather than as text',
    ).toBe(true)
  })

  it('keeps the "Base legal" column where the per-field assertion reads it from', () => {
    const coletados = secao(/Dados coletados/i)
    expect(coletados, 'there is no § Dados coletados section').not.toBe('')

    const cabecalho = coletados
      .split('\n')
      .find((l) => /\|\s*Base legal\s*\|/i.test(l))
      ?.split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    expect(
      cabecalho,
      'the § Dados coletados table has no "Base legal" column — FR-030 asks on what basis, and ' +
        'a table of fields without it records only half the obligation',
    ).toBeDefined()
    // The index the per-field case reads. Pinned so a reordered table moves the assertion with
    // it rather than silently checking the purpose column instead.
    expect(
      cabecalho?.findIndex((c) => /Base legal/i.test(c)),
      'the "Base legal" column moved. `COLUNA_BASE_LEGAL` is the index every per-field check ' +
        'reads, so leaving it stale would check the wrong cell and pass on a blank basis.',
    ).toBe(COLUNA_BASE_LEGAL)
  })

  it('ties consent to the stamp the code actually writes, version included', () => {
    expect(nomeia('aceiteTermosEm'), 'the record does not name the consent timestamp').toBe(true)
    expect(nomeia('aceiteTermosVersao'), 'the record does not name the consent version').toBe(true)
    expect(
      DOC.includes(TERMS_VERSION),
      `every account created today stamps TERMS_VERSION "${TERMS_VERSION}" and the record does ` +
        'not quote it. A record naming a superseded version describes a consent nobody gave — ' +
        'when the terms land and the constant increments, this document increments with it.',
    ).toBe(true)
  })

  it('does not invent a retention period while ISS-002 is open', () => {
    const backlog = readFileSync(BACKLOG, 'utf8')
    const aberto = /## ISS-002[\s\S]*?\*\*Status:\*\*\s*ABERTO/.test(backlog)
    expect(
      aberto,
      'ISS-002 is no longer ABERTO in docs/backlog.md. The retention period was the half of ' +
        'docs/lgpd.md the PO and the UNESP legal review owed (spec § CLR-003) — write it into ' +
        'the § Retenção section now and replace this assertion with the period itself.',
    ).toBe(true)

    const retencao = secao(/Retenç/i)
    expect(retencao, 'there is no § Retenção section — FR-030 asks "for how long"').not.toBe('')
    expect(
      retencao.includes('ISS-002'),
      'the § Retenção section states a period without naming ISS-002 as what still blocks it. ' +
        'spec § CLR-003 is explicit that the wording and the retention period belong with the ' +
        'terms and the legal review; a number invented here would be a policy this repo made up.',
    ).toBe(true)
  })

  it('describes withdrawal as the route and the confirmation the code implements', () => {
    const retirada = secao(/Retirada do consentimento|Como retirar/i)
    expect(retirada, 'there is no section on withdrawing consent — FR-030 asks how').not.toBe('')
    expect(
      retirada.includes(EXCLUIR_PATH),
      `consent is withdrawn at ${EXCLUIR_PATH} and the record does not name the route`,
    ).toBe(true)
    expect(
      /@handle/.test(retirada),
      'the record does not say the person types their own @handle to confirm (CLR-010), which ' +
        'is the friction the screen actually imposes',
    ).toBe(true)
  })

  it.each(COLECOES_COM_AUTOR)('says the byline on `%s` is kept as a tombstone, not erased', (colecao) => {
    expect(
      nomeia(colecao),
      `deleteAccount nulls \`autor\` on \`${colecao}\` and keeps the document. The record must ` +
        'name it: the surprising half of an erasure is that the published work stays (CLR-003), ' +
        'and a person who was not told has been misled by silence.',
    ).toBe(true)
  })

  it('says what deletion erases and what it recomputes', () => {
    const exclusao = secao(/exclus/i)
    expect(exclusao, 'there is no section on what deletion does').not.toBe('')
    expect(nomeia('perfilMaker'), 'the record does not say the profile row itself is deleted').toBe(true)
    expect(
      nomeia('curtida'),
      'the record does not say the likes are removed and the counters recomputed — the third of ' +
        'the three outcomes FR-031b makes the screen promise',
    ).toBe(true)
    expect(
      /tombstone|lápide|lapide/i.test(DOC),
      'the record does not name the tombstone the cards render in place of the removed author',
    ).toBe(true)
  })

  it('records the right of access as outstanding, while nothing implements it', () => {
    const exportRoute = join(ROOT, 'apps', 'web', 'app', '(frontend)', 'minha-conta', 'exportar')
    expect(
      existsSync(exportRoute),
      'an export route exists now. CLR-008 moved the right of access out of 004 and made ' +
        'docs/lgpd.md where the obligation is recorded as OUTSTANDING; that paragraph is now ' +
        'false in the other direction and must describe what the route delivers.',
    ).toBe(false)
    expect(
      DOC.includes('CLR-008'),
      'the record does not carry CLR-008: LGPD\'s right of access stands whether or not this ' +
        'feature implements it, and the spec makes this document where it is recorded as open',
    ).toBe(true)
  })
})
