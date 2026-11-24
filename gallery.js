'use strict';
const DB_NAME = 'waifu-wallpapers-preview';
const STORE = 'wallpapers';
const MAX_FILES = 40;
const MAX_BYTES = 12 * 1024 * 1024;
const CATEGORY_LABELS = {anime:'Anime',oled:'Dark / OLED',fantasy:'Fantasy',scifi:'Sci-Fi',other:'Other'};
const $ = id => document.getElementById(id);
let collection = [], selected = null, cardUrls = [], detailUrl = null, toastTimer = null;

function openDB() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(DB_NAME,1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Cannot open browser storage'));
  });
}
async function getAll() {
  const db = await openDB();
  try {
    return await new Promise((resolve,reject) => {
      const request = db.transaction(STORE,'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function saveAll(records) {
  const db = await openDB();
  try {
    await new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,'readwrite'), store = tx.objectStore(STORE);
      for (const record of records) store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function deleteItem(id) {
  const db = await openDB();
  try {
    await new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
function notify(text) {
  const toast = $('toast'); toast.textContent = text; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'),3500);
}
function formatBytes(n) { return n < 1024*1024 ? (n/1024).toFixed(0)+' KB' : (n/(1024*1024)).toFixed(2)+' MB'; }
function titleFromFile(name) {
  return (name || 'Untitled wallpaper').replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80) || 'Untitled wallpaper';
}
function categoryName(v){ return CATEGORY_LABELS[v] || 'Other'; }
function download(blob,name) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),20000);
}
function clearCardUrls(){ for(const u of cardUrls) URL.revokeObjectURL(u); cardUrls=[]; }
function closeModal(modal){ if(modal.open) modal.close(); }
function openModal(modal){ if(!modal.open) modal.showModal(); }
function buildCard(item) {
  const card=document.createElement('button');
  card.className='wallcard'; card.type='button'; card.setAttribute('aria-label','View '+item.title);
  const wrap=document.createElement('div');wrap.className='image-wrap';
  const img=document.createElement('img');
  const url=URL.createObjectURL(item.blob); cardUrls.push(url);
  img.src=url;img.loading='lazy';img.alt=item.title;img.decoding='async';
  const overlay=document.createElement('span');overlay.className='img-overlay';
  const chip=document.createElement('span');chip.className='chip';chip.textContent=categoryName(item.category);
  const arrow=document.createElement('span');arrow.className='view';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
  wrap.append(img,overlay,chip,arrow);
  const details=document.createElement('div');details.className='card-details';
  const name=document.createElement('h3');name.textContent=item.title;
  const sub=document.createElement('p');sub.textContent=item.width+' × '+item.height+' · Local preview';
  details.append(name,sub);card.append(wrap,details);
  card.addEventListener('click',()=>viewDetail(item.id));
  return card;
}
function render() {
  clearCardUrls();
  let items=[...collection];
  const search=$('search').value.trim().toLowerCase();
  const category=$('categoryFilter').value,sort=$('sort').value;
  if(category!=='all')items=items.filter(it=>it.category===category);
  if(search)items=items.filter(it=>it.title.toLowerCase().includes(search));
  if(sort==='name')items.sort((a,b)=>a.title.localeCompare(b.title));
  else if(sort==='size')items.sort((a,b)=>b.width*b.height-a.width*a.height);
  else items.sort((a,b)=>b.createdAt-a.createdAt);
  const grid=$('wallGrid');grid.replaceChildren();
  for(const item of items)grid.append(buildCard(item));
  $('collectionCount').textContent=String(collection.length).padStart(2,'0');
  const empty=$('emptyState');
  empty.hidden=items.length>0;
  if(!collection.length) {
    empty.querySelector('h3').textContent='Your collection begins here.';
    empty.querySelector('p').textContent='Choose your favorite anime wallpaper to see the gallery come alive. Files stay in your browser during this preview.';
  } else if(!items.length){
    empty.querySelector('h3').textContent='No matching wallpapers.';
    empty.querySelector('p').textContent='Try a different keyword or category to explore the collection.';
  }
}
function viewDetail(id) {
  const item=collection.find(x=>x.id===id); if(!item)return;
  selected=item;
  if(detailUrl)URL.revokeObjectURL(detailUrl);
  detailUrl=URL.createObjectURL(item.blob);
  const img=$('detailImg');img.src=detailUrl;img.alt=item.title;
  $('detailTitle').textContent=item.title;
  $('detailCategory').textContent=categoryName(item.category).toUpperCase()+' · LOCAL COLLECTION';
  $('detailResolution').textContent=item.width+' × '+item.height;
  $('detailSize').textContent=formatBytes(item.size);
  $('detailFormat').textContent=(item.mime.split('/')[1]||'image').toUpperCase().replace('JPEG','JPG');
  openModal($('detailDialog'));
}
async function dimensions(file) {
  if('createImageBitmap' in window) {
    const bitmap=await createImageBitmap(file);
    try { return {width:bitmap.width,height:bitmap.height}; }
    finally { bitmap.close(); }
  }
  const url=URL.createObjectURL(file);
  try {
    return await new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});
      img.onerror=()=>reject(new Error('Cannot decode '+file.name));
      img.src=url;
    });
  } finally { URL.revokeObjectURL(url); }
}
async function uploadHandler(ev) {
  ev.preventDefault();
  const input=$('uploadFiles'),files=[...input.files];
  const status=$('uploadStatus'),button=$('saveUpload');
  if(!files.length){status.textContent='Choose at least one image.';return;}
  if(collection.length+files.length>MAX_FILES){status.textContent='This preview supports up to '+MAX_FILES+' saved images. Remove some first.';return;}
  const allowed=new Set(['image/png','image/jpeg','image/webp']);
  if(files.some(f=>!allowed.has(f.type)||f.size>MAX_BYTES)){status.textContent='Use PNG, JPG or WebP files up to 12 MB each.';return;}
  button.disabled=true;status.textContent='Reading images…';
  try {
    const newItems=[];
    for (let i=0;i<files.length;i++) {
      const file=files[i];status.textContent='Checking '+(i+1)+' of '+files.length+'…';
      const size=await dimensions(file);
      if(size.width<1 || size.height<1 || size.width*size.height>70000000) throw new Error('This image has unsupported dimensions.');
      newItems.push({
        id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+'-'+i+'-'+Math.random(),
        title:titleFromFile(file.name),
        filename:file.name,
        mime:file.type,
        size:file.size,
        width:size.width,height:size.height,
        category:$('uploadCategory').value,
        createdAt:Date.now()+i,
        blob:file
      });
    }
    await saveAll(newItems);
    collection=await getAll();render();
    input.value='';status.textContent='';
    closeModal($('uploadDialog'));
    notify(newItems.length+' wallpaper'+(newItems.length===1?'':'s')+' added to this browser');
    $('collection').scrollIntoView({behavior:'smooth'});
  } catch (error) {
    status.textContent='Could not save your image: '+(error.message||'Browser storage may be full.');
  } finally {button.disabled=false;}
}
function launchAI(scale) {
  if(!selected)return;
  // Both the gallery and original lab use the same origin and IndexedDB.
  // The lab reads the ID and pre-selects the image: no second file picker.
  const id=encodeURIComponent(selected.id);
  window.location.assign('./ai.html?fromGallery='+id+'&scale='+scale);
}
async function removeSelected() {
  if(!selected)return;
  const item=selected;
  if(!window.confirm('Remove "'+item.title+'" from this browser?'))return;
  try {
    await deleteItem(item.id);
    selected=null;
    closeModal($('detailDialog'));
    if(detailUrl){URL.revokeObjectURL(detailUrl);detailUrl=null;}
    collection=await getAll();render();notify('Wallpaper removed from this browser');
  } catch(e){notify('Could not remove image: '+e.message);}
}
function bind() {
  const uploadDialog=$('uploadDialog'),detailDialog=$('detailDialog');
  for(const id of ['openUpload','emptyUpload']) $(id).addEventListener('click',()=>openModal(uploadDialog));
  $('closeUpload').addEventListener('click',()=>closeModal(uploadDialog));
  $('closeDetail').addEventListener('click',()=>closeModal(detailDialog));
  for(const dialog of [uploadDialog,detailDialog]) {
    dialog.addEventListener('click',ev=>{if(ev.target===dialog)closeModal(dialog);});
  }
  detailDialog.addEventListener('close',()=>{if(detailUrl){URL.revokeObjectURL(detailUrl);detailUrl=null;}});
  $('uploadForm').addEventListener('submit',uploadHandler);
  $('originalDownload').addEventListener('click',()=>{if(selected)download(selected.blob,selected.filename);});
  $('enhance2x').addEventListener('click',()=>launchAI(2));
  $('enhance4x').addEventListener('click',()=>launchAI(4));
  $('removeItem').addEventListener('click',removeSelected);
  for(const id of ['search','categoryFilter','sort']) $(id).addEventListener(id==='search'?'input':'change',render);
  window.addEventListener('pagehide',()=>{clearCardUrls();if(detailUrl)URL.revokeObjectURL(detailUrl);});
}
document.addEventListener('DOMContentLoaded',async()=>{
  bind();
  try {collection=await getAll();render();}
  catch(e){notify('Browser storage unavailable. Use standard Chrome and allow site storage.');}
});