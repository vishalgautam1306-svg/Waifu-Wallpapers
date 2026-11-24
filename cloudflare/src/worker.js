// Waifu Wallpapers public gallery API: Cloudflare Worker + R2 + D1.
// Public uploads are OFF unless Turnstile is configured. Nothing is public until approved.
const CATEGORIES = new Set(["anime", "oled", "fantasy", "scifi", "other"]);
const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const MAX_THUMB_BYTES = 350 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
}
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const headers = new Headers({
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
  if (origin && allowedOrigins(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}
function json(request, env, data, status = 200, extra = {}) {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  Object.entries(extra).forEach(([key, value]) => headers.set(key, value));
  return new Response(JSON.stringify(data), {status, headers});
}
function error(request, env, status, message) {
  return json(request, env, {error: message}, status);
}
function checkOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return !!origin && allowedOrigins(env).includes(origin);
}
function safeTitle(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 90);
}
function safeCategory(value) {
  return CATEGORIES.has(value) ? value : "other";
}
function equalToken(a, b) {
  const x = String(a || ""), y = String(b || "");
  let mismatch = x.length ^ y.length;
  const size = Math.max(x.length, y.length);
  for (let i = 0; i < size; i++) mismatch |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return mismatch === 0 && x.length > 0;
}
function isAdmin(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return !!env.ADMIN_TOKEN && equalToken(token, env.ADMIN_TOKEN);
}
async function ipHash(request, env) {
  const value = (request.headers.get("CF-Connecting-IP") || "unknown") + "|" + env.IP_HASH_SALT;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map(v => v.toString(16).padStart(2, "0")).join("");
}
async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET_KEY || !token) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", String(token));
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.append("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body, signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return false;
    const result = await response.json();
    const origin = new URL(request.headers.get("Origin"));
    return result.success === true && result.hostname === origin.hostname;
  } catch (_) { return false; }
}
function sniffMime(bytes) {
  if (bytes.length >= 24 &&
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 &&
      bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10 &&
      String.fromCharCode(...bytes.slice(12, 16)) === "IHDR") return "image/png";
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 16 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
function dimensions(bytes, mime) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png") {
    return [view.getUint32(16, false), view.getUint32(20, false)];
  }
  if (mime === "image/webp") {
    const fourCC = String.fromCharCode(...bytes.slice(12, 16));
    if (fourCC === "VP8X" && bytes.length >= 30) {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return [width, height];
    }
    if (fourCC === "VP8 " && bytes.length >= 30) {
      return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    }
    if (fourCC === "VP8L" && bytes.length >= 25) {
      const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
      return [1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))];
    }
    return null;
  }
  if (mime === "image/jpeg") {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 255) return null;
      const marker = bytes[i + 1]; i += 2;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (i + 2 > bytes.length) return null;
      const length = view.getUint16(i, false);
      if (length < 2 || i + length > bytes.length) return null;
      const isSOF = [0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker);
      if (isSOF && length >= 7) return [view.getUint16(i + 3, false), view.getUint16(i + 1 + 4, false)];
      i += length;
    }
    return null;
  }
  return null;
}
function saneDimensions(dims) {
  if (!dims) return false;
  const [w, h] = dims;
  return Number.isInteger(w) && Number.isInteger(h) && w >= 64 && h >= 64 &&
    w <= 14000 && h <= 14000 && w * h <= 48_000_000;
}
function encodeCursor(row) {
  if (!row) return null;
  return btoa(String(row.created_at) + ":" + row.id).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
}
function decodeCursor(s) {
  if (!s) return null;
  try {
    const value = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const index = value.indexOf(":");
    const stamp = Number(value.slice(0, index));
    const id = value.slice(index + 1);
    return index > 0 && Number.isSafeInteger(stamp) && stamp > 0 &&
      /^[0-9a-f-]{36}$/i.test(id) ? {created_at: stamp, id} : null;
  } catch (_) { return null; }
}
function publicItem(row) {
  return {
    id: row.id, title: row.title, category: row.category,
    width: row.width, height: row.height,
    mime: row.mime, size: row.size, createdAt: row.created_at,
    thumbnail: "/api/wallpapers/" + row.id + "/thumb",
    original: "/api/wallpapers/" + row.id + "/original"
  };
}
async function gallery(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(24, Math.max(1, Number(url.searchParams.get("limit")) || 12));
  const key = url.searchParams.get("cursor");
  const cursor = decodeCursor(key);
  if (key && !cursor) return error(request, env, 400, "Invalid cursor");
  let statement;
  if (cursor) {
    statement = env.DB.prepare("SELECT id,title,category,width,height,mime,size,created_at FROM wallpapers WHERE status='approved' AND (created_at < ?1 OR (created_at = ?1 AND id < ?2)) ORDER BY created_at DESC, id DESC LIMIT ?3").bind(cursor.created_at, cursor.id, limit + 1);
  } else {
    statement = env.DB.prepare("SELECT id,title,category,width,height,mime,size,created_at FROM wallpapers WHERE status='approved' ORDER BY created_at DESC, id DESC LIMIT ?1").bind(limit + 1);
  }
  const result = await statement.all();
  const rows = result.results || [];
  const hasMore = rows.length > limit;
  const shown = rows.slice(0, limit);
  return json(request, env, {items: shown.map(publicItem), nextCursor: hasMore ? encodeCursor(shown.at(-1)) : null});
}
async function picture(request, env, id, variant, adminOnly = false) {
  const row = await env.DB.prepare("SELECT original_key,thumb_key,mime,status FROM wallpapers WHERE id = ?").bind(id).first();
  if (!row || (adminOnly ? !isAdmin(request, env) : row.status !== "approved")) return error(request, env, 404, "Wallpaper not found");
  const key = variant === "original" ? row.original_key : row.thumb_key;
  if (!key) return error(request, env, 404, "Image not found");
  const item = await env.IMAGES.get(key);
  if (!item) return error(request, env, 404, "Image not found");
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", variant === "original" ? row.mime : (item.httpMetadata?.contentType || "image/webp"));
  headers.set("Cache-Control", adminOnly ? "no-store" : "public, max-age=60");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  if (item.size) headers.set("Content-Length", String(item.size));
  return new Response(request.method === "HEAD" ? null : item.body, {status: 200, headers});
}
async function submit(request, env) {
  if (!checkOrigin(request, env)) return error(request, env, 403, "Origin is not allowed");
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY || !env.IP_HASH_SALT) {
    return error(request, env, 503, "Public submissions are not enabled");
  }
  const headerSize = Number(request.headers.get("Content-Length"));
  if (headerSize > MAX_ORIGINAL_BYTES + MAX_THUMB_BYTES + 100000) return error(request, env, 413, "Upload is too large");
  if (!(request.headers.get("Content-Type") || "").startsWith("multipart/form-data")) return error(request, env, 415, "Multipart form required");

  const form = await request.formData();
  const token = form.get("cf-turnstile-response") || form.get("turnstileToken");
  if (!await verifyTurnstile(request, env, token)) return error(request, env, 403, "Verification failed. Try again");
  const ip = await ipHash(request, env);
  const now = Date.now();
  const usage = await env.DB.prepare("SELECT COUNT(*) AS count FROM wallpapers WHERE ip_hash = ? AND created_at >= ?")
    .bind(ip, now - DAY_MS).first();
  if ((usage?.count || 0) >= 5) return error(request, env, 429, "Daily submission limit reached");

  const original = form.get("image");
  const thumb = form.get("thumbnail");
  if (!(original instanceof File) || !(thumb instanceof File)) return error(request, env, 400, "An image and preview thumbnail are required");
  if (original.size < 100 || original.size > MAX_ORIGINAL_BYTES ||
      thumb.size < 100 || thumb.size > MAX_THUMB_BYTES) return error(request, env, 413, "Image exceeds upload limits");
  const originalBytes = new Uint8Array(await original.arrayBuffer());
  const thumbBytes = new Uint8Array(await thumb.arrayBuffer());
  const mime = sniffMime(originalBytes), thumbMime = sniffMime(thumbBytes);
  if (!mime || !thumbMime) return error(request, env, 415, "Only valid PNG, JPEG and WebP images are accepted");
  const [w, h] = dimensions(originalBytes, mime) || [];
  if (!saneDimensions([w, h])) return error(request, env, 400, "Invalid or unsupported image dimensions");
  const title = safeTitle(form.get("title") || original.name);
  if (title.length < 2) return error(request, env, 400, "Enter a wallpaper title");
  const category = safeCategory(form.get("category"));

  const id = crypto.randomUUID(), ext = {"image/png":"png","image/jpeg":"jpg","image/webp":"webp"};
  const originalKey = "originals/" + id + "." + ext[mime];
  const thumbKey = "thumbnails/" + id + "." + ext[thumbMime];
  const http = type => ({httpMetadata: {contentType: type}});
  await env.IMAGES.put(originalKey, originalBytes, http(mime));
  try {
    await env.IMAGES.put(thumbKey, thumbBytes, http(thumbMime));
    await env.DB.prepare("INSERT INTO wallpapers (id,title,category,width,height,mime,size,original_key,thumb_key,status,created_at,ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,title,category,w,h,mime,original.size,originalKey,thumbKey,"pending",now,ip).run();
  } catch (e) {
    await Promise.allSettled([env.IMAGES.delete(originalKey),env.IMAGES.delete(thumbKey)]);
    throw e;
  }
  return json(request, env, {message:"Submitted for review", status:"pending", id}, 202);
}
async function listPending(request, env) {
  const rows = await env.DB.prepare("SELECT id,title,category,width,height,mime,size,status,created_at FROM wallpapers WHERE status='pending' ORDER BY created_at ASC LIMIT 50").all();
  return json(request, env, {items:(rows.results || []).map(r => ({...publicItem(r), status:r.status,
    reviewThumb:"/api/admin/wallpapers/"+r.id+"/thumb"}))});
}
async function decision(request, env, id) {
  const row = await env.DB.prepare("SELECT status,original_key,thumb_key FROM wallpapers WHERE id=?").bind(id).first();
  if (!row) return error(request, env, 404, "Wallpaper not found");
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (!["approve","reject","remove"].includes(action)) return error(request, env, 400, "Invalid action");
  if ((action==="approve" || action==="reject") && row.status !== "pending") return error(request, env, 409, "Submission is not pending");
  if (action==="remove" && row.status !== "approved") return error(request, env, 409, "Wallpaper is not published");

  const status = action==="approve" ? "approved" : action==="reject" ? "rejected" : "removed";
  await env.DB.prepare("UPDATE wallpapers SET status=? WHERE id=?").bind(status,id).run();
  if (status!=="approved") {
    // Keep metadata for audit and anti-abuse counts. Remove unneeded original data.
    await Promise.allSettled([env.IMAGES.delete(row.original_key),env.IMAGES.delete(row.thumb_key)]);
  }
  return json(request, env, {id,status});
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "OPTIONS") {
      const headers = corsHeaders(request, env);
      if (!headers.has("Access-Control-Allow-Origin")) return new Response(null, {status:403});
      return new Response(null, {status:204,headers});
    }
    try {
      if (path === "/api/health" && request.method === "GET") return json(request,env,{ok:true,storage:"cloudflare-r2",version:1});
      if (path === "/api/config" && request.method === "GET") return json(request,env,{
        publicUploadsEnabled:!!(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && env.IP_HASH_SALT),
        turnstileSiteKey:env.TURNSTILE_SITE_KEY || null,
        maxOriginalBytes:MAX_ORIGINAL_BYTES
      });
      if (path === "/api/gallery" && request.method === "GET") return gallery(request,env);
      const pic = /^\/api\/wallpapers\/([0-9a-f-]{36})\/(original|thumb)$/.exec(path);
      if (pic && (request.method === "GET" || request.method === "HEAD")) return picture(request,env,pic[1],pic[2]);
      if (path === "/api/submissions" && request.method === "POST") return submit(request,env);

      if (path.startsWith("/api/admin/")) {
        if (!isAdmin(request,env)) return error(request,env,401,"Admin access required");
        if (path === "/api/admin/pending" && request.method === "GET") return listPending(request,env);
        const preview = /^\/api\/admin\/wallpapers\/([0-9a-f-]{36})\/thumb$/.exec(path);
        if (preview && request.method==="GET") return picture(request,env,preview[1],"thumb",true);
        const mod = /^\/api\/admin\/wallpapers\/([0-9a-f-]{36})\/decision$/.exec(path);
        if (mod && request.method==="POST") return decision(request,env,mod[1]);
      }
      return error(request,env,404,"Not found");
    } catch (e) {
      console.error("API failure", e?.message || e);
      return error(request,env,500,"Internal error");
    }
  }
};