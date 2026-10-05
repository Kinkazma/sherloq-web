import {createEngine} from '../src/index.js';import {createSHA256} from '../vendor/hash-wasm/hashes.js';
function assert(ok,text){if(!ok)throw Error(text);}
async function inventory(){const root=await navigator.storage.getDirectory(),names=[];for await(const name of root.keys())names.push(name);return names.sort();}
export async function comparisonStreamBrowserTest({limits=[768,64],mixed=false}={}){
 const expected=await(await fetch('/.build/comparison-stream/reference.json')).json(),blobs=await Promise.all(['first','second'].map(async n=>(await fetch('/.build/comparison-stream/'+n+'.jpg')).blob())),before=await inventory(),cases=[];
 for(const limit of limits){
  const engine=createEngine({memoryBudgetBytes:limit*1024**2,resourceHints:{hardwareConcurrency:4}});let disposed=false;
  try{
   for(let i=0;i<2;i++){const source=await engine.loadBlob({id:['first','second'][i],blob:blobs[i],layout:mixed&&i===0?'auto':'segmented'});assert(source.availableOperations.includes('comparison.image'),'comparison advertised');if(mixed&&i===0)assert(source.provenance.layout!=='segmented-scanlines','mixed pair starts with contiguous source');}
   let cancel=false;
   const views=limit===64?expected.views.filter(v=>['normal','difference'].includes(v.mode)):limit===512?expected.views.filter(v=>v.mode==='normal'&&!v.equalized):expected.views;
   for(const view of views){const phases=[],result=await engine.run({id:'pair',imageId:'first',operation:'comparison.image',params:{referenceImageId:'second',metrics:limit!==64,view:view.mode,equalized:view.equalized,grayscale:view.grayscale}},{onProgress:p=>phases.push(p.phase)});
    if(limit!==64)for(const [key,value]of Object.entries(expected.values)){const actual=result.data.values[key];assert(typeof value!=='number'?actual===value:Math.abs(actual-value)<=(['butter','ssimul'].includes(key)?0:1e-12*Math.max(1,Math.abs(value))),'native metric '+key+' '+actual+' / '+value);}
    const hasher=await createSHA256();for(let y=0;y<expected.height;y+=32){const page=await engine.readPixels({surfaceId:result.surface.id,revision:1,rect:{x:0,y,width:expected.width,height:Math.min(32,expected.height-y)}});hasher.update(page.pixels.data);}const sha256=hasher.digest('hex');assert(sha256===view.sha256,'native pixels '+view.mode+' '+sha256);assert(result.metrics.memory.peakAccountedBytes<=limit*1024**2,'budget respected');cases.push({limitMiB:limit,view,sha256,metrics:result.metrics});await engine.releaseSurface(result.surface.id);
   }
   if(limit!==64){const controller=new AbortController();await engine.run({id:'cancel',imageId:'first',operation:'comparison.image',params:{referenceImageId:'second',view:'butter'}},{signal:controller.signal,onProgress:p=>{if(p.phase==='comparison-metric'&&p.completed===0)controller.abort();}}).then(()=>{throw Error('cancellation succeeded unexpectedly');},error=>{assert(error.code==='CANCELLED','cancellation code');cancel=true;});assert(cancel,'cancel observed');}
   const held=await engine.run({id:'held',imageId:'first',operation:'comparison.image',params:{referenceImageId:'second',view:'normal'}});await engine.unload('second');await engine.readPixels({surfaceId:held.surface.id,revision:1,rect:{x:0,y:0,width:1,height:1}}).then(()=>{throw Error('dependent output survived reference unload');},e=>assert(e.code==='NOT_FOUND','dependent output removed'));
   await engine.unload('first');assert(engine.capabilities().memory.activeReservationBytes===0,'reservations released');await engine.dispose();disposed=true;
  }finally{if(!disposed)await engine.dispose();}
 }
 const after=await inventory();assert(JSON.stringify(before)===JSON.stringify(after),'OPFS cleanup');return {status:'passed',mixed,dimensions:[expected.width,expected.height],cases,storageArtifactsRemaining:after.length-before.length};
}
