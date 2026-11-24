# Waifu Wallpapers V7 — Owner security and real AI tagging

## Status (2026-11-24)

- **Public Owner Studio links hidden** in the V7 frontend and in the separately deployed, safe public-only preview.
- **Security and AI backend source implemented on this branch, but NOT deployed to the live Cloudflare Worker yet.** The Cloudflare connector blocked the upload action. Do not claim that expiring sessions or AI tagging are active on the production Worker.
- The V7 frontend design preview is at `https://waifu-wallpapers-67gir1jv0-myself-adc5.vercel.app`. Its new admin login requires the V7 Worker and will fail against the older Worker until deployed.
- The safe, working guest-interface preview with hidden admin links and **the existing working admin login** is `https://waifu-wallpapers-bvpvm5pdv-myself-adc5.vercel.app`.
- The current production Vercel domain has not been overwritten.

## Security changes in source

- No Owner Studio navigation links on public pages; the private path `/admin.html` still exists (hiding a link is not an authentication defense).
- Admin key exchanged over HTTPS using `POST /api/admin/login` for a **30-minute session token**. The admin key and session are held in memory only, not stored in site JavaScript, cookies or localStorage.
- Sessions are stored as SHA-256 token hashes in D1, scoped to IP and user agent, and revoked at `POST /api/admin/logout`.
- **6 failed logins** within 15 minutes lock the submitting IP for 15 minutes.
- D1 records security events for login, upload, metadata edit, publication and AI scan; no keys or raw IPs are stored there.
- Public read APIs do not require an account; write APIs still require valid admin session.
- The existing `ADMIN_TOKEN` remains a **Cloudflare Worker Secret**, not exposed in the frontend.
- `cloudflare/migrations/0002_admin_security.sql` has been created and executed on the existing D1 database.

## Genuine image-based AI metadata suggestions

The private Owner Studio now has two explicit actions:
- **Analyze next 10 with AI**: processes up to 10 selected, unsent wallpaper thumbnails. Each result suggests title, description, series, category and comma-separated searchable tags. The admin must **review** and still choose **Upload drafts**.
- **Suggest with image AI**: analyzes an existing R2-stored thumbnail in the metadata editor. Nothing changes until the admin clicks **Save metadata**.

The Worker code uses Cloudflare Workers AI's **Moondream 3.1** model (`@cf/moondream/moondream3.1-9B-A2B`) with an `AI` binding. The input is a small preview thumbnail, not the full-resolution original. The output is validated, restricted to known categories and filtered into editable draft suggestions. The model may misidentify franchises and characters, so no automatic publication is allowed.

**Cost and availability:** Workers AI has a daily free allocation, but may charge above that on paid plans. The Worker enforces a conservative **20 AI scans per UTC day** and scans run **only after an admin click and confirmation**. The model provider returned HTTP 500 in two direct connectivity checks on 2026-11-24. So **AI inference has not yet been proven end-to-end**; test with one wallpaper before attempting larger batches.

## How the account owner can deploy this Worker when the connected Cloudflare upload is blocked

The project already uses Wrangler (`cloudflare/wrangler.jsonc`); keep using that existing configuration.

1. Open the V7 branch in GitHub: `https://github.com/vishalgautam1306-svg/Waifu-Wallpapers/tree/v7-admin-security-ai-tags`.
2. Clone/download the repo on the owner's computer, open a terminal in the `cloudflare` folder.
3. Run `npm install` and `npx wrangler login` (approve the login on Cloudflare).
4. Run `npx wrangler d1 migrations apply waifu-wallpapers-db --remote` if Wrangler reports unapplied migrations. The migrations are idempotent. The D1 tables have already been created through the API.
5. Run `npx wrangler deploy`. **Verify the deployed Worker still has the existing ADMIN_TOKEN Secret** and R2/D1/AI bindings in Cloudflare Dashboard. Do not retype any private key in GitHub.
6. Visit the V7 frontend `/admin.html` and sign in with the existing admin key. The Worker now exchanges it for a short-lived session. Previous versions' admin login screens use a legacy API and will not work with the V7 session-only Worker.
7. Start with a **single AI analysis**. Confirm returned tags are correct enough to review, and check Cloudflare Workers AI usage before more scans.
8. Test wrong-password throttling, session logout, private draft visibility, public downloads, and phone/desktop behavior.

Do **not** publish or use model-generated character names without confirming accuracy. Do not expose the long admin key in logs, screenshot attachments, localStorage, GitHub files or frontend JS.

## Model references

- Cloudflare [Moondream 3.1](https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/)
- Cloudflare [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- Cloudflare [Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) — optional second identity-based protection when the owner configures an allowed email/account identity.
