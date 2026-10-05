import{Budget}from'../src/cache.js';import{loadSegmentedJpeg,disposeSegmentedImage}from'../src/image-sources.js';import{jpegCodec}from'../src/jpeg.js';import{rgbRowSource}from'../src/rgb-row-source.js';
import{createPreparation}from'../experiments/d2prl/prepare.js';import{createSegmentationPrepare}from'../experiments/segmentation/prepare.js';import factory from'../vendor/d2prl/prepare.js';
const assert=(v,m)=>{if(!v)throw Error(m);},hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(a.buffer,a.byteOffset,a.byteLength))),x=>x.toString(16).padStart(2,'0')).join('');
self.onmessage=async({data:{blob,reference}})=>{
 const budget=new Budget(256*1024**2),cases=[];let image,resident,torch,pil;
 try{
  const started=performance.now();image=await loadSegmentedJpeg(blob,{budget});const loadMs=performance.now()-started;assert(image.sha256===reference.originalSha256&&image.metrics.storage==='temporary','Native original and segmented source');
  resident=budget.reserve(jpegCodec.memoryBytes());torch=await createPreparation(factory,{budget});pil=createSegmentationPrepare({budget});
  for(const e of reference.cases){
   const input=rgbRowSource(image.surface,e.bounds),out=await torch.runRows(input);let d2;
   try{const sha256=await hash(out.data);assert(sha256===e.d2prl.sha256,'Native Torch tensor '+e.bounds);d2={sha256,metrics:out.metrics,memory:budget.snapshot()};}finally{out.release();}
   const segmentation=[];for(const expected of e.segmentation){const out=await pil.run({...input,side:expected.side});try{const rgbSha256=await hash(out.rgb),tensorSha256=await hash(out.tensor);assert(rgbSha256===expected.rgbSha256&&tensorSha256===expected.tensorSha256,'Native Pillow tensor '+expected.side+' '+e.bounds);segmentation.push({side:expected.side,rgbSha256,tensorSha256,metrics:out.metrics,memory:budget.snapshot()});}finally{out.release();}}
   cases.push({bounds:e.bounds,d2prl:d2,segmentation});self.postMessage({progress:true,bounds:e.bounds});
  }
  const baseline=budget.total(),small=rgbRowSource(image.surface,[31,29,288,230]);
  for(const family of ['d2prl','segmentation']){const abort=new AbortController();let code;try{const hooks={signal:abort.signal,rowsPerRead:3,onProgress:()=>abort.abort()};const out=family==='d2prl'?await torch.runRows(small,hooks):await pil.run({...small,side:512},hooks);out.release();}catch(e){code=e.code;}assert(code==='CANCELLED','Native preparation cancellation '+family);assert(budget.total()===baseline,'Cancellation releases windows '+family);const out=family==='d2prl'?await torch.runRows(small):await pil.run({...small,side:512});out.release();}
  torch.dispose();torch=null;pil.dispose();pil=null;resident();resident=null;await disposeSegmentedImage(image);image=null;assert(budget.total()===0,'Preparation and source cleanup');
  self.postMessage({ok:true,report:{schema:1,status:'passed',scope:'Qualified common JPEG loader, actual OPFS and oriented RGB row-source preparation in a browser worker; full96MP and actual92MP ROI, native Torch448 and Pillow256/512 tensor SHA exact. Preparation only, no model inference or public segmented AI claim.',loadMs,cases,cancellationAndRetry:true,memory:budget.snapshot()}});
 }catch(e){self.postMessage({ok:false,error:{message:e.message,stack:e.stack}});}finally{torch?.dispose();pil?.dispose();resident?.();if(image)await disposeSegmentedImage(image);}
};
