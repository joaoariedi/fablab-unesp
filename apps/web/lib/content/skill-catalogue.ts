import type { PayloadRequest, Where } from 'payload'

import { getTenantScopedPayload, TenantUnresolvedError, type TenantScopedPayload } from '../tenancy'

/**
 * **Which skills a document may be assigned to** (T038, FR-019, US9).
 *
 * FR-019 retires a skill from *use* without retiring it from *history*: it disappears from the
 * maker's panel and from new assignment, while every level and every ledger entry stays exactly
 * where it was. Two of those three surfaces already had an owner — the panel is filtered where
 * it is rendered (`minha-conta`), and a retired skill is never handed to a new profile
 * (`lib/accounts/signup.ts`, `Skill.ts`). This is the third: the `skill` relationship on the
 * mission and on the four publishables, which without it goes on offering the whole catalogue.
 *
 * Nothing else stops that. `ativa: false` is a column, not a constraint, so an author naming the
 * retired skill on their next article is an ordinary write — and the review queue then keeps
 * approving publications that credit XP into a skill no maker can see on their panel, which is
 * the one state FR-015 and FR-016 exist to prevent.
 *
 * ── Why the already-stored skill stays selectable ───────────────────────────────────────────
 *
 * The obvious implementation is the static `{ ativa: { equals: true } }`, and it is wrong in a
 * way that only shows up months later. `filterOptions` is not merely a picker query: the shared
 * relationship validator delegates to `validations.relationship`, which enforces it on **every
 * write that carries the field** (`lib/tenancy/same-tenant-validator.ts` §
 * `payloadRelationshipRefusal`). An article published in a skill the lab later retires still
 * carries that id, and the admin panel sends the whole document on save — so the static filter
 * would refuse the save. Retiring one skill would quietly brick every publication that ever
 * credited it: no edit, no correction, no republish, the only way out being to re-point the
 * content at a different skill. That is the append-only history rewritten to satisfy a display
 * rule, which is "erased" wearing a different coat.
 *
 * So the rule is about **new** assignment, exactly as FR-019 words it: the active catalogue,
 * plus whatever this document already names. A create (`id` undefined) has nothing to add, and
 * pays no read for it.
 *
 * ── The two answers that are deliberately permissive ────────────────────────────────────────
 *
 * **A write with no host is a SERVER-SIDE write** — a seed, a migration, a Local API call in a
 * test — and the choke point quite correctly refuses to guess an organization. There is then no
 * way to learn what the document already names, and refusing the write on that ignorance would
 * strand exactly the callers that cannot be shown an error. `Skill.ts` makes the same call for
 * the same reason, and says so twice.
 *
 * **A document this caller cannot read** answers the same way, and costs nothing: a caller who
 * cannot read the row cannot update it either — access control refuses that write on its own,
 * before the value it carries is anybody's question.
 *
 * Neither branch can widen the tenant boundary. The multi-tenant plugin wraps whatever is
 * declared here and AND-s its own tenant clause onto the result
 * (`plugin-multi-tenant/utilities/addFilterOptionsToFields`), so the most permissive answer
 * available is still "any skill of this organization".
 *
 * @example
 *   { name: 'skill', type: 'relationship', relationTo: 'skill',
 *     filterOptions: offeredSkills('artigo'), validate: sameTenant }
 */

/** The catalogue as it is offered for something that names no skill yet. */
export const ACTIVE_SKILLS_ONLY: Where = { ativa: { equals: true } }

/** The slice of the choke point this needs: one read of the document being edited. */
type StoredSkillReader = Pick<TenantScopedPayload, 'findByID'>

const skillIdOf = (valor: unknown): string | number | null => {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'object' && 'id' in valor) return (valor as { id: string | number }).id
  return valor as string | number
}

/**
 * The skill this document already carries, or `null` when it carries none.
 *
 * `depth: 0` because only the id is compared, and a populated row would be a second read of the
 * catalogue for an answer already in the column.
 */
const storedSkillOf = async (
  store: StoredSkillReader,
  collection: string,
  id: string | number,
): Promise<string | number | null> => {
  const doc = await store.findByID<{ skill?: unknown }>({ collection, id, depth: 0 })
  return doc === null ? null : skillIdOf(doc.skill)
}

/**
 * @param collection the slug of the collection this field belongs to — passed explicitly
 *   because `filterOptions` is handed the document's `id` but never its collection, and
 *   deriving one from `req` would be a guess that is wrong on every nested operation.
 */
export const offeredSkills =
  (collection: string) =>
  async ({ id, req }: { id?: string | number; req: PayloadRequest }): Promise<Where | true> => {
    // A create has nothing assigned yet, so the active catalogue is the whole answer — and the
    // hot path pays no extra read for it.
    if (id === undefined || id === null) return ACTIVE_SKILLS_ONLY

    let store: StoredSkillReader
    try {
      store = await getTenantScopedPayload(req)
    } catch (erro) {
      if (!(erro instanceof TenantUnresolvedError)) throw erro
      console.warn(
        `[skill] ${collection} ${String(id)} foi escrito sem host na requisição (escrita de ` +
          'servidor); a skill já gravada não pôde ser lida e o catálogo inteiro foi oferecido ' +
          '(FR-019)',
      )
      return true
    }

    const jaEscolhida = await storedSkillOf(store, collection, id)
    if (jaEscolhida === null) return ACTIVE_SKILLS_ONLY

    return { or: [ACTIVE_SKILLS_ONLY, { id: { equals: jaEscolhida } }] }
  }
