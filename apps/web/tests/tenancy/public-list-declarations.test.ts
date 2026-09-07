import { describe, expect, it } from 'vitest'

import {
  isScoped,
  publicListCollections,
  publicListReason,
  SCOPE_REGISTRY,
} from '../../lib/tenancy/scope-registry.js'

/**
 * The four `publicList` declarations, and the collections that must never get one (T004,
 * FR-002, FR-004, FR-008).
 *
 * `public-list.test.ts` guards the *shape* of a declaration — non-empty reason, no queryable
 * `status`. It is deliberately blind to **which** collections carry one, because a rot guard
 * that also pinned the membership would pass vacuously the day the set was empty and would
 * have to be edited by the same person adding the entry it exists to question.
 *
 * This file pins the membership, in both directions, and the second direction is the one with
 * teeth:
 *
 *   - **Declared**: the four filter vocabularies a public page *enumerates* — the category
 *     tabs on Projetos (`projetos.md` § Tabs de categoria) and Artigos, the teal sidebar's
 *     `CATEGORIAS` list on Biblioteca 3D (`biblioteca-3d.md` § Sidebar), and the
 *     `Todas as máquinas` select on Calendário (`calendario.md` § Filtros). Each is read
 *     without a document to hang it on, so no populated read can carry it in.
 *   - **Not declared**: everything a published document *populates* — the three media
 *     collections behind a cover image, `perfilMaker` behind an author, `local` behind an
 *     event's room. `depth: 1` already carries those in behind a row the published-only
 *     filter has cleared, so a declaration would only widen the anonymous surface for nothing
 *     — and `curtida` and `users` are the shape of the feature-002 leak itself.
 *
 * An exact set is the assertion rather than four `toBeDefined()` calls: only equality fails
 * when a fifth collection is added, and "publicList becomes a habit — the 002 leak,
 * reintroduced one collection at a time" is the risk the plan names for this mechanism.
 */

/** The pages that read each vocabulary, so a diff that drops one names what it breaks. */
const DECLARED: Record<string, string> = {
  categoriaProjeto: 'Projetos — the category tabs',
  categoriaArtigo: 'Artigos — the category tabs',
  categoriaModelo: 'Biblioteca 3D — the teal sidebar CATEGORIAS list',
  maquina: 'Calendário — the "Todas as máquinas" filter',
}

/** Reached by populating a published document, so a declaration would widen nothing but risk. */
const POPULATED_ONLY = [
  'midiaImagem',
  'midiaModelo3d',
  'midiaDocumento',
  'perfilMaker',
  'local',
] as const

/** Never public at all: a like ledger and the platform's accounts. */
const NEVER_PUBLIC = ['curtida', 'users', 'progressoAula', 'pendingInvites'] as const

describe('the publicList declarations (T004, FR-002, FR-004, FR-008)', () => {
  it('declares exactly the four filter vocabularies the public pages enumerate', () => {
    expect(publicListCollections(SCOPE_REGISTRY).sort()).toEqual(Object.keys(DECLARED).sort())
  })

  it.each(Object.entries(DECLARED))(
    '%s carries a reason a reviewer can argue with (%s)',
    (slug) => {
      const reason = publicListReason(slug)

      expect(reason, `${slug} declares no publicList reason`).toBeDefined()
      // Long enough to be a sentence rather than a shrug: `public-list.test.ts` already
      // refuses an empty string, and the next cheapest way to satisfy it is "ok".
      expect((reason ?? '').trim().length, `${slug}: ${String(reason)}`).toBeGreaterThan(30)
    },
  )

  it.each(Object.keys(DECLARED))(
    '%s is scoped, so the enumeration is confined to the host organization',
    (slug) => {
      // The gate AND-s `isScoped` in: a declaration says a visitor may enumerate the
      // collection, it cannot manufacture the tenant column that keeps the enumeration to one
      // lab. A `global` collection declared here would serve every organization's rows.
      expect(isScoped(slug), `${slug} is not scoped — its publicList would leak every tenant`).toBe(
        true,
      )
    },
  )

  it.each([...POPULATED_ONLY, ...NEVER_PUBLIC])('%s carries no publicList declaration', (slug) => {
    expect(SCOPE_REGISTRY[slug as keyof typeof SCOPE_REGISTRY], `${slug} left the registry`).toBeDefined()
    expect(publicListReason(slug), `${slug} was granted an anonymous listing`).toBeUndefined()
  })
})
