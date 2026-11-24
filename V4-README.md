# Waifu Wallpapers V4 — Bulk Library Preview

A separate **preview** of an image-first wallpaper browser based on the organization patterns found on MotionBgs, MoeWalls, and HD wallpaper galleries. Do not merge until the user tests it on their laptop and Android Chrome.

## What works in the code

- **Import 100 files per batch** via file picker, desktop folder picker, or drag/drop.
- Save originals + small thumbnails in IndexedDB (browser-local, not shared across devices). Repeat with more batches **until the browser's storage quota is reached**.
- Duplicate warning based on **filename + file size**; this is not an exact content hash.
- Auto-suggest metadata from **filenames and parent folder names**: Demon Slayer, HSR, Genshin, Jujutsu Kaisen and several others.
- Detect approximate **OLED/dark** images by sampled pixel luminance; orientation and dominant color; generate editable titles, categories, descriptions, and tags.
- Search, category filter, series filter, orientation, and resolution sorting; detailed metadata editor.
- Multiple selection, per-item Original / AI 2× / AI 4× options, sequential waifu2x neural processing, and **one ZIP download** using zip.js.
- Export metadata CSV for backup or later cloud migration.
- Existing AI Lab stays available at \`index.html\`; V4 is \`library.html\`.

### Important limitations

- Automatic tags are **heuristic suggestions**, NOT a real vision model recognizing a character from image pixels. An unknown filename cannot reliably identify Kafka, Shinobu, etc. The owner should review AI-generated/heuristic labels.
- No live multi-user upload or shared cloud storage yet. User has not created a Cloudflare account; R2 + Worker + D1 are still pending.
- Storing thousands of original files in one browser is **not guaranteed**: quota and storage eviction vary by browser. Browser-local content disappears if site data is cleared.
- 100-file import maximum is **per batch**, not total. Each file must be <=10 MB. Images must decode successfully.
- AI ZIP queue supports up to 8 enhanced images on desktop or 2 on mobile, plus originals up to 100 per ZIP. 4× output dimension/memory safeguards intentionally block very large jobs.
- Keep the page active during neural processing. No background processing, no persistent AI task after closing page.
- The ZIP library and ONNX Runtime load from third-party CDNs. The waifu2x AI models are supplied using the same experimental Vercel rewrite as the existing working AI Lab.
- Big mixed-quality ZIP archives consume device RAM. Do not attempt thousands of AI images in a single browser session.
- Downloading a ZIP via a blob URL works best in Chrome; some in-app browsers can block this.
- Untested in physical Chrome/Android hardware as of this commit. User needs to test.

## Test

1. Open **library.html** from the Vercel preview in Chrome on a laptop.
2. Import 5–10 wallpapers using **Import wallpapers**, review smart drafts, and save. Check categories and the image grid.
3. Search filenames/franchises and filter OLED / portrait / landscape.
4. Select 3 wallpapers, choose Original / 2× / 4× individually in **Batch download**, and start ZIP.
5. Open ZIP: verify each output exists with the correct resolution and that no second image selection was required.
6. Test 50–100 image imports, CSV export, browser refresh persistence, and mobile import/ZIP separately.
7. Do not use on sensitive/irreplaceable originals until Chrome testing is complete.

## Design inspiration (not copied)

- MotionBgs and MoeWalls: prominent search, anime/game series categories, content-first discovery.
- HD Wallpapers / HDQWalls: size and device-orientation filters, catalog navigation.
- New V4 visual language: editorial near-black, muted rose accents, dense artwork grid and practical bulk-actions.

All third-party model and engine license notices still apply, see LICENSE-UPSTREAM.txt.
