# V12 — 1,000-image bulk and folder uploads

**Live site:** https://waifu-wallpapers.vercel.app/
**Private Owner Studio:** https://waifu-wallpapers.vercel.app/admin.html
**Worker version:** 12
**Source branch:** `v12-thousand-bulk-upload`

## What changed

- Bulk selection cap increased from 500 to **1,000 accepted images in the current browser queue**, total across file picker, **Choose a folder** (recursive via `webkitdirectory`), nested folders and drag-and-drop.
- One image still has a strict maximum of **15 MB**, and only PNG, JPEG and WebP are accepted. The Cloudflare Worker continues validating image signature and dimensions.
- The queue displays **25 editable preview cards per page** (40 pages for a full 1,000 image batch), generating temporary object URLs **only for the visible page**. Old preview URLs are revoked when changing pages.
- Multiple selections can be combined until 1,000 are queued. Re-choosing an identical file with the same relative folder path, size and modification time does not add it twice. Two different subfolders can contain distinct files with the same filename.
- Chrome/Edge folder drag-and-drop walks nested directory entries. Very large dropped directory scans cap at 3,000 file entries to prevent a browser freeze; use Choose a folder or smaller batches when appropriate.
- Pre-upload metadata (category, filename-derived series suggestions, description, credit and searchable tags) remains editable. Tags can still be applied across the whole queue. **No Workers AI is invoked automatically.**
- Files upload sequentially as **private drafts**. Progress reports attempted/total, uploaded, failed and remaining. Stop is safe after the current file.
- If an upload fails, that File object remains queued with an error; successful items are immediately excluded from subsequent retries. Click Upload drafts securely again to retry and continue; selecting the folder again is not needed while the tab stays open.
- A UUID `upload_request_id` is sent with each queue item. D1 stores it uniquely; retries after a lost HTTP response return the already-created wallpaper instead of creating a duplicate. Migration: `cloudflare/migrations/0007_upload_request_id.sql` (applied to production).
- The Worker renews actively used admin sessions during a long import so the original 30-minute idle expiry does not interrupt a continuous bulk upload. Idle/closed sessions still expire as before; no key is saved in localStorage.
- Browser prompts before leaving **while an upload is running**, but browser crashes/reloads still lose File references. Uploaded drafts remain on Cloudflare; on a tab crash, reselect the unuploaded files and check Manage catalog. The resume/retry queue is in-memory, not a persistent scheduled job.

## How to use it

1. Open **Owner Studio → Add wallpapers** on laptop/PC and sign in with your existing admin key.
2. Use **Choose a folder**, choose many files, or drop a directory onto the dropzone. Nested folder paths appear in the preview cards.
3. Browse the preview pages, edit metadata, or apply bulk tags/presets. No upload occurs merely from selecting files.
4. Click **Upload drafts securely**. Leave this tab open and the computer awake during the batch.
5. If some fail, click the same upload button again to retry only the remaining files. If you stop, resume later while the tab stays open.
6. Use **Manage catalog** to review/publish private drafts. Public guest upload remains disabled.

## Costs and limitations

- A batch of 1,000 images **at 15 MB each could store about 15 GB** of originals, in addition to smaller thumbnails. Storage, operations and worker/database usage can incur charges depending on Cloudflare plan/allowances; this release does not promise zero cost.
- No background uploading while the tab is closed; on some phones and mobile browsers, folder selection, large-file processing or background tab reliability can be limited. Prefer a laptop for 1,000-image batches.
- This protects against duplicates **during retry of the same selected queue item**; it does not detect visually identical wallpapers already in the entire website catalog.
- AI suggestion controls remain manual and may be billable if clicked; they are not enabled during the bulk upload process.

## Verification

- HTML/JS matching element IDs and syntax checks passed.
- Browser preview loaded 1,000 simulated file objects from nested paths, rendering exactly 25 cards on each of 40 pages and preserving paths.
- Simulated 60 sequential uploads with one artificial HTTP failure: 59 successes were removed from queue, one failed item stayed in queue, and retry sent the same upload UUID; final queue empty.
- Browser preview tested nested folder drag/drop and duplicate avoidance.
- D1 migration was applied successfully, Cloudflare Worker updated, and production Vercel deployment reached READY with clean domain alias.
- Real upload of 1,000 user-supplied wallpapers was **not** performed (requires the user's private key and local files).

## Future deployments

From Windows if needed:

```powershell
cd C:\Waifu-Wallpapers
git fetch origin
git switch v12-thousand-bulk-upload
git pull --ff-only
cd cloudflare
npx wrangler deploy
```

**Already deployed**: no PowerShell deployment is required now.
