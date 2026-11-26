'use strict';
const $=id=>document.getElementById(id);
const API=String(window.WAIFU_COMMUNITY_API||'').trim().replace(/\/+$/,'');
const FAV_KEY='waifu-wallpapers-public-favorites';
const CATS={"anime":"Anime","manga":"Manga & comics","gaming":"Gaming","oled":"OLED / Dark","fantasy":"Fantasy","scifi":"Sci-Fi","cyberpunk":"Cyberpunk","space":"Space","nature":"Nature & scenery","cityscapes":"Cityscapes","aesthetic":"Aesthetic","minimal":"Minimal","abstract":"Abstract","movies":"Movies & TV","3d":"3D art","cars":"Cars & vehicles","animals":"Animals","architecture":"Architecture","photography":"Photography","digitalart":"Digital art","horror":"Horror","kawaii":"Kawaii","seasonal":"Seasonal","sports":"Sports","other":"Other"};
const id=new URLSearchParams(location.search).get('id')||'';
const validId=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id);
let item=null,busy=false,reportBusy=false,toastTimer=0,favorites={};
try{favorites=JSON.parse(localStorage.getItem(FAV_KEY)||'{}')||{}}catch(_){favorites={};}
const src=(id,kind='thumb')=>API+'/api/wallpapers/'+encodeURIComponent(id)+'/'+kind;
function bytes(n){return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';}
function message(text){$('actionStatus').textContent=text;}
function toast(text){
 clearTimeout(toastTimer);const e=$('toast');e.textContent=text;e.hidden=false;
 toastTimer=setTimeout(()=>{e.hidden=true;},4600);
}
function showError(text){$('detailContent').hidden=true;$('detailError').hidden=false;$('detailErrorMessage').textContent=text;document.title='Wallpaper unavailable | Waifu Wallpapers';}
function setFavState(){$('saveFavorite').textContent=favorites[id]?'♥ Remove from favorites':'♡ Save to favorites';}
function toggleFavorite(){
 if(!item)return;
 if(favorites[id]){delete favorites[id];toast('Removed from your browser favorites.');}
 else{favorites[id]=item;toast('Saved to My Favorites in this browser.');}
 try{localStorage.setItem(FAV_KEY,JSON.stringify(favorites))}catch(_){toast('Your browser blocked saving favorites.');}
 setFavState();
}
function makeRelatedCard(data){
 const anchor=document.createElement('a');anchor.href='./wallpaper.html?id='+encodeURIComponent(data.id);anchor.className='related-card';
 const image=document.createElement('img');image.src=src(data.id,'thumb');image.alt=data.title;image.loading='lazy';
 const title=document.createElement('strong');title.textContent=data.title;
 const description=document.createElement('small');description.textContent=data.series||CATS[data.category]||'Wallpaper';
 anchor.append(image,title,description);return anchor;
}
async function showRelated(){
 try{
  const r=await fetch(API+'/api/wallpapers/'+encodeURIComponent(id)+'/related');
  if(!r.ok)throw Error('Recommendations unavailable');
  const data=await r.json();
  const list=$('relatedGrid');list.replaceChildren();
  for(const x of (data.items||[]).slice(0,8))if(x?.id&&x.id!==id)list.append(makeRelatedCard(x));
  $('browseMore').hidden=false;
  if(!list.children.length)list.append(Object.assign(document.createElement('p'),{textContent:'More related artwork will appear as the gallery grows.',className:'empty-recommendations'}));
 }catch(_){$('browseMore').hidden=false;}
}
async function showNeighbors(){
 try{
  const r=await fetch(API+'/api/wallpapers/'+encodeURIComponent(id)+'/adjacent');
  if(!r.ok)return;
  const data=await r.json();
  if(data.previous?.id){$('prevWallpaper').href='./wallpaper.html?id='+encodeURIComponent(data.previous.id);$('prevWallpaper').textContent='← '+data.previous.title;$('prevWallpaper').hidden=false;}
  if(data.next?.id){$('nextWallpaper').href='./wallpaper.html?id='+encodeURIComponent(data.next.id);$('nextWallpaper').textContent=data.next.title+' →';$('nextWallpaper').hidden=false;}
 }catch(_){}
}
function display(data){
 item=data;
 document.title=data.title+' | Waifu Wallpapers';
 $('breadcrumbTitle').textContent=data.title;
 $('detailTitle').textContent=data.title;
 $('sideTitle').textContent=data.title;
 $('introSeries').textContent=[data.series||'Original anime-inspired artwork',data.width+' × '+data.height,'Download & AI upscale'].join(' · ');
 $('detailCategory').textContent=[CATS[data.category]||'Artwork',data.series].filter(Boolean).join(' · ');
 $('detailRes').textContent=data.width+' × '+data.height;
 $('imageResolutionLabel').textContent=data.width+' × '+data.height+' · Original';
 $('detailSize').textContent=bytes(data.size||0);
 $('detailOrientation').textContent=data.width>data.height*1.12?'Landscape':data.height>data.width*1.12?'Portrait':'Square';
 $('detailFormat').textContent=({'image/png':'PNG','image/jpeg':'JPEG','image/webp':'WebP'})[data.mime]||'Image';
 $('detailDescription').textContent=data.description||'Explore this wallpaper in its original resolution, or enhance it with our on-device AI studio.';
 $('detailCredit').textContent=data.credit||'Waifu Wallpapers · AI-assisted artwork';
 $('detailFanNote').textContent=data.series?'Unofficial fan artwork inspired by '+data.series+'. Not affiliated with the original rights holder.':'';
 $('detailFanNote').hidden=!data.series;
 const preview=$('detailImage'),original=src(data.id,'original'),thumb=src(data.id,'thumb');
 preview.src=original;preview.alt=data.title+' — wallpaper artwork';
 preview.onerror=()=>{preview.onerror=null;preview.src=thumb;};
 $('artStage').style.setProperty('--art-bg','url("'+thumb+'")');
 $('openImage').href=original;
 const tags=$('detailTags');tags.replaceChildren();
 for(const tag of (data.tags||[]).slice(0,30)){
  if(typeof tag!=='string'||!tag.trim())continue;
  const link=document.createElement('a');link.href='./index.html?tag='+encodeURIComponent(tag.trim())+'#feed';
  link.textContent='#'+tag.replace(/^#/,'').trim();tags.append(link);
 }
 $('tagsSection').hidden=!tags.children.length;
 setFavState();$('detailContent').hidden=false;$('detailError').hidden=true;
 $('actionStatus').textContent='Use the buttons above to download or enhance your wallpaper.';
}
async function originalBlob(){
 const r=await fetch(src(id,'original'));
 if(!r.ok)throw Error('Original image unavailable ('+r.status+')');
 return r.blob();
}
function download(blob,name){
 const url=URL.createObjectURL(blob);const a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function storeForAI(data,blob){
 const db=await new Promise((resolve,reject)=>{
  const req=indexedDB.open('waifu-wallpapers-preview',1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('wallpapers'))req.result.createObjectStore('wallpapers',{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('wallpapers','readwrite');
   tx.objectStore('wallpapers').put({
    id:'community-'+data.id,title:data.title,description:data.description,series:data.series,tags:data.tags,
    filename:data.title+'.'+(blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg'),
    mime:blob.type||data.mime,size:blob.size,width:data.width,height:data.height,category:data.category,
    createdAt:Date.now(),blob
   });
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
 }finally{db.close();}
}
async function perform(kind){
 if(!item||busy)return;
 busy=true;
 for(const key of ['downloadOriginal','enhance2','enhance4'])$(key).disabled=true;
 message('Preparing your image…');
 try{
  const blob=await originalBlob();
  if(kind==='original'){
   const ext=item.mime==='image/png'?'png':item.mime==='image/webp'?'webp':'jpg';
   download(blob,item.title.replace(/[^a-z0-9_-]+/gi,'_')+'.'+ext);
   toast('Original wallpaper download started.');message('Original download started.');
  }else{
   await storeForAI(item,blob);
   location.assign('./ai.html?fromGallery='+encodeURIComponent('community-'+item.id)+'&scale='+kind);
   return;
  }
 }catch(e){message('Unable to proceed: '+e.message);toast('Could not prepare this image.');}
 finally{busy=false;for(const key of ['downloadOriginal','enhance2','enhance4'])$(key).disabled=false;}
}
async function copyWallpaperLink(){
 const url=new URL(location.href);url.search='?id='+encodeURIComponent(id);url.hash='';
 const value=url.toString();
 try{
  if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(value);
  else{
   const input=document.createElement('textarea');input.value=value;input.readOnly=true;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();
   if(!document.execCommand('copy'))throw Error('Copy failed');input.remove();
  }
  toast('✓ Wallpaper link copied to clipboard.');
 }catch(_){toast('Copy unavailable here. Select the URL in your address bar instead.');}
}
function closeBackdrop(dialog,event){
 if(event.target!==dialog)return;
 const r=dialog.getBoundingClientRect();
 if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
}
function openReport(){
 if(!item)return;
 $('reportForm').reset();$('reportStatus').textContent='';
 $('reportSubmit').disabled=false;$('reportItemTitle').textContent='Wallpaper: '+item.title;
 $('reportDialog').showModal();
}
async function submitReport(event){
 event.preventDefault();if(reportBusy||!item)return;
 const reason=$('reportReason').value;if(!reason)return;
 reportBusy=true;$('reportSubmit').disabled=true;$('reportStatus').textContent='Sending report…';
 try{
  const r=await fetch(API+'/api/wallpapers/'+encodeURIComponent(id)+'/report',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({reason,note:$('reportNote').value.trim().slice(0,300)})
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.error||'Report unavailable ('+r.status+')');
  $('reportDialog').close();
  toast(data.alreadyReported?'✓ Already reported. Thank you!':'✓ Report sent! Thank you for helping improve the gallery.');
 }catch(e){$('reportStatus').textContent='Could not send: '+e.message;$('reportSubmit').disabled=false;}
 finally{reportBusy=false;}
}
function goBack(event){
 if(document.referrer&&new URL(document.referrer).origin===location.origin&&history.length>1){
  event.preventDefault();history.back();
 }
}
async function initialize(){
 $('backGallery').addEventListener('click',goBack);
 $('copyLink').addEventListener('click',copyWallpaperLink);
 $('saveFavorite').addEventListener('click',toggleFavorite);
 $('downloadOriginal').addEventListener('click',()=>perform('original'));
 $('enhance2').addEventListener('click',()=>perform('2'));
 $('enhance4').addEventListener('click',()=>perform('4'));
 $('reportIssue').addEventListener('click',openReport);
 $('reportClose').addEventListener('click',()=>$('reportDialog').close());
 $('reportDialog').addEventListener('click',e=>closeBackdrop($('reportDialog'),e));
 $('reportForm').addEventListener('submit',submitReport);
 if(!validId){showError('This wallpaper link is incomplete or invalid.');return;}
 if(!/^https:\/\//.test(API)){showError('The gallery server is not configured.');return;}
 try{
  const r=await fetch(API+'/api/wallpapers/'+encodeURIComponent(id),{cache:'no-store'});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.error||'Wallpaper unavailable ('+r.status+')');
  display(data);
  showRelated();showNeighbors();
 }catch(e){showError(e.message);}
}
document.addEventListener('DOMContentLoaded',initialize);