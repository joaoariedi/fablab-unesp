import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { MEDIA_SLUGS } from '../../collections/Media'
import { refuseOverQuota, storageUsageAfterChange, storageUsageAfterDelete } from '../../lib/content/storage-usage'
import configPromise, { s3StorageOptions } from '../../payload.config'

/**
 * T011 / FR-026, SC-019 — no byte reaches storage without passing the quota.
 *
 * Collection hooks run the same whichever transport called the operation — Local API, REST,
 * GraphQL, the admin — so one registration covers them all. What could still go around it is
 * narrower, and each is pinned here:
 *
 *   1. **Browser-direct uploads.** With `clientUploads` on, the browser PUTs to the bucket with a
 *      signed URL before any document exists, so the bytes are stored before a hook could refuse
 *      them — the very hole the per-group cap already has on that path (T016b). Off since 002's
 *      D1; asserted here, because flipping it would silently turn the quota into an after-the-fact
 *      note.
 *   2. **A media collection without the hooks** — a fourth group added later, say.
 *   3. **Code writing to the bucket itself**, around Payload. Today nothing does.
 */

const WEB = fileURLToPath(new URL('../..', import.meta.url))
const FONTES = ['app', 'lib', 'collections'] as const
/** An IMPORT of the S3 SDK — not a mention in a comment, which `media-objects.ts` makes. */
const IMPORTA_SDK = /^\s*import[^;]*from\s+['"]@aws-sdk\/client-s3['"]/m

const arquivos = (raiz: string): string[] =>
  readdirSync(raiz).flatMap((nome) => {
    const caminho = join(raiz, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : []
  })

const quemImportaOSdk = (raizes: readonly string[]): string[] =>
  raizes.flatMap(arquivos).filter((f) => IMPORTA_SDK.test(readFileSync(f, 'utf8')))

describe('browser-direct uploads stay off (FR-026)', () => {
  it('clientUploads is false in the storage options the app is built with', async () => {
    const config = await configPromise
    const opcoes = s3StorageOptions(
      { S3_BUCKET: 'qualquer', S3_ENDPOINT: undefined, S3_ACCESS_KEY_ID: undefined, S3_SECRET_ACCESS_KEY: undefined, S3_REGION: undefined },
      config.collections,
    )
    expect(
      opcoes.clientUploads,
      'clientUploads is on: the browser would PUT to the bucket before any hook could refuse it, ' +
        'and the quota would become a note written after the bytes were already stored',
    ).toBe(false)
  })
})

describe('every media collection carries the quota and the figure (FR-026, FR-028)', () => {
  it.each(Object.values(MEDIA_SLUGS))('%s refuses over quota and keeps the figure', async (slug) => {
    const config = await configPromise
    const colecao = config.collections.find((c) => c.slug === slug)
    expect(colecao, `${slug} is not in the built config`).toBeDefined()
    const hooks = colecao!.hooks ?? {}
    expect(hooks.beforeValidate ?? [], `${slug} has no quota refusal`).toContain(refuseOverQuota)
    expect(hooks.afterChange ?? [], `${slug} does not charge its uploads`).toContain(storageUsageAfterChange)
    expect(hooks.afterDelete ?? [], `${slug} does not release its deletions`).toContain(storageUsageAfterDelete)
  })
})

describe('nothing writes to the bucket around Payload (SC-019)', () => {
  it('the control: the scan names a file that imports the S3 SDK', () => {
    // The scan's silence below means something only if it can speak: it must find this file,
    // which really does import the SDK — so the pattern is not one that matches nothing.
    expect(IMPORTA_SDK.test(`import { PutObjectCommand } from '@aws-sdk/client-s3'\n`)).toBe(true)
    expect(IMPORTA_SDK.test(`// re-read a bucket through @aws-sdk/client-s3\n`), 'a comment counted').toBe(false)
  })

  it('no source file under app, lib or collections imports the S3 SDK', () => {
    const encontrados = quemImportaOSdk(FONTES.map((f) => join(WEB, f))).map((f) => relative(WEB, f))
    expect(
      encontrados,
      'a source file imports @aws-sdk/client-s3 and can write to the bucket without passing ' +
        'refuseOverQuota — every byte must arrive through a Payload upload operation',
    ).toEqual([])
  })
})
