import { describe, expect, it } from 'vitest'

import { Maquina } from '../../collections/content/Maquina'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T041 / FR-001, FR-003 — `maquina`, the second physical-resource collection `evento`
 * relates to.
 *
 * The fields trace to `calendario.md` § Coleções relacionadas: "`maquina` — `nome`,
 * `estacao`, `icone` (`.svg`), `skill` relacionada, `manutencao_ate`". Two of the five are
 * **deliberately absent**, and this file pins the absence so a later reader does not "restore"
 * them into a config that cannot load:
 *
 *   - **`estacao`** and **`skill`** are relations to feature 005's collections (spec § Scope,
 *     "Deliberately out"; FR-022 as amended by D2). Payload throws `InvalidFieldRelationship`
 *     at config load for a `relationTo` naming a collection that does not exist, so declaring
 *     them here would take the whole app down rather than defer anything. `Projeto.ts` records
 *     the same deferral for `maquinas_utilizadas → estacao`.
 *
 * Config-shape only, against the exported collection: registration is T044's single edit.
 */

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

const fieldNamed = (name: string) =>
  Maquina.fields.find((f) => (f as { name?: string }).name === name) as
    | Record<string, unknown>
    | undefined

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = Maquina.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`maquina declares no ${operation} access; it would fall back to logged-in`)
  }
  return access({ req: { user } } as never)
}

describe('maquina is declared (T041, FR-003)', () => {
  it('carries the slug evento.maquinas relates to', () => {
    expect(Maquina.slug).toBe('maquina')
  })

  it('is labelled in PT-BR, because the admin is the lab team\'s surface (US7)', () => {
    const labels = Maquina.labels as { singular?: unknown; plural?: unknown } | undefined

    expect(labels?.singular).toBe('Máquina')
    expect(labels?.plural).toBe('Máquinas')
  })

  it('names its rows by nome, which is what the machine filter and picker show (FR-021)', () => {
    expect(
      (Maquina.admin as { useAsTitle?: unknown } | undefined)?.useAsTitle,
      'without useAsTitle the picker on evento.maquinas offers ids',
    ).toBe('nome')
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (Maquina.endpoints || []).some((e) => e.path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })

  it('writes no row to payload-locked-documents (FR-018, CLR-004)', () => {
    expect(Maquina.lockDocuments).toBe(false)
  })
})

describe('maquina carries the fields calendario.md defines (T041, FR-003)', () => {
  it('requires nome — Corte a Laser, Impressoras 3D, Serigrafia, Bordado Digital', () => {
    const field = fieldNamed('nome')

    expect(field, 'maquina declares no nome (calendario.md § Coleções relacionadas)').toBeDefined()
    expect(field?.required, 'the machine filter has nothing to render without a name').toBe(true)
  })

  it('declares icone and manutencaoAte with their types', () => {
    for (const [name, type] of [
      ['icone', 'relationship'],
      ['manutencaoAte', 'date'],
    ] as const) {
      const field = fieldNamed(name)
      expect(field, `maquina declares no ${name} (calendario.md)`).toBeDefined()
      expect(field?.type, `${name} has the wrong type`).toBe(type)
    }
  })

  it('points icone at the image media collection, so it inherits the image rules', () => {
    // `.svg` per calendario.md, which is in the image group's allowlist — pointing at
    // `midiaImagem` applies that cap and allowlist rather than restating them here.
    expect(fieldNamed('icone')?.relationTo).toBe('midiaImagem')
  })

  it('declares neither estacao nor skill, whose targets belong to feature 005 (D2)', () => {
    // Not an oversight and not a TODO: a `relationTo` naming an absent collection throws
    // `InvalidFieldRelationship` at config load, so declaring these would break the app for
    // every collection at once. They are additive the day 005 registers their targets.
    for (const name of ['estacao', 'skill']) {
      expect(
        fieldNamed(name),
        `maquina declares ${name}, whose target collection is feature 005's (FR-022, D2)`,
      ).toBeUndefined()
    }
  })

  it('labels every field in PT-BR', () => {
    const expected: Record<string, string> = {
      nome: 'Nome',
      icone: 'Ícone',
      manutencaoAte: 'Manutenção até',
    }

    for (const [name, label] of Object.entries(expected)) {
      expect(fieldNamed(name)?.label, `${name} is not labelled in PT-BR`).toBe(label)
    }
  })
})

describe('maquina keeps the template\'s guarantees (T041, FR-006, FR-007)', () => {
  it('validates its scoped relationship with the shared sameTenant (FR-007)', () => {
    expect(
      fieldNamed('icone')?.validate,
      'icone points at a scoped collection with no same-tenant validator',
    ).toBe(sameTenant)
  })

  it('answers a member with a query constraint, never a bare authorisation (FR-006)', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        "including another lab's machines (FR-006)",
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    expect(await decide('read', undefined)).toBe(false)
  })

  it('lets only the lab team declare a machine, not every maker (US7)', async () => {
    for (const operation of ['create', 'update', 'delete'] as const) {
      expect(
        await decide(operation, member(1, 'maker')),
        `a maker was allowed to ${operation} a maquina`,
      ).toBe(false)
    }
  })

  it('admits staff and admins, still scoped to their own organizations', async () => {
    for (const role of ['staff', 'admin']) {
      const result = await decide('create', member(7, role))
      expect(result, `a ${role} was refused`).not.toBe(false)
      expect(JSON.stringify(result), `a ${role} was not scoped to their own lab`).toContain('7')
    }
  })
})
