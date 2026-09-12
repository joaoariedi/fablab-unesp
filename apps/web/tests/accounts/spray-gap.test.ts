import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T016b / FR-015, CLR-007 — **the gap is recorded where the configuration is read.**
 *
 * CLR-007 decided that FR-015 is Payload's own per-account lock and that per-source limiting
 * is not built in phase 1. It also named, rather than implied, the attack that decision does
 * not stop: *"an attacker spraying one common password across many accounts never trips a
 * per-account lock."*
 *
 * That sentence is the whole point of the clarification, and the spec is not where it will be
 * read. Someone raising `maxLoginAttempts` from 5 to 10, or reading these two numbers to
 * decide whether login is "rate limited", is looking at `collections/Users.ts` — not at
 * `spec.md § CLR-007`. A decision recorded only in the document nobody has open while editing
 * the value is a decision that gets silently re-litigated.
 *
 * So the assertions below are deliberately **positional**: they read only the contiguous `//`
 * block immediately above `maxLoginAttempts`, never the file as a whole. Scanning the whole
 * file would pass just as happily if the gap were written in the collection's top docblock,
 * fifty lines from the config — which is the spec's failure mode with extra steps, and is
 * precisely what this task exists to prevent.
 *
 * Why each assertion is shaped the way it is:
 *
 *  - **the attack is named, not alluded to.** "Per-source limiting is not in phase 1" states
 *    what is missing; it does not tell the reader what an attacker does with it. A future
 *    reader has to already know what per-source limiting buys to hear a warning in it.
 *  - **the negation sits in the same sentence as the attack.** A block can carry the word
 *    "spraying" in one sentence and an unrelated "not" in another and read as though the
 *    attack were handled. Requiring the two together is what makes this assert the *gap*
 *    rather than the vocabulary.
 *  - **CLR-007 is cited** so the reader can reach the rationale and the revisit condition
 *    ("the platform is public, or a second organization exists") rather than only the verdict.
 */

const APP_DIR = join(import.meta.dirname, '..', '..')
const usersSource = readFileSync(join(APP_DIR, 'collections', 'Users.ts'), 'utf8')

/**
 * The contiguous run of `//` lines directly above the `maxLoginAttempts:` config line, with the
 * comment markers stripped and joined into prose. Returns `''` when the config line is not
 * preceded by any comment at all — which is itself a failure this file should report.
 */
const commentBlockAbove = (source: string, property: string): string => {
  const lines = source.split('\n')
  const target = lines.findIndex((line) => new RegExp(`^\\s*${property}\\s*:`).test(line))
  if (target === -1) return ''

  const block: string[] = []
  // `noUncheckedIndexedAccess` types `lines[i]` as `string | undefined`, and the loop guard is
  // not enough for the compiler to know the body's access is the same one. Bound once.
  for (let i = target - 1; i >= 0; i -= 1) {
    const linha = lines[i]
    if (linha === undefined || !/^\s*\/\//.test(linha)) break
    block.unshift(linha.replace(/^\s*\/\/\s?/, ''))
  }
  return block.join(' ')
}

const gapComment = commentBlockAbove(usersSource, 'maxLoginAttempts')

/** Sentence-ish split, so "names the attack" and "says it is unstopped" can be required together. */
const sentences = gapComment.split(/(?<=[.!?])\s+/).filter(Boolean)

const NAMES_THE_ATTACK = /spray(ing|ed|s)?\b/i
const MANY_ACCOUNTS = /\b(many|multiple|several|across)\b[^.]{0,40}\baccounts\b/i
const UNSTOPPED = /\b(not|never|no|nothing|cannot|can't|does not|doesn't|without)\b/i

describe('the spraying gap is recorded beside maxLoginAttempts (T016b, FR-015, CLR-007)', () => {
  it('has a comment on the config line at all', () => {
    expect(gapComment).not.toBe('')
  })

  it('names password spraying as the attack, rather than only naming the missing control', () => {
    expect(gapComment).toMatch(NAMES_THE_ATTACK)
  })

  it('says the spraying is spread across many accounts, which is why the per-account lock misses it', () => {
    expect(gapComment).toMatch(MANY_ACCOUNTS)
  })

  it('states in the same sentence as the attack that it is not stopped', () => {
    const attackSentences = sentences.filter((sentence) => NAMES_THE_ATTACK.test(sentence))
    expect(attackSentences.length).toBeGreaterThan(0)
    expect(attackSentences.some((sentence) => UNSTOPPED.test(sentence))).toBe(true)
  })

  it('cites CLR-007 so the rationale and the revisit condition are reachable', () => {
    expect(gapComment).toMatch(/CLR-007/)
  })
})
