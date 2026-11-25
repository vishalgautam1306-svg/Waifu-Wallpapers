# Waifu Wallpapers V9 — Owner catalog and report workflow

**Live site:** https://waifu-wallpapers.vercel.app/
**Private owner URL:** https://waifu-wallpapers.vercel.app/admin.html
**Cloudflare API:** https://waifu-wallpapers-api.waifu-wallpapers-vishal13.workers.dev
**Live Worker health version:** `9`
**Source branch:** `v9-catalog-search-reports`

## How to locate the 1,000th wallpaper without scrolling

1. Open the wallpaper on the public site.
2. Click **Copy link** in the viewer. The link contains the wallpaper's exact UUID in `?wallpaper=<id>`.
3. Open `/admin.html` privately, sign in, select **Manage catalog**.
4. Paste that public wallpaper link into **Find any wallpaper** and click **Find wallpaper**.
5. The exact artwork editor opens. Change the title, series, category, description or tags; choose **Save metadata**.
6. The existing public image remains unchanged; catalog metadata is updated in D1.

Alternatively search title, series, tag or category. **Every published, draft and removed record can be searched**, with 30 records shown per page. Previous/Next navigate results. Owner Studio remains absent from public navigation and is protected by its short-lived session.

## Guest reports

1. Guest opens a wallpaper, chooses **Report incorrect details or an issue**.
2. Guest selects a reason: wrong title/series, wrong category/tags, broken image/download, copyright concern, other.
3. Guest may write a brief note, without personal information.
4. The report is saved to D1 privately, not published on the wallpaper.
5. In Owner Studio → **Wallpaper reports**, the owner sees the report and chooses **Open exact wallpaper** to edit the corresponding record, then marks it **Resolved** or **Dismissed**.

Each client connection is capped at **five reports per 24 hours**, and repeated reports for the same wallpaper are deduplicated. No chat or community wallpaper uploads are enabled by this reporting feature. The report system is low-compute, using D1 SQL only; it does not run Workers AI. Cloudflare D1/R2 requests may still incur usage charges beyond plan allowances.

## Creator credits and rights

For original work, an optional credit in the description can say **"Created by Waifu Wallpapers · AI-assisted artwork."** For fan-inspired artwork, use **"Unofficial fan artwork — [series]."** These are attribution descriptions, not proof of rights. Do not credit a third-party artist unless they created the content and you have appropriate permissions. Creating new images with a generative model does not automatically authorize distribution of someone else's protected character design or artwork. Consider a copyright complaint contact channel before broad marketing.

Separate dedicated wallpaper detail pages and structured artist-credit metadata are **future enhancements**. V9 uses `?wallpaper=<id>` permalinks now, and does not require a redesigned page for editing.

## Current release state

- V9 Cloudflare Worker deployed and confirmed alive with `/api/health` → `{"ok":true,"version":9}`.
- V9 static website deployed to `waifu-wallpapers.vercel.app`, Vercel READY.
- D1 `wallpaper_reports` migration applied. R2 bucket and `ADMIN_TOKEN` secret preserved.
- JavaScript syntax checked, UI ID references checked. Homepage browser test confirmed report button/dialog visible and no public Owner Studio link.
- Real guest report submission and authenticated owner editing require manual end-to-end testing from a visitor browser and the owner's session; avoid claiming those are tested until confirmed.
- No new AI calls, scheduled jobs, or background monitoring created.
- Global chat stays locked; public community wallpaper uploads stay locked.

## Important future-deploy note

If deploying from Windows using Wrangler, first switch to **this branch**; deploying an older branch could overwrite new API routes.

```powershell
cd C:\Waifu-Wallpapers
git fetch origin
git switch v9-catalog-search-reports
git pull --ff-only
cd cloudflare
npx wrangler deploy
```

You do **not** need to run these commands for this release: the live Worker and frontend are already deployed. Do not share your `ADMIN_TOKEN` with anyone.
