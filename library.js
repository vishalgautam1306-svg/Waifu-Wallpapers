import { makeBatchZip, cancelBatchWork, capabilities } from "./library-batch.js";
const DB_NAME="waifu-wallpapers-preview", STORE="wallpapers";
const MAX_IMPORT=500, MAX_FILE=15*1024*1024;
const LABELS={"anime":"Anime","manga":"Manga & comics","gaming":"Games","oled":"OLED / Dark","fantasy":"Fantasy","scifi":"Sci-Fi","cyberpunk":"Cyberpunk","space":"Space & cosmos","nature":"Nature & scenery","cityscapes":"Cities & skylines","aesthetic":"Aesthetic","minimal":"Minimal","abstract":"Abstract","movies":"Movies & TV","3d":"3D art","cars":"Cars & vehicles","animals":"Animals","architecture":"Architecture","photography":"Photography","digitalart":"Digital art","horror":"Horror","kawaii":"Cute / Kawaii","seasonal":"Seasonal","sports":"Sports","other":"Other"};
const $=id=>document.getElementById(id);
const SERIES=[
  ["Honkai: Star Rail",/(?:\bhsr\b|honkai[\s_-]*star[\s_-]*rail|\b(?:kafka|acheron|firefly|march[\s_-]*7th|stelle|caelus|silver[\s_-]*wolf|ruan[\s_-]*mei|black[\s_-]*swan|sparkle|dan[\s_-]*heng)\b)/i],
  ["Demon Slayer",/(?:demon[\s_-]*slayer|kimetsu|\b(?:tanjiro|tanjirou|nezuko|giyu|giyuu|shinobu|mitsuri|zenitsu|inosuke|muichiro|sanemi|rengoku|kokushibo|akaza)\b)/i],
  ["Genshin Impact",/(?:genshin|\b(?:raiden[\s_-]*shogun|furina|navia|arlecchino|hutao|hu[\s_-]*tao|lumine|aether|neuvillette|keqing|nahida)\b)/i],
  ["Jujutsu Kaisen",/(?:jujutsu|jjk|\b(?:gojo|sukuna|megumi|nobara|itadori|toji)\b)/i],
  ["Attack on Titan",/(?:attack[\s_-]*on[\s_-]*titan|shingeki|\b(?:mikasa|levi|eren|armin)\b)/i],
  ["Hatsune Miku",/(?:hatsune[\s_-]*miku|\bmiku\b|vocaloid)/i],
  ["Darling in the Franxx",/(?:darling[\s_-]*in[\s_-]*the[\s_-]*franxx|zero[\s_-]*two|02[\s_-]*wallpaper)/i],
  ["Re:Zero",/(?:re[\s_-]*zero|\brezero\b|\b(?:emilia|echidna|rem[\s_-]*rezero)\b)/i],
  ["Mushoku Tensei",/(?:mushoku|\broxy\b|eris[\s_-]*greyrat)/i],
  ["Solo Leveling",/(?:solo[\s_-]*leveling|sung[\s_-]*jin[\s_-]*woo|jinwoo)/i],
  ["One Piece",/(?:one[\s_-]*piece|\bluffy\b|\bzoro\b|\bnami\b)/i],
  ["Naruto",/(?:\bnaruto\b|\bsasuke\b|\bitachi\b|\bhinata\b)/i],
  ["Bleach",/(?:\bbleach\b|\bichigo\b|\brukia\b)/i],
  ["Zenless Zone Zero",/(?:zenless|zzz[\s_-]*game|ellen[\s_-]*joe|miyabi)/i],
  ["Wuthering Waves",/(?:wuthering|wuwa|\bchangli\b|\bjinshi\b)/i]
];
const toMb=n=>(n/(1024*1024)).toFixed(2)+" MB";
let db=null,items=[],filtered=[],showLimit=70,selected=new Set(),quality=new Map(),drafts=[],draftURLs=[],cardUrls=[],batchUrls=[],detailUrl=null,detailItem=null,preparing=false,saving=false,processing=false,batchOpen=false,frontFilter="all";

