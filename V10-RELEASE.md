# V10 — Dedicated wallpaper pages, persistent browsing and reusable tags

**Production website:** https://waifu-wallpapers.vercel.app/
**Private Owner Studio:** https://waifu-wallpapers.vercel.app/admin.html
**Cloudflare Worker:** https://waifu-wallpapers-api.waifu-wallpapers-vishal13.workers.dev
**GitHub source branch:** `v10-fullpage-wallpapers`.

## Navigation and browsing

- Wallpaper cards are normal same-tab links to `/wallpaper.html?id=<UUID>`, not popup dialogs.
- Each wallpaper has a refresh-safe detail URL, a large original image, metadata, editable creator credit, original download, on-device 2×/4× AI buttons, browser favorites, tags, reports, related wallpaper tiles, and previous/next links from the Worker.
- Browser Back returns the previous gallery URL. Public gallery filters (search/category/tag/orientation) are encoded in its URL. Gallery scroll is saved per-tab; catalog metadata is cached in sessionStorage for up to six hours so deeply scrolled galleries can restore quickly. Reloading a dedicated artwork page keeps its ID.
- Older `/index.html?wallpaper=<UUID>` links redirect to the new page.
- The main header now gives clear links to Wallpapers, Categories, AI Studio, Community, Favorites. Owner Studio is never linked publicly.
- Reset filters is available in the public gallery.
- The favorites page explains that **wallpaper files are hosted in Cloudflare R2**, while **the guest's favorite bookmarks remain in that browser** until future account syncing.

## Dialogs and confirmation

- The public gallery and favorites pages contain **no popup dialogs**.
- The dedicated wallpaper page has exactly **one** dialog, the private visitor issue report form. Close with Escape, X, or clicking the backdrop outside the dialog. On a successful report, the dialog closes and a confirmation toast appears.
- The private Owner Studio has its existing edit dialog; backdrop clicks and Escape can dismiss it.
- Copy link shows an on-page confirmation toast on success.
- Browser refresh does **not** preserve a currently running 2×/4× inference, or an admin sign-in session stored only in memory. The admin key and session are deliberately never persisted in browser storage.

## Creator credit and AI assisted images

- D1 `wallpapers.credit` stores an editable credit. New owner uploads default to `Waifu Wallpapers · AI-assisted artwork`. Existing records display that wording until an owner edits their credit.
- On pages for recognizable third-party series, an **unofficial fan artwork** note appears. This is a disclosure, not a permission claim.
- Creator credit can be edited in Owner Studio → Manage Catalog → Edit details. No new image processing is required to change metadata.

## Reusable tags (without paid AI)

- Owner Studio → Add Wallpapers includes a **Reusable tags & suggestions** panel.
- Suggestions combine popular tags already saved in D1 with a small set of useful defaults. They do not call Workers AI.
- Click a queued image's Tags field, then tap a suggested chip; the tag is appended without duplicates.
- Use **Add to queue** to append comma-separated tags to all queued wallpapers.
- Save a field's tags as a named preset. Tag presets are stored locally in the owner's browser (`localStorage`), not in Cloudflare; the existing catalog tags and counts come from D1.
- The metadata editor has the same clickable suggestions and saved presets.
- Optional image AI tagging remains a **separate manually invoked** feature and may incur Cloudflare AI usage charges; do not enable it for a mass import without checking usage.

## Deployment state, 2026-11-26

- Cloudflare D1 credit migration executed and verified; latest Worker source deployed with `/api/health` version **10**.
- Existing R2 bucket, D1 binding, AI binding, and `ADMIN_TOKEN` secret preserved.
- Vercel production deployment READY on clean domain.
- Source code syntax and HTML input references verified. Automated browser tests confirmed full Akaza page, artwork preview, credit, previous/next, one related wallpaper, public gallery search filters restored, and report dialog backdrop closing. End-to-end **report submission, authenticated tag preset edit/upload, and mobile touch interactions** should be manually tested by owner.
- No Cloudflare chat or user-upload feature was unlocked, and no new AI scans or jobs were scheduled.

## Future Wrangler deployments

The production Worker code has been deployed, so no PowerShell action is needed for V10. If deploying again from the owner's Windows PC, first switch to the latest branch to avoid overwriting new endpoints:

```powershell
cd C:\Waifu-Wallpapers
git fetch origin
git switch v10-fullpage-wallpapers
git pull --ff-only
cd cloudflare
npx wrangler deploy
```

**Important:** The D1 credit-column migration was already applied directly to the live database. Do not rerun the migration manually against production; duplicate-column errors can occur if Wrangler migration records do not reflect direct D1 changes. Do not share `ADMIN_TOKEN` or store it in GitHub.

Community text chat and public wallpaper submissions remain locked unless the owner explicitly opens them.
