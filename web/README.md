# Harbor-Index audit viewer (Next.js)

## Dev server

```bash
npm run dev
```

`predev` clears `.next`, syncs JSON data, then starts Next. This avoids webpack errors like `Cannot find module './991.js'` (stale chunk cache after `sync-data` or hot reload).

- **`npm run dev:fast`** — skip the automatic clean/sync hooks; use only if you did not change data and see no chunk errors.
- **`npm run clean`** — remove `.next` manually, then restart `npm run dev`.
- If you run **`node scripts/sync-data.mjs`** while the dev server is running, **restart** `npm run dev` afterward.

## Build

```bash
npm run build
```

Production deploy uses Next.js server mode (API routes under `app/api/`). Static trial artifacts remain in `public/annotate/`.

### Annotation cloud save (optional)

Set in Vercel project env (and `web/.env.local` for dev):

| Variable | Purpose |
|---|---|
| `ANNOTATION_API_TOKEN` | Shared secret for `/api/annotate` |
| `NEXT_PUBLIC_ANNOTATION_API_TOKEN` | Same token baked into client (internal studies) |
| `BLOB_READ_WRITE_TOKEN` | Auto-set when you add a Vercel Blob store |

Without Blob token, dev writes to `web/.data/annotations/`. On Vercel, add a Blob store from the Storage tab.
