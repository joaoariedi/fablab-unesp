/**
 * Upload caps and format allowlists, as named constants (FR-011, FR-012).
 *
 * **The numbers are `docs/tech-stack.md` § Storage's and the extensions are FR-011's** — this
 * module is where they are written once, not where they are decided. `tests/uploads/
 * limits.test.ts` parses both documents and fails when this file and they disagree, so
 * raising a cap is a documentation change first and a code change second. Anything that needs
 * a limit imports it from here; a number retyped at a field is how two limits drift apart
 * (FR-012 exists because that had already started happening in the page specs).
 *
 * **This is the only defence, not one layer of two.** Spike S1 measured that with
 * `clientUploads` Payload returns from `generateFileData` before `checkFileRestrictions`, so
 * the collection-level `mimeTypes` and `filesize` options never execute on our upload path.
 * A reader who sees these constants used only at presign (T016) and post-upload verification
 * (T018) is looking at the whole enforcement surface — there is no field-level net underneath.
 */

/**
 * The three declared upload groups. A group — not a file extension — is what a field
 * declares, because `.svg` is legitimately both an image and a document (FR-011), so
 * extension → group is not a function and cannot be inverted.
 */
export const MEDIA_GROUPS = ['image', 'model3d', 'document'] as const

export type MediaGroup = (typeof MEDIA_GROUPS)[number]

/**
 * Binary megabyte. Caddy's `client_max_body_size`, MinIO and S3 all count megabytes this way;
 * using 1_000_000 here would leave the presigned policy and the proxy limit 5% apart, and the
 * resulting failure — a file that passes signature checking and is refused by the proxy — is
 * the least debuggable of the two.
 */
const MEGABYTE = 1024 * 1024

/**
 * Maximum object size per group, in bytes — `tech-stack.md` § Storage: images 10 MB, 3D
 * meshes 100 MB, documents/archives 200 MB.
 *
 * Enforced **at presign** (T016), never only after the bytes land: a 200 MB cap checked once
 * the object is already in the bucket has paid the disk cost it existed to prevent, and
 * `tech-stack.md` names disk exhaustion as failure number one.
 */
export const UPLOAD_CAP_BYTES: Readonly<Record<MediaGroup, number>> = Object.freeze({
  image: 10 * MEGABYTE,
  model3d: 100 * MEGABYTE,
  document: 200 * MEGABYTE,
})

/**
 * The largest cap of any group — the **ceiling** the whole upload surface is bounded by.
 *
 * Derived, never retyped: it must move when a group's cap moves, or it becomes a second,
 * quieter limit that disagrees with the first.
 *
 * This exists because `@payloadcms/storage-s3`'s presign handler reads exactly one number,
 * `payload.config.upload.limits.fileSize`, and it is **global** — measured in
 * `generateSignedURL.js`, which caps and adds `content-length` to the signed headers only when
 * that value is set, and otherwise signs `ContentLength: undefined`. With it unset, any
 * signed-in user could obtain a signed URL for a PUT of any size at all.
 *
 * So this is a ceiling, not the policy: it stops the unbounded case. The **per-group** cap
 * (`UPLOAD_CAP_BYTES`) cannot be expressed through the plugin at all, and enforcing it at
 * presign requires an endpoint of our own that calls `presignUpload`. Until that exists, an
 * image field is bounded at the document cap rather than at 10 MB.
 */
export const MAX_UPLOAD_CAP_BYTES: number = Math.max(...Object.values(UPLOAD_CAP_BYTES))

/**
 * The accepted extensions per group, exactly as FR-011 enumerates them — no "and similar
 * formats" (checklist CHK032). Stored lowercase and dot-led so a caller compares one shape.
 *
 * Frozen, and deeply: these tables are read on the presign and verification paths, and an
 * array a caller can `push` onto is an allowlist any imported module could widen at runtime,
 * from anywhere in the app.
 */
export const ALLOWED_EXTENSIONS: Readonly<Record<MediaGroup, readonly string[]>> = Object.freeze({
  image: Object.freeze(['.jpg', '.jpeg', '.png', '.webp', '.svg']),
  model3d: Object.freeze(['.stl', '.3mf', '.obj', '.gltf', '.glb']),
  document: Object.freeze(['.pdf', '.zip', '.svg', '.dxf']),
})
