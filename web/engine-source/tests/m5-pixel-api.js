import {createWorkerEngine} from '../src/worker-client.js';
import {magnifier,magnifierParams} from '../src/magnifier.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';

const assert=(v,message)=>{if(!v)throw Error(message);};
export async function test(){
 const started=performance.now(),width=6144,height=4096,canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d'),rgba=context.createImageData(width,height);
 for(let i=0;i<width*height;i++){rgba.data[i*4]=(i*13^(i>>6))&255;rgba.data[i*4+1]=(i*31^(i>>9))&255;rgba.data[i*4+2]=(i*7^(i>>13))&255;rgba.data[i*4+3]=255;}
 context.putImageData(rgba,0,0);const blob=await canvas.convertToBlob({type:'image/jpeg',quality:.87}),engine=createWorkerEngine({memoryBudgetBytes:256*1024**2,resourceHints:{hardwareConcurrency:4}}),exports=[],cases=[];
 try{
  const loaded=await engine.loadBlob({id:'pixels',blob,layout:'segmented'}),pixels={width,height,format:'rgb8',data:new Uint8Array(width*height*3)};
  for(let y=0;y<height;y+=32){const p=await engine.readPixels({surfaceId:loaded.surface.id,revision:1,rect:{x:0,y,width,height:32}});pixels.data.set(p.pixels.data,y*width*3);}
  for(const [i,params]of [{mode:'equalize'},{mode:'contrast',percent:30}].entries()){
   const expected=await magnifier(pixels,magnifierParams(params)),result=await engine.run({id:'magnifier-'+i,imageId:'pixels',operation:'inspection.magnifier',params});
   assert(result.layout==='surface','Large magnifier public surface missing');assert(result.surface.width===width&&result.surface.height===height,'Original dimensions changed');assert(result.layers[0].origin.every(v=>v===0),'Original origin changed');
   const hash=await createSHA256();for(let y=0;y<height;y+=32){const p=await engine.readPixels({surfaceId:result.surface.id,revision:1,rect:{x:0,y,width,height:32}}),offset=y*width*3;assert(p.pixels.data.every((v,j)=>v===expected.pixels.data[offset+j]),'Magnifier exact RGB mismatch');hash.update(p.pixels.data);}
   if(i)assert(result.metrics.analysisCacheHit,'Magnifier global histogram was not reused');
   const exported=await engine.exportSurface({surfaceId:result.surface.id,revision:1,format:'png',compression:0,storage:'temporary'});assert(exported.metrics.storage==='temporary','Explicit temporary PNG ignored');exports.push(exported);cases.push({params,sha256:hash.digest('hex'),metrics:result.metrics,export:exported});await engine.releaseSurface(result.surface.id);
  }
  await engine.unload('pixels');
  for(const d of exports){const hash=await createSHA256();let length=0;while(length<d.byteLength){const p=await engine.readExport({exportId:d.id,revision:1,offset:length,length:Math.min(1024**2,d.byteLength-length)});hash.update(p.bytes);assert(p.nextOffset>length,'Export made no progress');length=p.nextOffset;}assert(hash.digest('hex')===d.sha256,'Complete PNG changed after source release');await engine.releaseExport(d.id);}
  const capabilities=await engine.capabilities(),memory=capabilities.memory;assert(!memory.retainedBytes&&!memory.cacheBytes&&!memory.activeReservationBytes,'Accounted memory remains');
  return {passed:true,scope:'Merged public worker API: large magnifier fallback, original-coordinate surfaces, global histogram reuse, full temporary PNG hashes after source release. The native 96 MP corpus remains separately pinned to M4.',version:capabilities.version,width,height,cases,memory,elapsedMs:performance.now()-started};
 }finally{await engine.dispose();}
}
