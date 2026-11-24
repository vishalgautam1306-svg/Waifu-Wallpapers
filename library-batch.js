import { onnxRunner } from "./js/runner.js";
import { CONFIG } from "./js/models.js";
import { decodeImage, onnxSession } from "./js/utils.js";

// Sequential neural upscaling. Only the completed output is added to the ZIP.
// This uses the SAME real ONNX engine as the working Waifu Wallpapers AI Lab.
const phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const MAX_AI_JOBS = phone ? 2 : 8;
const MAX_4X_PIXELS = phone ? 12_000_000 : 38_000_000;
const MAX_2X_PIXELS = phone ? 24_000_000 : 65_000_000;
const MAX_ZIP_BYTES = phone ? 300 * 1024 * 1024 : 900 * 1024 * 1024;
let cancelRequested = false;
let running = false;
export const capabilities = {phone, maxAIJobs:MAX_AI_JOBS};

export function cancelBatchWork() {
  cancelRequested = true;
  onnxRunner.stop_flag = true;
}
function imageDataFromFile(file) {
  return new Promise((resolve,reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {resolve(decodeImage(img));}
      catch(e){reject(e);}
      finally {URL.revokeObjectURL(url);}
    };
    img.onerror = () => {URL.revokeObjectURL(url);reject(new Error("Unable to read "+file.name));};
    img.src=url;
  });
}
function filenameFor(item, quality, i) {
  const base=(item.title || item.filename || 'wallpaper').replace(/[^a-z0-9 _-]/gi,'').replace(/\s+/g,'_').slice(0,57) || 'wallpaper';
  const suffix=quality==='original'?'original':quality+'x_AI';
  const ext=quality==='original'?(item.mime==='image/png'?'png':item.mime==='image/webp'?'webp':'jpg'):'png';
  return String(i+1).padStart(2,'0')+'_'+base+'_'+suffix+'.'+ext;
}
async function aiOutput(item,scale,onTile) {
  if(typeof ort==='undefined') throw new Error('ONNX Runtime did not load. Check your connection.');
  if(!window.isSecureContext) throw new Error('Secure HTTPS is required for the AI engine');
  if(cancelRequested) throw new Error('Batch canceled');
  const pixels=item.width*item.height*scale*scale;
  if(pixels > (scale===4?MAX_4X_PIXELS:MAX_2X_PIXELS)) {
    throw new Error(item.title+' is too large for '+scale+'× bulk AI on this device. Use Original or the individual AI Studio.');
  }
  const data=await imageDataFromFile(item.blob);
  if(cancelRequested) throw new Error('Batch canceled');
  const model=CONFIG.get_config("swin_unet","art",`noise0_scale${scale}x`);
  if(!model) throw new Error('AI model unavailable');
  const tileSize=model.calc_tile_size(phone?64:256,model);
  // WebGPU can be much faster on laptops; WASM is used as a fallback by the upstream runtime.
  onnxSession.backend="auto";
  if(!onnxRunner.running) onnxRunner.stop_flag=false;
  const canvas=document.createElement('canvas');
  const progress=(done,total,processing)=>{
    if(cancelRequested)onnxRunner.stop_flag=true;
    if(processing && total>0) onTile(done,total);
  };
  await onnxRunner.tiled_render(data,model,null,0,tileSize,false,canvas,progress);
  if(cancelRequested||onnxRunner.stop_flag)throw new Error('Batch canceled');
  const blob=await new Promise((resolve,reject)=>{
    canvas.toBlob(result=>result?resolve(result):reject(new Error('PNG encoding failed; device memory may be full')),'image/png');
  });
  // Release the large drawing backing store before the next job begins.
  canvas.width=1;canvas.height=1;
  return blob;
}
function checkZipLib(){
  if(typeof zip==='undefined'||typeof zip.ZipWriter!=='function') throw new Error('ZIP library did not load. Try Chrome with internet enabled.');
}
function formatMb(bytes){return (bytes/(1024*1024)).toFixed(1)+' MB';}
export async function makeBatchZip(items,onProgress) {
  if(running)throw new Error('A batch is already running');
  if(!items.length)throw new Error('Select some wallpapers first');
  if(items.length>100)throw new Error('Please select 100 or fewer images per ZIP');
  const countAI=items.filter(x=>x.quality!=='original').length;
  if(countAI>MAX_AI_JOBS)throw new Error(`This device allows up to ${MAX_AI_JOBS} AI-enhanced images per ZIP. Choose Original for the others or split the batch.`);
  if(countAI && typeof ort==='undefined')throw new Error('The neural inference engine is not available.');
  checkZipLib();
  if(!window.isSecureContext && countAI)throw new Error('HTTPS is required for on-device AI processing.');

  running=true;cancelRequested=false;
  let doneBytes=0;
  const writer = new zip.ZipWriter(new zip.BlobWriter('application/zip'),{useWebWorkers:false});
  try {
    for(let i=0;i<items.length;i++) {
      if(cancelRequested)throw new Error('Batch canceled');
      const {item,quality}=items[i];
      onProgress({done:i,total:items.length,stage:quality==='original'?'Preparing original':`AI ${quality}×: loading or processing model`,name:item.title,percent:Math.round(i/items.length*100)});
      const blob=quality==='original' ? item.blob : await aiOutput(item,Number(quality),(completed,total)=>{
        const percent=Math.round(((i+(completed/total))/items.length)*100);
        onProgress({done:i,total:items.length,stage:`AI ${quality}×: tile ${completed}/${total}`,name:item.title,percent});
      });
      if(cancelRequested)throw new Error('Batch canceled');
      doneBytes += blob.size;
      if(doneBytes > MAX_ZIP_BYTES)throw new Error('The ZIP has become too large for safe browser export ('+formatMb(doneBytes)+'). Split the batch.');
      const name=filenameFor(item,quality,i);
      onProgress({done:i,total:items.length,stage:'Adding to ZIP: '+name,name:item.title,percent:Math.round((i+.9)/items.length*100)});
      await writer.add(name,new zip.BlobReader(blob),{level:0});
    }
    onProgress({done:items.length,total:items.length,stage:'Finalizing ZIP…',name:'',percent:99});
    const result=await writer.close();
    if(cancelRequested)throw new Error('Batch canceled');
    onProgress({done:items.length,total:items.length,stage:'Finished',name:'',percent:100});
    return result;
  }finally{
    running=false;
    onnxRunner.stop_flag=false;
  }
}