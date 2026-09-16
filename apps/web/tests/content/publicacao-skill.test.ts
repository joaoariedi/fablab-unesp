import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T013b / FR-039, CLR-009 — the four publishables each name **the skill their publication
 * credits**.
 *
 * FR-002 requires every ledger entry to record a skill, and the checklist (CHK010/011) found
 * that *nothing mapped a publication to one*: `projeto` has a `categoria`, `artigo` and
 * `modelo3d` have their own independent vocabularies, and `aula` has none — so a
 * category→skill table would have been a fourth vocabulary to seed and keep in step across
 * every organization. CLR-009 chose the honest shape instead: the author names the skill on
 * the content and the team confirms it in the same review that publishes it.
 *
 * **Nullable, asserted rather than assumed.** CLR-002's rule is that a column created
 * nullable never needs feature 004's two-layer `required: true` repair, and the content that
 * shipped before this feature names no skill at all. `required: true` here would make every
 * pre-existing row unwritable and would take `creditXp` down with it — a publication naming
 * no skill still credits the maker's total (FR-039), so refusing the write would lose both
 * halves of the credit to save one. `xpLedger.skill` is nullable for exactly this reason and
 * this field is its source.
 *
 * **`sameTenant` by identity, not merely "a function".** Both sides are scoped — `skill` is
 * the one catalogue CLR-001 scopes per organization — and spike S4c measured the multi-tenant
 * plugin *accepting* a row in A pointed at a row in B. FR-007 asks for the **shared**
 * validator: a hand-rolled copy on one collection is the drift that makes a tenancy guarantee
 * stop holding somewhere nobody looks. So `toBe(sameTenant)`, the same assertion
 * `projeto-same-tenant.test.ts` makes for `categoria`.
 *
 * `evento` is deliberately absent from the list: it carries `aprovacaoRegistrada` like the
 * others but publishing one credits nothing (CLR-012, FR-008), so it has no entry to name a
 * skill for.
 *
 * Config-shape only: no database, like `projeto.test.ts` and `publishable.test.ts`.
 */

const PUBLICAVEIS = ['projeto', 'artigo', 'aula', 'modelo3d'] as const

type RelationshipField = {
  name?: string
  type: string
  relationTo?: string | string[]
  required?: boolean
  label?: unknown
  validate?: unknown
}

const skillField = async (slug: string): Promise<RelationshipField | undefined> => {
  const config = await configPromise
  const collection = config.collections.find((c) => c.slug === slug)
  if (!collection) throw new Error(`${slug} is not registered in the Payload config`)

  // `flattenedFields`, not `fields`: a relationship nested in a group or a tab is still a
  // column, and a walk of the top level alone would exempt it silently.
  return (collection.flattenedFields as unknown as RelationshipField[]).find(
    (f) => f.name === 'skill',
  )
}

describe('a publication names the skill it credits (T013b, FR-039, CLR-009)', () => {
  it.each(PUBLICAVEIS)('%s declares a `skill` relationship pointing at the catalogue', async (slug) => {
    const field = await skillField(slug)

    expect(
      field,
      `${slug} declares no \`skill\` field. FR-002 requires the ledger entry to record a ` +
        'skill and nothing else on this collection maps a publication to one, so every entry ' +
        'it causes credits the maker total and no skill at all.',
    ).toBeDefined()

    expect(field?.type, `${slug}.skill is not a relationship`).toBe('relationship')
    expect(
      field?.relationTo,
      `${slug}.skill points somewhere other than the \`skill\` catalogue`,
    ).toBe('skill')
  })

  it.each(PUBLICAVEIS)('leaves %s.skill nullable, so pre-005 content stays writable', async (slug) => {
    const field = await skillField(slug)

    // Non-vacuity guard: `undefined?.required` is `undefined`, which is falsy, so without this
    // the case below is green for a collection that declares no `skill` at all.
    expect(field, `${slug} declares no \`skill\` field, so this case asserts nothing`).toBeDefined()

    expect(
      field?.required,
      `${slug}.skill is \`required\`. Every row published before this feature names no skill, ` +
        'so the column cannot be NOT NULL without making them unwritable — and CLR-009 says a ' +
        "publication with none still credits the maker's total.",
    ).toBeFalsy()
  })

  it.each(PUBLICAVEIS)('guards %s.skill with the shared same-tenant validator', async (slug) => {
    const field = await skillField(slug)

    expect(
      field?.validate,
      `${slug}.skill carries no \`sameTenant\`. \`skill\` is scoped per organization ` +
        '(CLR-001) and spike S4c measured the plugin ACCEPTING a cross-tenant reference, so ' +
        "without it a publication in lab A can credit lab B's vocabulary.",
    ).toBe(sameTenant)
  })

  it.each(PUBLICAVEIS)('labels %s.skill for the team that fills it in (US7)', async (slug) => {
    const field = await skillField(slug)

    expect(field?.label, `${slug}.skill is unlabelled`).toBe('Skill')
  })
})
