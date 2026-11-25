# Waifu Wallpapers V8 — Public gallery + community

## Live website

**Production domain:** https://waifu-wallpapers.vercel.app/
- `/` — Wallpaper gallery (image-first catalog; previous/next arrows, random wallpaper, screen-orientation filters, related recommendations, and share links).
- `/ai.html` — Existing real on-device AI 2×/4× enhancer.
- `/community.html` — Community lounge, character polls, and a **locked** community-submission teaser.
- `/library.html` — Browser-local favorites, with no public upload.
- `/admin.html` — Owner Studio, direct URL only; **never add it back to public navigation**.

### Wallpaper browsing

- Previous / Next buttons, keyboard Left/Right arrows, and touch swipes.
- "More like this" thumbnails **below** the cinematic preview, ranked by series/category/tags. The new Worker offers a full-catalog recommendation endpoint.
- Desktop/phone portrait orientation selection, Surprise Me, topic discovery, plus shareable `?wallpaper=<id>` links.

### Community status

**Frontend is published. Backend V8 must be deployed with Wrangler.**
The community frontend will show temporarily unavailable/locked messages while the old Worker V7 is active.

Community wallpaper submissions **remain disabled**. There is deliberately no anonymous image-upload Worker endpoint.

**Global chat:** Text-only nicknames, no account required after owner enables. Defaults to **locked**. Each message: 2–240 characters; nicknames 2–24; no URLs, emails or phone numbers. Per-IP-hash limits: **one every 30 seconds**, 24 messages/hour. Public room refreshes every ~12 seconds while open. Everyone can report messages; only admin can hide/restore them. Messages are kept for at most 30 days in public listings. Use the admin toggle to shut off new messages instantly. This is basic protection; it does not replace a Turnstile CAPTCHA, abuse detection, or stronger user accounts as the site grows.

**Character polls:** Owner creates a question and 2–6 options, can close/reopen voting. Guests vote once per poll using hashed IP + user agent; different devices sharing the same connection may be affected. In production, accounts or Turnstile may improve fairness. Owner controls voting availability.

### Deployment of backend V8

The new D1 schema `cloudflare/migrations/0003_community.sql` was already applied to the connected account on 2026-11-25. It adds Community Settings, Chat Messages, Reports, Polls and Votes. Chat enabled flag is initially 0; voting enabled flag initially 1. All earlier D1 tables remain untouched.

On a computer with Wrangler already logged in:

```powershell
cd C:\Waifu-Wallpapers
git fetch origin
git switch v8-platform-community-viewer
cd cloudflare
npx wrangler deploy
```

Verify the deploy output lists **DB, IMAGES, AI**, and **ALLOWED_ORIGINS**. It should *not* include a public R2 bucket address. `ADMIN_TOKEN` is a Cloudflare secret and must remain present after the deploy. Wrangler configuration is now aligned to the production Vercel domain and has `preview_urls:false`.

Check https://waifu-wallpapers-api.waifu-wallpapers-vishal13.workers.dev/api/health and confirm `version: 8`. Check `/api/community/status` returns `chatEnabled: false` (until owner opens the room).

Go to `https://waifu-wallpapers.vercel.app/admin.html`, sign in with the existing admin key, and open **Community control** to publish character polls, moderate messages and, when ready, open chat. You do not need to re-create the admin secret.

### Follow-up checklist before broad public marketing

1. Test previous/next on desktop/mobile, original downloads and local AI 2×/4× enhancements, and returning to gallery.
2. Create one poll, vote from a guest device, verify one-vote limit and close/reopen controls.
3. Only enable chat for a trial with a few trusted visitors. Verify reporting/hide and rate limiting. Add Cloudflare Turnstile, dedicated anti-bot rules and clear behavior policy before larger public exposure.
4. Keep anonymous community image submissions locked until automated screening, reporting/takedowns, submission permissions, and moderation workflows are ready.
5. Add an artist-credit field, copyright complaint/contact form and backup/export procedure for R2 + D1.
6. Monitor Workers requests, D1 rows, R2 usage and AI inference charges.

### Project/source notes

Branch: `v8-platform-community-viewer`. The production deployment was a static file deployment; **it did not deploy the Cloudflare Worker**. The `community-hub.js` and `community-hub.css` source files are bundled inline into `community.html` for the production static deployment; `public.css` bundles viewer and discovery CSS.

The design is original; it draws high-level inspiration from wallpaper sites' multi-series browsing, search, tagged discovery and related content rather than reproducing their logos or page assets.
