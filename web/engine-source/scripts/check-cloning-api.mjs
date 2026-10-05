import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';
const base=new URL('../.build/cloning-study/',import.meta.url);
const read=async(file,Type=Uint8Array)=>{const b=await fs.readFile(new URL(file,base));return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const cases=JSON.parse(await fs.readFile(new URL('api-reference.json',base))),engine=createEngine({memoryBudgetBytes:1024**3,cpuKernel:'single'}),task={id:'copy',imageId:'image',operation:'tampering.copyMove.orb'};
const exact=(a,b,label)=>{assert.equal(a.length,b.length,label+' length');for(let i=0;i<a.length;i++)if(a[i]!==b[i])assert.fail(label+' '+i+': '+a[i]+'/'+b[i]);};
const records=[];let currentImage,currentMask;
try{
  for(const r of cases){
    if(r.image!==currentImage){if(currentMask&&currentMask!=='all')engine.unload('mask');if(currentImage)engine.unload('image');await engine.loadBlob({id:'image',blob:new Blob([await read(r.image+'.png')])});currentImage=r.image;currentMask='all';}
    if(r.mask!==currentMask){if(currentMask!=='all')engine.unload('mask');if(r.mask!=='all')await engine.loadBlob({id:'mask',blob:new Blob([await read(r.image+'-'+r.mask+'-mask.png')])});currentMask=r.mask;}
    const params={...r.params,maskImageId:r.mask==='all'?null:'mask'},progress=[];
    const output=await engine.run({...task,params},{onProgress:e=>progress.push(e.fraction)});
    assert.ok(progress.every((x,i)=>!i||x>=progress[i-1]),'monotonic progress');assert.deepEqual(output.data.stats,r.stats);
    exact(output.data.points,await read(r.prefix+'-points.f64',Float64Array),'points');exact(output.data.matches,await read(r.prefix+'-filtered.f64',Float64Array),'matches');exact(output.data.groupLengths,await read(r.prefix+'-lengths.u32',Uint32Array),'lengths');exact(output.data.groupIndices,await read(r.prefix+'-groups.u32',Uint32Array),'groups');exact(output.pixels.data,await read(r.prefix+'.rgb'),'RGB');
    assert.equal(output.metrics.memory.activeReservationBytes,0);assert.ok(output.metrics.memory.peakAccountedBytes<=1024**3);
    records.push({prefix:r.prefix,image:r.image,mask:r.mask,params,stats:output.data.stats,metrics:output.metrics});console.log(r.prefix,r.image);
  }
  if(currentMask!=='all')engine.unload('mask');engine.unload('image');const cleanup=engine.capabilities().memory;assert.equal(cleanup.retainedBytes+cleanup.cacheBytes+cleanup.activeReservationBytes,0);
  await fs.writeFile(new URL('api-results.json',base),JSON.stringify({status:'exact native PNG/mask/API corpus',cleanup,records},null,2)+'\n');
}finally{engine.dispose();}
