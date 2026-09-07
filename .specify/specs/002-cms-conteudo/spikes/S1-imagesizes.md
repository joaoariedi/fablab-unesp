# Spike S1 — `imageSizes` with direct-to-bucket upload

<!-- Date: 2026-09-04 -->

**Why this ran.** `docs/tech-stack.md` § *Absorções do benchmark*, item 3, makes it a
prerequisite: *"Validar também o comportamento real de `imageSizes` com upload direto antes de
fixar a spec da feature 002."* The page specs require thumbnails on every card, so if automatic
resizing does not happen the content model needs a different answer before tasks are generated.

**Method.** Source evidence, not an end-to-end run — stated plainly so nobody reads this as
more than it is. Payload 3.88.0 is installed and was read directly;
`@payloadcms/storage-s3@3.88.0` and `@payloadcms/plugin-cloud-storage@3.88.0` were fetched with
`npm pack` into a scratch directory and read **without being added to the project**, since a
spike should not change the lockfile. What was *executed* is only the last finding.

## Answer: `imageSizes` produces nothing on the clientUploads path

`payload/dist/uploads/generateFileData.js` resolves `let file = req.file`, and with
`clientUploads: true` the browser PUTs straight to the bucket, so `req.file` is absent. Line 85:

```js
if (!file) {
  if (throwOnMissingFile) { throw new MissingFile(req.t) }
  return { data: incomingFileData, files: [] }        // ← returns here
}
await checkFileRestrictions({ collection, file, req })  // ← line 94, never reached
```

Everything downstream — `resizeOptions`, `imageSizes`, `formatOptions`, `withMetadata` — is
destructured above but only consumed after that return. The storage plugins never resize
either: `imageSizes` appears in `plugin-cloud-storage` only in `getFields.js` (declaring the
size fields on the document) and `getFilePrefix.js` (knowing which keys belong to sizes). No
`sharp` reference exists anywhere in either package.

**So the size fields would exist on the document and be permanently empty.**

## The finding that matters more than the one we went looking for

`checkFileRestrictions` sits **after** the early return. On the clientUploads path Payload's own
`mimeTypes` and `filesize` restrictions therefore **never execute**.

This directly undercuts an assumption in the spec: FR-011 and FR-012 declare per-field
allowlists and size caps as though putting them on the collection enforces them. On this path
they are decorative. CLR-003 already moved verification to a post-upload pass, which was the
right call for a different reason — but the plan must now say that the post-upload check is
**not defence in depth, it is the only defence**, and size must be enforced at the presign step
(a policy on the signed URL) rather than trusted afterwards.

## Measured, not read

`sharp` is **not wired into this app's Payload config** — `apps/web/payload.config.ts` passes no
`sharp` option, and `sharp` is not a declared dependency of `apps/web` (it is present at
`sharp@0.35.3` only transitively). Without it, `imageSizes` is a no-op **even for server-side
uploads**. So today the feature would produce nothing by either route.

## A mechanism does exist, and it is not general

`generateFileData` can fetch a remote object back: when `shouldReupload(uploadEdits, fileData)`
is true and the document carries `filename` and `url`, it calls `getExternalFile(...)` and
processes normally. But `shouldReupload` fires only on **admin image edits** — crop, explicit
width/height, or a changed focal point. It is not a hook a post-upload pass can lean on.

## Recommendation for the plan

1. **Do not rely on `imageSizes` with clientUploads.** Generate derivatives in the same
   post-upload pass that verifies the signature (CLR-003's flow): fetch, verify, resize with
   `sharp` explicitly, write the derivatives, then release from quarantine.
2. **Declare `sharp` in `apps/web` and pass it to `buildConfig`** — otherwise nothing resizes on
   any path. This is a dependency addition beyond `@payloadcms/storage-s3` and needs the same
   Principle 1 note.
3. **Enforce size at presign time**, not after upload. A 200 MB cap checked after the bytes are
   already in the bucket has paid the cost it was meant to prevent — and `tech-stack.md` names
   disk as failure number one.
4. **Record that collection-level `mimeTypes`/`filesize` do not run on this path**, so a later
   reader does not add them and believe the surface is covered.

## Residual risk

This is source analysis. It should be confirmed by execution during 002a, as an acceptance
criterion on the upload task: upload one image through the real presigned flow and assert the
size fields are populated and a disallowed type is refused. That is the difference between
knowing the code path and having watched it.