function sleep(){return new Promise(resolve=>setTimeout(resolve,0));}
function openDatabase(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{const database=req.result;if(!database.objectStoreNames.contains(STORE))database.createObjectStore(STORE,{keyPath:"id"});};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error || new Error('IndexedDB unavailable'));
    req.onblocked=()=>reject(new Error("Browser storage is blocked by another tab"));
  });
}
async function allRecords(){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly');
    const req=tx.objectStore(STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
async function putRecords(records){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    const store=tx.objectStore(STORE);
    for(const record of records)store.put(record);
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error||new Error('Browser storage quota exceeded'));
    tx.onerror=()=>reject(tx.error||new Error('Storage error'));
  });
}
async function deleteRecord(id){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete=resolve;
    tx.onabort=()=>reject(tx.error);
    tx.onerror=()=>reject(tx.error);
  });
}
const FAV_KEY="waifu-wallpapers-favorites-v5";
let favorites=new Set(),favOnly=false;
try{favorites=new Set(JSON.parse(localStorage.getItem(FAV_KEY)||"[]"));}catch(_){}
function saveFavorites(){try{localStorage.setItem(FAV_KEY,JSON.stringify([...favorites]));}catch(_){}}
function toggleFavorite(id){if(favorites.has(id))favorites.delete(id);else favorites.add(id);saveFavorites();render();updateFavoriteButton();}
function updateFavoriteButton(){if(detailItem)$('detailFavorite').textContent=favorites.has(detailItem.id)?"♥ Remove favorite":"♡ Save favorite";}
function titleForFile(name){
  const base=String(name||'').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  if(!base || /^(?:1000\d+|img\s*\d+|screenshot\s*\d+|dsc\s*\d+|image\s*\d+)$/i.test(base))return "Untitled wallpaper";
  return base.slice(0,90);
}
function guessSeries(source){
  for(const [name,re] of SERIES)if(re.test(source))return name;
  return "";
}
function orientation(w,h){return w/h>1.12?"landscape":h/w>1.12?"portrait":"square";}
function fromColor(r,g,b){
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  if(max<50)return "dark";
  if(max-min<15)return "neutral";
  if(b>r*1.25&&b>g*1.14)return "blue";
  if(r>g*1.30&&b>g*1.20)return "purple";
  if(r>g*1.37&&r>b*1.23)return "red";
  if(g>r*1.18&&g>b*1.1)return "green";
  if(r>150&&g>100&&b<g*.77)return "gold";
  return "colorful";
}
async function inspect(file){
  let bitmap;
  try {
    bitmap=await createImageBitmap(file);
    const w=bitmap.width,h=bitmap.height;
    if(w<64||h<64||w*h>70_000_000)throw new Error("Unsupported image resolution");
    const canvas=document.createElement('canvas');
    canvas.width=56;canvas.height=56;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(bitmap,0,0,56,56);
    const data=ctx.getImageData(0,0,56,56).data;
    let black=0,luma=0,r=0,g=0,b=0;
    for(let i=0;i<data.length;i+=4){
      const rr=data[i],gg=data[i+1],bb=data[i+2];
      const lum=rr*.2126+gg*.7152+bb*.0722;
      if(lum<24)black++;
      luma+=lum;r+=rr;g+=gg;b+=bb;
    }
    const count=data.length/4;
    const oled=black/count>.62 && luma/count<48;
    const size=bitmap.width/bitmap.height;
    const thumbnail=document.createElement('canvas');
    const max=320;const factor=Math.min(1,max/Math.max(w,h));
    thumbnail.width=Math.max(1,Math.round(w*factor));thumbnail.height=Math.max(1,Math.round(h*factor));
    const tctx=thumbnail.getContext('2d',{alpha:false});
    tctx.drawImage(bitmap,0,0,thumbnail.width,thumbnail.height);
    let thumb=await new Promise(res=>thumbnail.toBlob(res,'image/webp',.76));
    if(!thumb)thumb=await new Promise(res=>thumbnail.toBlob(res,'image/jpeg',.70));
    if(!thumb)throw new Error("Could not create thumbnail");
    canvas.width=1;canvas.height=1;thumbnail.width=1;thumbnail.height=1;
    return {width:w,height:h,orientation:orientation(w,h),oled,color:fromColor(r/count,g/count,b/count),thumb};
  }finally{if(bitmap)bitmap.close();}
}
function dedupKey(f){return String(f.name).toLowerCase()+"|"+f.size;}
function derive(file,analysis){
  const title=titleForFile(file.name);
  const source=(file.webkitRelativePath||'')+' '+file.name;
  const series=guessSeries(source);
  const lower=source.toLowerCase();
  let category=analysis.oled?'oled':series?'anime':/\b(dragon|fantasy|magic|fairy|castle|angel|demon)\b/.test(lower)?'fantasy':/\b(cyberpunk|neon|mecha|space|robot|sci[\s_-]?fi)\b/.test(lower)?'scifi':'anime';
  if(!analysis.oled && !series){if(/cyberpunk|neon city/.test(lower))category='cyberpunk';else if(/horror|ghost|haunted|scary/.test(lower))category='horror';else if(/anime cute|kawaii|chibi/.test(lower))category='kawaii';else if(/manga|comic|manhwa/.test(lower))category='manga';else if(/gaming|gameplay|game wallpaper/.test(lower))category='gaming';else if(/planet|galaxy|cosmos|nebula|space/.test(lower))category='space';else if(/car|vehicle|bmw|ferrari|porsche|lamborghini/.test(lower))category='cars';else if(/cat|dog|fox|animal|bird/.test(lower))category='animals';else if(/building|architecture|interior/.test(lower))category='architecture';else if(/city|skyline|urban/.test(lower))category='cityscapes';else if(/photo|photography|portrait photo/.test(lower))category='photography';else if(/3d art|3d render|cgi/.test(lower))category='3d';else if(/digital art|concept art|illustration/.test(lower))category='digitalart';else if(/beach|ocean|forest|mountain|lake|sunset|sakura|river|landscape|sky/.test(lower))category='nature';else if(/bedroom|cozy|rainy|coffee|pastel|aesthetic/.test(lower))category='aesthetic';else if(/minimal|monochrome/.test(lower))category='minimal';else if(/abstract|pattern|geometry/.test(lower))category='abstract';}
  const tags=new Set([analysis.orientation]);
  for(const tag of ['beach','ocean','bedroom','anime girl','rain','night','sunset','forest','city','mountain','sky','moon','sakura','flowers','cozy','purple','blue','cute','dark','space'])if(lower.includes(tag))tags.add(tag);
  if(series)tags.add(series);
  if(analysis.oled)tags.add("OLED");
  if(analysis.color!=='neutral')tags.add(analysis.color);
  for(const t of title.split(/\s+/).filter(x=>x.length>2).slice(0,5))tags.add(t.toLowerCase());
  const description=(title==="Untitled wallpaper"?"Untitled wallpaper":title)+
    (series?" · "+series:"")+" · "+analysis.width+" × "+analysis.height+
    " · "+analysis.orientation+(analysis.oled?" · dark background":"");
  return {title,series,category,description,tags:[...tags].slice(0,12)};
}
function makeEl(name,cls,txt){
  const el=document.createElement(name);
  if(cls)el.className=cls;
  if(txt!==undefined)el.textContent=txt;
  return el;
}
function release(urls){for(const url of urls)URL.revokeObjectURL(url);urls.length=0;}
async function prepareBatch(files){
  if(preparing||saving)return;
  const validType=new Set(['image/png','image/jpeg','image/webp']);
  const list=[...files].filter(f=>validType.has(f.type));
  if(!list.length){$('importStatus').textContent="Choose PNG, JPG or WebP files.";return;}
  if(list.length>MAX_IMPORT){$('importStatus').textContent="Choose up to 500 images per batch. Split larger folders into smaller groups.";return;}
  if(list.some(f=>f.size>MAX_FILE||f.size<100)){$('importStatus').textContent="Each image must be between 100 bytes and 10 MB.";return;}
  preparing=true;
  $('saveDrafts').disabled=true;
  $('importProgress').style.width='0%';$('importTrack').hidden=false;
  const existing=new Set(items.map(it=>dedupKey({name:it.filename||it.title,size:it.size})));
  const pending=new Set(drafts.map(it=>dedupKey(it.file)));
  let skipped=0,invalid=0;
  try{
    for(let i=0;i<list.length;i++){
      const file=list[i],key=dedupKey(file);
      $('importStatus').textContent=`Reading ${i+1} of ${list.length}: ${file.name}`;
      $('importProgress').style.width=Math.round(i/list.length*100)+'%';
      if(existing.has(key)||pending.has(key)){skipped++;continue;}
      try{
        const analysis=await inspect(file);
        const metadata=derive(file,analysis);
        drafts.push({file,...analysis,...metadata});
        pending.add(key);
      }catch(e){console.warn(file.name,e);invalid++;}
      if(i%40===0) await sleep(); // Avoid rebuilding hundreds of preview cards repeatedly
    }
    $('importProgress').style.width='100%';
    renderDrafts();
    $('importErrors').textContent=(skipped?skipped+' probable duplicates skipped · ':'')+(invalid?invalid+' images unreadable':'');
    $('importStatus').textContent=`Prepared ${drafts.length} unique images. Review titles and categories, then save.`;
  }finally{preparing=false;$('saveDrafts').disabled=!drafts.length;}
}
function renderDrafts(){
  release(draftURLs);
  const list=$('draftList');list.replaceChildren();
  $('importCount').textContent=drafts.length+' images prepared';$('importSummary').hidden=!drafts.length;
  for(let i=0;i<drafts.length;i++){
    const draft=drafts[i];
    const row=makeEl('div','draft');
    const img=document.createElement('img');img.alt='';img.src=URL.createObjectURL(draft.thumb);draftURLs.push(img.src);
    const info=makeEl('div','draft-info');
    const input=document.createElement('input');input.value=draft.title;input.maxLength=90;input.setAttribute('aria-label','Wallpaper title for image '+(i+1));
    input.addEventListener('change',()=>{draft.title=input.value.trim().slice(0,90)||'Untitled wallpaper';});
    const sub=makeEl('small',null,(draft.series?draft.series+' · ':'')+draft.width+' × '+draft.height+' · '+toMb(draft.file.size));
    const tags=makeEl('small','draft-tags','Suggested tags: '+(draft.tags||[]).join(', '));
    const seriesBox=makeEl('input','draft-inline-input');seriesBox.value=draft.series||'';seriesBox.placeholder='Series (e.g. Demon Slayer)';seriesBox.setAttribute('aria-label','Series for wallpaper '+(i+1));seriesBox.maxLength=100;
    seriesBox.addEventListener('change',()=>draft.series=seriesBox.value.trim());
    const descBox=makeEl('input','draft-inline-input');descBox.value=draft.description||'';descBox.placeholder='Short description';descBox.setAttribute('aria-label','Description for wallpaper '+(i+1));descBox.maxLength=280;
    descBox.addEventListener('change',()=>draft.description=descBox.value.trim());
    const tagsBox=makeEl('input','draft-inline-input');tagsBox.value=(draft.tags||[]).join(', ');tagsBox.placeholder='Tags: beach, bedroom, ocean';tagsBox.setAttribute('aria-label','Tags for wallpaper '+(i+1));tagsBox.maxLength=320;
    tagsBox.addEventListener('change',()=>draft.tags=[...new Set(tagsBox.value.split(',').map(x=>x.trim()).filter(Boolean))].slice(0,20));
    tags.textContent='Editable suggestions · category below';
    info.append(input,sub,seriesBox,descBox,tagsBox,tags);
    const category=document.createElement('select');category.setAttribute('aria-label','Category for image '+(i+1));
    for(const [val,label] of Object.entries(LABELS)){const o=new Option(label,val);category.append(o);}
    category.value=draft.category;category.addEventListener('change',()=>{draft.category=category.value;});
    row.append(img,info,category);list.append(row);
  }
}
async function saveImport(){
  if(saving||preparing||!drafts.length)return;
  saving=true;$('saveDrafts').disabled=true;
  $('importStatus').textContent='Saving '+drafts.length+' wallpapers to this browser…';
  try{
    const records=drafts.map((d,i)=>({
      id:crypto.randomUUID(),filename:d.file.name,blob:d.file,thumb:d.thumb,
      title:d.title,series:d.series,category:d.category,
      description:d.description,tags:d.tags,width:d.width,height:d.height,
      orientation:d.orientation,mime:d.file.type,size:d.file.size,createdAt:Date.now()+i
    }));
    await putRecords(records);
    items=await allRecords();
    clearDrafts();
    $('importDialog').close();
    showLimit=70;populateSeries();render();
    $('browse').scrollIntoView({behavior:'smooth'});
    note(records.length+' wallpapers saved locally. Choose more batches any time.');
  }catch(e){
    $('importStatus').textContent='Could not save: '+(e?.message||'Browser storage may be full')+'. For thousands of wallpapers, Cloudflare storage is required.';
  }finally{saving=false;$('saveDrafts').disabled=!drafts.length;}
}
function clearDrafts(){release(draftURLs);drafts=[];$('draftList').replaceChildren();$('importSummary').hidden=true;$('importStatus').textContent='';$('importTrack').hidden=true;$('saveDrafts').disabled=true;}
function note(text){
  const node=$('importStatus');node.textContent=text;
  if(!$('importDialog').open){$('matchedCount').textContent=text;setTimeout(()=>{if($('matchedCount').textContent===text)render();},6000);}
}
function populateSeries(){
  const current=$('series').value,select=$('series');
  const values=[...new Set(items.map(it=>it.series).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  select.replaceChildren(new Option('All series','all'));
  for(const value of values)select.append(new Option(value,value));
  select.value=values.includes(current)?current:'all';
}
function filteredItems(){
  let result=items.filter(item=>{
    if(favOnly&&!favorites.has(item.id))return false;
    const tagQuery=$('tagFilter').value.trim().toLowerCase().replaceAll('#','');
    if(tagQuery){const tokens=tagQuery.split(',').map(x=>x.trim()).filter(Boolean);const hay=(item.tags||[]).join(' ').toLowerCase()+' '+(item.description||'').toLowerCase();if(tokens.some(t=>!hay.includes(t)))return false;}
    const category=$('category').value,series=$('series').value,orient=$('orientation').value;
    if(category!=='all'&&item.category!==category)return false;
    if(series!=='all'&&item.series!==series)return false;
    if(orient!=='all'&&(item.orientation||orientation(item.width,item.height))!==orient)return false;
    const text=$('searchInput').value.trim().toLowerCase();
    if(text){
      const hay=[item.title,item.filename,item.category,item.description,item.series,...(item.tags||[])].join(' ').toLowerCase();
      if(!hay.includes(text))return false;
    }
    return true;
  });
  const sort=$('sort').value;
  if(sort==='name')result.sort((a,b)=>a.title.localeCompare(b.title));
  else if(sort==='res')result.sort((a,b)=>b.width*b.height-a.width*a.height);
  else result.sort((a,b)=>b.createdAt-a.createdAt);
  return result;
}
function makeTile(item){
  const tile=makeEl('article','tile '+(item.orientation||orientation(item.width,item.height)));
  if(selected.has(item.id))tile.classList.add('selected');
  const frame=makeEl('div','tile-frame');
  const button=makeEl('button','tile-button');button.type='button';button.setAttribute('aria-label','View '+item.title);
  const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.alt=item.title;
  const url=URL.createObjectURL(item.thumb||item.blob);img.src=url;cardUrls.push(url);
  button.append(img,makeEl('span','tile-overlay'),makeEl('span','tile-shape',LABELS[item.category]||'Artwork'));
  button.addEventListener('click',()=>openDetail(item.id));
  const fav=makeEl('button','tile-fav',favorites.has(item.id)?'♥':'♡');
  fav.type='button';fav.setAttribute('aria-label',(favorites.has(item.id)?'Remove favorite: ':'Save favorite: ')+item.title);
  fav.addEventListener('click',()=>toggleFavorite(item.id));
  frame.append(fav);
  const selectLabel=makeEl('label','tile-checkbox');selectLabel.title='Select for batch download';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(item.id);checkbox.setAttribute('aria-label','Select '+item.title);
  checkbox.addEventListener('change',()=>{
    if(checkbox.checked)selected.add(item.id);else selected.delete(item.id);
    tile.classList.toggle('selected',checkbox.checked);
    updateSelection();
  });
  selectLabel.append(checkbox);selectLabel.hidden=true;
  frame.append(button,selectLabel);
  const details=makeEl('div','tile-text');
  const title=makeEl('strong',null,item.title);
  const sub=makeEl('small',null,(item.series?item.series+' · ':'')+item.width+' × '+item.height);
  details.append(title,sub);tile.append(frame,details);
  return tile;
}
function render(){
  filtered=filteredItems();
  const grid=$('wallGrid');release(cardUrls);grid.replaceChildren();
  for(const item of filtered.slice(0,showLimit))grid.append(makeTile(item));
  $('totalCount').textContent=items.length.toLocaleString();
  $('matchedCount').textContent=filtered.length+' results';
  $('loadMore').hidden=filtered.length<=showLimit;
  $('empty').hidden=filtered.length>0;
  if(!filtered.length){
    $('emptyHeading').textContent=items.length?'No wallpapers match this search.':'Your archive is waiting.';
    $('emptyCopy').textContent=items.length?'Try other series, category, or orientation filters.':'Import your wallpapers in batches of 100, then browse them like a real wallpaper website.';
    $('emptyImport').hidden=items.length>0;
  }
  for(const button of document.querySelectorAll('[data-quick]'))button.classList.toggle('chosen',button.dataset.quick===$('category').value);
  updateSelection();
}
function updateSelection(){
  for(const id of [...selected])if(!items.some(it=>it.id===id))selected.delete(id);
  const count=selected.size;
  $('selectionDock').hidden=!count;
  $('topSelected').textContent=count;
  $('dockNumber').textContent=count;
  if(batchOpen)renderBatch();
}
function openDetail(id){
  detailItem=items.find(x=>x.id===id);
  if(!detailItem)return;
  if(detailUrl)URL.revokeObjectURL(detailUrl);
  detailUrl=URL.createObjectURL(detailItem.blob);
  $('detailImage').src=detailUrl;$('detailImage').alt=detailItem.title;
  $('detailTitle').textContent=detailItem.title;updateFavoriteButton();
  $('detailDimensions').textContent=detailItem.width+' × '+detailItem.height;
  $('detailSize').textContent=toMb(detailItem.size);
  $('detailName').value=detailItem.title;
  $('detailSeries').value=detailItem.series||'';
  $('detailCategory').value=detailItem.category||'other';
  $('detailDescription').value=detailItem.description||'';
  $('detailTags').value=(detailItem.tags||[]).join(', ');
  $('detailDialog').showModal();
}
async function saveDetails(){
  if(!detailItem)return;
  const title=$('detailName').value.trim().slice(0,90);
  if(!title){$('detailName').focus();return;}
  const updated={...detailItem,title,series:$('detailSeries').value.trim().slice(0,80),
    category:$('detailCategory').value,description:$('detailDescription').value.trim().slice(0,280),
    tags:$('detailTags').value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,20)};
  try{await putRecords([updated]);items=await allRecords();populateSeries();render();$('detailDialog').close();}
  catch(e){window.alert('Unable to save metadata: '+e.message);}
}
function saveFile(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function detailAction(kind){
  if(!detailItem)return;
  if(kind==='original')return saveFile(detailItem.blob,detailItem.filename||'wallpaper.png');
  window.location.href='./ai.html?fromGallery='+encodeURIComponent(detailItem.id)+'&scale='+kind;
}
async function deleteDetail(){
  if(!detailItem)return;
  const item=detailItem;
  if(!confirm('Delete "'+item.title+'" from THIS browser? This cannot be undone.'))return;
  try{
    await deleteRecord(item.id);selected.delete(item.id);quality.delete(item.id);favorites.delete(item.id);saveFavorites();
    items=await allRecords();populateSeries();render();$('detailDialog').close();
  }catch(e){window.alert('Delete failed: '+e.message);}
}
function openBatch(){return; // Bulk download deliberately disabled pending later redesign.
  batchOpen=true;$('overlay').hidden=false;
  $('batchPanel').classList.add('open');$('batchPanel').setAttribute('aria-hidden','false');
  renderBatch();
}
function closeBatch(){
  if(processing)return;
  batchOpen=false;$('batchPanel').classList.remove('open');
  $('batchPanel').setAttribute('aria-hidden','true');$('overlay').hidden=true;
  release(batchUrls);
}
function renderBatch(){
  release(batchUrls);
  const list=$('batchList');list.replaceChildren();
  const ids=[...selected];const active=ids.map(id=>items.find(x=>x.id===id)).filter(Boolean);
  for(const item of active){
    const row=makeEl('div','batch-entry');
    const img=document.createElement('img');img.alt='';img.src=URL.createObjectURL(item.thumb||item.blob);batchUrls.push(img.src);
    const info=makeEl('div');info.append(makeEl('strong',null,item.title),makeEl('small',null,item.width+' × '+item.height));
    const picker=document.createElement('select');picker.setAttribute('aria-label','Download quality for '+item.title);
    for(const [value,label] of [['original','Original'],['2','AI 2×'],['4','AI 4×']])picker.append(new Option(label,value));
    picker.value=quality.get(item.id)||'original';picker.disabled=processing;
    picker.addEventListener('change',()=>quality.set(item.id,picker.value));
    const remove=makeEl('button',null,'×');remove.type='button';remove.title='Remove from queue';remove.disabled=processing;
    remove.setAttribute('aria-label','Remove '+item.title+' from batch');
    remove.addEventListener('click',()=>{selected.delete(item.id);updateSelection();render();});
    row.append(img,info,picker,remove);list.append(row);
  }
  $('batchStatus').textContent=active.length?active.length+' wallpapers ready':'No wallpapers selected';
  $('startBatch').disabled=!active.length||processing;
}
async function batchStart(){
  if(processing)return;
  const entries=[...selected].map(id=>items.find(x=>x.id===id)).filter(Boolean).map(item=>({item,quality:quality.get(item.id)||'original'}));
  if(!entries.length){$('batchDetail').textContent='Select images from the collection first.';return;}
  processing=true;$('startBatch').disabled=true;$('cancelBatch').disabled=false;
  $('batchDetail').textContent='Preparing batch; keep this tab open.';
  $('batchPct').textContent='0%';$('batchProgress').style.width='0%';
  try{
    const blob=await makeBatchZip(entries,(ev)=>{
      $('batchStatus').textContent=ev.stage;
      $('batchDetail').textContent=ev.name?ev.name+' · '+(ev.done+1)+' of '+ev.total+' wallpapers':'Packaging files…';
      $('batchPct').textContent=ev.percent+'%';
      $('batchProgress').style.width=ev.percent+'%';
    });
    saveFile(blob,'waifu-wallpapers-batch-'+new Date().toISOString().slice(0,10)+'.zip');
    $('batchStatus').textContent='All wallpapers ready!';
    $('batchDetail').textContent=entries.length+' wallpapers packaged. ZIP download started ('+toMb(blob.size)+').';
  }catch(e){
    $('batchStatus').textContent='Batch stopped';
    $('batchDetail').textContent=String(e.message||e);
  }finally{
    processing=false;$('cancelBatch').disabled=true;$('startBatch').disabled=!selected.size;
    for(const control of $('batchList').querySelectorAll('select,button'))control.disabled=false;
  }
}
function resetFilters(){favOnly=false;$('favoriteFilter').classList.remove('active');$('tagFilter').value='';$('category').value='all';$('series').value='all';$('orientation').value='all';$('sort').value='recent';$('searchInput').value='';showLimit=70;render();}
function csv(text){return '"'+String(text??'').replace(/"/g,'""')+'"';}
function exportCSV(){
  const headers=['filename','title','description','series','category','tags','width','height','size_bytes','created_at'];
  const rows=[headers.join(',')];
  for(const item of items)rows.push([item.filename,item.title,item.description||'',item.series||'',item.category,(item.tags||[]).join('|'),item.width,item.height,item.size,new Date(item.createdAt).toISOString()].map(csv).join(','));
  saveFile(new Blob([rows.join('\r\n')],{type:'text/csv;charset=utf-8'}),'waifu-wallpapers-metadata.csv');
}
function importOpen(){if(!$('importDialog').open)$('importDialog').showModal();}
function bindUI(){
  for(const id of ['railImport','headerImport','emptyImport','heroImport'])$(id).addEventListener('click',importOpen);
  for(const id of ['railBatch','headerBatch','dockBatch'])$(id).addEventListener('click',openBatch);
  $('dockClear').addEventListener('click',()=>{selected.clear();updateSelection();render();});
  $('clearSelection').addEventListener('click',()=>{selected.clear();updateSelection();render();});
  $('selectVisible').addEventListener('click',()=>{for(const item of filtered.slice(0,showLimit))selected.add(item.id);render();});
  $('batchClose').addEventListener('click',closeBatch);
  $('overlay').addEventListener('click',()=>{
    if(batchOpen)closeBatch();
    $('rail').classList.remove('menu-open');
    $('overlay').hidden=true;
  });
  $('applyQuality').addEventListener('click',()=>{for(const id of selected)quality.set(id,$('defaultQuality').value);renderBatch();});
  $('startBatch').addEventListener('click',batchStart);
  $('cancelBatch').addEventListener('click',()=>{cancelBatchWork();$('batchStatus').textContent='Stopping at next processing tile…';});
  for(const id of ['searchInput','category','series','orientation','sort','tagFilter'])$(id).addEventListener(['searchInput','tagFilter'].includes(id)?'input':'change',()=>{showLimit=70;render();});
  $('clearAll').addEventListener('click',resetFilters);
  $('loadMore').addEventListener('click',()=>{showLimit+=70;render();});
  for(const button of document.querySelectorAll('[data-quick]'))button.addEventListener('click',()=>{
    $('category').value=button.dataset.quick;showLimit=70;render();
    document.getElementById('archiveHeading').scrollIntoView({behavior:'smooth',block:'center'});
  });
  $('exportCsv').addEventListener('click',exportCSV);
  $('favoriteFilter').addEventListener('click',()=>{favOnly=!favOnly;$('favoriteFilter').classList.toggle('active',favOnly);render();$('archiveHeading').scrollIntoView({behavior:'smooth'});});
  $('detailFavorite').addEventListener('click',()=>{if(detailItem)toggleFavorite(detailItem.id);});
  $('menuToggle').addEventListener('click',()=>{$('rail').classList.toggle('menu-open');$('overlay').hidden=!$('rail').classList.contains('menu-open');});
  $('importClose').addEventListener('click',()=>{if(!preparing&&!saving)$('importDialog').close();});
  $('clearDrafts').addEventListener('click',()=>{if(!preparing&&!saving)clearDrafts();});
  $('saveDrafts').addEventListener('click',saveImport);
  $('bulkFiles').addEventListener('change',ev=>{prepareBatch(ev.target.files);ev.target.value='';});
  $('bulkFolder').addEventListener('change',ev=>{prepareBatch(ev.target.files);ev.target.value='';});
  const drop=$('dropzone');
  for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('drag-over');});
  for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('drag-over');});
  drop.addEventListener('drop',e=>prepareBatch(e.dataTransfer.files));
  $('detailClose').addEventListener('click',()=>$('detailDialog').close());
  $('detailDialog').addEventListener('close',()=>{if(detailUrl)URL.revokeObjectURL(detailUrl);detailUrl=null;});
  $('saveDetails').addEventListener('click',saveDetails);
  $('detailOriginal').addEventListener('click',()=>detailAction('original'));
  $('detail2x').addEventListener('click',()=>detailAction('2'));
  $('detail4x').addEventListener('click',()=>detailAction('4'));
  $('detailDelete').addEventListener('click',deleteDetail);
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&batchOpen)closeBatch();});
  window.addEventListener('pagehide',()=>{release(cardUrls);release(batchUrls);release(draftURLs);if(detailUrl)URL.revokeObjectURL(detailUrl);});
}
async function init(){
  bindUI();
  try{
    db=await openDatabase();
    items=await allRecords();
    populateSeries();render();
    if(typeof ort!=='undefined'){
      ort.env.wasm.proxy=true;
      ort.env.wasm.numThreads=Math.min(navigator.hardwareConcurrency||4,8);
    }
  }catch(e){
    $('emptyHeading').textContent='Local storage unavailable';
    $('emptyCopy').textContent='Open this website in Chrome and allow site storage: '+e.message;
    $('headerImport').disabled=true;
  }
}
document.addEventListener('DOMContentLoaded',init);
