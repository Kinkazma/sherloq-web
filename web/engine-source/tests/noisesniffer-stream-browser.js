import {createWorkerEngine as createEngine} from '../src/worker-client.js';
import {storageInventory as inventory} from './source-api-browser.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
const assert=(ok,message)=>{if(!ok)throw Error(message);};

export async function noisesnifferStreamBrowserTest(){
 const ref=await(await fetch('/.build/noisesniffer-stream/reference.json')).json(),blob=await(await fetch('/.build/noisesniffer-stream/input.jpg')).blob(),before=await inventory(),cases=[];
 for(const limit of [512,128]){console.log('Noisesniffer budget',limit);
  const engine=createEngine({memoryBudgetBytes:limit*1024**2,resourceHints:{hardwareConcurrency:4}});let held;
  try{const loaded=await engine.loadBlob({id:'image',blob,layout:'segmented'});assert(loaded.availableOperations.includes('noise.noisesniffer'),'segmented advertised');const [blockSize,cellSize,samplesPerBin,lowFrequencyFraction,lowNoiseFraction]=ref.parameters,params={blockSize,cellSize,samplesPerBin,lowFrequencyFraction,lowNoiseFraction};
   for(const [view,key]of [['regions','overlay'],['mask','mask'],['distribution','distribution']]){
    const result=await engine.run({id:view,imageId:'image',operation:'noise.noisesniffer',params:{...params,view}},{onProgress:p=>{if(p.completed===p.total)console.log(limit,view,p.phase);}});assert(result.data.metadata.valid_blocks===ref.validCount,'valid count');assert(result.data.metadata.selected_blocks===ref.selectedCount,'selected count');assert(JSON.stringify(result.data.metadata.regions.map(r=>r.cells))===JSON.stringify(ref.regions.map(r=>r.cells)),'ordered native regions');
    const sha=await createSHA256();for(let y=0;y<ref.height;y+=32){const page=await engine.readPixels({surfaceId:result.surface.id,revision:1,rect:{x:0,y,width:ref.width,height:Math.min(32,ref.height-y)}});sha.update(view==='mask'?Uint8Array.from({length:page.pixels.data.length/3},(_,i)=>page.pixels.data[i*3]):page.pixels.data);}const hash=sha.digest('hex');assert(hash===ref.arrays[key],'native '+key+' SHA '+hash);assert(result.metrics.memory.peakAccountedBytes<=limit*1024**2,'shared budget');cases.push({limitMiB:limit,view,sha256:hash,metrics:result.metrics});
    if(view==='distribution')held=result;else await engine.releaseSurface(result.surface.id);
   }
   let at=0,pages=0,bytes=0;const npz=await createSHA256();do{const page=await engine.readNpz({surfaceId:held.surface.id,revision:1,offset:at,length:262141});npz.update(page.bytes);pages++;bytes+=page.bytes.length;at=page.nextOffset;if(page.done)break;}while(true);cases.push({limitMiB:limit,npzPages:pages,npzBytes:bytes,npzSha256:npz.digest('hex')});
   const controller=new AbortController();await engine.run({id:'cancel',imageId:'image',operation:'noise.noisesniffer',params:{...params,lowFrequencyFraction:.3}},{signal:controller.signal,onProgress:p=>{if(p.phase==='noisesniffer-select')controller.abort();}}).then(()=>{throw Error('expected cancel');},e=>assert(e.code==='CANCELLED'&&e.imagesCleared,'worker cancel clears sources: '+e.code+' '+e.message));await engine.loadBlob({id:'recovered',blob,layout:'segmented'});await engine.unload('recovered');assert((await engine.capabilities()).memory.activeReservationBytes===0,'released reservations');
  }finally{await engine.dispose();}
 }
 const after=await inventory();assert(JSON.stringify(before)===JSON.stringify(after),'temporary cleanup');return {status:'passed',dimensions:[ref.width,ref.height],cases,storageArtifactsRemaining:after.length-before.length};
}
