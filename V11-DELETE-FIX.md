# V11 — Permanent deletion and ghost wallpaper cleanup

Production website: https://waifu-wallpapers.vercel.app/
Worker: https://waifu-wallpapers-api.waifu-wallpapers-vishal13.workers.dev
Source: `v11-permanent-delete-cache-fix`

## Why wallpapers became ghosts

V10 Owner Studio "Remove" called `POST /api/admin/wallpapers/:id` with `status:'removed'`. This only changed a D1 field; it did not delete the R2 original/thumbnail or database record. The public gallery excludes removed records, but the gallery kept browser-tab metadata in sessionStorage for up to six hours, while favorites were stored in localStorage. These client caches could still render artwork that was no longer published.

At investigation on 2026-11-27 both Akaza and Mahoraga were still D1 records marked `removed`, but their two original images and two thumbnails were already missing from R2 (GET returned 404 / 10007). Their remaining D1 records and associated wallpaper report were then deleted using exact IDs with `status='removed'` guards. Database was verified: zero wallpaper records remain; public catalog version is now 2. No other wallpaper IDs or media objects were touched.

## Permanent delete workflow (Admin)

1. Open `/admin.html`, sign in, then **Manage catalog**.
2. Click **Remove from catalog** to unpublish the artwork. This is a reversible hiding step and keeps the files in R2.
3. Choose **Removed** in the status filter.
4. Click **Delete permanently**, type `DELETE` and accept the final confirmation.
5. The Worker verifies admin bearer session, that the record is removed and both storage keys belong to its UUID.
6. It deletes both R2 objects, then performs an atomic D1 batch to delete the wallpaper's reports and catalog row and increment the public revision. An R2 failure leaves the D1 record hidden and retryable. If D1 fails after R2 succeeds, the record remains hidden and retry can finish.

Endpoint: `DELETE /api/admin/wallpapers/:id`, admin-authenticated only.
Cloudflare R2 supports `env.IMAGES.delete([key1,key2])`.
Admin secret remains a Worker secret, never included in public JavaScript.

## Preventing future ghosts

- D1 `catalog_state` (migration `0006_catalog_state.sql`) maintains a monotonically increasing public revision on upload, edit, publish/unpublish or permanent deletion.
- `GET /api/gallery/version` gives a cache-busting revision; `POST /api/gallery/validate` checks up to 120 wallpaper IDs against published records using one bounded SQL query.
- Home gallery compares the saved six-hour cache revision with the live revision before rendering. If it changed, stale/unpublished IDs are removed.
- Returning to a tab and BFCache restoration recheck the public revision and filter removed records.
- Favorites validate published IDs on opening; deleted/unpublished favorites are removed from this browser's local bookmark list. Artwork is never deleted simply by changing favorite state.
- No image analysis, scheduled job, or new Cloudflare AI charge was added; just small D1 checks.

## Verified live

- Production Vercel deployment READY and aliased to `waifu-wallpapers.vercel.app`.
- Cloudflare Worker uploaded successfully and `ADMIN_TOKEN` secret is still present.
- Live browser verification returned health version **11**, public revision **2**, gallery `items: []`, `POST /api/gallery/validate` status 200, active IDs `[]` for the two deleted wallpapers, and zero visible gallery ghost cards.
- HTML/JS ID bindings and Worker syntax checks passed.
- The owner-side actual permanent delete button's authenticated end-to-end click was not performed because the private admin key was not requested or used. Test on a noncritical temporary wallpaper if needed.

## Future updates from Windows

Do **not** redeploy an older Worker branch (doing so would replace the new deletion and cache endpoints).

```powershell
cd C:\Waifu-Wallpapers
git fetch origin
git switch v11-permanent-delete-cache-fix
git pull --ff-only
cd cloudflare
npx wrangler deploy
```

Already deployed; **no PowerShell deployment is needed for V11**. The migration was applied through Cloudflare API; applying migrations blindly can encounter already-applied D1 changes.

Owner should refresh any old open browser tab once to load the new client JavaScript. From then on, stored metadata will be checked on return/refocus. If the server is unavailable, UI may display a validation notice rather than trusting stale records.

Guest uploads and public chat remain locked.
