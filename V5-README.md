# Waifu Wallpapers — Cloudflare live preview (2026-11-24)

## Deployment status

- Public website preview: https://waifu-wallpapers-p3xzc0lqd-myself-adc5.vercel.app/
- Live API: https://waifu-wallpapers-api.waifu-wallpapers-vishal13.workers.dev
- Cloudflare R2 private Standard bucket: `waifu-wallpapers-images` (Asia-Pacific); **R2 public development URL disabled; no custom public bucket domain**.
- D1 database: `waifu-wallpapers-db`, bound to Worker.
- Worker module: `cloudflare/src/worker.js` deployed with R2 and D1 bindings; `/api/health` and empty `/api/gallery` confirmed via Cloudflare Browser Rendering.
- Long random `ADMIN_TOKEN` secret installed **only** in Cloudflare Workers. **Never commit or put this secret in frontend configuration**. Rotate it from Cloudflare dashboard if compromised.
- GitHub branch: `v5-admin-gallery`. Production Vercel domain not overwritten. Direct previews still need hands-on mobile and upload tests.

## Pages

- `/` — **public** anime wallpaper gallery, 25 categories, filter/search by title/description/series/tag, responsive art thumbnails, guest-local favorites, original and AI 2×/4× download actions.
- `/admin.html` — **private owner studio**. Login with the Worker admin key, import 500 files at a time, edit per-image metadata and send drafts securely to R2, then approve/publish.
- `/library.html` — optional **browser-only private collection** and bulk-import prototype, maximum 500 images per batch, 15 MB/image (subject to browser quota).
- `/ai.html` — existing working local ONNX/waifu2x 2× and 4× engine, unmodified.
- Public bulk ZIP download is disabled by owner request.

## Categories (25)

Anime, Manga & comics, Games, OLED/Dark, Fantasy, Sci-Fi, Cyberpunk, Space & cosmos, Nature & scenery, Cities & skylines, Aesthetic, Minimal, Abstract, Movies & TV, 3D art, Cars & vehicles, Animals, Architecture, Photography, Digital art, Horror, Cute/Kawaii, Seasonal, Sports, Other.

Series and tags are separate: `category=anime`, `series=Demon Slayer`, `tags=shinobu,butterfly,night,purple,portrait`.
Basic auto-suggestions use filenames/folders, **not AI image recognition**. All metadata can be manually reviewed.

## Owner workflow

1. Open the **Admin Studio** at the preview URL. Paste the private admin access key.
2. Choose or drop up to 500 files (PNG/JPG/WebP; each <=15 MB). Review and update suggested title, series, description, category, tags for every image.
3. Select **Upload drafts securely**. Each image and a compressed thumbnail go to private R2; metadata goes into D1 as `draft`.
4. Select **Manage catalog**, choose Drafts, then **Publish** approved works individually.
5. Only records marked `approved` appear in public `/api/gallery`; all others return 404 to guest image requests.
6. Visitors can download originals or use the AI studio and save favorites locally. No guest account or password needed.

## Security and billing

- Admin uploads and edits require Cloudflare `ADMIN_TOKEN` (>=32 characters), supplied via HTTPS, held only in browser memory by admin studio.
- Private R2 bucket has no public R2 domain; uploads are streamed through the Worker and only approved images can be fetched publicly.
- This is **a first-generation access-key gate**, not full role-based authentication. Before large-scale public launch, replace with Cloudflare Access or passwordless admin login with audited sessions, improve content moderation, copyrights/takedowns, rate limiting and monitoring.
- Cloudflare R2 has free usage allowances, but **thousands of wallpaper originals can exceed them and incur monthly storage/operation charges**. Check real usage and pricing. 500×15 MB is a batch limit, not a promise about available storage.
- Production site remains unchanged pending real browser upload, publish, search, and mobile tests.
- Do not publish or redistribute artwork without appropriate permissions.

## Test limitations

Cloudflare Browser Rendering returned HTTP 200 for the Worker health endpoint and empty gallery. Vercel deployment is READY. **Actual authenticated upload / publish and device-to-device browsing still need end-to-end testing.** No example wallpapers were uploaded without the owner's artwork.
