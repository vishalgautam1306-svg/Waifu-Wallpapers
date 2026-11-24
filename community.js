'use strict';
const $=id=>document.getElementById(id);
const CATS={"anime":"Anime","manga":"Manga & comics","gaming":"Games","oled":"OLED / Dark","fantasy":"Fantasy","scifi":"Sci-Fi","cyberpunk":"Cyberpunk","space":"Space & cosmos","nature":"Nature & scenery","cityscapes":"Cities & skylines","aesthetic":"Aesthetic","minimal":"Minimal","abstract":"Abstract","movies":"Movies & TV","3d":"3D art","cars":"Cars & vehicles","animals":"Animals","architecture":"Architecture","photography":"Photography","digitalart":"Digital art","horror":"Horror","kawaii":"Cute / Kawaii","seasonal":"Seasonal","sports":"Sports","other":"Other"};
const FAV_KEY='waifu-wallpapers-public-favorites';
let api='',items=[],page=null,busy=false,selected=null,onlyFavorites=false,favorites={};
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
 card.setAttribute('aria-label','Preview '+item.title);
 const box=document.createElement('div');box.className='image-wrap';
 const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.alt=item.title;img.src=src(item.id);
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
function render(){
 const grid=$('publicGrid');grid.replaceChildren();
 let data=onlyFavorites?Object.values(favorites):items;
 for(const item of data)if(item&&item.id&&/^[0-9a-f-]{36}$/i.test(item.id))grid.append(buildCard(item));
 const has=grid.children.length>0;
 $('publicEmpty').hidden=has;
 if(!has)empty(onlyFavorites?'No saved favorites yet.':'No wallpapers in this view.',onlyFavorites?'Tap a wallpaper and choose Save favorite. These bookmarks stay in this browser.':'Published wallpapers will appear here after an admin approves them.');
 $('loadMore').hidden=onlyFavorites||page===null;
 $('publicFavorites').classList.toggle('active',onlyFavorites);
}
function parameters(n){const q=new URLSearchParams({limit:'24',page:String(n)});const search=$('publicSearch').value.trim(),cat=$('publicCategory').value,tag=$('publicTag').value.trim();if(search)q.set('q',search);if(cat)q.set('category',cat);if(tag)q.set('tag',tag);return q.toString();}
async function load(reset=false){
 if(!api)return;
 if(reset){items=[];page=0;}
 const next=page;
 if(next===null)return;
 const button=$('loadMore');button.disabled=true;
 try{
  const response=await fetch(api+'/api/gallery?'+parameters(next),{cache:'no-store'});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'API returned '+response.status);
  if(!Array.isArray(result.items))throw new Error('Invalid gallery response');
  const known=new Set(items.map(x=>x.id));
  for(const item of result.items)if(!known.has(item.id)){items.push(item);known.add(item.id);}
  page=result.nextPage===null?null:result.nextPage;
  info('Public gallery connected · '+items.length+' artworks loaded');
 }catch(e){info('Public gallery unavailable: '+e.message,true);page=null;}
 finally{button.disabled=false;button.textContent='Load more wallpapers ↓';render();}
}
function openDetail(item){
 selected=item;
 $('publicTitle').textContent=item.title;
 $('publicDetailCategory').textContent=(CATS[item.category]||'Artwork').toUpperCase()+(item.series?' · '+item.series:'');
 $('publicRes').textContent=item.width+' × '+item.height;
 $('publicSize').textContent=bytes(item.size);
 $('publicImage').src=src(item.id);
 $('publicImage').alt=item.title;
 $('downloadStatus').textContent=(item.description?item.description+' · ':'')+(item.tags?.length?'Tags: '+item.tags.join(', '):'Enhance locally with AI.');
 updateFavoriteButton();
 $('publicDetail').showModal();
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
 $('publicFavorites').addEventListener('click',()=>{onlyFavorites=!onlyFavorites;render();});
 $('loadMore').addEventListener('click',()=>load());
 const reload=()=>{onlyFavorites=false;load(true);};
 $('publicCategory').addEventListener('change',()=>{syncGenres();reload();});
 for(const btn of document.querySelectorAll('[data-publiccat]'))btn.addEventListener('click',()=>{
   $('publicCategory').value=btn.dataset.publiccat;
   syncGenres();reload();
   document.getElementById('feed').scrollIntoView({behavior:'smooth',block:'start'});
 });
 function syncGenres(){const current=$('publicCategory').value;for(const btn of document.querySelectorAll('[data-publiccat]'))btn.classList.toggle('active',btn.dataset.publiccat===current);}
 let searchTimer;for(const id of ['publicSearch','publicTag'])$(id).addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(reload,270);});

 if(!configured){info('Cloudflare storage has not been enabled yet. Public catalog setup is in progress.',true);page=null;render();return;}
 try{const url=new URL(configured);if(url.protocol!=='https:')throw new Error('HTTPS required');api=url.origin+url.pathname;await load(true);}
 catch(e){info('Could not connect to storage: '+e.message,true);render();}
}
document.addEventListener('DOMContentLoaded',init);