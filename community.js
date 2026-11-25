'use strict';
const $=id=>document.getElementById(id);
const CATS={"anime":"Anime","manga":"Manga & comics","gaming":"Games","oled":"OLED / Dark","fantasy":"Fantasy","scifi":"Sci-Fi","cyberpunk":"Cyberpunk","space":"Space & cosmos","nature":"Nature & scenery","cityscapes":"Cities & skylines","aesthetic":"Aesthetic","minimal":"Minimal","abstract":"Abstract","movies":"Movies & TV","3d":"3D art","cars":"Cars & vehicles","animals":"Animals","architecture":"Architecture","photography":"Photography","digitalart":"Digital art","horror":"Horror","kawaii":"Cute / Kawaii","seasonal":"Seasonal","sports":"Sports","other":"Other"};
const FAV_KEY='waifu-wallpapers-public-favorites';
const favoritesPage=/\/library\.html$/.test(location.pathname);
let api='',items=[],page=null,busy=false,selected=null,onlyFavorites=favoritesPage,favorites={};
let modalSequence=[],viewerIndex=0,loadingShared=false,swipeStart=null,requestSeq=0;
try{favorites=JSON.parse(localStorage.getItem(FAV_KEY)||'{}')||{};}catch(_){favorites={};}
function saveFavorites(){try{localStorage.setItem(FAV_KEY,JSON.stringify(favorites));}catch(_){}}
function favorite(item){
 if(favorites[item.id])delete favorites[item.id];else favorites[item.id]=item;
 saveFavorites();
 if(selected?.id===item.id)updateFavoriteButton();
 render();
}
function updateFavoriteButton(){$('publicFavorite').textContent=favorites[selected?.id]?'♥ Remove favorite':'♡ Save favorite';}
function bytes(n){return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' KB';}
function info(message,failed=false){$('connectionState').textContent=message;$('connectionState').closest('.notice').style.borderColor=failed?'#d5658e':'#b49aec66';}
function empty(title,desc){$('publicEmpty').hidden=false;$('emptyTitle').textContent=title;$('emptyDesc').textContent=desc;}
function src(id,kind='thumb'){return api+'/api/wallpapers/'+encodeURIComponent(id)+'/'+kind;}
function buildCard(item){
 const card=document.createElement('button');card.type='button';card.className='wallcard';
 if(item.width && item.height) card.classList.add(item.height>item.width*1.12?'portrait-art':item.width>item.height*1.12?'landscape-art':'square-art');
 card.setAttribute('aria-label','Preview '+item.title);
 const box=document.createElement('div');box.className='image-wrap';
 const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.alt=item.title;img.src=src(item.id);
 if(item.width>0&&item.height>0)img.style.aspectRatio=item.width+' / '+item.height;
 const overlay=document.createElement('span');overlay.className='img-overlay';
 const chip=document.createElement('span');chip.className='chip';chip.textContent=CATS[item.category]||'Artwork';
 const arrow=document.createElement('span');arrow.className='view';arrow.textContent='↗';
 box.append(img,overlay,chip,arrow);
 const details=document.createElement('div');details.className='card-details';
 const title=document.createElement('h3');title.textContent=item.title;
 const sub=document.createElement('p');sub.textContent=(item.series?item.series+' · ':'')+item.width+' × '+item.height+(favorites[item.id]?' · ♥':'');
 details.append(title,sub);card.append(box,details);
 card.addEventListener('click',()=>openDetail(item));return card;
}
function visibleItems(){return onlyFavorites?Object.values(favorites):items;}
function render(){
 const grid=$('publicGrid');grid.replaceChildren();
 let data=visibleItems();
 for(const item of data)if(item&&item.id&&/^[0-9a-f-]{36}$/i.test(item.id))grid.append(buildCard(item));
 const has=grid.children.length>0;
 $('publicEmpty').hidden=has;
 if(!has)empty(onlyFavorites?'No saved favorites yet.':'No wallpapers in this view.',onlyFavorites?'Tap a wallpaper and choose Save favorite. These bookmarks stay in this browser.':'Published wallpapers will appear here after an admin approves them.');
 $('loadMore').hidden=onlyFavorites||page===null;
 $('publicFavorites').classList.toggle('active',onlyFavorites);
}
function parameters(n){const q=new URLSearchParams({limit:'24',page:String(n)});const search=$('publicSearch').value.trim(),cat=$('publicCategory').value,tag=$('publicTag').value.trim(),orient=$('publicOrient').value;if(search)q.set('q',search);if(cat)q.set('category',cat);if(tag)q.set('tag',tag);if(orient)q.set('orientation',orient);return q.toString();}
async function load(reset=false){
 if(!api)return;
 if(reset){items=[];page=0;}
 const next=page;
 if(next===null)return;
 const seq=++requestSeq;
 const button=$('loadMore');button.disabled=true;
 try{
  const response=await fetch(api+'/api/gallery?'+parameters(next),{cache:'no-store'});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'API returned '+response.status);
  if(!Array.isArray(result.items))throw new Error('Invalid gallery response');
  if(seq!==requestSeq)return;
  const known=new Set(items.map(x=>x.id));
  for(const item of result.items)if(!known.has(item.id)){items.push(item);known.add(item.id);}
  page=result.nextPage===null?null:result.nextPage;
  info('Public gallery connected · '+items.length+' artworks loaded');
 }catch(e){info('Public gallery unavailable: '+e.message,true);page=null;}
 finally{button.disabled=false;button.textContent='Load more wallpapers ↓';render();}
}
function relatedRank(x,chosen){
 if(!x||x.id===chosen.id)return -1000;
 const ax=new Set((chosen.tags||[]).map(t=>String(t).trim().toLowerCase()).filter(Boolean));
 const overlap=(x.tags||[]).filter(t=>ax.has(String(t).trim().toLowerCase())).length;
 return (chosen.series&&x.series&&chosen.series.toLowerCase()===x.series.toLowerCase()?12:0)
    +(chosen.category===x.category?5:0)+overlap*2
    +(Math.abs((x.width/x.height)-(chosen.width/chosen.height))<0.3?1:0);
}
function renderRelated(item,remote){
 const target=$('viewerRelated');target.replaceChildren();
 const candidates=Array.isArray(remote)?[...remote,...items,...Object.values(favorites)]:[...items,...Object.values(favorites)];
 const relevant=candidates.filter((x,i,arr)=>x?.id&&arr.findIndex(y=>y?.id===x.id)===i&&x.id!==item.id)
  .sort((a,b)=>relatedRank(b,item)-relatedRank(a,item)).slice(0,6);
 for(const x of relevant){
  const btn=document.createElement('button');btn.type='button';btn.className='related-tile';
  const img=document.createElement('img');img.alt=x.title;img.loading='lazy';img.src=src(x.id);
  const title=document.createElement('span');title.textContent=x.title;
  btn.append(img,title);btn.addEventListener('click',()=>openDetail(x));target.append(btn);
 }
 target.parentElement.hidden=!relevant.length;
}
async function updateRelated(item){
 if(!api)return;
 try{
  const response=await fetch(api+'/api/wallpapers/'+encodeURIComponent(item.id)+'/related');
  if(!response.ok)return;
  const payload=await response.json();
  if(selected?.id!==item.id)return;
  renderRelated(item,Array.isArray(payload.items)?payload.items:[]);
 }catch(_){}
}
function navigateViewer(delta){
 if(!selected)return;
 modalSequence=visibleItems().filter(x=>x?.id);
 if(modalSequence.length<2)return;
 viewerIndex=modalSequence.findIndex(x=>x.id===selected.id);
 if(viewerIndex<0)viewerIndex=0;
 const next=(viewerIndex+delta+modalSequence.length)%modalSequence.length;
 openDetail(modalSequence[next]);
}
function shareCurrent(){
 if(!selected)return;
 const url=new URL(location.href);url.searchParams.set('wallpaper',selected.id);
 const value=url.toString();
 if(navigator.share){navigator.share({title:selected.title,url:value}).catch(()=>{});return;}
 if(navigator.clipboard?.writeText){navigator.clipboard.writeText(value).then(()=>{$('downloadStatus').textContent='Wallpaper link copied.'}).catch(()=>{prompt('Copy wallpaper link:',value);});return;}
 prompt('Copy wallpaper link:',value);
}
async function openShared(){
 if(loadingShared||!api)return;
 const id=new URLSearchParams(location.search).get('wallpaper');
 if(!id||!/^[-a-f\d]{36}$/i.test(id))return;
 loadingShared=true;
 try{
  let item=[...items,...Object.values(favorites)].find(x=>x?.id===id);
  if(!item){const r=await fetch(api+'/api/wallpapers/'+encodeURIComponent(id));if(r.ok)item=await r.json();}
  if(item)openDetail(item);
 }catch(e){console.warn('Shared wallpaper link not available',e);}
 finally{loadingShared=false;}
}
function openDetail(item){
 selected=item;
 modalSequence=visibleItems().filter(x=>x?.id);
 viewerIndex=modalSequence.findIndex(x=>x.id===item.id);
 if(viewerIndex<0)viewerIndex=0;
 $('viewerPosition').textContent=modalSequence.length>1?(viewerIndex+1)+' / '+modalSequence.length:'';
 for(const key of ['viewerPrev','viewerNext','viewerPrevSmall','viewerNextSmall'])$(key).disabled=modalSequence.length<2;
 renderRelated(item);
 updateRelated(item);
 const dialog=$('publicDetail');
 $('publicTitle').textContent=item.title;
 $('publicDetailCategory').textContent=[CATS[item.category]||'Artwork',item.series].filter(Boolean).join('  ·  ');
 const width=Number(item.width)||0, height=Number(item.height)||0;
 const res=width&&height?width+' × '+height:'Unknown';
 $('publicRes').textContent=res;
 $('publicArtResolution').textContent=res;
 $('publicSize').textContent=bytes(item.size||0);
 $('publicOrientation').textContent=!width||!height?'Unknown':width>height*1.12?'Landscape':height>width*1.12?'Portrait':'Square';
 $('publicFormat').textContent=({ 'image/jpeg':'JPEG','image/png':'PNG','image/webp':'WebP' })[item.mime]||'Image';
 $('publicDescription').textContent=item.description||'';
 const originalUrl=src(item.id,'original'),thumbUrl=src(item.id,'thumb');
 const image=$('publicImage');
 image.onerror=()=>{image.onerror=null;image.src=thumbUrl};
 image.src=originalUrl;
 image.alt=item.title+' — full wallpaper preview';
 $('viewerAmbient').style.setProperty('--viewer-bg','url("'+thumbUrl+'")');
 $('publicExpand').href=originalUrl;
 const tags=$('publicTags');tags.replaceChildren();
 const tagList=Array.isArray(item.tags)?item.tags:[];
 for(const tag of tagList.slice(0,20)){
   if(typeof tag!=='string'||!tag.trim())continue;
   const chip=document.createElement('span');
   chip.textContent='#'+tag.replace(/^#/,'').trim();
   tags.append(chip);
 }
 $('viewerTagsSection').hidden=tags.childElementCount===0;
 $('downloadStatus').textContent='AI enhancement runs locally in your browser. Original downloads retain full image quality.';
 updateFavoriteButton();
 if(!dialog.open)dialog.showModal();
}
async function original(){
 if(!selected)throw new Error('No wallpaper selected');
 const res=await fetch(src(selected.id,'original'));
 if(!res.ok)throw new Error('Original unavailable ('+res.status+')');
 return res.blob();
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function storeForAI(item,blob){
 const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('waifu-wallpapers-preview',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('wallpapers'))req.result.createObjectStore('wallpapers',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('wallpapers','readwrite');tx.objectStore('wallpapers').put({id:'community-'+item.id,title:item.title,description:item.description,series:item.series,tags:item.tags,filename:item.title+'.'+(blob.type==='image/png'?'png':'jpg'),mime:blob.type||item.mime,size:blob.size,width:item.width,height:item.height,category:item.category,createdAt:Date.now(),blob});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
 finally{db.close();}
}
async function perform(kind){
 if(!selected||busy)return;busy=true;
 for(const id of ['publicOriginal','public2x','public4x'])$(id).disabled=true;
 $('downloadStatus').textContent='Preparing your image…';
 try{
  const item=selected,blob=await original();
  if(kind==='original'){download(blob,item.title.replace(/[^a-z0-9_-]+/gi,'_')+'.'+(item.mime==='image/png'?'png':item.mime==='image/webp'?'webp':'jpg'));$('downloadStatus').textContent='Original download started.';}
  else{await storeForAI(item,blob);location.assign('./ai.html?fromGallery='+encodeURIComponent('community-'+item.id)+'&scale='+kind);return;}
 }catch(e){$('downloadStatus').textContent='Could not open wallpaper: '+e.message;}
 finally{busy=false;for(const id of ['publicOriginal','public2x','public4x'])$(id).disabled=false;}
}
async function init(){
 const configured=String(window.WAIFU_COMMUNITY_API||'').trim().replace(/\/+$/,'');
 $('publicOriginal').addEventListener('click',()=>perform('original'));
 $('public2x').addEventListener('click',()=>perform('2'));
 $('public4x').addEventListener('click',()=>perform('4'));
 $('publicFavorite').addEventListener('click',()=>{if(selected)favorite(selected);});
 $('publicClose').addEventListener('click',()=>$('publicDetail').close());
 for(const [id,dir] of [['viewerPrev',-1],['viewerNext',1],['viewerPrevSmall',-1],['viewerNextSmall',1]])$(id).addEventListener('click',()=>navigateViewer(dir));
 $('publicShare').addEventListener('click',shareCurrent);
 $('publicRandom').addEventListener('click',()=>{const data=visibleItems().filter(x=>x?.id);if(data.length)openDetail(data[Math.floor(Math.random()*data.length)]);else location.hash='#feed';});
 document.addEventListener('keydown',event=>{
   if(!$('publicDetail').open||event.altKey||event.ctrlKey||event.metaKey)return;
   if(event.target?.matches('input,textarea,select'))return;
   if(event.key==='ArrowLeft'){event.preventDefault();navigateViewer(-1);}
   if(event.key==='ArrowRight'){event.preventDefault();navigateViewer(1);}
 });
 const view=$('publicImage');
 view.addEventListener('touchstart',event=>{swipeStart=event.touches[0]?.clientX??null;},{passive:true});
 view.addEventListener('touchend',event=>{if(swipeStart===null)return;const end=event.changedTouches[0]?.clientX;if(typeof end==='number'&&Math.abs(end-swipeStart)>70)navigateViewer(end<swipeStart?1:-1);swipeStart=null;},{passive:true});

 $('publicDetail').addEventListener('click',e=>{if(e.target===$('publicDetail'))$('publicDetail').close();});
 $('publicFavorites').addEventListener('click',()=>{if(favoritesPage){location.assign('./index.html');return;}onlyFavorites=!onlyFavorites;render();});
 $('loadMore').addEventListener('click',()=>load());
 const reload=()=>{onlyFavorites=favoritesPage;load(true);};
 $('publicCategory').addEventListener('change',()=>{syncGenres();reload();});
 $('publicOrient').addEventListener('change',reload);
 for(const btn of document.querySelectorAll('[data-discover]'))btn.addEventListener('click',()=>{$('publicCategory').value=btn.dataset.discover;syncGenres();reload();document.getElementById('feed').scrollIntoView({behavior:'smooth'});});
 for(const btn of document.querySelectorAll('[data-publiccat]'))btn.addEventListener('click',()=>{
   $('publicCategory').value=btn.dataset.publiccat;
   syncGenres();reload();
   document.getElementById('feed').scrollIntoView({behavior:'smooth',block:'start'});
 });
 function syncGenres(){const current=$('publicCategory').value;for(const btn of document.querySelectorAll('[data-publiccat]'))btn.classList.toggle('active',btn.dataset.publiccat===current);}
 let searchTimer;for(const id of ['publicSearch','publicTag'])$(id).addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(reload,270);});

 if(!configured){info('Cloudflare storage has not been enabled yet. Public catalog setup is in progress.',true);page=null;render();return;}
 try{const url=new URL(configured);if(url.protocol!=='https:')throw new Error('HTTPS required');api=url.origin+url.pathname.replace(/\/+$/,'');await load(true);await openShared();}
 catch(e){info('Could not connect to storage: '+e.message,true);render();}
}
document.addEventListener('DOMContentLoaded',init);