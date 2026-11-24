# Waifu Wallpapers V5 — Anime Gallery + Owner Studio

## State

- **Design preview** on Vercel; original production AI upscaler not replaced.
- Cloudflare connection confirmed. D1 database `waifu-wallpapers-db` has been created and the V5 schema applied.
- **R2 is NOT enabled** in the Cloudflare account as of 2026-11-24, so real public uploads and public catalog images cannot operate yet.
- No admin password has been committed to GitHub or set in a Cloudflare Worker. Do not enable admin endpoints without a strong Cloudflare `ADMIN_TOKEN` secret (at least 32 random characters).
- The user must enable R2 themselves using Cloudflare Dashboard -> Storage & Databases -> R2 -> Overview and complete the R2 subscription checkout, after reviewing billing.
- This is prelaunch software. Mobile compatibility, real 15 MB uploads, moderation flow, and high-volume import need end-to-end testing.

## Routes

- `/` and `/library.html` — redesigned V5 anime-themed personal library. Local 500-file-at-a-time import (15 MB max per file), editable title, series, tags and description, local favorites, filters, original and individual AI enhancement.
- `/community.html` — future guest-safe public catalog. Search by title/series/category/tags, original and AI download and browser-local favorites. No public upload.
- `/admin.html` — owner-only management dashboard, initially locked pending R2 + admin secret; 500-file queue, upload drafts and publish/metadata controls. Authentication uses a server-side long secret in memory, not browser localStorage.
- `/ai.html` — unchanged real ONNX waifu2x AI studio, with direct 2×/4× enhancement and single-image downloads.
- **Mixed-quality bulk ZIP is intentionally disabled** per owner request.

## Categories and tags

Categories: Anime, OLED/Dark, Fantasy, Sci-Fi, Nature & Scenery, Aesthetic, Minimal, Abstract, Movies & TV, 3D Art, Other.

The series field is separate (e.g. `Demon Slayer`), and tags can be as specific as `shinobu, butterfly, bedroom, ocean, anime girl, moon, night, purple`.

Filename/folder-based metadata suggestions are **heuristics**, not genuine AI image classification. Future enhancement: vision model for image-content recognition with confidence scores and admin approval.

## Cloudflare deployment steps (once R2 is enabled)

1. Create private R2 bucket `waifu-wallpapers-images`; do **not** enable public bucket access.
2. Use the existing D1 database ID already in `cloudflare/wrangler.jsonc`.
3. Set `ALLOWED_ORIGINS` to exact approved Vercel domain(s), including any preview URL used during testing.
4. Deploy `cloudflare/src/worker.js` with bindings `DB` (D1) and `IMAGES` (R2).
5. Set a random, long `ADMIN_TOKEN` as a Cloudflare Worker secret in its secure environment, not in GitHub or JavaScript.
6. Add the public `https://...workers.dev` endpoint (no secrets) to `community-config.js`.
7. Verify public read endpoints, admin 401 rejection, draft upload, draft visibility restrictions, update, approve and public download, then test across laptop + phone.
8. Do not make public launch until browser integration, abuse defenses, moderation, copyright/takedown policy, and storage/billing limits are reviewed.

## Security model

- Public: GET approved images and metadata only.
- Owner: admin bearer secret required for upload, metadata edit, publication/unpublication. Admin key held in page memory only and transmitted over HTTPS.
- Every public image must be explicitly **approved**; unpublished records are not downloadable by guests.
- Local visitor favorites stored in localStorage; clearing site data removes them. Future optional accounts can sync favorites.
- A strong access-key gate is an initial owner-only MVP, **not a complete password + user management system**. For production, prefer Cloudflare Access or managed session-based authentication with auditing and rate limits.
- No credentials in repository or frontend code.
