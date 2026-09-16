import { describe, expect, it } from 'vitest'

import { COLECOES_COM_AUTOR } from '../../lib/accounts/deletion'
import configPromise from '../../payload.config'
import { isScoped } from '../../lib/tenancy/scope-registry'

/**
 * T039 / FR-031, FR-034, CLR-003 — **the erasure's collection list, asked of the config.**
 *
 * `COLECOES_COM_AUTOR` is what `apagarConta` walks to replace a byline with the tombstone. Its
 * own docblock names the danger: a collection *forgotten* there is *"a byline that survives the
 * erasure"* — silent, and an LGPD record that says the name is gone while it is still on a card.
 *
 * It happened. `projeto` had no `autor` until T039 and was listed as deliberately absent; the
 * column landed and the list did not move. Nothing caught it, and `lgpd-doc.test.ts` could not:
 * it iterates over **this same constant**, so the omission was concealed by the only test that
 * read it. That is the shape of a list that checks itself.
 *
 * So this file asks the authority instead. Payload's sanitized config knows which collections
 * declare a field named `autor` pointing at `perfilMaker`; every scoped one of them owes a
 * tombstone, and the list must name exactly those. A collection gaining an author next year
 * fails here on the day it does, rather than on the day somebody remembers.
 */

/** A relationship field named `autor`, as the sanitized config reports it. */
type CampoAutor = { name?: string; type?: string; relationTo?: string | string[] }

const apontaParaPerfil = (campo: CampoAutor): boolean => {
  const alvo = campo.relationTo
  return Array.isArray(alvo) ? alvo.includes('perfilMaker') : alvo === 'perfilMaker'
}

describe('every collection with an author is on the erasure list (T039, FR-031, CLR-003)', () => {
  it('names exactly the scoped collections that declare an `autor` → `perfilMaker`', async () => {
    const config = await configPromise

    const comAutor = config.collections
      .filter((colecao) => isScoped(colecao.slug))
      .filter((colecao) =>
        colecao.flattenedFields.some(
          (campo) =>
            (campo as CampoAutor).name === 'autor' &&
            (campo as CampoAutor).type === 'relationship' &&
            apontaParaPerfil(campo as CampoAutor),
        ),
      )
      .map((colecao) => colecao.slug)
      .sort()

    // Non-vacuity: a config read that found nothing would make the equality below trivially
    // true against an empty list, which is the failure this whole file is written against.
    expect(
      comAutor.length,
      'no collection declares an `autor` relationship, so either the field was renamed or this ' +
        'scan reads the wrong thing — and the assertion below would compare two empty lists',
    ).toBeGreaterThanOrEqual(4)

    expect(
      [...COLECOES_COM_AUTOR].sort(),
      'the erasure walks a list that disagrees with the collections actually carrying an ' +
        'author. A collection MISSING here keeps its byline through an erasure — the silent ' +
        'half the constant\'s own docblock names, and an LGPD record that says the name was ' +
        'removed while a card still shows it. One listed but carrying no `autor` is a write ' +
        'that fails mid-erasure and rolls the whole thing back',
    ).toEqual(comAutor)
  })
})
