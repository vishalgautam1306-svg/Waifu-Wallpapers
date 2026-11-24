'use strict';
const $=id=>document.getElementById(id);
const CATEGORIES={"anime":"Anime","manga":"Manga & comics","gaming":"Games","oled":"OLED / Dark","fantasy":"Fantasy","scifi":"Sci-Fi","cyberpunk":"Cyberpunk","space":"Space & cosmos","nature":"Nature & scenery","cityscapes":"Cities & skylines","aesthetic":"Aesthetic","minimal":"Minimal","abstract":"Abstract","movies":"Movies & TV","3d":"3D art","cars":"Cars & vehicles","animals":"Animals","architecture":"Architecture","photography":"Photography","digitalart":"Digital art","horror":"Horror","kawaii":"Cute / Kawaii","seasonal":"Seasonal","sports":"Sports","other":"Other"};
const SERIES=[
["Demon Slayer",/demon[\s_-]*slayer|kimetsu|tanjiro|nezuko|shinobu|giyu|rengoku|mitsuri/i],
["Honkai: Star Rail",/honkai|star[\s_-]*rail|hsr|acheron|kafka|firefly|sparkle/i],
["Genshin Impact",/genshin|furina|raiden|navia|arlecchino|keqing/i],
["Jujutsu Kaisen",/jujutsu|gojo|sukuna|toji|itadori|megumi/i],
["Attack on Titan",/attack[\s_-]*on[\s_-]*titan|mikasa|levi|eren/i],
["Hatsune Miku",/miku|vocaloid/i],
["Zenless Zone Zero",/zenless|ellen[\s_-]*joe|miyabi/i],
["Wuthering Waves",/wuthering|changli|jinshi/i],
["One Piece",/one[\s_-]*piece|luffy|zoro|nami/i]
];
let api='',credential='',queue=[],visible=[],adminItems=[],uploading=false,cancel=false,editing=null;
let sessionExpiry=0,scanning=false;
const urls=[];
function blobUrl(blob){const url=URL.createObjectURL(blob);urls.push(url);return url;}
function clearUrls(){for(const url of urls)URL.revokeObjectURL(url);urls.length=0;}
function escapeSource(name){return(name||"wallpaper").replace(/\.[^/.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();}
function proposed(file){
 const name=escapeSource(file.name),source=(file.webkitRelativePath||'')+' '+file.name;
 const series=SERIES.find(([_,re])=>re.test(source))?.[0]||'';
 const raw=source.toLowerCase();
 let category=series?"anime":/beach|ocean|sky|forest|sakura|mountain|landscape|garden/.test(raw)?"nature":/bedroom|aesthetic|pastel|rain|cozy|city/.test(raw)?"aesthetic":/oled|black|dark/.test(raw)?"oled":/cyberpunk|robot|mecha|sci-fi/.test(raw)?"scifi":"anime";
 const matches=["beach","ocean","bedroom","anime girl","night","sky","city","rain","forest","purple","blue","dark","cute","sunset","sakura","moon","stars","portrait"].filter(x=>raw.includes(x));
 const words=name.split(' ').filter(x=>x.length>3).slice(0,5).map(x=>x.toLowerCase());
 const tags=[...new Set([...(series?[series]:[]),...matches,...words])].slice(0,20).join(', ');
 return {title:name.slice(0,90)||"Untitled wallpaper",series,category,description:(name||"Wallpaper")+(series?" · "+series:""),tags};
}
function request(path,opts={}){
 if(!credential||Date.now()>=sessionExpiry){if(credential)logout();return Promise.reject(new Error('Admin session expired. Please sign in again.'));}
 return fetch(api+path,{...opts,headers:{...(opts.headers||{}),Authorization:'Bearer '+credential}});
}
async function jsonOrThrow(response){
 let body={};try{body=await response.json();}catch(_){}
 if(response.status===401&&credential){logout();throw new Error('Admin session expired or revoked. Sign in again.');}
 if(!response.ok)throw new Error(body.error||"Request failed: "+response.status);
 return body;
}
function setPanel(name){
 $('uploadPane').hidden=name!=='upload';$('managePane').hidden=name!=='manage';
 $('showUpload').classList.toggle('active',name==='upload');$('showManage').classList.toggle('active',name==='manage');
 if(name==='manage')refresh();
}
function showOffline(message){$('offline').hidden=false;$('offline').textContent=message;}
function logout(){
 const previous=credential;
 credential='';sessionExpiry=0;editing=null;scanning=false;
 $('login').hidden=false;$('workspace').hidden=true;$('secret').value='';
 $('loginState').textContent='Locked. Sign in again when needed.';
 if(previous&&api)fetch(api+'/api/admin/logout',{method:'POST',headers:{Authorization:'Bearer '+previous}}).catch(()=>{});
}
async function login(ev){
 ev.preventDefault();
 const configured=String(window.WAIFU_COMMUNITY_API||'').trim().replace(/\/+$/,'');
 if(!configured){$('loginState').textContent='Cloudflare Worker URL is not configured. Finish R2 setup first.';return;}
 try{
  const url=new URL(configured);
  if(url.protocol!=='https:')throw new Error('HTTPS is required');
  api=url.origin+url.pathname.replace(/\/+$/,'');
  const key=$('secret').value;
  const result=await jsonOrThrow(await fetch(api+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})}));
  if(!result.authenticated||!result.session)throw new Error('Admin access denied');
  credential=result.session;sessionExpiry=result.expiresAt;
  $('login').hidden=true;$('workspace').hidden=false;
  $('secret').value='';$('loginState').textContent='';
  setPanel('upload');
 }catch(e){credential='';sessionExpiry=0;$('loginState').textContent=e.message;}
}
function node(tag,cls,label){
 const n=document.createElement(tag);if(cls)n.className=cls;if(label!==undefined)n.textContent=label;return n;
}
function inputFor(row,key,label,max=100){
 const wrap=node('label');wrap.textContent=label;
 const inp=document.createElement('input');inp.value=row[key]||'';inp.maxLength=max;
 inp.addEventListener('change',()=>{row[key]=inp.value.trim().slice(0,max);});
 wrap.append(inp);return wrap;
}
function renderQueue(){
 const list=$('queue');list.replaceChildren();
 $('queueCount').textContent=queue.length+' wallpapers queued';
 for(let i=0;i<queue.length;i++){
  const item=queue[i];const card=node('div','queue-item');
  const img=document.createElement('img');img.src=item.preview;img.alt='';
  const fields=node('div','queue-fields');
  fields.append(inputFor(item,'title','Title',90),inputFor(item,'series','Series',100));
  const desc=inputFor(item,'description','Description',450);desc.classList.add('wide');fields.append(desc);
  const tags=inputFor(item,'tags','Search tags (comma separated)',600);tags.classList.add('wide');fields.append(tags);
  const sel=document.createElement('select');sel.setAttribute('aria-label','Category for '+item.title);
  for(const [key,val] of Object.entries(CATEGORIES))sel.append(new Option(val,key));
  sel.value=item.category;sel.addEventListener('change',()=>{item.category=sel.value;});
  card.append(img,fields,sel);list.append(card);
 }
 $('startUpload').disabled=!queue.length||uploading||scanning;
 $('analyzeQueue').disabled=!queue.some(x=>!x.aiScanned)||uploading||scanning;
}
async function selectFiles(files){
 if(uploading)return;
 const valid=['image/jpeg','image/png','image/webp'];
 const list=[...files];
 if(!list.length)return;
 if(list.length>500){$('uploadStatus').textContent='Select up to 500 images at a time. Repeat with more batches.';return;}
 const existing=new Set(queue.map(q=>q.file.name.toLowerCase()+'|'+q.file.size));
 let skipped=0;
 for(const file of list){
  if(!valid.includes(file.type)||file.size>15*1024*1024||file.size<100){skipped++;continue;}
  const key=file.name.toLowerCase()+'|'+file.size;
  if(existing.has(key)){skipped++;continue;}
  if(queue.length>=500){skipped++;continue;}
  existing.add(key);
  const meta=proposed(file);
  queue.push({file,...meta,preview:blobUrl(file)});
 }
 renderQueue();
 $('uploadStatus').textContent=queue.length+' valid images queued'+(skipped?' · '+skipped+' skipped (unsupported, duplicate or over limit)':'')+'. Review suggested metadata before uploading.';
}
function thumb(file){
 return new Promise(async(resolve,reject)=>{
  let bitmap;
  try{
   bitmap=await createImageBitmap(file);
   const factor=Math.min(1,480/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*factor));
   canvas.height=Math.max(1,Math.round(bitmap.height*factor));
   canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);
   const result=await new Promise(done=>canvas.toBlob(done,'image/webp',.75));
   if(!result)throw new Error('Thumbnail conversion failed');
   resolve(new File([result],'thumbnail.webp',{type:result.type}));
   canvas.width=1;canvas.height=1;
  }catch(e){reject(e);}finally{bitmap?.close();}
 });
}
function applyVision(item,suggestions){
 const x=suggestions||{};
 if(x.title&&typeof x.title==="string")item.title=x.title.trim().slice(0,90);
 if(x.description&&typeof x.description==="string")item.description=x.description.trim().slice(0,450);
 if(x.series&&typeof x.series==="string")item.series=x.series.trim().slice(0,100);
 if(x.category&&Object.hasOwn(CATEGORIES,x.category))item.category=x.category;
 const oldTags=String(item.tags||"").split(",").map(t=>t.trim()).filter(Boolean);
 const newTags=Array.isArray(x.tags)?x.tags.filter(t=>typeof t==="string").map(t=>t.trim()).filter(Boolean):[];
 item.tags=[...new Set([...oldTags,...newTags].map(t=>t.toLowerCase()))].slice(0,25).join(", ");
 item.aiScanned=true;
}
async function analyzeQueue(){
 if(scanning||uploading||!credential)return;
 const pending=queue.filter(item=>!item.aiScanned).slice(0,10);
 if(!pending.length){$('aiQueueStatus').textContent="All queued images have already been scanned.";return;}
 if(!confirm("Run Cloudflare image AI on "+pending.length+" thumbnails? This uses Workers AI quota and may incur charges on a paid Cloudflare plan. Every suggestion remains editable and private."))return;
 scanning=true;$('analyzeQueue').disabled=true;$('startUpload').disabled=true;
 let ok=0,fail=0;
 try{
  for(let i=0;i<pending.length;i++){
   const item=pending[i];
   $('aiQueueStatus').textContent="Analyzing image "+(i+1)+" of "+pending.length+" · "+item.file.name;
   try{
    const picture=await thumb(item.file);
    if(picture.size>500*1024)throw new Error("Preview exceeds 500 KB");
    const form=new FormData();form.append("thumbnail",picture);
    const data=await jsonOrThrow(await request('/api/admin/analyze',{method:'POST',body:form}));
    applyVision(item,data.suggestions);
    ok++;
   }catch(e){fail++;$('aiQueueStatus').textContent="AI stopped: "+e.message+". "+ok+" suggestions completed.";break;}
  }
  renderQueue();
  if(!fail)$('aiQueueStatus').textContent=ok+" images analyzed. Review all titles, series and tags before uploading or publishing.";
 }finally{scanning=false;renderQueue();}
}
async function suggestForEdit(){
 if(!editing||scanning||!credential)return;
 if(!confirm("Analyze this stored thumbnail with Cloudflare image AI? This uses AI quota. Changes will only be applied if you later click Save metadata."))return;
 scanning=true;$('editAI').disabled=true;$('editStatus').textContent="Analyzing the actual wallpaper pixels…";
 try{
  const data=await jsonOrThrow(await request('/api/admin/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editing.id})}));
  const suggestions=data.suggestions||{};
  if(suggestions.title)$('editTitle').value=suggestions.title;
  if(suggestions.series)$('editSeries').value=suggestions.series;
  if(suggestions.description)$('editDescription').value=suggestions.description;
  if(suggestions.category&&Object.hasOwn(CATEGORIES,suggestions.category))$('editCategory').value=suggestions.category;
  if(Array.isArray(suggestions.tags)){
   const current=$('editTags').value.split(",").map(t=>t.trim()).filter(Boolean);
   $('editTags').value=[...new Set([...current,...suggestions.tags])].slice(0,25).join(", ");
  }
  $('editStatus').textContent="AI draft ready. Check possible mistakes, then click Save metadata to apply changes.";
 }catch(e){$('editStatus').textContent="AI scan unavailable: "+e.message;}
 finally{scanning=false;$('editAI').disabled=false;}
}
async function uploadQueue(){
 if(uploading||!queue.length)return;
 uploading=true;cancel=false;$('startUpload').disabled=true;$('analyzeQueue').disabled=true;$('cancelUpload').disabled=false;
 const count=queue.length;let success=0;const failures=[];
 try{
  for(let i=0;i<count;i++){
   if(cancel)break;
   const item=queue[i];
   $('uploadStatus').textContent='Uploading '+(i+1)+' / '+count+' · '+item.file.name;
   $('meter').style.width=Math.round(100*i/count)+'%';
   try{
    const thumbnail=await thumb(item.file);
    const data=new FormData();data.append('image',item.file);data.append('thumbnail',thumbnail);
    for(const k of ['title','series','category','description','tags'])data.append(k,item[k]||'');
    await jsonOrThrow(await request('/api/admin/upload',{method:'POST',body:data}));
    success++;
   }catch(e){failures.push(item.file.name+': '+e.message);}
  }
  $('meter').style.width=Math.round(100*(success+failures.length)/count)+'%';
  if(!cancel&&success===count){queue=[];clearUrls();renderQueue();}
  else{
   const completed=success+failures.length;
   queue=queue.slice(completed);renderQueue();
  }
  $('uploadStatus').textContent=success+' drafts uploaded'+(failures.length?' · '+failures.length+' failed: '+failures.slice(0,3).join(' | '):'')+(cancel?' · Stopped early':'')+'. Drafts stay private until published.';
 }finally{uploading=false;$('startUpload').disabled=!queue.length;$('cancelUpload').disabled=true;renderQueue();}
}
async function preview(id,img){
 try{
  const res=await request('/api/admin/wallpapers/'+id+'/thumb');
  if(!res.ok)throw new Error('No thumbnail');
  img.src=blobUrl(await res.blob());
 }catch(_){img.alt='Preview unavailable';}
}
async function refresh(){
 if(!credential)return;
 $('manageStatus').textContent='Loading catalog…';const list=$('manageList');list.replaceChildren();clearUrls();
 try{
  const data=await jsonOrThrow(await request('/api/admin/list?status='+encodeURIComponent($('statusFilter').value)));
  adminItems=data.items||[];
  $('manageStatus').textContent=adminItems.length+' wallpapers in this view.';
  for(const item of adminItems){
   const row=node('div','manage-item');const img=document.createElement('img');img.alt='Private preview for '+item.title;
   preview(item.id,img);
   const meta=node('div','meta');meta.append(node('strong',null,item.title),node('small',null,(item.series||'No series')+' · '+item.category+' · '+item.status));
   const actions=node('div','manage-actions');
   const edit=node('button','secondary','Edit');edit.addEventListener('click',()=>openEdit(item));
   const publish=node('button','primary',item.status==='approved'?'Unpublish':'Publish');
   publish.addEventListener('click',()=>changeStatus(item,item.status==='approved'?'draft':'approved'));
   const remove=node('button','secondary','Remove');remove.addEventListener('click',()=>changeStatus(item,'removed'));
   actions.append(edit,publish,remove);row.append(img,meta,actions);list.append(row);
  }
 }catch(e){$('manageStatus').textContent=e.message;}
}
async function changeStatus(item,status){
 if(status==='removed'&&!confirm('Unpublish and mark "'+item.title+'" as removed?'))return;
 if(status==='approved'&&!confirm('Publish "'+item.title+'" for every visitor to view and download?'))return;
 try{
  await jsonOrThrow(await request('/api/admin/wallpapers/'+item.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}));
  refresh();
 }catch(e){$('manageStatus').textContent=e.message;}
}
function openEdit(item){
 editing=item;const dialog=$('editDialog');
 $('editTitle').value=item.title||'';$('editSeries').value=item.series||'';
 $('editDescription').value=item.description||'';$('editTags').value=(item.tags||[]).join(', ');
 $('editCategory').value=item.category||'other';$('editStatus').textContent='';
 preview(item.id,$('editPreview'));dialog.showModal();
}
async function saveEdit(e){
 e.preventDefault();if(!editing)return;
 const body={title:$('editTitle').value,series:$('editSeries').value,category:$('editCategory').value,
  description:$('editDescription').value,tags:$('editTags').value.split(',').map(t=>t.trim()).filter(Boolean)};
 try{
  await jsonOrThrow(await request('/api/admin/wallpapers/'+editing.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  $('editDialog').close();refresh();
 }catch(e){$('editStatus').textContent=e.message;}
}
function bind(){
 $('loginForm').addEventListener('submit',login);
 $('logout').addEventListener('click',logout);
 $('showUpload').addEventListener('click',()=>setPanel('upload'));
 $('showManage').addEventListener('click',()=>setPanel('manage'));
 $('statusFilter').addEventListener('change',refresh);
 $('refresh').addEventListener('click',refresh);
 $('files').addEventListener('change',e=>{selectFiles(e.target.files);e.target.value='';});
 $('folder').addEventListener('change',e=>{selectFiles(e.target.files);e.target.value='';});
 $('clearQueue').addEventListener('click',()=>{if(uploading)return;clearUrls();queue=[];renderQueue();});
 $('startUpload').addEventListener('click',uploadQueue);
 $('analyzeQueue').addEventListener('click',analyzeQueue);
 $('editAI').addEventListener('click',suggestForEdit);
 $('cancelUpload').addEventListener('click',()=>{cancel=true;$('uploadStatus').textContent='Stopping after current upload…';});
 $('editForm').addEventListener('submit',saveEdit);
 $('closeEdit').addEventListener('click',()=>$('editDialog').close());
 const box=$('dropzone');
 ['dragover','dragenter'].forEach(event=>box.addEventListener(event,e=>{e.preventDefault();box.classList.add('drag');}));
 ['drop','dragleave'].forEach(event=>box.addEventListener(event,e=>{e.preventDefault();box.classList.remove('drag');}));
 box.addEventListener('drop',e=>selectFiles(e.dataTransfer.files));
 for(const [key,val] of Object.entries(CATEGORIES))$('editCategory').append(new Option(val,key));
 window.addEventListener('pagehide',()=>{credential='';sessionExpiry=0;clearUrls();});
}
document.addEventListener('DOMContentLoaded',()=>{
 bind();
 if(!window.WAIFU_COMMUNITY_API)showOffline('Cloudflare R2 is not enabled or the API URL is not configured yet. This admin interface is prepared, but cannot authenticate or publish until the secure backend is online.');
});