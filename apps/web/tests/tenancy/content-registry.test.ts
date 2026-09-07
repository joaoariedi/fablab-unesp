import type { CollectionConfig, Field } from 'payload'
import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config.js'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator.js'
import { isScoped, SCOPE_REGISTRY } from '../../lib/tenancy/scope-registry.js'

/**
 * The 002b integration gate (T044 — FR-004, FR-007, FR-018).
 *
 * T038–T043 authored eleven collection files in parallel; none of them could register itself,
 * because `payload.config.ts` and `SCOPE_REGISTRY` are single files six parallel agents cannot
 * all write. This test is what makes that hand-off checkable: a collection file that exists on
 * disk but reaches neither the config nor the registry is invisible to `registry.test.ts` —
 * that gate diffs the registry against the *config*, so an unregistered collection makes it
 * pass vacuously rather than fail. The expected list is therefore written out by name here,
 * driven from this feature's task list rather than derived from whatever happens to be wired.
 */
const NEW_CONTENT_COLLECTIONS = [
  'perfilMaker',
  'categoriaArtigo',
  'artigo',
  'categoriaModelo',
  'modelo3d',
  'aula',
  'progressoAula',
  'local',
  'maquina',
  'evento',
  'curtida',
] as const

/** Relationship fields hide inside tabs, groups, arrays and rows — a flat scan misses most. */
const flattenFields = (fields: Field[]): Field[] =>
  fields.flatMap((field) => {
    const nested: Field[] = []
    if ('fields' in field && Array.isArray(field.fields)) nested.push(...flattenFields(field.fields))
    if ('tabs' in field && Array.isArray(field.tabs)) {
      nested.push(...flattenFields(field.tabs.flatMap((tab) => tab.fields)))
    }
    return [field, ...nested]
  })

const relationshipTargets = (field: Field): string[] => {
  if (field.type !== 'relationship' && field.type !== 'upload') return []
  const { relationTo } = field as { relationTo: string | string[] }
  return Array.isArray(relationTo) ? relationTo : [relationTo]
}

const collectionsBySlug = async (): Promise<Map<string, CollectionConfig>> => {
  const config = await configPromise
  return new Map(config.collections.map((c) => [c.slug, c as unknown as CollectionConfig]))
}

describe('002b content collections are registered (T044)', () => {
  it('declares every new content collection scoped in SCOPE_REGISTRY (FR-004)', () => {
    const missing = NEW_CONTENT_COLLECTIONS.filter((slug) => !(slug in SCOPE_REGISTRY))
    expect(
      missing,
      `Missing from SCOPE_REGISTRY: ${missing.join(', ')}. Every collection is declared ` +
        `'scoped' or 'global' with a one-line justification (FR-004).`,
    ).toEqual([])

    const notScoped = NEW_CONTENT_COLLECTIONS.filter((slug) => !isScoped(slug))
    expect(
      notScoped,
      `Declared but not 'scoped': ${notScoped.join(', ')}. Content belongs to the lab that ` +
        `made it (FR-005).`,
    ).toEqual([])
  })

  it('registers each of them in the Payload config, tenant field injected (FR-007)', async () => {
    const bySlug = await collectionsBySlug()

    const absent = NEW_CONTENT_COLLECTIONS.filter((slug) => !bySlug.has(slug))
    expect(
      absent,
      `Collection file exists but is not in payload.config.ts: ${absent.join(', ')}. ` +
        `An unregistered collection makes registry.test.ts pass vacuously.`,
    ).toEqual([])

    const untenanted = NEW_CONTENT_COLLECTIONS.filter(
      (slug) => !bySlug.get(slug)?.fields.some((f) => 'name' in f && f.name === 'tenant'),
    )
    expect(
      untenanted,
      `No plugin-injected 'tenant' field: ${untenanted.join(', ')}. Add each to the ` +
        `multiTenantPlugin 'collections' map — without it the collection has no tenant column.`,
    ).toEqual([])
  })

  it('turns edit locking off on each (FR-018)', async () => {
    const bySlug = await collectionsBySlug()
    const locking = NEW_CONTENT_COLLECTIONS.filter(
      (slug) => bySlug.get(slug)?.lockDocuments !== false,
    )
    // `payload-locked-documents` is not scoped by the plugin and each row names a document by
    // collection and id, so a lockable scoped collection hands another organization an
    // enumerable reference to our document ids (CLR-004, SC-003).
    expect(
      locking,
      `lockDocuments is not false on: ${locking.join(', ')}.`,
    ).toEqual([])
  })

  it('guards every scoped-to-scoped relationship with sameTenant (FR-007)', async () => {
    const bySlug = await collectionsBySlug()
    const unguarded: string[] = []

    for (const slug of NEW_CONTENT_COLLECTIONS) {
      const collection = bySlug.get(slug)
      if (!collection) continue
      for (const field of flattenFields(collection.fields)) {
        const scopedTargets = relationshipTargets(field).filter(isScoped)
        if (scopedTargets.length === 0) continue
        const name = 'name' in field ? String(field.name) : '(unnamed)'
        if ((field as { validate?: unknown }).validate !== sameTenant) {
          unguarded.push(`${slug}.${name} -> ${scopedTargets.join('|')}`)
        }
      }
    }

    // Spike S4c updated a row in organization A to point at a row in organization B and the
    // write succeeded: without this validator a scoped relationship is a hole straight
    // through the tenancy model, and the plugin does not close it.
    expect(
      unguarded,
      `Relationship(s) to a scoped collection with no 'validate: sameTenant': ` +
        `${unguarded.join(', ')}.`,
    ).toEqual([])
  })
})
