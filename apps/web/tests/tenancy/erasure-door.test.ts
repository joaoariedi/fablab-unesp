import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ErasureNotOwnedError, getErasureScopedPayload } from '../../lib/tenancy/erasure-payload'
import { getSystemScopedPayload } from '../../lib/tenancy/system-payload'
import { buildWorld, type Fixture } from './fixtures'

/**
 * T032b / FR-031, CLR-003 — the door a person erases themselves through, and what bounds it.
 *
 * ## Why the bound is ownership and not the host
 *
 * `signup-payload.ts` is confined by the host, and that is enough there: a signup cannot land in
 * another lab. It would not be enough here, because **every maker of a lab shares a host**. So
 * this door proves the profile belongs to the authenticated caller before it hands anything
 * back, and then refuses every id but that profile and that account.
 *
 * That proof is the entire licence for the door to exist. `perfilMaker.delete` is `teamOnly()`
 * and `users.delete` is `masterOnly()`, and both rules are right: they are about somebody
 * erasing *other people's* work. What they do not describe is a person removing their own, which
 * is what LGPD asks for — so the exemption is written against exactly that case and nothing
 * wider.
 *
 * ## What each case is for
 *
 * The happy path proves the door opens. Every other case is an attempt to get it to open onto
 * somebody else, and the file is worth more for those: a door whose only test is that it opens
 * is not a test of a door.
 */

let world: Fixture
let perfilA: { id: string | number }
let perfilB: { id: string | number }

beforeAll(async () => {
  world = await buildWorld()
  const sistema = await getSystemScopedPayload(String(world.orgA.id))

  perfilA = await sistema.create<{ id: string | number }>({
    collection: 'perfilMaker',
    data: { nome: 'Maria Porta', handle: `porta-a-${String(Date.now())}`, usuario: world.userA.id },
  })
  perfilB = await sistema.create<{ id: string | number }>({
    collection: 'perfilMaker',
    data: { nome: 'Outro Alguem', handle: `porta-b-${String(Date.now())}`, usuario: world.userB.id },
  })
}, 120_000)

/**
 * The two profiles this file created, removed again.
 *
 * Not tidiness: `tests/content/counters.test.ts` reconciles **the whole database** against a
 * recount of every counter's source rows, so a profile left behind by a neighbouring file
 * surfaces there as drift — a failure in a gate that is working correctly, blamed on a file that
 * did nothing wrong. Measured: both of its cases went red with these two rows present.
 */
afterAll(async () => {
  const sistema = await getSystemScopedPayload(String(world.orgA.id))
  for (const perfil of [perfilA, perfilB]) {
    if (perfil) await sistema.delete({ collection: 'perfilMaker', id: perfil.id })
  }
}, 60_000)

const abrir = (usuarioId: unknown, perfilId: unknown) =>
  getErasureScopedPayload({
    host: world.orgA.host,
    usuarioId: usuarioId as string | number,
    perfilId: perfilId as string | number,
  })

describe('the door opens onto the caller’s own rows (FR-031)', () => {
  it('unseals the profile and the account it belongs to', async () => {
    const porta = await abrir(world.userA.id, perfilA.id)

    expect(String(porta.perfilId)).toBe(String(perfilA.id))
    expect(String(porta.usuarioId)).toBe(String(world.userA.id))
    expect(porta.tenantId).toBe(String(world.orgA.id))
  })
})

describe('and onto nothing else (SC-002)', () => {
  it('refuses a profile that belongs to somebody else', async () => {
    // The case the host bound cannot catch: `userB`'s profile is in the SAME organization, so
    // every tenant filter in the codebase passes it. Only the ownership proof refuses it.
    await expect(
      abrir(world.userA.id, perfilB.id),
      'one maker opened the erasure door onto another maker’s profile. They share a host, so ' +
        'nothing else in this codebase would have stopped the delete.',
    ).rejects.toBeInstanceOf(ErasureNotOwnedError)
  })

  it('refuses a profile that does not exist', async () => {
    await expect(abrir(world.userA.id, 99_999_999)).rejects.toBeInstanceOf(ErasureNotOwnedError)
  })

  it('refuses to delete any id but the two it proved', async () => {
    const porta = await abrir(world.userA.id, perfilA.id)

    // Proven ids first, so the refusals below cannot be "this door deletes nothing".
    await expect(
      porta.delete({ collection: 'perfilMaker', id: perfilB.id }),
      'the door deleted a profile it never proved belonged to the caller',
    ).rejects.toThrow(/so abre sobre/)
    await expect(
      porta.delete({ collection: 'users', id: world.userB.id as string | number }),
      'the door deleted an account it never proved belonged to the caller',
    ).rejects.toThrow(/so abre sobre/)
  })

  it('refuses a collection the erasure has no business deleting', async () => {
    const porta = await abrir(world.userA.id, perfilA.id)

    await expect(porta.delete({ collection: 'artigo', id: 1 })).rejects.toThrow(/so abre sobre/)
  })

  it('updates only the three collections that carry an author', async () => {
    const porta = await abrir(world.userA.id, perfilA.id)

    // The tombstone is `autor → null` on artigo/aula/modelo3d. Anything else being writable
    // would make this a general write client wearing a narrow name.
    await expect(
      porta.update({ collection: 'perfilMaker', id: perfilA.id, data: { nome: 'x' } }),
      'the door edited a collection outside the tombstone',
    ).rejects.toThrow(/nao atualiza/)
  })
})
