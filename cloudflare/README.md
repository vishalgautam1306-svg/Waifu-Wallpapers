# Cloudflare backend — Waifu Wallpapers

## Live resources (2026-11-24)

- Cloudflare Worker: `waifu-wallpapers-api`
- Worker URL: https://waifu-wallpapers-api.waifu-wallpapers-vishal13.workers.dev
- Private R2 Standard bucket: `waifu-wallpapers-images` (APAC).
- D1 database: `waifu-wallpapers-db`.
- Database tables and indices were created; no artworks have been uploaded.
- Secure Worker secret: `ADMIN_TOKEN` configured, **not** stored in this repository.
- Guest uploads disabled; only the owner can upload/edit/publish.

## Architecture

Browser -> HTTPS Worker API -> D1 metadata + R2 original/thumbnail.

Public queries are read-only and return only published `approved` wallpapers. The R2 bucket is private, including the R2.dev domain. Each admin upload first creates a private `draft`. Admin publication is a separate authenticated action.

The admin Studio lives on the Vercel static frontend at `/admin.html`, using a long secure key stored in the Cloudflare Worker secret binding. The page keeps this key only in its memory; it never commits it, saves it in localStorage, or sends it to a third-party AI provider.

**API routes**

| Method | Route | Who can call it |
|---|---|---|
| GET | `/api/health` | Everyone |
| GET | `/api/config` | Everyone |
| GET | `/api/gallery` with `q,category,series,tag,page,limit` | Everyone |
| GET | `/api/wallpapers/:id/thumb` | Everyone (approved only) |
| GET | `/api/wallpapers/:id/original` | Everyone (approved only) |
| GET | `/api/admin/check` | Admin bearer token |
| GET | `/api/admin/list?status=draft` | Admin bearer token |
| GET | `/api/admin/wallpapers/:id/thumb` | Admin bearer token |
| POST | `/api/admin/upload` | Admin bearer token |
| PATCH | `/api/admin/wallpapers/:id` | Admin bearer token |
| POST | `/api/admin/wallpapers/:id` | Admin bearer token (status) |

**File limits:** originals 15 MiB, thumbnails 500 KiB, PNG/JPEG/WebP only. Image dimension validation performed server-side.

## Local development

The repository already uses `wrangler.jsonc`, so continue using Wrangler:

```sh
cd cloudflare
npm install
npx wrangler login
npm run dev
```

The existing `wrangler.jsonc` uses the real D1 database ID and R2 bucket name; keep the correct values. Secrets are not stored in git. When using another local environment, use `npx wrangler secret put ADMIN_TOKEN` to set a new strong key in the target Worker.

To change the actual production Worker code, deploy from `cloudflare/src/worker.js` via Wrangler using your existing Cloudflare account or the connected Cloudflare tools. The Worker is currently already deployed.

## Important cautions

- Do **not** enable the R2 public development URL or a custom public domain for the private bucket.
- Do **not** publish user-uploaded artwork without validating image rights and quality.
- Do **not** allow guest upload/write operations with the same admin credential.
- Before large-scale use, add robust admin identity + sessions, rate limiting, operations logging, and a removal/takedown policy.
- The filename/category heuristics in the frontend do **not** use a vision model.
- Thousands of wallpapers can incur R2 costs. Monitor storage and request usage.
