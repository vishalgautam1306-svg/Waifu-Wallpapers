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
const MAX_BATCH_FILES=1000,QUEUE_PAGE_SIZE=25;
let queuePage=0;
const queuePreviewUrls=[];
let sessionExpiry=0,scanning=false;
let activeTagInput=null,tagSuggestions=[],savedTagPresets=[];
const TAG_PRESET_KEY='waifu-wallpapers-owner-tag-presets';
try{savedTagPresets=JSON.parse(localStorage.getItem(TAG_PRESET_KEY)||'[]')||[]}catch(_){savedTagPresets=[];}
let catalogPage=0,catalogNext=null,reportsPage=0,reportsNext=null,adminSearchTerm='',adminStatus='draft';
const urls=[];
function blobUrl(blob){const url=URL.createObjectURL(blob);urls.push(url);return url;}
function clearUrls(){for(const url of urls)URL.revokeObjectURL(url);urls.length=0;}
function releaseQueuePreviews(){for(const url of queuePreviewUrls)URL.revokeObjectURL(url);queuePreviewUrls.length=0;}
function escapeSource(name){return(name||"wallpaper").replace(/\.[^/.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();}
function proposed(file){
 const name=escapeSource(file.name),source=(file.webkitRelativePath||'')+' '+file.name;
 const series=SERIES.find(([_,re])=>re.test(source))?.[0]||'';
 const raw=source.toLowerCase();
 let category=series?"anime":/beach|ocean|sky|forest|sakura|mountain|landscape|garden/.test(raw)?"nature":/bedroom|aesthetic|pastel|rain|cozy|city/.test(raw)?"aesthetic":/oled|black|dark/.test(raw)?"oled":/cyberpunk|robot|mecha|sci-fi/.test(raw)?"scifi":"anime";
 const matches=["beach","ocean","bedroom","anime girl","night","sky","city","rain","forest","purple","blue","dark","cute","sunset","sakura","moon","stars","portrait"].filter(x=>raw.includes(x));
 const words=name.split(' ').filter(x=>x.length>3).slice(0,5).map(x=>x.toLowerCase());
 const tags=[...new Set([...(series?[series]:[]),...matches,...words])].slice(0,20).join(', ');
 return {title:name.slice(0,90)||"Untitled wallpaper",series,category,description:(name||"Wallpaper")+(series?" · "+series:""),tags,credit:"Waifu Wallpapers · AI-assisted artwork"};
}
function request(path,opts={}){
 if(!credential||Date.now()>=sessionExpiry){if(credential)logout();return Promise.reject(new Error('Admin session expired. Please sign in again.'));}
 return fetch(api+path,{...opts,headers:{...(opts.headers||{}),Authorization:'Bearer '+credential}});
}
async function jsonOrThrow(response){
 let body={};try{body=await response.json();}catch(_){}
 if(response.status===401&&credential){logout();throw new Error('Admin session expired or revoked. Sign in again.');}
 if(!response.ok)throw new Error(body.error||"Request failed: "+response.status);
 // The Worker renews active admin sessions for large sequential uploads.
 // Keep the in-memory client expiry aligned with successful authenticated requests.
 if(credential && sessionExpiry)sessionExpiry=Date.now()+30*60*1000;
 return body;
}
function setPanel(name){
 $('uploadPane').hidden=name!=='upload';$('managePane').hidden=name!=='manage';$('communityPane').hidden=name!=='community';$('reportsPane').hidden=name!=='reports';
 $('showUpload').classList.toggle('active',name==='upload');$('showManage').classList.toggle('active',name==='manage');$('showCommunity').classList.toggle('active',name==='community');$('showReports').classList.toggle('active',name==='reports');
 if(name==='manage')refresh();
 if(name==='community')loadCommunityAdmin();
 if(name==='reports')refreshReports();
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
  const deep=new URLSearchParams(location.search).get('wallpaper');
  if(deep){setPanel('manage');$('adminSearch').value=deep;await findCatalogWallpaper();}
  else setPanel('upload');
  loadTagSuggestions();
 }catch(e){credential='';sessionExpiry=0;$('loginState').textContent=e.message;}
}
function node(tag,cls,label){
 const n=document.createElement(tag);if(cls)n.className=cls;if(label!==undefined)n.textContent=label;return n;
}
function inputFor(row,key,label,max=100){
 const wrap=node('label');wrap.textContent=label;
 const inp=document.createElement('input');inp.value=row[key]||'';inp.maxLength=max;
 inp.addEventListener('change',()=>{row[key]=inp.value.trim().slice(0,max);});
 if(key==='tags')inp.addEventListener('focus',()=>{activeTagInput=inp;$('tagHelperStatus').textContent='Selected '+(row.title||'wallpaper')+'. Tap tags or presets below.';});
 wrap.append(inp);return wrap;
}
function renderQueue(){
 const list=$('queue');
 releaseQueuePreviews();
 list.replaceChildren();
 const total=queue.length,pageCount=Math.max(1,Math.ceil(total/QUEUE_PAGE_SIZE));
 queuePage=Math.max(0,Math.min(queuePage,pageCount-1));
 const start=queuePage*QUEUE_PAGE_SIZE,end=Math.min(total,start+QUEUE_PAGE_SIZE);
 const failed=queue.filter(x=>x.status==='failed').length;
 const remaining=total-failed;
 $('queueCount').textContent=total+' of '+MAX_BATCH_FILES+' wallpapers queued'+(failed?' · '+failed+' failed / retryable':'')+(remaining?' · '+remaining+' ready':'');
 $('queuePager').hidden=total<=QUEUE_PAGE_SIZE;
 $('queuePageLabel').textContent=total?'Showing '+(start+1)+'–'+end+' of '+total+' · Page '+(queuePage+1)+' / '+pageCount:'No queued wallpapers';
 $('queuePrev').disabled=uploading||queuePage===0;
 $('queueNext').disabled=uploading||queuePage>=pageCount-1;
 const frag=document.createDocumentFragment();
 for(let i=start;i<end;i++){
  const item=queue[i],card=node('div','queue-item');
  const img=document.createElement('img');
  img.loading='lazy';img.alt='Preview for '+item.file.name;
  const previewUrl=URL.createObjectURL(item.file);queuePreviewUrls.push(previewUrl);img.src=previewUrl;
  const fields=node('div','queue-fields');
  fields.append(inputFor(item,'title','Title',90),inputFor(item,'series','Series',100));
  const desc=inputFor(item,'description','Description',450);desc.classList.add('wide');fields.append(desc);
  const credit=inputFor(item,'credit','Artist / AI credit',110);credit.classList.add('wide');fields.append(credit);
  const tags=inputFor(item,'tags','Search tags (comma separated)',600);tags.classList.add('wide');fields.append(tags);
  const sel=document.createElement('select');sel.setAttribute('aria-label','Category for '+item.title);
  for(const [key,val] of Object.entries(CATEGORIES))sel.append(new Option(val,key));
  sel.value=item.category;sel.addEventListener('change',()=>{item.category=sel.value;});
  const info=node('div','queue-info');
  const path=node('span','file-path',(item.file.webkitRelativePath||item.file.name)+' · '+(item.file.size/1048576).toFixed(1)+' MB');
  const state=node('span','upload-state '+(item.status==='failed'?'failed':'pending'),item.status==='failed'?'Retry required':'Ready to upload');
  info.append(path,state);
  if(item.error)info.append(node('span','upload-error',item.error.slice(0,140)));
  card.append(img,fields,sel,info);
  if(uploading)for(const control of card.querySelectorAll('input,select'))control.disabled=true;
  frag.append(card);
 }
 list.append(frag);
 $('startUpload').disabled=!total||uploading||scanning;
 $('analyzeQueue').disabled=!queue.some(x=>!x.aiScanned)||uploading||scanning;
}
async function selectFiles(files){
 if(uploading||scanning)return;
 const selected=Array.from(files);
 if(!selected.length)return;
 const validTypes=new Set(['image/jpeg','image/png','image/webp']);
 const existing=new Set(queue.map(x=>(x.file.webkitRelativePath||x.file.name).toLowerCase()+'|'+x.file.size+'|'+x.file.lastModified));
 let duplicates=0,invalid=0,overLimit=0,added=0;
 for(const file of selected){
  if(!(validTypes.has(file.type)||(!file.type&&/\.(png|jpe?g|webp)$/i.test(file.name)))||file.size<100||file.size>15*1024*1024){invalid++;continue;}
  const key=(file.webkitRelativePath||file.name).toLowerCase()+'|'+file.size+'|'+file.lastModified;
  if(existing.has(key)){duplicates++;continue;}
  if(queue.length>=MAX_BATCH_FILES){overLimit++;continue;}
  existing.add(key);
  queue.push({file,...proposed(file),status:'pending',error:'',uploadRequestId:crypto.randomUUID(),aiScanned:false});
  added++;
 }
 renderQueue();
 $('uploadStatus').textContent=added+' wallpaper(s) added · '+queue.length+'/'+MAX_BATCH_FILES+' total'+
 (invalid?' · '+invalid+' skipped (format or 15 MB limit)':'')+
 (duplicates?' · '+duplicates+' already queued':'')+
 (overLimit?' · '+overLimit+' over the 1,000-file queue limit':'')+
 '. All files are kept as private drafts until you publish them.';
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
function setBulkProgress(attempted,total){
 const percentage=total?Math.round(attempted/total*100):0;
 $('meter').style.width=percentage+'%';
 $('uploadProgress').setAttribute('aria-valuenow',String(percentage));
}
async function uploadQueue(){
 if(uploading||scanning||!queue.length)return;
 const work=queue.filter(item=>item.status!=='uploaded');
 if(!work.length)return;
 uploading=true;cancel=false;
 let attempted=0,success=0;
 const failures=[],count=work.length;
 setBulkProgress(0,count);renderQueue();$('cancelUpload').disabled=false;
 try{
  for(const item of work){
   if(cancel)break;
   $('uploadStatus').textContent='Uploading '+(attempted+1)+' / '+count+' · '+(item.file.webkitRelativePath||item.file.name)+
    ' · '+success+' uploaded'+(failures.length?' · '+failures.length+' failed':'')+'. Keep this tab open.';
   try{
    const thumbnail=await thumb(item.file);
    const data=new FormData();
    data.append('image',item.file);
    data.append('thumbnail',thumbnail);
    data.append('upload_request_id',item.uploadRequestId);
    for(const k of ['title','series','category','description','tags','credit'])data.append(k,item[k]||'');
    await jsonOrThrow(await request('/api/admin/upload',{method:'POST',body:data}));
    item.status='uploaded';item.error='';success++;
   }catch(e){
    item.status='failed';item.error=String(e?.message||'Upload failed');
    failures.push((item.file.webkitRelativePath||item.file.name)+': '+item.error);
    // Once the session expires, stop automatically instead of turning 900 files into failures.
    if(!credential||/session expired|sign in again|admin session|access denied/i.test(item.error)){
     cancel=true;
    }
   }
   attempted++;setBulkProgress(attempted,count);
   if(attempted%20===0)renderQueue();
  }
 }finally{
  // Successfully uploaded files must NEVER be re-uploaded when retrying the remainder.
  queue=queue.filter(item=>item.status!=='uploaded');
  queuePage=Math.min(queuePage,Math.max(0,Math.ceil(queue.length/QUEUE_PAGE_SIZE)-1));
  uploading=false;$('cancelUpload').disabled=true;
  renderQueue();
  const pending=queue.filter(x=>x.status!=='failed').length;
  $('uploadStatus').textContent=success+' draft(s) uploaded this run'+
   (failures.length?' · '+failures.length+' failed and kept for retry':'')+
   (pending?' · '+pending+' not yet attempted':'')+
   (cancel?' · stopped (or session needs sign-in)':'')+
   '. '+(queue.length?'Use Upload drafts securely again to retry/continue.':'All selected wallpapers uploaded as private drafts.');
  if(!queue.length)setBulkProgress(count,count);
 }
}

async function refresh(){
 if(!credential)return;
 $('manageStatus').textContent='Searching your catalog…';
 const list=$('manageList');list.replaceChildren();
 const p=new URLSearchParams({status:adminStatus,page:String(catalogPage)});
 if(adminSearchTerm)p.set('q',adminSearchTerm);
 try{
  const data=await jsonOrThrow(await request('/api/admin/list?'+p));
  adminItems=data.items||[];catalogNext=data.nextPage;
  $('manageStatus').textContent=adminItems.length
    ?'Showing '+adminItems.length+' wallpapers on page '+(catalogPage+1)+(adminSearchTerm?' for "'+adminSearchTerm+'"':'')+'.'
    :'No matches. Try another title, series, tag, or paste the full wallpaper link.';
  for(const item of adminItems){
   const row=node('div','manage-item');
   const img=document.createElement('img');img.alt='Private preview of '+item.title;
   preview(item.id,img);
   const meta=node('div','meta');
   meta.append(node('strong',null,item.title),
    node('small',null,(item.series||'No series')+' · '+item.category+' · '+item.status),
    node('small',null,'ID '+item.id));
   const actions=node('div','manage-actions');
   const edit=node('button','secondary','✎ Edit details');edit.type='button';edit.addEventListener('click',()=>openEdit(item));
   const publish=node('button','primary',item.status==='approved'?'Unpublish':'Publish');
   publish.type='button';publish.addEventListener('click',()=>changeStatus(item,item.status==='approved'?'draft':'approved'));
   // "Remove" hides it from the public archive; actual storage deletion is a separate irreversible step.
   if(item.status==='removed'){
    const purge=node('button','secondary permanent-delete','Delete permanently');
    purge.type='button';purge.title='Delete original and thumbnail from Cloudflare R2 plus database record';
    purge.addEventListener('click',()=>permanentlyDelete(item));
    actions.append(edit,publish,purge);
   }else{
    const remove=node('button','secondary','Remove from catalog');
    remove.type='button';remove.title='Unpublish and move to Removed. Files remain in storage until permanently deleted.';
    remove.addEventListener('click',()=>changeStatus(item,'removed'));
    actions.append(edit,publish,remove);
   }
   row.append(img,meta,actions);list.append(row);
  }
  updateCatalogPagination();
 }catch(e){$('manageStatus').textContent='Cannot search catalog: '+e.message;catalogNext=null;updateCatalogPagination();}
}
async function findCatalogWallpaper(){
 const raw=$('adminSearch').value.trim();
 adminSearchTerm=normalizeLookup(raw);
 $('statusFilter').value='all';adminStatus='all';catalogPage=0;
 await refresh();
 // For an exact public URL or UUID, open the correct record without searching pages.
 if(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(adminSearchTerm)){
  try{
   const result=await jsonOrThrow(await request('/api/admin/wallpapers/'+adminSearchTerm));
   if(result.item)openEdit(result.item);
  }catch(e){$('manageStatus').textContent='Could not open exact wallpaper: '+e.message;}
 }
}
function clearCatalogSearch(){
 $('adminSearch').value='';adminSearchTerm='';catalogPage=0;
 $('statusFilter').value='all';adminStatus='all';refresh();
}
async function refreshReports(){
 if(!credential)return;
 const list=$('reportsList');list.replaceChildren();
 $('reportsFeedback').textContent='Loading reports…';
 const params=new URLSearchParams({status:$('reportsStatus').value,page:String(reportsPage)});
 try{
  const result=await jsonOrThrow(await request('/api/admin/reports?'+params));
  reportsNext=result.nextPage;
  const reports=result.items||[];
  $('reportsFeedback').textContent=reports.length?reports.length+' reports on this page.':'No reports in this view.';
  for(const report of reports){
   const row=node('article','report-item');
   const header=node('div','report-item-head');
   header.append(node('strong',null,report.title),node('small',null,new Date(report.createdAt).toLocaleString()));
   const reasonMap={wrong_details:'Wrong title / anime',wrong_tags:'Wrong category / tags',broken_image:'Broken download / image',copyright:'Copyright / ownership',other:'Other'};
   const desc=node('p',null,(reasonMap[report.reason]||report.reason)+(report.note?' — '+report.note:''));
   const status=node('small',null,'Report '+report.status+' · Artwork '+report.wallpaperId);
   const actions=node('div','manage-actions');
   const edit=node('button','primary','✎ Open exact wallpaper');
   edit.type='button';edit.addEventListener('click',()=>openReportArtwork(report.wallpaperId));
   const link=document.createElement('a');link.href='./index.html?wallpaper='+encodeURIComponent(report.wallpaperId);
   link.target='_blank';link.rel='noopener noreferrer';link.className='secondary';link.textContent='View public page';
   const resolve=node('button','secondary','✓ Resolved');resolve.type='button';resolve.disabled=report.status==='resolved';
   resolve.addEventListener('click',()=>updateReportStatus(report.id,'resolved'));
   const dismiss=node('button','secondary','Dismiss');dismiss.type='button';dismiss.disabled=report.status==='dismissed';
   dismiss.addEventListener('click',()=>updateReportStatus(report.id,'dismissed'));
   actions.append(edit,link,resolve,dismiss);
   row.append(header,desc,status,actions);list.append(row);
  }
  $('reportsPageCount').textContent='Page '+(reportsPage+1);
  $('reportsPrev').disabled=reportsPage===0;$('reportsNext').disabled=reportsNext===null;
 }catch(e){$('reportsFeedback').textContent='Reports unavailable: '+e.message;reportsNext=null;$('reportsNext').disabled=true;}
}
async function openReportArtwork(id){
 try{
  const data=await jsonOrThrow(await request('/api/admin/wallpapers/'+encodeURIComponent(id)));
  if(data.item)openEdit(data.item);
 }catch(e){$('reportsFeedback').textContent='Cannot open wallpaper: '+e.message;}
}
async function updateReportStatus(id,status){
 try{
  await jsonOrThrow(await request('/api/admin/reports/'+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}));
  await refreshReports();
 }catch(e){$('reportsFeedback').textContent='Could not update report: '+e.message;}
}
async function permanentlyDelete(item){
 if(item.status!=='removed')return;
 const response=prompt('PERMANENT DELETION: This destroys both Cloudflare R2 image files AND the catalog record. It cannot be undone.\n\nWallpaper: '+item.title+'\n\nType DELETE to confirm:');
 if(response!=='DELETE')return;
 if(!confirm('Final confirmation: permanently delete "'+item.title+'"?'))return;
 $('manageStatus').textContent='Permanently deleting '+item.title+' from Cloudflare R2 and D1…';
 try{
  const result=await jsonOrThrow(await request('/api/admin/wallpapers/'+encodeURIComponent(item.id),{method:'DELETE'}));
  $('manageStatus').textContent=result.message||'Wallpaper permanently deleted.';
  await refresh();
 }catch(e){$('manageStatus').textContent='Permanent deletion failed: '+e.message+' (check Removed status and retry).';}
}
async function changeStatus(item,status){
 if(status==='removed'&&!confirm('Move "'+item.title+'" to Removed? This hides it publicly but DOES NOT delete cloud files. To permanently erase it, open Removed and click Delete permanently.'))return;
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
 $('editCategory').value=item.category||'other';$('editCredit').value=item.credit||'Waifu Wallpapers · AI-assisted artwork';$('editStatus').textContent='';
 renderTagTools();
 $('editArtworkId').textContent='Wallpaper ID: '+item.id;
 preview(item.id,$('editPreview'));dialog.showModal();
}
async function saveEdit(e){
 e.preventDefault();if(!editing)return;
 const body={title:$('editTitle').value,series:$('editSeries').value,category:$('editCategory').value,
  description:$('editDescription').value,tags:$('editTags').value.split(',').map(t=>t.trim()).filter(Boolean),credit:$('editCredit').value};
 try{
  await jsonOrThrow(await request('/api/admin/wallpapers/'+editing.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  $('editDialog').close();refresh();
 }catch(e){$('editStatus').textContent=e.message;}
}
async function loadCommunityAdmin(){
 if(!credential)return;
 $('communityAdminStatus').textContent="Loading community settings…";
 try{
  const settings=await jsonOrThrow(await request('/api/admin/community/settings'));
  $('adminChatEnabled').value=String(Boolean(settings.settings?.chat_enabled));
  $('adminPollsEnabled').value=String(Boolean(settings.settings?.polls_enabled));
  $('communityAdminStatus').textContent=settings.settings?.chat_enabled?'Global chat is open. Check reports regularly.':'Global chat is locked. Guests cannot post.';
  await Promise.all([loadAdminPolls(),loadAdminMessages()]);
 }catch(e){$('communityAdminStatus').textContent="Community tools unavailable: "+e.message;}
}
async function saveCommunitySettings(){
 const chatEnabled=$('adminChatEnabled').value==='true',pollsEnabled=$('adminPollsEnabled').value==='true';
 if(chatEnabled&&!confirm('Open public global chat? Anonymous visitors will be able to post. Monitor for spam and close the room when needed.'))return;
 try{
  await jsonOrThrow(await request('/api/admin/community/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatEnabled,pollsEnabled})}));
  $('communityAdminStatus').textContent='Settings saved. Global chat is '+(chatEnabled?'OPEN':'LOCKED')+'. Poll voting is '+(pollsEnabled?'enabled':'closed')+'.';
 }catch(e){$('communityAdminStatus').textContent='Could not update settings: '+e.message;}
}
async function createPoll(event){
 event.preventDefault();
 const question=$('newPollQuestion').value.trim();
 const options=$('newPollOptions').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(question.length<8||options.length<2||options.length>6){$('pollAdminStatus').textContent='Use a meaningful question and 2–6 unique options, each on a new line.';return;}
 try{
  await jsonOrThrow(await request('/api/admin/community/polls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,options})}));
  $('newPollQuestion').value='';$('newPollOptions').value='';
  $('pollAdminStatus').textContent='Poll published! Visitors can now vote on the Community page.';await loadAdminPolls();
 }catch(e){$('pollAdminStatus').textContent='Poll not published: '+e.message;}
}
async function loadAdminPolls(){
 const container=$('adminPollList');container.replaceChildren();
 try{
  const data=await jsonOrThrow(await request('/api/community/polls'));
  for(const poll of data.items||[]){
   const row=node('div','moderation-item');
   row.append(node('strong',null,poll.question),node('small',null,poll.status+' · '+poll.totalVotes+' votes · '+(poll.options||[]).join(' / ')));
   const button=node('button','secondary',poll.status==='active'?'Close voting':'Reopen voting');
   button.type='button';
   button.addEventListener('click',()=>changePollState(poll.id,poll.status==='active'?'closed':'active'));
   row.append(button);container.append(row);
  }
  if(!container.childElementCount)container.append(node('p',null,'No polls created yet.'));
 }catch(e){container.append(node('p',null,'Could not load polls: '+e.message));}
}
async function changePollState(id,status){
 try{
  await jsonOrThrow(await request('/api/admin/community/polls/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}));
  await loadAdminPolls();
 }catch(e){$('pollAdminStatus').textContent=e.message;}
}
async function loadAdminMessages(){
 const container=$('adminChatList');container.replaceChildren();
 try{
  const data=await jsonOrThrow(await request('/api/admin/community/messages'));
  for(const msg of data.items||[]){
   const row=node('div','moderation-item');
   row.append(node('strong',null,msg.nickname+' · '+new Date(msg.createdAt).toLocaleString()));
   row.append(node('p',null,msg.body));
   row.append(node('small',null,msg.status+' · '+msg.reports+' report(s)'));
   const button=node('button','secondary',msg.status==='visible'?'Hide message':'Restore message');
   button.type='button';
   button.addEventListener('click',()=>moderateMessage(msg.id,msg.status==='visible'?'hidden':'visible'));
   row.append(button);container.append(row);
  }
  if(!container.childElementCount)container.append(node('p',null,'No chat messages yet.'));
 }catch(e){container.append(node('p',null,'Could not load chat: '+e.message));}
}
async function moderateMessage(id,status){
 try{
  await jsonOrThrow(await request('/api/admin/community/messages/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}));
  await loadAdminMessages();
 }catch(e){$('communityAdminStatus').textContent=e.message;}
}

const STATIC_TAGS=["anime girl","anime boy","night","moon","forest","beach","ocean","bedroom","landscape","city","neon","rain","purple","blue","sunset","sakura","stars","oled","portrait","4k"];
function splitTags(value){
 return [...new Set(String(value||"").split(',').map(t=>t.trim().replace(/^#/,'').toLowerCase()).filter(Boolean))].slice(0,25);
}
function currentTagInput(){return $('editDialog')?.open?$('editTags'):(activeTagInput?.isConnected?activeTagInput:null);}
function insertTags(values){
 const field=currentTagInput();
 if(!field){$('tagHelperStatus').textContent='Click a wallpaper Tags field first, then choose tags.';return;}
 const list=splitTags([...splitTags(field.value),...splitTags(Array.isArray(values)?values.join(','):values)].join(','));
 field.value=list.join(', ');
 field.dispatchEvent(new Event('change',{bubbles:true}));
 if($('editDialog')?.open)$('editStatus').textContent='Tags added. Click Save metadata to keep changes.';
 else $('tagHelperStatus').textContent='Tags added to selected wallpaper.';
}
function storeTagPresets(){try{localStorage.setItem(TAG_PRESET_KEY,JSON.stringify(savedTagPresets.slice(0,20)));}catch(_){}}
function saveCurrentTagPreset(name){
 const field=currentTagInput(),tags=splitTags(field?.value||'');
 name=String(name||'').trim().slice(0,40);
 const notice=$('editDialog')?.open?$('editStatus'):$('tagHelperStatus');
 if(!name||!tags.length){notice.textContent='Select a Tags field containing tags and enter a preset name.';return;}
 savedTagPresets=[{name,tags},...savedTagPresets.filter(p=>p.name.toLowerCase()!==name.toLowerCase())].slice(0,20);
 storeTagPresets();renderTagTools();$('presetName').value='';
 notice.textContent='Saved "'+name+'" as a reusable tag preset on this device.';
}
function renderTagTools(){
 const popular=[...new Set([...tagSuggestions.map(x=>x.tag),...STATIC_TAGS])].slice(0,35);
 for(const id of ['uploadTagSuggestions','editTagSuggestions']){
  const root=$(id);root.replaceChildren();
  for(const tag of popular){
   const b=node('button','tag-chip','#'+tag);b.type='button';b.title='Add '+tag+' to selected Tags field';
   b.addEventListener('click',()=>insertTags([tag]));root.append(b);
  }
 }
 for(const id of ['tagPresetList','editTagPresetList']){
  const root=$(id);root.replaceChildren();
  for(const preset of savedTagPresets){
   if(!preset||!Array.isArray(preset.tags))continue;
   const row=node('div','tag-preset');
   const add=node('button','tag-preset-apply',preset.name+' · '+preset.tags.length+' tags');add.type='button';add.title=preset.tags.join(', ');
   add.addEventListener('click',()=>insertTags(preset.tags));
   const del=node('button','tag-preset-remove','×');del.type='button';del.title='Delete tag preset';
   del.addEventListener('click',()=>{savedTagPresets=savedTagPresets.filter(x=>x.name!==preset.name);storeTagPresets();renderTagTools();});
   row.append(add,del);root.append(row);
  }
  if(!root.children.length)root.append(node('span','tag-empty','No saved sets yet.'));
 }
}
async function loadTagSuggestions(){
 renderTagTools();
 if(!credential)return;
 try{const result=await jsonOrThrow(await request('/api/admin/tags'));tagSuggestions=Array.isArray(result.items)?result.items.filter(x=>x&&typeof x.tag==='string'):[];renderTagTools();}
 catch(_){$('tagHelperStatus').textContent='Using standard tags. The cloud tag history is unavailable.';}
}
function applyBulkTags(){
 const toAdd=splitTags($('bulkTags').value);
 if(!queue.length||!toAdd.length){$('tagHelperStatus').textContent='Select wallpapers and enter some tags first.';return;}
 if(queue.length>10&&!confirm('Apply '+toAdd.length+' tags to ALL '+queue.length+' queued wallpapers?'))return;
 for(const item of queue)item.tags=splitTags([...splitTags(item.tags),...toAdd].join(',')).join(', ');
 renderQueue();$('tagHelperStatus').textContent='Added tags to '+queue.length+' queued wallpapers. Review them before uploading.';
}

function bind(){
 $('loginForm').addEventListener('submit',login);
 $('logout').addEventListener('click',logout);
 $('showUpload').addEventListener('click',()=>setPanel('upload'));
 $('showManage').addEventListener('click',()=>setPanel('manage'));
 $('showReports').addEventListener('click',()=>setPanel('reports'));
 $('adminSearchForm').addEventListener('submit',e=>{e.preventDefault();findCatalogWallpaper();});
 $('clearAdminSearch').addEventListener('click',clearCatalogSearch);
 $('adminPrev').addEventListener('click',()=>{if(catalogPage>0){catalogPage--;refresh();}});
 $('adminNext').addEventListener('click',()=>{if(catalogNext!==null){catalogPage=catalogNext;refresh();}});
 $('reportsStatus').addEventListener('change',()=>{reportsPage=0;refreshReports();});
 $('refreshReports').addEventListener('click',refreshReports);
 $('reportsPrev').addEventListener('click',()=>{if(reportsPage>0){reportsPage--;refreshReports();}});
 $('reportsNext').addEventListener('click',()=>{if(reportsNext!==null){reportsPage=reportsNext;refreshReports();}});
 $('copyArtworkLink').addEventListener('click',()=>{
   if(!editing)return;
   const url=new URL('./wallpaper.html?id='+encodeURIComponent(editing.id),location.href).href;
   if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(()=>{$('editStatus').textContent='Public wallpaper link copied.'}).catch(()=>prompt('Copy this link:',url));
   else prompt('Copy this link:',url);
 });
 $('showCommunity').addEventListener('click',()=>setPanel('community'));
 $('saveCommunitySettings').addEventListener('click',saveCommunitySettings);
 $('pollCreateForm').addEventListener('submit',createPoll);
 $('refreshModeration').addEventListener('click',loadAdminMessages);
 $('statusFilter').addEventListener('change',()=>{adminStatus=$('statusFilter').value;catalogPage=0;refresh();});
 $('refresh').addEventListener('click',refresh);
 $('queuePrev').addEventListener('click',()=>{if(!uploading&&queuePage>0){queuePage--;renderQueue();}});
 $('queueNext').addEventListener('click',()=>{if(!uploading&&(queuePage+1)*QUEUE_PAGE_SIZE<queue.length){queuePage++;renderQueue();}});
 $('files').addEventListener('change',e=>{selectFiles(e.target.files);e.target.value='';});
 $('folder').addEventListener('change',e=>{selectFiles(e.target.files);e.target.value='';});
 $('clearQueue').addEventListener('click',()=>{
  if(uploading)return;
  if(queue.length&&!confirm('Clear '+queue.length+' not-yet-uploaded file(s) from this browser queue? This does not affect uploaded drafts.'))return;
  queue=[];queuePage=0;releaseQueuePreviews();setBulkProgress(0,0);renderQueue();$('uploadStatus').textContent='Queue cleared.';
 });
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
 $('applyBulkTags').addEventListener('click',applyBulkTags);
 $('saveTagPreset').addEventListener('click',()=>saveCurrentTagPreset($('presetName').value.trim()));
 $('saveEditTagPreset').addEventListener('click',()=>{
  const name=prompt('Name this reusable tag set (for example, Ocean scenes):');
  if(name)saveCurrentTagPreset(name.trim());
 });
 $('editTags').addEventListener('focus',()=>{activeTagInput=$('editTags');});
 $('editDialog').addEventListener('click',event=>{
  const d=$('editDialog');
  if(event.target!==d)return;
  const r=d.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)d.close();
 });
 renderTagTools();
 window.addEventListener('beforeunload',event=>{
  if(uploading){event.preventDefault();event.returnValue='';}
 });
 window.addEventListener('pagehide',()=>{credential='';sessionExpiry=0;releaseQueuePreviews();clearUrls();});
}
document.addEventListener('DOMContentLoaded',()=>{
 bind();
 if(!window.WAIFU_COMMUNITY_API)showOffline('Cloudflare R2 is not enabled or the API URL is not configured yet. This admin interface is prepared, but cannot authenticate or publish until the secure backend is online.');
});