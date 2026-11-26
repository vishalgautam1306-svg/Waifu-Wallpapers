'use strict';
const $=id=>document.getElementById(id);
const FAV_KEY='waifu-wallpapers-public-favorites';
const favoritesPage=/\/library\.html$/.test(location.pathname);
const categoryLabels={"anime":"Anime","manga":"Manga & comics","gaming":"Games","oled":"OLED / Dark","fantasy":"Fantasy","scifi":"Sci-Fi","cyberpunk":"Cyberpunk","space":"Space & cosmos","nature":"Nature & scenery","cityscapes":"Cities & skylines","aesthetic":"Aesthetic","minimal":"Minimal","abstract":"Abstract","movies":"Movies & TV","3d":"3D art","cars":"Cars & vehicles","animals":"Animals","architecture":"Architecture","photography":"Photography","digitalart":"Digital art","horror":"Horror","kawaii":"Cute / Kawaii","seasonal":"Seasonal","sports":"Sports","other":"Other"};
let api='',items=[],favorites={},nextPage=0,loadedPages=0,busy=false,seq=0,scrollTimer=0;
try{favorites=JSON.parse(localStorage.getItem(FAV_KEY)||'{}')||{};}catch(_){favorites={};}
function viewKey(){return 'ww:gallery:view:'+location.pathname+location.search;}
function itemCacheKey(){return viewKey()+':catalog';}
function rememberView(){
 try{sessionStorage.setItem(viewKey(),JSON.stringify({scroll:window.scrollY,pages:loadedPages}));}catch(_){}
}
function fetchView(){try{return JSON.parse(sessionStorage.getItem(viewKey())||'{}')||{};}catch(_){return {};}}
function saveCatalogCache(){
 if(favoritesPage)return;
 try{sessionStorage.setItem(itemCacheKey(),JSON.stringify({items,nextPage,loadedPages,savedAt:Date.now()}));}catch(_){}
}
function readCatalogCache(){
 try{
  const result=JSON.parse(sessionStorage.getItem(itemCacheKey())||'null');
  if(result&&Array.isArray(result.items)&&result.items.length<=4000&&Date.now()-result.savedAt<6*3600000)return result;
 }catch(_){}
 return null;
}
function scrollSave(){if(scrollTimer)return;scrollTimer=setTimeout(()=>{scrollTimer=0;rememberView();},220);}
function info(message,failed=false){
 const e=$('connectionState');if(e)e.textContent=message;
 const parent=e?.closest('.notice');if(parent)parent.style.borderColor=failed?'#d5658e':'#b49aec66';
}
function empty(title,description){
 $('publicEmpty').hidden=false;$('emptyTitle').textContent=title;$('emptyDesc').textContent=description;
}
function urlFor(item){return './wallpaper.html?id='+encodeURIComponent(item.id);}
function thumbFor(id){return api+'/api/wallpapers/'+encodeURIComponent(id)+'/thumb';}
function buildCard(item){
 const card=document.createElement('a');card.className='wallcard';card.href=urlFor(item);
 if(item.height>item.width*1.12)card.classList.add('portrait-art');
 else if(item.width>item.height*1.12)card.classList.add('landscape-art');
 card.setAttribute('aria-label','View '+item.title+' wallpaper details');
 const imageWrap=document.createElement('div');imageWrap.className='image-wrap';
 const image=document.createElement('img');image.loading='lazy';image.decoding='async';
 image.alt=item.title;image.src=thumbFor(item.id);
 if(item.width&&item.height)image.style.aspectRatio=item.width+' / '+item.height;
 const overlay=document.createElement('span');overlay.className='img-overlay';
 const chip=document.createElement('span');chip.className='chip';chip.textContent=categoryLabels[item.category]||'Art';
 const view=document.createElement('span');view.className='view';view.textContent='↗';
 imageWrap.append(image,overlay,chip,view);
 const details=document.createElement('div');details.className='card-details';
 const title=document.createElement('h3');title.textContent=item.title;
 const sub=document.createElement('p');sub.textContent=(item.series?item.series+' · ':'')+item.width+' × '+item.height+(favorites[item.id]?' · ♥':'');
 details.append(title,sub);card.append(imageWrap,details);
 card.addEventListener('click',rememberView);
 return card;
}
function show(){
 const grid=$('publicGrid');grid.replaceChildren();
 const rows=favoritesPage?Object.values(favorites):items;
 for(const item of rows)if(item?.id&&/^[a-f0-9-]{36}$/i.test(item.id))grid.append(buildCard(item));
 const count=grid.children.length;
 $('publicEmpty').hidden=count>0;
 if(!count)empty(favoritesPage?'No favorites saved yet':'No wallpapers match these filters.',
   favoritesPage?'Browse the public gallery and tap Save favorite on a wallpaper. Images live in the cloud; your bookmark list stays in this browser.':'Clear your filters or try a different series or tag.');
 $('loadMore').hidden=favoritesPage||nextPage===null;
 $('loadMore').disabled=busy;
 $('publicFavorites').classList.toggle('active',favoritesPage);
}
function getFilters(){
 const q=new URLSearchParams({limit:'24'});
 for(const [key,id] of [['q','publicSearch'],['category','publicCategory'],['tag','publicTag'],['orientation','publicOrient']]){
  const val=$(id).value.trim();if(val)q.set(key,val);
 }
 return q;
}
function writeFilters(){
 if(favoritesPage)return;
 const u=new URL(location.href);
 for(const key of ['q','category','tag','orientation'])u.searchParams.delete(key);
 const q=getFilters();for(const key of ['q','category','tag','orientation'])if(q.has(key))u.searchParams.set(key,q.get(key));
 history.replaceState(history.state,'',u.pathname+(u.search||'')+(u.hash||''));
}
function restoreFilters(){
 if(favoritesPage)return;
 const q=new URLSearchParams(location.search);
 for(const [key,id] of [['q','publicSearch'],['category','publicCategory'],['tag','publicTag'],['orientation','publicOrient']]){
  if(q.has(key))$(id).value=q.get(key)||'';
 }
}
function syncGenres(){
 const cat=$('publicCategory').value;
 for(const e of document.querySelectorAll('[data-publiccat]'))e.classList.toggle('active',e.dataset.publiccat===cat);
}
async function load(reset=false){
 if(!api||favoritesPage||busy)return;
 if(reset){items=[];nextPage=0;loadedPages=0;seq++;}
 if(nextPage===null)return;
 const cycle=seq,offset=nextPage;
 busy=true;$('loadMore').disabled=true;
 try{
  const q=getFilters();q.set('page',String(offset));
  const r=await fetch(api+'/api/gallery?'+q,{cache:'no-store'});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.error||'Server responded with '+r.status);
  if(cycle!==seq)return;
  if(!Array.isArray(data.items))throw Error('Invalid gallery response');
  const seen=new Set(items.map(x=>x.id));
  for(const item of data.items)if(!seen.has(item.id)){items.push(item);seen.add(item.id);}
  nextPage=data.nextPage===null?null:data.nextPage;loadedPages++;
  info(items.length+' artworks · Cloud gallery connected');
  saveCatalogCache();
 }catch(e){info('Gallery unavailable: '+e.message,true);nextPage=null;}
 finally{busy=false;show();if(cycle!==seq)await load();}
}
async function applyFilters(){
 seq++;items=[];nextPage=0;loadedPages=0;
 writeFilters();syncGenres();
 try{sessionStorage.removeItem(viewKey());sessionStorage.removeItem(itemCacheKey());}catch(_){}
 await load();
 document.getElementById('feed')?.scrollIntoView({behavior:'smooth',block:'start'});
}
async function initialize(){
 const oldId=new URLSearchParams(location.search).get('wallpaper');
 if(oldId&&/^[a-f\d-]{36}$/i.test(oldId)){
  location.replace('./wallpaper.html?id='+encodeURIComponent(oldId));return;
 }
 const configured=String(window.WAIFU_COMMUNITY_API||'').trim().replace(/\/+$/,'');
 try{const url=new URL(configured);if(url.protocol==='https:')api=url.origin+url.pathname.replace(/\/+$/,'');}catch(_){}
 restoreFilters();syncGenres();
 $('publicFavorites').addEventListener('click',()=>{rememberView();location.assign(favoritesPage?'./index.html':'./library.html');});
 $('publicRandom').addEventListener('click',()=>{
  const rows=favoritesPage?Object.values(favorites):items;
  if(!rows.length){document.getElementById('feed')?.scrollIntoView({behavior:'smooth'});return;}
  rememberView();location.assign(urlFor(rows[Math.floor(Math.random()*rows.length)]));
 });
 $('loadMore').addEventListener('click',async()=>{await load();rememberView();});
 let debounce;
 for(const id of ['publicSearch','publicTag'])$(id).addEventListener('input',()=>{
  if(favoritesPage)return;clearTimeout(debounce);debounce=setTimeout(applyFilters,300);
 });
 for(const id of ['publicCategory','publicOrient'])$(id).addEventListener('change',()=>{if(!favoritesPage)applyFilters();});
 $('resetFilters')?.addEventListener('click',()=>{
  for(const id of ['publicSearch','publicTag','publicCategory','publicOrient'])$(id).value='';
  applyFilters();
 });
 for(const button of document.querySelectorAll('[data-publiccat]'))button.addEventListener('click',()=>{
  $('publicCategory').value=button.dataset.publiccat;
  if(!favoritesPage)applyFilters();
 });
 for(const button of document.querySelectorAll('[data-discover]'))button.addEventListener('click',()=>{
  $('publicCategory').value=button.dataset.discover;
  if(!favoritesPage)applyFilters();
 });
 window.addEventListener('scroll',scrollSave,{passive:true});
 window.addEventListener('pagehide',()=>{rememberView();saveCatalogCache();});
 if(!api){info('Gallery API not configured',true);nextPage=null;show();return;}
 if(favoritesPage){nextPage=null;show();info('Favorites are browser bookmarks · wallpapers stored on Cloudflare');}
 else{
  const last=fetchView(),cached=readCatalogCache();
  if(cached){
   items=cached.items;nextPage=cached.nextPage;loadedPages=cached.loadedPages;
   info(items.length+' artworks · Restored your gallery position');show();
  }else{
   const wanted=Math.min(60,Math.max(1,Number(last.pages)||1));
   for(let i=0;i<wanted;i++){await load();if(nextPage===null)break;}
  }
  if(Number.isFinite(last.scroll)&&last.scroll>0)setTimeout(()=>window.scrollTo({top:last.scroll,behavior:'instant'}),90);
 }
}
document.addEventListener('DOMContentLoaded',initialize);