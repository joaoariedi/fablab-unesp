import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T025b / FR-038, CLR-008 — **the trusted-completion posture is recorded where the hook is
 * read, not only in the spec.**
 *
 * `creditarConclusao` credits a class the moment `concluidaEm` is stamped, and it stamps
 * whatever the client claimed: there is no elapsed-time floor and there are no server-side
 * checkpoints. That is a *decision* (CLR-008), not an omission — but the code cannot tell the
 * difference on its own, and the next reader who notices the missing check has exactly two
 * moves: reopen a decision that was costed, or "fix" it. 004 paid for this: a gap recorded only
 * in a spec is a gap nobody meets again, because nobody reads the spec while reading the hook.
 *
 * So the assertion is deliberately **anchored to the hook's own doc comment** rather than to the
 * file. A note about trusted completions pasted at the bottom of the collection — or in the
 * `progressoAula` block, or in any of the other essays this file carries — would satisfy a
 * whole-file substring check and would still not be there when somebody opens `creditarConclusao`
 * and finds it crediting on nothing but a client's word.
 */
const FONTE = readFileSync(
  join(import.meta.dirname, '..', '..', 'collections', 'content', 'ProgressoAula.ts'),
  'utf8',
)

/**
 * The comment block **attached** to `export const <alvo>` — contiguous comment lines, stopping
 * at the first blank line above them. The blank line is the whole point: it is what separates
 * "documented beside this hook" from "documented somewhere in this 330-line file".
 */
function comentarioAcimaDe(alvo: string): string {
  const posicao = FONTE.indexOf(`export const ${alvo}`)
  if (posicao < 0) return ''

  const linhas = FONTE.slice(0, posicao).split('\n')
  const bloco: string[] = []
  for (let i = linhas.length - 1; i >= 0; i--) {
    const linha = (linhas[i] ?? '').trim()
    if (linha === '') {
      // Trailing blanks before the comment are noise; a blank *inside* the walk is the boundary.
      if (bloco.length === 0) continue
      break
    }
    if (!/^(\/\*|\*|\/\/)/.test(linha)) break
    bloco.unshift(linha)
  }
  return bloco.join('\n')
}

const DOC = comentarioAcimaDe('creditarConclusao')

describe('the completion hook records CLR-008 beside itself (T025b, FR-038)', () => {
  it('cites the decision, so the reader can find what was costed', () => {
    expect(
      DOC,
      'creditarConclusao has no comment block attached to it at all, so there is nowhere for ' +
        'CLR-008 to be read from.',
    ).not.toBe('')
    expect(
      /CLR-008/.test(DOC),
      'the hook credits on an unverified claim and its comment never names CLR-008. Without ' +
        'the citation the reader cannot tell a decision from an oversight, and the two have ' +
        'opposite remedies.',
    ).toBe(true)
    expect(
      /FR-038/.test(DOC),
      'the comment does not name FR-038, the requirement this posture is written into. The ID ' +
        'is what connects the hook to the spec row that can be revisited.',
    ).toBe(true)
  })

  it('says v1 TRUSTS the claim — no elapsed-time floor, no checkpoints', () => {
    expect(
      /\btrust(s|ed|ing)?\b/i.test(DOC),
      'the comment never says the completion claim is trusted. "There is no check here" is ' +
        'what the code already shows; that it is deliberate is the only thing a comment adds.',
    ).toBe(true)
    expect(
      /elapsed|duraca|duração|duracao|floor|checkpoint/i.test(DOC),
      'the comment does not name what was deliberately NOT built — the elapsed-time floor ' +
        'against duracaoMin and the server-side checkpoints. CLR-008 costed both; a reader ' +
        'who cannot see they were considered will propose one of them as a discovery.',
    ).toBe(true)
  })

  it('states the bound: 1 XP per class, forever, by idempotency', () => {
    expect(
      /\b1 XP\b/.test(DOC),
      'the comment does not state the bound as 1 XP. "Trusted" without the ceiling reads as ' +
        'an unbounded exposure, which is the opposite of what CLR-008 decided.',
    ).toBe(true)
    expect(
      /per (class|aula)|por aula|per-(class|aula)/i.test(DOC),
      'the comment does not say the 1 XP bound is per class. Per class and per completion are ' +
        'different ceilings, and only the first survives a rewatch.',
    ).toBe(true)
    expect(
      /idempot/i.test(DOC),
      'the comment does not say idempotency is what holds the bound. The ceiling is not a ' +
        'property of this hook alone — it is the ledger key (FR-003) — and a reader who does ' +
        'not know that can remove the guard believing the bound survives.',
    ).toBe(true)
  })

  it('states the audit trail, and refuses to claim farming is prevented', () => {
    expect(
      /ledger|xpLedger/i.test(DOC),
      'the comment does not name the ledger as the audit trail. Trusting the claim is only ' +
        'defensible because every credit leaves a row naming who, what and when.',
    ).toBe(true)
    expect(
      /append-only|append only/i.test(DOC),
      'the comment does not say the ledger is append-only. An audit trail that can be edited ' +
        'is not one, and append-only is the property that makes after-the-fact inspection work.',
    ).toBe(true)
    expect(
      /not prevent|does not prevent|never claims|not claim/i.test(DOC),
      'the comment does not say what CLR-008 explicitly refuses to claim: farming is NOT ' +
        'prevented, only bounded and visible after the fact. Overstating the guarantee is how ' +
        'the weaker property gets relied on as the stronger one.',
    ).toBe(true)
  })
})
