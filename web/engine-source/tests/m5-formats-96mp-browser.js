import {createWorkerEngine} from '../src/worker-client.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {storageInventory} from './source-api-browser.js';
const assert=(value,message)=>{if(!value)throw Error(message);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function testFormats96mp(){
 const reference=await(await fetch('/formats-reference')).json(),before=await storageInventory(),budgetBytes=256*1024**2,engine=createWorkerEngine({memoryBudgetBytes:budgetBytes,resourceHints:{hardwareConcurrency:4}}),started=performance.now(),cases=[];let archive,last='',stamp=0;
 const progress=event=>{const now=performance.now();if(event.phase!==last||now-stamp>2000){last=event.phase;stamp=now;console.log('FORMATS96',JSON.stringify(event));}};
 try{
  for(const [index,expected] of reference.cases.entries()){
   const start=performance.now(),blob=await(await fetch('/format/'+expected.file)).blob();let at=performance.now();const source=await engine.loadBlob({id:'source',blob,layout:'segmented'},{onProgress:progress}),loadMs=performance.now()-at;
   assert(source.width===12000&&source.height===8000&&source.sha256===expected.sha256,'Original96MP format source');
   assert(source.provenance.sourceDepth===16,'Native16-bit conversion');if(expected.interlace)assert(source.metrics.passes===7,'Seven global Adam7 passes');if(expected.bigTiff)assert(source.provenance.container==='BigTIFF'&&source.metrics.blockWidth===256,'Native tiled BigTIFF path');
   const hash=await createSHA256();at=performance.now();
   for(let y=0;y<8000;y+=512){const part=await engine.readPixels({surfaceId:source.surface.id,revision:source.surface.revision,rect:{x:0,y,width:12000,height:Math.min(512,8000-y)}});hash.update(part.pixels.data);}
   assert(hash.digest('hex')===expected.rgbSha256,'Every original RGB pixel exact');const pixelReadMs=performance.now()-at;
   const rect={x:1710,y:1610,width:128,height:96},window=await engine.readPixels({surfaceId:source.surface.id,revision:source.surface.revision,rect}),again=await engine.readPixels({surfaceId:source.surface.id,revision:source.surface.revision,rect});
   assert(window.origin[0]===rect.x&&window.origin[1]===rect.y&&window.pixels.data.every((v,i)=>v===again.pixels.data[i]),'Stable original-coordinate view');
   at=performance.now();archive=await engine.exportSurface({surfaceId:source.surface.id,revision:source.surface.revision,format:'png',compression:0,storage:'temporary'},{onProgress:progress});const exportMs=performance.now()-at;await engine.unload('source');
   const encodedHash=await createSHA256();at=performance.now();let delivered=0;
   for(let offset=0;offset<archive.byteLength;offset+=4*1024**2){const part=await engine.readExport({exportId:archive.id,revision:archive.revision,offset,length:Math.min(4*1024**2,archive.byteLength-offset)});encodedHash.update(part.bytes);delivered+=part.bytes.length;const response=await fetch('/png-part?index='+index+'&offset='+offset,{method:'POST',body:part.bytes});assert(response.ok,'Complete PNG local delivery');}
   assert(delivered===archive.byteLength&&encodedHash.digest('hex')===archive.sha256,'Every PNG byte after unload');const readbackMs=performance.now()-at,exportInfo={byteLength:archive.byteLength,sha256:archive.sha256,afterSourceUnload:true};await engine.releaseExport(archive.id);archive=null;
   const memory=(await engine.capabilities()).memory;assert(memory.retainedBytes+memory.cacheBytes+memory.activeReservationBytes===0,'Per-source ownership cleanup');
   cases.push({file:expected.file,source,fullRgbSha256:expected.rgbSha256,times:{loadMs,pixelReadMs,exportMs,readbackMs,totalMs:performance.now()-start},archive:exportInfo,finalMemory:memory});console.log('FORMAT_DONE',expected.file);
  }
  await engine.dispose();assert(same(before,await storageInventory()),'Temporary inventory restored');return {passed:true,scope:'Two distinct96MP source-memory paths: RGB16 Adam7 seven-pass PNG and deflate/predictor RGB16 tiled BigTIFF. Full native RGB8 comparisons, original-coordinate views and whole PNGs after unload.',budgetBytes,cases,totalMs:performance.now()-started,storageCleanup:true};
 }finally{if(archive)await engine.releaseExport(archive.id);await engine.dispose();}
}
