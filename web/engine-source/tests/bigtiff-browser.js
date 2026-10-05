import {createWorkerEngine} from '../src/worker-client.js';
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export async function bigtiffBrowserTest(){const root='/tests/data/bigtiff/',ref=await(await fetch(root+'reference.json')).json(),engine=createWorkerEngine({memoryBudgetBytes:128*1024**2});let exact=0,peak=0;try{
 for(const row of ref.cases){const blob=await(await fetch(root+row.file)).blob(),inspection=await engine.inspectHeaders({blob});if(!inspection.header.bigTiff||inspection.metrics.pixelDecode)throw Error('BigTIFF header-only inspection');if(row.file==='rgb8-le.tiff'&&inspection.header.directories[0].entries.find(e=>e.tag===65000).value.integer64!=='1152921504606847099')throw Error('64-bit scalar lost');
 const loaded=await engine.loadBlob({id:'i',blob}),pixels=await engine.imagePixels('i');if(loaded.width!==row.width||loaded.height!==row.height||loaded.provenance.container!=='BigTIFF'||await sha(pixels.data)!==row.rgbSha256)throw Error('BigTIFF native mismatch');peak=Math.max(peak,loaded.metrics.memory.peakAccountedBytes);exact++;await engine.unload('i');}
 return {status:'passed',nativeCases:exact,predecodeHeaders:true,exactLargeScalarStrings:true,peakAccountedBytes:peak,hugeFilesQualified:false};
 }finally{engine.dispose();}}
