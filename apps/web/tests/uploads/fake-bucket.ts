import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Payload } from 'payload'
import sharp from 'sharp'

/**
 * A real HTTP server that speaks just enough S3 for an upload to complete — PUT, GET, HEAD,
 * DELETE — so a test can drive Payload's actual upload path, derivatives and storage plugin
 * included, with no MinIO and no network. CI runs with no `S3_*` at all.
 *
 * Shared by feature 007's quota tests. `tests/uploads/native-upload.test.ts` keeps its own private
 * copy, from which this one was taken; it is left as it is rather than refactored to import this,
 * because changing a passing test that is not this feature's is not this feature's to do.
 */
export class FakeBucket {
  readonly objects = new Map<string, Buffer>()
  /** Every PUT, in order — so a test can ask whether bytes arrived before or after a hook ran. */
  readonly puts: string[] = []
  /** When true, every PUT is answered 500 — the storage outage a rollback test needs. */
  recusarPuts = false
  private server?: Server

  constructor(readonly name: string) {}

  async listen(): Promise<string> {
    const server = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    this.server = server
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  async close(): Promise<void> {
    if (!this.server) return
    this.server.closeAllConnections()
    await new Promise<void>((resolve) => this.server?.close(() => resolve()))
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const key = decodeURIComponent(new URL(req.url ?? '/', 'http://bucket').pathname).replace(
      `/${this.name}/`,
      '',
    )
    if (req.method === 'PUT') {
      if (this.recusarPuts) {
        req.resume()
        res.writeHead(500, { 'Content-Type': 'application/xml' }).end('<Error><Code>InternalError</Code></Error>')
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      this.objects.set(key, Buffer.concat(chunks))
      this.puts.push(key)
      res.writeHead(200, { ETag: '"fake"' }).end()
      return
    }
    if (req.method === 'DELETE') {
      this.objects.delete(key)
      res.writeHead(204).end()
      return
    }
    const body = this.objects.get(key)
    if (!body) {
      res
        .writeHead(404, { 'Content-Type': 'application/xml' })
        .end('<Error><Code>NoSuchKey</Code></Error>')
      return
    }
    res
      .writeHead(200, { 'Content-Length': String(body.length) })
      .end(req.method === 'HEAD' ? undefined : body)
  }
}

/**
 * Boots a Payload instance whose S3 adapter writes into `bucket`, under its own instance `key` so
 * it shares nothing with any other file's instance. The env is set BEFORE the config is imported:
 * the adapter reads it at config build.
 */
export async function bootWithFakeBucket(bucket: FakeBucket, key: string): Promise<Payload> {
  const endpoint = await bucket.listen()
  process.env.S3_ENDPOINT = endpoint
  process.env.S3_BUCKET = bucket.name
  process.env.S3_ACCESS_KEY_ID = 'fake-key'
  process.env.S3_SECRET_ACCESS_KEY = 'fake-secret'
  process.env.S3_REGION = 'us-east-1'
  const [{ default: config }, { getPayload }] = await Promise.all([
    import('../../payload.config'),
    import('payload'),
  ])
  return getPayload({ config, key })
}

/**
 * A real PNG, large enough that every derivative width is a genuine downscale — so `sizes` is
 * populated with real files and real `filesize` values, which is the case CLR-006 is about.
 */
export async function pngDe(width = 1600, height = 900): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } },
  })
    .png()
    .toBuffer()
}
