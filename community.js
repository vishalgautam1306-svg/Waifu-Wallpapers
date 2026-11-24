'use strict';
const $ = id => document.getElementById(id);
const ALLOWED_CATEGORIES = {anime:'Anime',oled:'Dark / OLED',fantasy:'Fantasy',scifi:'Sci-Fi',other:'Other'};
const MAX_UPLOAD = 10 * 1024 * 1024;
let base = '', items = [], cursor = null, selected = null, uploadsEnabled = false, turnstileWidget = null, turnstileToken = '', busy = false;
function bytes(n){return n >= 1048576 ? (n/1048576).toFixed(2)+' MB' : Math.round(n/1024)+' KB';}
function api(path){return base+path;}
function info(message, bad=false){
  $('connectionState').textContent=message;
  const node=$('connectionState').closest('.notice');
  node.style.borderColor=bad?'rgba(255,105,120,.45)':'rgba(183,148,245,.25)';
}
function empty(title,desc){
  $('publicEmpty').hidden=false;
  $('emptyTitle').textContent=title;
  $('emptyDesc').textContent=desc;
  $('emptyUpload').hidden=!uploadsEnabled;
}
function uuid(){return crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+'-'+Math.random();}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function showItem(item){
  if(!/^[0-9a-f-]{36}$/i.test(item.id))return null;
  const card=document.createElement('button');card.type='button';card.className='wallcard';card.setAttribute('aria-label','View '+item.title);
  const box=document.createElement('div');box.className='image-wrap';
  const img=document.createElement('img');img.src=api('/api/wallpapers/'+item.id+'/thumb');img.alt=item.title;img.loading='lazy';img.decoding='async';
  const mask=document.createElement('span');mask.className='img-overlay';
  const chip=document.createElement('span');chip.className='chip';chip.textContent=ALLOWED_CATEGORIES[item.category]||'Artwork';
  const arrow=document.createElement('span');arrow.className='view';arrow.textContent='↗';
  box.append(img,mask,chip,arrow);
  const details=document.createElement('div');details.className='card-details';
  const title=document.createElement('h3');title.textContent=item.title;
  const sub=document.createElement('p');sub.textContent=item.width+' × '+item.height+' · Original stored';
  details.append(title,sub);card.append(box,details);
  card.addEventListener('click',()=>openItem(item));return card;
}
async function loadGallery(reset=false){
  if(!base)return;
  if(reset){items=[];cursor=null;$('publicGrid').replaceChildren();}
  const button=$('loadMore');button.disabled=true;button.textContent='Loading…';
  try{
    const response=await fetch(api('/api/gallery?limit=12'+(cursor?'&cursor='+encodeURIComponent(cursor):'')),{cache:'no-store'});
    if(!response.ok)throw new Error('Gallery API returned '+response.status);
    const data=await response.json();
    if(!Array.isArray(data.items))throw new Error('Invalid gallery response');
    const grid=$('publicGrid');
    for(const item of data.items){
      const card=showItem(item);
      if(card){items.push(item);grid.append(card);}
    }
    cursor=data.nextCursor||null;
    button.hidden=!cursor;
    if(items.length)$('publicEmpty').hidden=true;
    else empty('Nothing published yet.','Approved community wallpapers will appear here when the first submissions are reviewed.');
    info('Connected · '+items.length+' reviewed wallpaper'+(items.length===1?'':'s')+' loaded');
  }catch(e){
    info('Could not load public gallery: '+e.message,true);
    if(!items.length)empty('Public gallery unavailable','Your working local collection and AI Studio are still available.');
  }finally{button.disabled=false;button.textContent='Load more wallpapers ↓';}
}
function openItem(item){
  selected=item;
  $('publicTitle').textContent=item.title;
  $('publicCategory').textContent=(ALLOWED_CATEGORIES[item.category]||'Artwork').toUpperCase()+' · APPROVED';
  $('publicRes').textContent=item.width+' × '+item.height;
  $('publicSize').textContent=bytes(item.size);
  const img=$('publicImage');img.src=api('/api/wallpapers/'+item.id+'/thumb');img.alt=item.title;
  $('downloadStatus').textContent='Enhancement runs locally. Keep the AI tab open until it finishes.';
  $('publicDetail').showModal();
}
async function originalBlob(){
  if(!selected)throw new Error('No wallpaper selected');
  const url=api('/api/wallpapers/'+selected.id+'/original');
  const res=await fetch(url,{mode:'cors'});
  if(!res.ok)throw new Error('Download unavailable ('+res.status+')');
  const blob=await res.blob();
  if(!blob.size)throw new Error('Received an empty image');
  return blob;
}
function extension(mime){return mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp';}
async function galleryStoreImage(id,blob,item){
  // The existing AI Lab already reads this IndexedDB store. It preselects
  // the wallpaper without needing the user to choose the file again.
  const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open('waifu-wallpapers-preview',1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('wallpapers'))req.result.createObjectStore('wallpapers',{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('wallpapers','readwrite');
      tx.objectStore('wallpapers').put({
        id,title:item.title,filename:(item.title||'wallpaper').replace(/[^a-z0-9_-]+/gi,'_')+'.'+extension(blob.type),
        mime:blob.type||item.mime||'image/png',size:blob.size,width:item.width,height:item.height,
        category:item.category,createdAt:Date.now(),blob
      });
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }finally{db.close();}
}
async function action(kind){
  if(!selected||busy)return;busy=true;
  const id=selected.id,item=selected;
  const buttons=[$('publicOriginal'),$('public2x'),$('public4x')];buttons.forEach(b=>b.disabled=true);
  $('downloadStatus').textContent=kind==='original'?'Downloading original…':'Preparing wallpaper for our AI studio…';
  try{
    const blob=await originalBlob();
    if(kind==='original')downloadBlob(blob,'waifu-wallpapers-'+id+'.'+extension(blob.type||item.mime));
    else{
      const cacheId='community-'+id;
      await galleryStoreImage(cacheId,blob,item);
      location.href='./ai.html?fromGallery='+encodeURIComponent(cacheId)+'&scale='+(kind==='4x'?'4':'2');
      return;
    }
    $('downloadStatus').textContent='Original image downloaded.';
  }catch(e){$('downloadStatus').textContent='Unable to open wallpaper: '+e.message;}
  finally{busy=false;buttons.forEach(b=>b.disabled=false);}
}
async function generateThumb(file){
  const bitmap=await createImageBitmap(file);
  try{
    const factor=Math.min(1,480/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*factor));
    canvas.height=Math.max(1,Math.round(bitmap.height*factor));
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('Could not create preview thumbnail');
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const encode=(type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));
    let blob=await encode('image/webp',0.76);
    if(!blob||blob.type!=='image/webp')blob=await encode('image/jpeg',0.76);
    if(!blob)throw new Error('Cannot export a thumbnail');
    if(blob.size>350*1024){blob=await encode(blob.type,0.55);}
    if(!blob||blob.size>350*1024)throw new Error('Preview is too large; try a different image');
    return new File([blob],'preview.'+extension(blob.type),{type:blob.type});
  } finally{bitmap.close();}
}
async function maybeTurnstile(siteKey){
  if(!siteKey)return;
  for(let i=0;i<40;i++){
    if(window.turnstile && typeof window.turnstile.render==='function')break;
    await new Promise(r=>setTimeout(r,250));
  }
  if(!window.turnstile){$('submitStatus').textContent='Security verification could not load. Disable ad blockers and retry.';return;}
  turnstileWidget=window.turnstile.render('#turnstileBox',{
    sitekey:siteKey, theme:'dark',
    callback:token=>{turnstileToken=token;$('submitStatus').textContent='Verified. Ready to submit.';},
    'expired-callback':()=>{turnstileToken='';$('submitStatus').textContent='Verification expired; please verify again.';},
    'error-callback':()=>{turnstileToken='';$('submitStatus').textContent='Security verification could not complete.';}
  });
}
async function submit(ev){
  ev.preventDefault();
  if(busy||!uploadsEnabled)return;
  const file=$('submitImage').files?.[0];
  const status=$('submitStatus');
  if(!file){status.textContent='Select an image';return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>MAX_UPLOAD){status.textContent='Use PNG, JPG or WebP up to 10 MB';return;}
  if(!turnstileToken){status.textContent='Complete security verification first';return;}
  busy=true;$('submitButton').disabled=true;status.textContent='Preparing the preview…';
  try{
    const thumb=await generateThumb(file);
    const data=new FormData();
    data.append('image',file);data.append('thumbnail',thumb);
    data.append('title',$('submitTitle').value.trim().slice(0,90));
    data.append('category',$('submitCategory').value);
    data.append('cf-turnstile-response',turnstileToken);
    status.textContent='Sending original to private cloud storage…';
    const response=await fetch(api('/api/submissions'),{method:'POST',body:data});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Upload failed ('+response.status+')');
    $('submitForm').reset();
    $('submitStatus').textContent='Submitted successfully! Your image will appear publicly after review.';
    info('Submitted for review · New uploads do not appear publicly until approved');
  }catch(e){status.textContent=e.message;}
  finally{
    busy=false;$('submitButton').disabled=false;turnstileToken='';
    if(turnstileWidget!==null && window.turnstile)window.turnstile.reset(turnstileWidget);
  }
}
function modalSetup(){
  for(const id of ['uploadOpen','emptyUpload']) $(id).addEventListener('click',()=>{
    if(!uploadsEnabled){info('Public submissions are not enabled yet. Cloudflare setup is required.',true);return;}
    $('submitDialog').showModal();
  });
  $('submitClose').addEventListener('click',()=>$('submitDialog').close());
  $('publicClose').addEventListener('click',()=>$('publicDetail').close());
  $('submitForm').addEventListener('submit',submit);
  $('loadMore').addEventListener('click',()=>loadGallery(false));
  $('publicOriginal').addEventListener('click',()=>action('original'));
  $('public2x').addEventListener('click',()=>action('2x'));
  $('public4x').addEventListener('click',()=>action('4x'));
}
async function init(){
  modalSetup();
  const configured=String(window.WAIFU_COMMUNITY_API||'').trim().replace(/\/+$/,'');
  if(!configured) {
    info('Public backend is being set up · Your local gallery and AI Studio are still usable',true);
    empty('Cloud storage is not connected yet.','The Cloudflare Worker, R2 bucket and D1 database must be deployed before community uploads can go live.');
    return;
  }
  try{
    const url=new URL(configured);
    if(url.protocol!=='https:' && !(url.hostname==='localhost'||url.hostname==='127.0.0.1'))throw new Error('Secure HTTPS is required');
    base=url.origin+url.pathname.replace(/\/+$/,'');
    const health=await fetch(api('/api/health'));
    if(!health.ok)throw new Error('The backend is not responding');
    const configResp=await fetch(api('/api/config'));
    if(!configResp.ok)throw new Error('Could not read community configuration');
    const config=await configResp.json();
    uploadsEnabled=!!config.publicUploadsEnabled;
    $('uploadOpen').disabled=!uploadsEnabled;
    await loadGallery(true);
    if(uploadsEnabled)await maybeTurnstile(config.turnstileSiteKey);
    else $('submitStatus').textContent='Uploads are disabled until Turnstile is configured.';
  }catch(e){
    info('Community backend unavailable: '+e.message,true);
    empty('Backend connection required.','The community gallery will appear as soon as the Cloudflare service is configured.');
  }
}
document.addEventListener('DOMContentLoaded',init);
