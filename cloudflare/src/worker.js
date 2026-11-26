// Waifu Wallpapers V5 catalog API.
// Public users can only READ approved originals and thumbnails.
// All uploads, metadata edits and publication changes require ADMIN_TOKEN on the server.
// There is deliberately NO public upload route, no user-facing credentials, and no token in frontend source.
const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_THUMB = 500 * 1024;
const CAT = new Set(["anime","manga","gaming","oled","fantasy","scifi","cyberpunk","space","nature","cityscapes","aesthetic","minimal","abstract","movies","3d","cars","animals","architecture","photography","digitalart","horror","kawaii","seasonal","sports","other"]);
const allowedOrigins = env => (env.ALLOWED_ORIGINS || "").split(",").map(x=>x.trim()).filter(Boolean);
const cors = (request,env) => {
 const h = new Headers({"Vary":"Origin","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
 const origin=request.headers.get("Origin");
 const projectPreview=/^https:\/\/waifu-wallpapers-[a-z0-9]+-myself-adc5\.vercel\.app$/.test(origin||"");
 if(origin && (allowedOrigins(env).includes(origin)||projectPreview)){
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

const SESSION_MS=30*60*1000;
const LOGIN_WINDOW_MS=15*60*1000;
const MAX_FAILED_LOGINS=6;
const AI_DAILY_CAP=20; // Deliberate cap: Workers AI may incur charges on paid plans.
const MODEL="@cf/moondream/moondream3.1-9B-A2B";

function bearer(request){return (request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");}
async function digest(value){
 const bytes=new TextEncoder().encode(value);
 const hash=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function fingerprints(request,env){
 const ip=request.headers.get("CF-Connecting-IP")||"unknown";
 const ua=request.headers.get("User-Agent")||"";
 const salt=String(env.ADMIN_TOKEN||"");
 return {ip:await digest("ip:"+salt+":"+ip),ua:await digest("ua:"+salt+":"+ua)};
}
async function audit(env,event,ip,record=""){
 try{await env.DB.prepare("INSERT INTO admin_security_events(event,ip_hash,created_at,record_id) VALUES (?,?,?,?)").bind(event,ip,Date.now(),record).run()}
 catch(e){console.warn("Admin audit write failed",event);}
}
async function ensureAdmin(request,env){
 const raw=bearer(request);
 if(!raw||raw.length<32||raw.length>180)return fail(request,env,401,"Admin session required");
 const now=Date.now();
 const hash=await digest(raw);
 const row=await env.DB.prepare("SELECT ip_hash,ua_hash,expires_at FROM admin_sessions WHERE token_hash=?").bind(hash).first();
 if(!row||row.expires_at<=now)return fail(request,env,401,"Session expired. Sign in again.");
 const fp=await fingerprints(request,env);
 if(!secureEqual(row.ip_hash,fp.ip)||!secureEqual(row.ua_hash,fp.ua))return fail(request,env,401,"Admin session device verification failed");
 return null;
}
async function loginAdmin(request,env){
 if(!env.ADMIN_TOKEN||String(env.ADMIN_TOKEN).length<32)return fail(request,env,503,"Owner authentication is not configured");
 if(!(request.headers.get("Content-Type")||"").startsWith("application/json"))return fail(request,env,415,"JSON request required");
 const len=Number(request.headers.get("Content-Length")||0);
 if(len>1500)return fail(request,env,413,"Invalid login request");
 const fp=await fingerprints(request,env), now=Date.now();
 const prior=await env.DB.prepare("SELECT window_start,failures,locked_until FROM admin_login_attempts WHERE ip_hash=?").bind(fp.ip).first();
 if(prior?.locked_until>now)return fail(request,env,429,"Too many attempts. Retry in 15 minutes.");
 const body=await request.json().catch(()=>null);
 const key=typeof body?.key==="string"&&body.key.length<=256?body.key:"";
 if(!secureEqual(key,String(env.ADMIN_TOKEN))){
  const recent=prior&&now-prior.window_start<LOGIN_WINDOW_MS;
  const count=(recent?prior.failures:0)+1;
  const locked=count>=MAX_FAILED_LOGINS?now+LOGIN_WINDOW_MS:0;
  await env.DB.prepare("INSERT INTO admin_login_attempts(ip_hash,window_start,failures,locked_until) VALUES (?,?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET window_start=excluded.window_start,failures=excluded.failures,locked_until=excluded.locked_until").bind(fp.ip,recent?prior.window_start:now,count,locked).run();
  await audit(env,"login_failed",fp.ip);
  return fail(request,env,locked?429:401,locked?"Too many attempts. Retry in 15 minutes.":"Invalid admin key");
 }
 await env.DB.prepare("DELETE FROM admin_login_attempts WHERE ip_hash=?").bind(fp.ip).run();
 const keyBytes=crypto.getRandomValues(new Uint8Array(32));
 const session=btoa(String.fromCharCode(...keyBytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
 const tokenHash=await digest(session),expiry=now+SESSION_MS;
 await env.DB.prepare("INSERT INTO admin_sessions(token_hash,ip_hash,ua_hash,created_at,expires_at) VALUES (?,?,?,?,?)").bind(tokenHash,fp.ip,fp.ua,now,expiry).run();
 await audit(env,"login_success",fp.ip);
 return reply(request,env,{authenticated:true,session,expiresAt:expiry,ttlMinutes:30});
}
async function logoutAdmin(request,env){
 await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash=?").bind(await digest(bearer(request))).run();
 return reply(request,env,{loggedOut:true});
}
function imageDataUri(bytes,mime){
 // 12 KiB is divisible by 3 so independently encoded base64 chunks join safely.
 let b64="";
 for(let i=0;i<bytes.length;i+=12288)b64+=btoa(String.fromCharCode(...bytes.subarray(i,i+12288)));
 return "data:"+mime+";base64,"+b64;
}
function aiMetadata(textOutput,originalName=""){
 const textValue=typeof textOutput==="string"?textOutput:String(textOutput?.answer||textOutput?.caption||"");
 const jsonText=textValue.match(/\{[\s\S]*\}/)?.[0]||"";
 let parsed={};
 try{parsed=JSON.parse(jsonText);}catch(_){}
 const description=text(parsed.description||(!jsonText?textValue:""),450);
 const title=text(parsed.title||"",90);
 const series=text(parsed.series||"",100);
 const category=CAT.has(parsed.category)?parsed.category:"anime";
 const suggestedTags=tags(parsed.tags||[]);
 if(!suggestedTags.length){
   for(const term of ["beach","ocean","bedroom","night","moon","sky","forest","flowers","purple","blue","neon","city","anime","illustration","portrait","landscape","mountains","clouds","stars","room","sakura","sunset"]){
     if(description.toLowerCase().includes(term))suggestedTags.push(term);
   }
 }
 return {title,description,series,category,tags:suggestedTags,provider:"Cloudflare Workers AI · Moondream 3.1",needsReview:true};
}
async function analyzeImage(request,env){
 if(!env.AI)return fail(request,env,503,"Visual AI is not enabled yet");
 let bytes,mime;
 const kind=request.headers.get("Content-Type")||"";
 if(kind.startsWith("multipart/form-data")){
   if(Number(request.headers.get("Content-Length")||0)>MAX_THUMB+30000)return fail(request,env,413,"Use a small preview image for AI");
   const form=await request.formData();
   const preview=form.get("thumbnail");
   if(!(preview instanceof File)||preview.size<50||preview.size>MAX_THUMB)return fail(request,env,400,"Preview image must be under 500 KB");
   bytes=new Uint8Array(await preview.arrayBuffer());
 }else if(kind.startsWith("application/json")){
   const body=await request.json().catch(()=>null);
   const id=body?.id;
   if(typeof id!=="string"||!idOK(id))return fail(request,env,400,"Valid wallpaper ID required");
   const item=await env.DB.prepare("SELECT thumb_key FROM wallpapers WHERE id=?").bind(id).first();
   if(!item)return fail(request,env,404,"Wallpaper not found");
   const image=await env.IMAGES.get(item.thumb_key);
   if(!image||image.size>MAX_THUMB)return fail(request,env,400,"Preview unavailable");
   bytes=new Uint8Array(await image.arrayBuffer());
 }else return fail(request,env,415,"Send preview file or wallpaper ID");
 mime=sniffMime(bytes);
 if(!mime)return fail(request,env,415,"Only valid PNG/JPEG/WebP previews are supported");
 const day=new Date().toISOString().slice(0,10);
 const quota=await env.DB.prepare("INSERT INTO admin_ai_usage(day,calls) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1 WHERE calls<?").bind(day,AI_DAILY_CAP).run();
 if((quota.meta?.changes||0)===0)return fail(request,env,429,"AI scan limit reached: 20 per day. Check Cloudflare AI usage before scanning more.");
 const fp=await fingerprints(request,env);
 await audit(env,"ai_scan",fp.ip);
 try{
  const question='Examine this wallpaper image and return ONLY a JSON object with keys: "title" (short descriptive title), "description" (one descriptive sentence about VISIBLE subjects and setting), "series" (anime/game title ONLY if confidently recognizable, otherwise empty string), "category" (ONE of anime,manga,gaming,oled,fantasy,scifi,cyberpunk,space,nature,cityscapes,aesthetic,minimal,abstract,movies,3d,cars,animals,architecture,photography,digitalart,horror,kawaii,seasonal,sports,other), and "tags" (array of up to 12 visual tags like anime girl, ocean, beach, bedroom, moon, neon, purple, portrait). Never invent specific named characters or series. This is an image indexing draft, not an assertion of copyright or identity.';
  const response=await env.AI.run(MODEL,{task:"query",image:imageDataUri(bytes,mime),question,reasoning:false,stream:false,max_tokens:320,temperature:0.15});
  const metadata=aiMetadata(response);
  if(!metadata.description&&!metadata.tags.length)return fail(request,env,502,"The vision model returned an unusable suggestion. You can retry later.");
  return reply(request,env,{suggestions:metadata,remainingToday:Math.max(0,AI_DAILY_CAP-((await env.DB.prepare("SELECT calls FROM admin_ai_usage WHERE day=?").bind(day).first())?.calls||0))});
 }catch(e){
   console.error("Visual AI unavailable",e?.message||"model failure");
   return fail(request,env,502,"Cloudflare AI did not complete this scan. No metadata was changed.");
 }
}
function text(value,n=120){return String(value??"").replace(/[<>\u0000-\u001f\u007f]/g,"").trim().slice(0,n);}
function tags(value){
 const arr=Array.isArray(value)?value:String(value||"").split(",");
 return [...new Set(arr.map(x=>text(x,40).replace(/^#/,"").toLowerCase()).filter(Boolean))].slice(0,25);
}
function idOK(id){return /^[a-f\d-]{36}$/i.test(id);}
function fields(row){
 let ts=[];try{ts=JSON.parse(row.tags_json||"[]");}catch(_){}
 return {id:row.id,title:row.title,description:row.description||"",series:row.series||"",credit:row.credit||"",category:row.category,
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
      if (isSOF && length >= 7) return [view.getUint16(i + 5, false), view.getUint16(i + 3, false)];
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
 const orient=text(params.get("orientation"),20).toLowerCase();
 const where=["status='approved'"],bind=[];
 if(search){where.push("(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(series) LIKE ? OR LOWER(tags_json) LIKE ?)");for(let i=0;i<4;i++)bind.push("%"+search+"%");}
 if(CAT.has(category)){where.push("category=?");bind.push(category);}
 if(series){where.push("LOWER(series)=?");bind.push(series);}
 if(tag){where.push("LOWER(tags_json) LIKE ?");bind.push("%"+tag+"%");}
 if(orient==="landscape")where.push("width*100>height*112");
 if(orient==="portrait")where.push("height*100>width*112");
 if(orient==="square")where.push("width*100<=height*112 AND height*100<=width*112");
 const sql="SELECT * FROM wallpapers WHERE "+where.join(" AND ")+" ORDER BY created_at DESC LIMIT ? OFFSET ?";
 const result=await env.DB.prepare(sql).bind(...bind,limit+1,page*limit).all();
 const rows=result.results||[];
 return reply(request,env,{items:rows.slice(0,limit).map(fields),page,nextPage:rows.length>limit?page+1:null});
}
async function listAdmin(request,env){
 const params=new URL(request.url).searchParams;
 const status=params.get("status")||"draft";
 const valid=["draft","approved","removed","all"].includes(status)?status:"draft";
 const query=text(params.get("q"),140);
 const page=Math.min(10000,Math.max(0,Math.floor(Number(params.get("page"))||0)));
 const limit=30;
 const conditions=[],bindings=[];
 if(valid!=="all"){conditions.push("status=?");bindings.push(valid);}
 const idMatch=query.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
 if(idMatch){conditions.push("id=?");bindings.push(idMatch[0].toLowerCase());}
 else if(query){conditions.push("(LOWER(title) LIKE ? OR LOWER(series) LIKE ? OR LOWER(category) LIKE ? OR LOWER(description) LIKE ? OR LOWER(tags_json) LIKE ?)");for(let i=0;i<5;i++)bindings.push("%"+query.toLowerCase()+"%");}
 const where=conditions.length?" WHERE "+conditions.join(" AND "):"";
 const data=await env.DB.prepare("SELECT * FROM wallpapers"+where+" ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?").bind(...bindings,limit+1,page*limit).all();
 const rows=data.results||[];
 return reply(request,env,{items:rows.slice(0,limit).map(fields),page,nextPage:rows.length>limit?page+1:null,limit});
}
async function adminWallpaperById(request,env,id){
 const row=await env.DB.prepare("SELECT * FROM wallpapers WHERE id=?").bind(id).first();
 return row?reply(request,env,{item:fields(row)}):fail(request,env,404,"Wallpaper not found");
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
 const credit=text(form.get("credit")||"Waifu Wallpapers · AI-assisted artwork",110);
 const tagList=tags(form.get("tags"));
 const id=crypto.randomUUID(),now=Date.now();
 const ext={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"};
 const originalKey="originals/"+id+"."+ext[mime],thumbKey="thumbs/"+id+"."+ext[tMime];
 await env.IMAGES.put(originalKey,bytes,{httpMetadata:{contentType:mime}});
 try{
  await env.IMAGES.put(thumbKey,thumbBytes,{httpMetadata:{contentType:tMime}});
  await env.DB.prepare("INSERT INTO wallpapers(id,title,description,series,credit,category,tags_json,width,height,mime,size,original_key,thumb_key,status,created_at,updated_at,ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,title,description,series,credit,category,JSON.stringify(tagList),dim[0],dim[1],mime,file.size,originalKey,thumbKey,"draft",now,now,"admin").run();
 }catch(error){
  await Promise.allSettled([env.IMAGES.delete(originalKey),env.IMAGES.delete(thumbKey)]);
  throw error;
 }
 await audit(env,"upload", (await fingerprints(request,env)).ip, id);
 return reply(request,env,{id,status:"draft",message:"Added to private admin drafts"},201);
}
async function edit(request,env,id){
 const row=await env.DB.prepare("SELECT * FROM wallpapers WHERE id=?").bind(id).first();
 if(!row)return fail(request,env,404,"Not found");
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object")return fail(request,env,400,"Expected JSON metadata");
 const title=text(body.title??row.title,90),desc=text(body.description??row.description,450),series=text(body.series??row.series,100),credit=text(body.credit??row.credit,110);
 if(!title)return fail(request,env,400,"Title required");
 const category=CAT.has(body.category)?body.category:row.category;
 const tagList=body.tags===undefined?JSON.parse(row.tags_json||"[]"):tags(body.tags);
 await env.DB.prepare("UPDATE wallpapers SET title=?,description=?,series=?,credit=?,category=?,tags_json=?,updated_at=? WHERE id=?")
  .bind(title,desc,series,credit,category,JSON.stringify(tagList),Date.now(),id).run();
 await audit(env,"metadata_edit", (await fingerprints(request,env)).ip, id);
 return reply(request,env,{id,message:"Updated"});
}
async function change(request,env,id){
 const row=await env.DB.prepare("SELECT * FROM wallpapers WHERE id=?").bind(id).first();
 if(!row)return fail(request,env,404,"Not found");
 const body=await request.json().catch(()=>null);
 if(!["draft","approved","removed"].includes(body?.status))return fail(request,env,400,"Invalid status");
 await env.DB.prepare("UPDATE wallpapers SET status=?,updated_at=? WHERE id=?").bind(body.status,Date.now(),id).run();
 await audit(env,"visibility_"+body.status,(await fingerprints(request,env)).ip,id);
 return reply(request,env,{id,status:body.status});
}

// Community is isolated from the owner media upload path. No guest image uploads exist.
const CHAT_RETENTION_MS=30*24*3600*1000;
const CHAT_INTERVAL_MS=30*1000;
const CHAT_HOURLY_CAP=24;
function validCommunityOrigin(request,env){
 const origin=request.headers.get("Origin")||"";
 return !!origin&&(allowedOrigins(env).includes(origin)||/^https:\/\/waifu-wallpapers-[a-z0-9]+-myself-adc5\.vercel\.app$/.test(origin));
}
async function communityEnabled(env,setting){
 const result=await env.DB.prepare("SELECT value FROM community_settings WHERE setting=?").bind(setting).first();
 return result?.value==="1";
}
async function communityStatus(request,env){
 return reply(request,env,{chatEnabled:await communityEnabled(env,"chat_enabled"),pollsEnabled:await communityEnabled(env,"polls_enabled"),guestUpload:false,chatRefreshSeconds:12,chatRetentionDays:30});
}
async function communityMessages(request,env){
 const limit=Math.min(80,Math.max(1,Number(new URL(request.url).searchParams.get("limit"))||60));
 const result=await env.DB.prepare("SELECT id,nickname,body,created_at FROM community_messages WHERE status='visible' AND created_at>? ORDER BY created_at DESC LIMIT ?").bind(Date.now()-CHAT_RETENTION_MS,limit).all();
 return reply(request,env,{items:(result.results||[]).reverse().map(x=>({id:x.id,nickname:x.nickname,body:x.body,createdAt:x.created_at}))});
}
async function postCommunityMessage(request,env){
 if(!await communityEnabled(env,"chat_enabled"))return fail(request,env,403,"Chat is temporarily closed by the owner.");
 if(!validCommunityOrigin(request,env))return fail(request,env,403,"Unsupported website origin");
 if(!(request.headers.get("Content-Type")||"").startsWith("application/json"))return fail(request,env,415,"JSON required");
 if(Number(request.headers.get("Content-Length"))>1100)return fail(request,env,413,"Message too long");
 const data=await request.json().catch(()=>null);
 let nickname=typeof data?.nickname==="string"?text(data.nickname,24).replace(/\s+/g," "):"";
 let body=typeof data?.body==="string"?text(data.body,240).replace(/\s+/g," "):"";
 if(nickname.length<2||body.length<2||body.length>240)return fail(request,env,400,"Nickname and message must be at least two characters");
 if(!/^[\p{L}\p{N} _.-]{2,24}$/u.test(nickname))return fail(request,env,400,"Nickname must contain letters, numbers or spaces");
 if(/(?:https?:\/\/|www\.|\b\S+@\S+\.\w{2,}\b|(?:\+?\d[\d \-]{8,}\d))/i.test(body))return fail(request,env,400,"No links, email addresses or phone numbers in public chat.");
 if(/(.)\1{12,}/u.test(body))return fail(request,env,400,"Please avoid repeated-character spam");
 const now=Date.now(),fp=await fingerprints(request,env);
 const rate=await env.DB.prepare("SELECT COUNT(*) AS n,MAX(created_at) AS last FROM community_messages WHERE ip_hash=? AND created_at>?").bind(fp.ip,now-3600000).first();
 if((rate?.n||0)>=CHAT_HOURLY_CAP)return fail(request,env,429,"Message limit reached for this hour. Please return later.");
 if(rate?.last&&now-rate.last<CHAT_INTERVAL_MS)return fail(request,env,429,"You can post one message every 30 seconds.");
 const id=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO community_messages(id,nickname,body,ip_hash,created_at,status) VALUES (?,?,?,?,?,'visible')").bind(id,nickname,body,fp.ip,now).run();
 return reply(request,env,{ok:true,id,createdAt:now},201);
}
async function reportCommunityMessage(request,env,id){
 if(!validCommunityOrigin(request,env))return fail(request,env,403,"Unsupported website origin");
 const item=await env.DB.prepare("SELECT id FROM community_messages WHERE id=? AND status='visible'").bind(id).first();
 if(!item)return fail(request,env,404,"Message not found");
 const fp=await fingerprints(request,env);
 const recent=await env.DB.prepare("SELECT COUNT(*) AS n FROM community_reports WHERE reporter_hash=? AND created_at>?").bind(fp.ip,Date.now()-86400000).first();
 if((recent?.n||0)>=10)return fail(request,env,429,"Daily report limit reached.");
 await env.DB.prepare("INSERT OR IGNORE INTO community_reports(message_id,reporter_hash,created_at) VALUES (?,?,?)").bind(id,fp.ip,Date.now()).run();
 return reply(request,env,{reported:true});
}
async function listCommunityPolls(request,env){
 const result=await env.DB.prepare("SELECT id,question,options_json,status,created_at FROM community_polls ORDER BY created_at DESC LIMIT 12").all();
 const polls=result.results||[];
 const mapped=[];
 for(const poll of polls){
  const options=JSON.parse(poll.options_json||"[]");
  const votes=await env.DB.prepare("SELECT option_index,COUNT(*) AS n FROM community_votes WHERE poll_id=? GROUP BY option_index").bind(poll.id).all();
  const counts=Array(options.length).fill(0);
  for(const vote of votes.results||[])if(Number.isInteger(vote.option_index)&&vote.option_index>=0&&vote.option_index<counts.length)counts[vote.option_index]=vote.n;
  mapped.push({id:poll.id,question:poll.question,options,status:poll.status,createdAt:poll.created_at,counts,totalVotes:counts.reduce((n,v)=>n+v,0)});
 }
 return reply(request,env,{items:mapped});
}
async function voteCommunityPoll(request,env,id){
 if(!await communityEnabled(env,"polls_enabled"))return fail(request,env,403,"Voting is currently closed");
 if(!validCommunityOrigin(request,env))return fail(request,env,403,"Unsupported website origin");
 if(Number(request.headers.get("Content-Length"))>300)return fail(request,env,413,"Invalid vote");
 const body=await request.json().catch(()=>null);
 const poll=await env.DB.prepare("SELECT options_json,status FROM community_polls WHERE id=?").bind(id).first();
 if(!poll)return fail(request,env,404,"Poll not found");
 if(poll.status!=="active")return fail(request,env,403,"Poll is closed");
 const options=JSON.parse(poll.options_json||"[]");
 if(!Number.isInteger(body?.option)||body.option<0||body.option>=options.length)return fail(request,env,400,"Select a valid option");
 const fp=await fingerprints(request,env),voter=await digest("poll:"+id+":"+fp.ip+":"+fp.ua);
 const result=await env.DB.prepare("INSERT OR IGNORE INTO community_votes(poll_id,voter_hash,option_index,created_at) VALUES (?,?,?,?)").bind(id,voter,body.option,Date.now()).run();
 if((result.meta?.changes||0)===0)return fail(request,env,409,"You have already voted in this poll.");
 return reply(request,env,{ok:true},201);
}
async function adminCommunitySettings(request,env){
 if(request.method==="GET"){
  const result=await env.DB.prepare("SELECT setting,value FROM community_settings").all();
  return reply(request,env,{settings:Object.fromEntries((result.results||[]).map(x=>[x.setting,x.value==="1"]))});
 }
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object")return fail(request,env,400,"Invalid settings");
 const records=[["chatEnabled","chat_enabled"],["pollsEnabled","polls_enabled"]].filter(([key])=>typeof body[key]==="boolean");
 if(!records.length)return fail(request,env,400,"Provide a boolean setting");
 for(const [key,setting] of records)await env.DB.prepare("INSERT INTO community_settings(setting,value) VALUES (?,?) ON CONFLICT(setting) DO UPDATE SET value=excluded.value").bind(setting,body[key]?"1":"0").run();
 await audit(env,"community_settings",(await fingerprints(request,env)).ip);
 return adminCommunitySettings(new Request(request.url,{method:"GET"}),env);
}
async function createCommunityPoll(request,env){
 const body=await request.json().catch(()=>null);
 const question=text(body?.question||"",150);
 const options=Array.isArray(body?.options)?body.options.map(x=>text(x,75)).filter(Boolean):[];
 if(question.length<8||options.length<2||options.length>6||new Set(options.map(x=>x.toLowerCase())).size!==options.length)return fail(request,env,400,"Provide a clear question and 2–6 distinct options");
 const id=crypto.randomUUID(),now=Date.now();
 await env.DB.prepare("INSERT INTO community_polls(id,question,options_json,status,created_at) VALUES (?,?,?,'active',?)").bind(id,question,JSON.stringify(options),now).run();
 await audit(env,"poll_created",(await fingerprints(request,env)).ip,id);
 return reply(request,env,{ok:true,id},201);
}
async function setCommunityPoll(request,env,id){
 const body=await request.json().catch(()=>null);
 if(!["active","closed"].includes(body?.status))return fail(request,env,400,"Invalid poll status");
 const result=await env.DB.prepare("UPDATE community_polls SET status=? WHERE id=?").bind(body.status,id).run();
 if((result.meta?.changes||0)===0)return fail(request,env,404,"Poll not found");
 await audit(env,"poll_"+body.status,(await fingerprints(request,env)).ip,id);
 return reply(request,env,{ok:true,status:body.status});
}
async function adminChatList(request,env){
 const messages=await env.DB.prepare("SELECT m.id,m.nickname,m.body,m.status,m.created_at,COUNT(r.reporter_hash) AS reports FROM community_messages m LEFT JOIN community_reports r ON r.message_id=m.id GROUP BY m.id ORDER BY m.created_at DESC LIMIT 100").all();
 return reply(request,env,{items:(messages.results||[]).map(m=>({id:m.id,nickname:m.nickname,body:m.body,status:m.status,createdAt:m.created_at,reports:m.reports}))});
}
async function adminChatModerate(request,env,id){
 const body=await request.json().catch(()=>null);
 if(!["hidden","visible"].includes(body?.status))return fail(request,env,400,"Status must be hidden or visible");
 const result=await env.DB.prepare("UPDATE community_messages SET status=? WHERE id=?").bind(body.status,id).run();
 if((result.meta?.changes||0)===0)return fail(request,env,404,"Message not found");
 await audit(env,"chat_"+body.status,(await fingerprints(request,env)).ip,id);
 return reply(request,env,{ok:true});
}
async function publicWallpaperDetails(request,env,id){
 const row=await env.DB.prepare("SELECT * FROM wallpapers WHERE id=? AND status='approved'").bind(id).first();
 return row?reply(request,env,fields(row)):fail(request,env,404,"Wallpaper not found");
}
async function publicRelated(request,env,id){
 const row=await env.DB.prepare("SELECT series,category FROM wallpapers WHERE id=? AND status='approved'").bind(id).first();
 if(!row)return fail(request,env,404,"Wallpaper not found");
 const related=await env.DB.prepare("SELECT * FROM wallpapers WHERE id<>? AND status='approved' ORDER BY (CASE WHEN series<>'' AND LOWER(series)=LOWER(?) THEN 20 ELSE 0 END)+(CASE WHEN category=? THEN 6 ELSE 0 END) DESC,created_at DESC LIMIT 8").bind(id,row.series,row.category).all();
 return reply(request,env,{items:(related.results||[]).map(fields)});
}


// V9 lightweight visitor correction reporting. No user uploads, AI or paid moderation.
const WALLPAPER_REPORT_REASONS=new Set(["wrong_details","wrong_tags","broken_image","copyright","other"]);
async function reportWallpaper(request,env,id){
 if(!validCommunityOrigin(request,env))return fail(request,env,403,"Reports must come from the gallery website.");
 if(!(request.headers.get("Content-Type")||"").startsWith("application/json"))return fail(request,env,415,"JSON required");
 if(Number(request.headers.get("Content-Length")||0)>1100)return fail(request,env,413,"Report is too long");
 const row=await env.DB.prepare("SELECT id FROM wallpapers WHERE id=? AND status='approved'").bind(id).first();
 if(!row)return fail(request,env,404,"Wallpaper not found");
 const body=await request.json().catch(()=>null);
 if(!WALLPAPER_REPORT_REASONS.has(body?.reason))return fail(request,env,400,"Select a valid report reason");
 const note=text(body?.note||"",300);
 if(/https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(note))return fail(request,env,400,"Please do not include links or contact information");
 const fp=await fingerprints(request,env),now=Date.now();
 const recent=await env.DB.prepare("SELECT COUNT(*) AS n FROM wallpaper_reports WHERE reporter_hash=? AND created_at>?").bind(fp.ip,now-86400000).first();
 if((recent?.n||0)>=5)return fail(request,env,429,"Daily report limit reached");
 const idNew=crypto.randomUUID();
 const result=await env.DB.prepare("INSERT OR IGNORE INTO wallpaper_reports(id,wallpaper_id,reporter_hash,reason,note,status,created_at,updated_at) VALUES (?,?,?,?,?,'open',?,?)").bind(idNew,id,fp.ip,body.reason,note,now,now).run();
 if((result.meta?.changes||0)===0)return reply(request,env,{reported:true,alreadyReported:true,message:"This wallpaper has already been reported from this connection."});
 return reply(request,env,{reported:true,message:"Thanks. The owner can review this report."},201);
}
async function listWallpaperReports(request,env){
 const params=new URL(request.url).searchParams;
 const status=["open","resolved","dismissed","all"].includes(params.get("status"))?params.get("status"):"open";
 const page=Math.min(10000,Math.max(0,Math.floor(Number(params.get("page"))||0)));
 const limit=30,where=status==="all"?"":" WHERE r.status=?";
 const binds=status==="all"?[]:[status];
 const result=await env.DB.prepare("SELECT r.id,r.wallpaper_id,r.reason,r.note,r.status,r.created_at,r.updated_at,w.title,w.status AS wallpaper_status FROM wallpaper_reports r LEFT JOIN wallpapers w ON w.id=r.wallpaper_id"+where+" ORDER BY r.created_at DESC LIMIT ? OFFSET ?").bind(...binds,limit+1,page*limit).all();
 const rows=result.results||[];
 return reply(request,env,{items:rows.slice(0,limit).map(x=>({id:x.id,wallpaperId:x.wallpaper_id,title:x.title||"Deleted wallpaper",wallpaperStatus:x.wallpaper_status,reason:x.reason,note:x.note,status:x.status,createdAt:x.created_at})),page,nextPage:rows.length>limit?page+1:null,limit});
}
async function setWallpaperReportStatus(request,env,id){
 const body=await request.json().catch(()=>null);
 if(!["open","resolved","dismissed"].includes(body?.status))return fail(request,env,400,"Invalid review status");
 const result=await env.DB.prepare("UPDATE wallpaper_reports SET status=?,updated_at=? WHERE id=?").bind(body.status,Date.now(),id).run();
 if((result.meta?.changes||0)===0)return fail(request,env,404,"Report not found");
 await audit(env,"wallpaper_report_"+body.status,(await fingerprints(request,env)).ip,id);
 return reply(request,env,{status:body.status});
}

async function adminTagSuggestions(request,env){
 // All from existing metadata, no Workers AI inference, billed model, or external call.
 const result=await env.DB.prepare("SELECT LOWER(TRIM(j.value)) AS tag, COUNT(*) AS uses FROM wallpapers w, json_each(w.tags_json) j WHERE w.status IN ('approved','draft') AND TYPEOF(j.value)='text' AND LENGTH(TRIM(j.value))>1 GROUP BY LOWER(TRIM(j.value)) ORDER BY uses DESC,tag ASC LIMIT 60").all();
 return reply(request,env,{items:(result.results||[]).map(x=>({tag:x.tag,uses:x.uses}))});
}
async function adjacentWallpaper(request,env,id){
 const row=await env.DB.prepare("SELECT id,created_at FROM wallpapers WHERE id=? AND status='approved'").bind(id).first();
 if(!row)return fail(request,env,404,"Wallpaper not found");
 // Displayed newest first: next is older; previous is newer.
 const prev=await env.DB.prepare("SELECT id,title FROM wallpapers WHERE status='approved' AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at ASC,id ASC LIMIT 1").bind(row.created_at,row.created_at,id).first();
 const next=await env.DB.prepare("SELECT id,title FROM wallpapers WHERE status='approved' AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 1").bind(row.created_at,row.created_at,id).first();
 return reply(request,env,{previous:prev||null,next:next||null});
}

export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname.replace(/\/+$/,"")||"/";
  if(request.method==="OPTIONS"){
   const h=cors(request,env);
   return new Response(null,{status:h.has("Access-Control-Allow-Origin")?204:403,headers:h});
  }
  try{
   if(path==="/api/health"&&request.method==="GET")return reply(request,env,{ok:true,version:10});
   if(path==="/api/config"&&request.method==="GET")return reply(request,env,{maxImageBytes:MAX_IMAGE,guestUpload:false,adminOnly:true,aiSuggestions:"admin-only-on-demand"});
   if(path==="/api/gallery"&&request.method==="GET")return listPublic(request,env);
   const artworkReport=/^\/api\/wallpapers\/([\da-f-]{36})\/report$/.exec(path);
   if(artworkReport&&request.method==="POST")return reportWallpaper(request,env,artworkReport[1]);
   const detail=/^\/api\/wallpapers\/([\da-f-]{36})$/.exec(path);
   if(detail&&request.method==="GET")return publicWallpaperDetails(request,env,detail[1]);
   const adjacent=/^\/api\/wallpapers\/([\da-f-]{36})\/adjacent$/.exec(path);
   if(adjacent&&request.method==="GET")return adjacentWallpaper(request,env,adjacent[1]);
   const related=/^\/api\/wallpapers\/([\da-f-]{36})\/related$/.exec(path);
   if(related&&request.method==="GET")return publicRelated(request,env,related[1]);
   if(path==="/api/community/status"&&request.method==="GET")return communityStatus(request,env);
   if(path==="/api/community/messages"&&request.method==="GET")return communityMessages(request,env);
   if(path==="/api/community/messages"&&request.method==="POST")return postCommunityMessage(request,env);
   const report=/^\/api\/community\/messages\/([\da-f-]{36})\/report$/.exec(path);
   if(report&&request.method==="POST")return reportCommunityMessage(request,env,report[1]);
   if(path==="/api/community/polls"&&request.method==="GET")return listCommunityPolls(request,env);
   const vote=/^\/api\/community\/polls\/([\da-f-]{36})\/vote$/.exec(path);
   if(vote&&request.method==="POST")return voteCommunityPoll(request,env,vote[1]);

   const pic=/^\/api\/wallpapers\/([\da-f-]{36})\/(original|thumb)$/.exec(path);
   if(pic&&["GET","HEAD"].includes(request.method))return getImage(request,env,pic[1],pic[2]);
   if(path.startsWith("/api/admin/")){
    if(path==="/api/admin/login"&&request.method==="POST")return loginAdmin(request,env);
    const denied=await ensureAdmin(request,env);
    if(denied)return denied;
    if(path==="/api/admin/logout"&&request.method==="POST")return logoutAdmin(request,env);
    if(path==="/api/admin/check"&&request.method==="GET")return reply(request,env,{authenticated:true,expiresInMinutes:30});
    if(path==="/api/admin/tags"&&request.method==="GET")return adminTagSuggestions(request,env);
    if(path==="/api/admin/reports"&&request.method==="GET")return listWallpaperReports(request,env);
    const reportStatus=/^\/api\/admin\/reports\/([\da-f-]{36})$/.exec(path);
    if(reportStatus&&request.method==="POST")return setWallpaperReportStatus(request,env,reportStatus[1]);
    if(path==="/api/admin/analyze"&&request.method==="POST")return analyzeImage(request,env);
    if(path==="/api/admin/community/settings"&&["GET","POST"].includes(request.method))return adminCommunitySettings(request,env);
    if(path==="/api/admin/community/messages"&&request.method==="GET")return adminChatList(request,env);
    if(path==="/api/admin/community/polls"&&request.method==="POST")return createCommunityPoll(request,env);
    const moderation=/^\/api\/admin\/community\/messages\/([\da-f-]{36})$/.exec(path);
    if(moderation&&request.method==="POST")return adminChatModerate(request,env,moderation[1]);
    const pollAdmin=/^\/api\/admin\/community\/polls\/([\da-f-]{36})$/.exec(path);
    if(pollAdmin&&request.method==="POST")return setCommunityPoll(request,env,pollAdmin[1]);

    const adminPic=/^\/api\/admin\/wallpapers\/([\da-f-]{36})\/(thumb|original)$/.exec(path);
    if(adminPic&&["GET","HEAD"].includes(request.method))return getImage(request,env,adminPic[1],adminPic[2],true);
    if(path==="/api/admin/list"&&request.method==="GET")return listAdmin(request,env);
    const wallpaperAdmin=/^\/api\/admin\/wallpapers\/([\da-f-]{36})$/.exec(path);
    if(wallpaperAdmin&&request.method==="GET")return adminWallpaperById(request,env,wallpaperAdmin[1]);
    if(path==="/api/admin/upload"&&request.method==="POST")return upload(request,env);
    const editPath=/^\/api\/admin\/wallpapers\/([\da-f-]{36})$/.exec(path);
    if(editPath&&request.method==="PATCH")return edit(request,env,editPath[1]);
    if(editPath&&request.method==="POST")return change(request,env,editPath[1]);
   }
   return fail(request,env,404,"Not found");
  }catch(e){console.error("Worker V5 error:",e?.message);return fail(request,env,500,"Internal error");}
 }
};
