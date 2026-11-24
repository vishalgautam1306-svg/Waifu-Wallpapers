# Waifu Wallpapers — Phase 3 Cloudflare backend

This is **pre-deployment source code**, not an active public gallery yet. The working AI upscaler remains on Vercel. The cloud backend runs separately as a Cloudflare Worker and stores **only original images + small thumbnails** in private R2. The D1 database stores metadata, review state, and salted IP hashes for rate limits.

## Architecture

- **Vercel** serves gallery HTML/JS and the existing ONNX browser-based 2× / direct-4× waifu2x AI engine.
- **Cloudflare Worker** implements a public gallery API and secured submission queue.
- **Cloudflare R2** stores original images and thumbnails. The bucket is **private**.
- **Cloudflare D1** stores titles, category, image sizes, R2 keys, and moderation status.
- **Cloudflare Turnstile** protects anonymous submissions; the Worker verifies tokens server-side.
- **Admin review** is mandatory. Pending images cannot be fetched by the public API. Rejected files are deleted.
- Public uploads **fail closed** if Turnstile or hash salt is missing. Admin endpoints require a secret bearer token.
- AI results are **never sent to R2**. The browser fetches the original, processes it, and downloads only the final image.

## Before running (account owner steps)

You need a Cloudflare account with Workers, D1, R2 and Turnstile enabled. These are separate from the GitHub and Vercel connections. **Do not paste API tokens or secret keys into ChatGPT or commit them to GitHub.**

1. From a terminal with Node.js, change directory to **cloudflare/** and run \`npm install\`, then \`npx wrangler login\` to authorize Cloudflare in your browser.
2. Create the resources:
   - \`npx wrangler r2 bucket create waifu-wallpapers-images\`
   - \`npx wrangler d1 create waifu-wallpapers-db\`
3. Copy the resulting D1 **database ID** into \`cloudflare/wrangler.jsonc\`, replacing \`REPLACE_WITH_REAL_D1_DATABASE_ID\`.
4. Create a Cloudflare Turnstile widget for **waifu-wallpapers.vercel.app** (and any other deployment hostname you actually use). Copy the public **site key** into \`wrangler.jsonc\`'s \`TURNSTILE_SITE_KEY\`. Set \`ALLOWED_ORIGINS\` to your actual frontend origin(s), comma-separated.
5. Add three Worker secrets interactively. Generate strong random values for the last two, and keep them private:
   - \`npx wrangler secret put TURNSTILE_SECRET_KEY\`
   - \`npx wrangler secret put ADMIN_TOKEN\`
   - \`npx wrangler secret put IP_HASH_SALT\`
6. Create the database schema with \`npx wrangler d1 migrations apply waifu-wallpapers-db --remote\`.
7. Deploy the Worker with \`npx wrangler deploy\`. Note its exact \`https://....workers.dev\` URL.
8. Set \`window.WAIFU_COMMUNITY_API = "https://YOUR-WORKER-URL.workers.dev";\` in the **root** \`community-config.js\`. That URL is not secret.
9. Deploy the updated frontend to Vercel. Visit \`community.html\` and check the Worker /api/health route.

**Do not deploy the current R2 code as a public upload service before verifying moderation and rate limits.** Start by submitting one of your own original artworks, review it, and approve it.

## API routes

| Method | URL | Purpose |
|---|---|---|
| GET | /api/health | Public health |
| GET | /api/config | Public Turnstile site key and upload enabled status |
| GET | /api/gallery?limit=12&cursor=... | Approved wallpapers, paginated |
| GET/HEAD | /api/wallpapers/:id/thumb | Approved thumbnail |
| GET/HEAD | /api/wallpapers/:id/original | Approved original |
| POST | /api/submissions | Upload original + thumbnail + verified Turnstile token. Returns 202 pending |
| GET | /api/admin/pending | Pending wallpaper metadata; admin only |
| GET | /api/admin/wallpapers/:id/thumb | Pending thumbnail for review; admin only |
| POST | /api/admin/wallpapers/:id/decision | JSON action: approve, reject or remove; admin only |

## Admin review (first MVP)

Admin review currently uses the API; a private visual moderation dashboard can be built next. With an admin token set **only in your local terminal**, send:

\`\`\`bash
# Set these shell variables locally. Don't commit them.
export WORKER_URL="https://YOUR-WORKER-URL.workers.dev"
# export ADMIN_TOKEN='...' # paste it only in your own terminal
curl -H "Authorization: Bearer $ADMIN_TOKEN" "$WORKER_URL/api/admin/pending"

# Preview a candidate using its ID (private; admin-only):
curl -L -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$WORKER_URL/api/admin/wallpapers/IMAGE_UUID/thumb" -o candidate.webp

# Approve, reject, or remove with the same endpoint:
curl -X POST "$WORKER_URL/api/admin/wallpapers/IMAGE_UUID/decision" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"action":"approve"}'
\`\`\`

The response shows the published gallery item after approval. **Please review each image before approving**: this first version does not include automated copyright, nudity, or illegal-content checks, nor a report/takedown interface. Do not launch unrestricted anonymous uploads until moderation is operational.

## File structure

\`\`\`text
community.html          — public gallery UI
community.css           — visual styles
community.js            — paging, submissions, downloads, gallery-to-AI handoff
community-config.js     — publicly visible Worker URL only, no credentials
cloudflare/
  package.json
  wrangler.jsonc        — Worker/D1/R2 bindings, public site key and origins
  migrations/0001_init.sql
  schema.sql
  src/worker.js         — gallery, submissions, moderation API
\`\`\`

## Status

- Cloudflare backend code staged on a feature branch.
- No live Cloudflare Worker, R2 bucket or D1 instance has been created by this chat.
- The existing original gallery and working 2×/4× AI Lab on Vercel have not been overwritten.
- The community page is not functional until the Worker URL, D1 database, R2 bucket and Turnstile settings exist.
- Browser-to-backend interactions require end-to-end tests before a public launch.

## Cost controls

- Store original files (max 10 MB) and compressed thumbnails (max 350 KB), **not 2×/4× results**.
- Anonymous submissions are limited to 5/day per salted IP hash plus Turnstile challenges; stronger WAF and abuse protection may be needed.
- R2 has an ongoing Standard storage free tier but R2 read/write operations, Worker requests and D1 operations still have usage-based limits. See official Cloudflare pricing before enabling payment methods.
