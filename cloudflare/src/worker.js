// Waifu Wallpapers V5 catalog API.
// Public users can only READ approved originals and thumbnails.
// All uploads, metadata edits and publication changes require ADMIN_TOKEN on the server.
// There is deliberately NO public upload route, no user-facing credentials, and no token in frontend source.
const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_THUMB = 500 * 1024;
const CAT = new Set(["anime","oled","fantasy","scifi","nature","aesthetic","minimal","abstract","movies","3d","other"]);
const allowedOrigins = env => (env.ALLOWED_ORIGINS || "").split(",").map(x=>x.trim()).filter(Boolean);
const cors = (request,env) => {
 const h = new Headers({"Vary":"Origin","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
 const origin=request.headers.get("Origin");
 if(origin && allowedOrigins(env).includes(origin)){
   h.set("Access-Control-Allow-Origin",origin);
   h.set("Access-Control-Allow-Methods","GET,HEAD,POST,PATCH,DELETE,OPTIONS");
   h.set("Access-Control-Allow-Headers","Authorization,Content-Type");
   h.set("Access-Control-Max-Age","600");
 }
 return h;
};
const reply=(request,env,data,status=200)=>{
 const headers=cors(request,env);headers.set("Content-Type","application/json; charset=utf-8");headers.set("Cache-Control","no-store");
 return new Response(JSON.stringify(data),{status,headers});
};
const fail=(request,env,status,message)=>reply(request,env,{error:message},status);
function secureEqual(a,b){
 a=String(a||"");b=String(b||"");let n=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return n===0&&a.length>0;
}
function authorized(request,env){
 const incoming=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 // A long random value is required. This is a secret configured in Cloudflare, never inside JS.
 return !!env.ADMIN_TOKEN && String(env.ADMIN_TOKEN).length>=32 && secureEqual(incoming,env.ADMIN_TOKEN);
}
function ensureAdmin(request,env){return authorized(request,env)?null:fail(request,env,401,"Admin authentication required");}
function text(value,n=120){return String(value??"").replace(/[<>\u0000-\u001f\u007f]/g,"").trim().slice(0,n);}
function tags(value){
 const arr=Array.isArray(value)?value:String(value||"").split(",");
 return [...new Set(arr.map(x=>text(x,40).replace(/^#/,"").toLowerCase()).filter(Boolean))].slice(0,25);
}
function idOK(id){return /^[a-f\d-]{36}$/i.test(id);}
function fields(row){
 let ts=[];try{ts=JSON.parse(row.tags_json||"[]");}catch(_){}
 return {id:row.id,title:row.title,description:row.description||"",series:row.series||"",category:row.category,
 tags:ts,width:row.width,height:row.height,mime:row.mime,size:row.size,status:row.status,
 createdAt:row.created_at,updatedAt:row.updated_at,
 thumbnail:"/api/wallpapers/"+row.id+"/thumb",original:"/api/wallpapers/"+row.id+"/original"};
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

async function listPublic(request,env){
 const params=new URL(request.url).searchParams;
 const limit=Math.min(60,Math.max(1,Number(params.get("limit"))||24));
 const page=Math.min(1000,Math.max(0,Number(params.get("page"))||0));
 const search=text(params.get("q"),90).toLowerCase();
 const category=text(params.get("category"),30);
 const series=text(params.get("series"),80).toLowerCase();
 const tag=text(params.get("tag"),40).toLowerCase().replace(/^#/,"");
 const where=["status='approved'"],bind=[];
 if(search){where.push("(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(series) LIKE ? OR LOWER(tags_json) LIKE ?)");for(let i=0;i<4;i++)bind.push("%"+search+"%");}
 if(CAT.has(category)){where.push("category=?");bind.push(category);}
 if(series){where.push("LOWER(series)=?");bind.push(series);}
 if(tag){where.push("LOWER(tags_json) LIKE ?");bind.push("%"+tag+"%");}
 const sql="SELECT * FROM wallpapers WHERE "+where.join(" AND ")+" ORDER BY created_at DESC LIMIT ? OFFSET ?";
 const result=await env.DB.prepare(sql).bind(...bind,limit+1,page*limit).all();
 const rows=result.results||[];
 return reply(request,env,{items:rows.slice(0,limit).map(fields),page,nextPage:rows.length>limit?page+1:null});
}
async function listAdmin(request,env){
 const status=new URL(request.url).searchParams.get("status")||"draft";
 const valid=["draft","approved","removed","all"].includes(status)?status:"draft";
 const sql=valid==="all"?"SELECT * FROM wallpapers ORDER BY created_at DESC LIMIT 150":"SELECT * FROM wallpapers WHERE status=? ORDER BY created_at DESC LIMIT 150";
 const r=valid==="all"?await env.DB.prepare(sql).all():await env.DB.prepare(sql).bind(valid).all();
 return reply(request,env,{items:(r.results||[]).map(fields)});
}
async function getImage(request,env,id,kind,admin=false){
 const row=await env.DB.prepare("SELECT status,original_key,thumb_key,mime FROM wallpapers WHERE id=?").bind(id).first();
 if(!row||(!admin&&row.status!=="approved"))return fail(request,env,404,"Not found");
 const entry=await env.IMAGES.get(kind==="thumb"?row.thumb_key:row.original_key);
 if(!entry)return fail(request,env,404,"Not found");
 const headers=cors(request,env);
 headers.set("Content-Type",kind==="thumb"?(entry.httpMetadata?.contentType||"image/webp"):row.mime);
 headers.set("Cache-Control",admin?"no-store":"public, max-age=300");
 headers.set("Content-Security-Policy","default-src 'none'; sandbox");
 return new Response(request.method==="HEAD"?null:entry.body,{status:200,headers});
}
async function upload(request,env){
 const header=Number(request.headers.get("Content-Length"));
 if(header>MAX_IMAGE+MAX_THUMB+200000)return fail(request,env,413,"Upload exceeds 15 MB image limit");
 if(!(request.headers.get("Content-Type")||"").startsWith("multipart/form-data"))return fail(request,env,415,"Multipart required");
 const form=await request.formData();
 const file=form.get("image"),thumb=form.get("thumbnail");
 if(!(file instanceof File)||!(thumb instanceof File))return fail(request,env,400,"Image and thumbnail required");
 if(file.size<100||file.size>MAX_IMAGE||thumb.size<50||thumb.size>MAX_THUMB)return fail(request,env,413,"Image or thumbnail exceeds size limit");
 const bytes=new Uint8Array(await file.arrayBuffer()),thumbBytes=new Uint8Array(await thumb.arrayBuffer());
 const mime=sniffMime(bytes),tMime=sniffMime(thumbBytes);
 if(!mime||!tMime)return fail(request,env,415,"Only real PNG/JPEG/WebP image files permitted");
 const dim=dimensions(bytes,mime);
 if(!saneDimensions(dim))return fail(request,env,400,"Invalid dimensions");
 const title=text(form.get("title")||file.name,90);
 if(!title)return fail(request,env,400,"Title required");
 const category=CAT.has(form.get("category"))?form.get("category"):"other";
 const description=text(form.get("description"),450);
 const series=text(form.get("series"),100);
 const tagList=tags(form.get("tags"));
 const id=crypto.randomUUID(),now=Date.now();
 const ext={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"};
 const originalKey="originals/"+id+"."+ext[mime],thumbKey="thumbs/"+id+"."+ext[tMime];
 await env.IMAGES.put(originalKey,bytes,{httpMetadata:{contentType:mime}});
 try{
  await env.IMAGES.put(thumbKey,thumbBytes,{httpMetadata:{contentType:tMime}});
  await env.DB.prepare("INSERT INTO wallpapers(id,title,description,series,category,tags_json,width,height,mime,size,original_key,thumb_key,status,created_at,updated_at,ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,title,description,series,category,JSON.stringify(tagList),dim[0],dim[1],mime,file.size,originalKey,thumbKey,"draft",now,now,"admin").run();
 }catch(error){
  await Promise.allSettled([env.IMAGES.delete(originalKey),env.IMAGES.delete(thumbKey)]);
  throw error;
 }
 return reply(request,env,{id,status:"draft",message:"Added to private admin drafts"},201);
}
async function edit(request,env,id){
 const row=await env.DB.prepare("SELECT * FROM wallpapers WHERE id=?").bind(id).first();
 if(!row)return fail(request,env,404,"Not found");
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object")return fail(request,env,400,"Expected JSON metadata");
 const title=text(body.title??row.title,90),desc=text(body.description??row.description,450),series=text(body.series??row.series,100);
 if(!title)return fail(request,env,400,"Title required");
 const category=CAT.has(body.category)?body.category:row.category;
 const tagList=body.tags===undefined?JSON.parse(row.tags_json||"[]"):tags(body.tags);
 await env.DB.prepare("UPDATE wallpapers SET title=?,description=?,series=?,category=?,tags_json=?,updated_at=? WHERE id=?")
  .bind(title,desc,series,category,JSON.stringify(tagList),Date.now(),id).run();
 return reply(request,env,{id,message:"Updated"});
}
async function change(request,env,id){
 const row=await env.DB.prepare("SELECT * FROM wallpapers WHERE id=?").bind(id).first();
 if(!row)return fail(request,env,404,"Not found");
 const body=await request.json().catch(()=>null);
 if(!["draft","approved","removed"].includes(body?.status))return fail(request,env,400,"Invalid status");
 await env.DB.prepare("UPDATE wallpapers SET status=?,updated_at=? WHERE id=?").bind(body.status,Date.now(),id).run();
 return reply(request,env,{id,status:body.status});
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname.replace(/\/+$/,"")||"/";
  if(request.method==="OPTIONS"){
   const h=cors(request,env);
   return new Response(null,{status:h.has("Access-Control-Allow-Origin")?204:403,headers:h});
  }
  try{
   if(path==="/api/health"&&request.method==="GET")return reply(request,env,{ok:true,version:5});
   if(path==="/api/config"&&request.method==="GET")return reply(request,env,{maxImageBytes:MAX_IMAGE,guestUpload:false,adminOnly:true});
   if(path==="/api/gallery"&&request.method==="GET")return listPublic(request,env);
   const pic=/^\/api\/wallpapers\/([\da-f-]{36})\/(original|thumb)$/.exec(path);
   if(pic&&["GET","HEAD"].includes(request.method))return getImage(request,env,pic[1],pic[2]);
   if(path.startsWith("/api/admin/")){
    const denied=ensureAdmin(request,env);
    if(denied)return denied;
    if(path==="/api/admin/check"&&request.method==="GET")return reply(request,env,{authenticated:true});
    const adminPic=/^\/api\/admin\/wallpapers\/([\da-f-]{36})\/(thumb|original)$/.exec(path);
    if(adminPic&&["GET","HEAD"].includes(request.method))return getImage(request,env,adminPic[1],adminPic[2],true);
    if(path==="/api/admin/list"&&request.method==="GET")return listAdmin(request,env);
    if(path==="/api/admin/upload"&&request.method==="POST")return upload(request,env);
    const editPath=/^\/api\/admin\/wallpapers\/([\da-f-]{36})$/.exec(path);
    if(editPath&&request.method==="PATCH")return edit(request,env,editPath[1]);
    if(editPath&&request.method==="POST")return change(request,env,editPath[1]);
   }
   return fail(request,env,404,"Not found");
  }catch(e){console.error("Worker V5 error:",e?.message);return fail(request,env,500,"Internal error");}
 }
};
