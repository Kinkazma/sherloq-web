import {createWorkerEngine} from '../src/worker-client.js';import {createEngine} from '../src/index.js';import {inspectExiftool} from '../src/exiftool.js';import {Budget} from '../src/cache.js';
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
export async function exiftoolBrowserTest(){
 const root='/tests/data/exiftool/',reference=await(await fetch(root+'reference.json')).json(),engine=createWorkerEngine({memoryBudgetBytes:640*1024**2}),assert=(ok,msg)=>{if(!ok)throw Error(msg);};let count=0,heap=0,peak=0;const reads=[];
 try{
  for(const row of reference.cases){const blob=await(await fetch(root+row.file)).blob();
   for(const mode of ['dump','location','headers','thumbnail']){const r=await engine.inspectMetadata({blob:new File([blob],row.file,{lastModified:123456789}),mode});
    if(mode==='dump'){assert(JSON.stringify(r.data.metadata)===JSON.stringify(row.metadata),row.file+' full dump');if(row.file==='xmp-gps.jpg')assert(r.data.coordinates===null&&r.data.metadata['XMP:GPSLongitude']===-12.25,'native XMP-only GPS absence');assert(r.file.lastModified===123456789,'source file metadata');}
    else if(mode==='location'){assert(JSON.stringify(r.data.metadata)===JSON.stringify(row.locationMetadata),'native explicit composite request');if(row.file==='zero-gps.jpg')assert(r.data.coordinates.latitude===0&&r.data.coordinates.longitude===0,'zero coordinates');}
    else assert(await sha(mode==='headers'?new TextEncoder().encode(r.data.html):r.data.bytes)===(mode==='headers'?row.htmlSha256:row.thumbnailSha256),row.file+' '+mode);
    assert(!r.metrics.pixelDecode,'pixel decode');heap=Math.max(heap,r.metrics.wasmHeapBytes);peak=Math.max(peak,r.metrics.memory.peakAccountedBytes);reads.push(r.metrics.sourceReads.maximumBytes);count++;
    const caps=await engine.capabilities();assert(caps.memory.retainedBytes===0&&caps.memory.activeReservationBytes===0,'inspection retains source/reservation');
   }
  }
  const blob=await(await fetch(root+'rich.jpg')).blob();await engine.loadBlob({id:'source',blob});
  const result=await engine.run({id:'exif',imageId:'source',operation:'metadata.exiftool',params:{mode:'dump'}});assert(JSON.stringify(result.data.metadata)===JSON.stringify(reference.cases[0].metadata),'loaded source route');
  const exported=await engine.exportResult(result,{format:'json'});assert(JSON.parse(new TextDecoder().decode(exported.bytes)).data.metadata['ExifTool:ExifToolVersion']===13.55,'JSON export');
  const controller=new AbortController();let cancelled=false;try{await engine.inspectMetadata({blob},{signal:controller.signal,onProgress:e=>{if(e.fraction>0)controller.abort();}});}catch(e){cancelled=e.code==='CANCELLED'&&e.imagesCleared;}assert(cancelled,'worker hard cancellation');
  const recovered=await engine.inspectMetadata({blob});assert(recovered.data.metadata['ExifTool:ExifToolVersion']===13.55,'worker reinitialization');
  const direct=createEngine({memoryBudgetBytes:640*1024**2});try{
   await direct.loadBlob({id:'source',blob});const controller=new AbortController();let cancelled=false;
   try{await direct.run({id:'exif',imageId:'source',operation:'metadata.exiftool'},{signal:controller.signal,onProgress:e=>{if(e.fraction>0)controller.abort();}});}catch(e){cancelled=e.code==='CANCELLED';}
   assert(cancelled&&direct.originalBlob('source').size===blob.size&&direct.capabilities().memory.activeReservationBytes===0,'direct cancellation/source retention');
  }finally{await direct.dispose();}
  const budget=new Budget(1024);let refused=false;try{await inspectExiftool(blob,{}, {budget});}catch(e){refused=e.code==='MEMORY_LIMIT';}assert(refused&&budget.active===0,'memory refusal');
  // A large original is backed by Blob; WASI sees small requested ranges, not a full copy.
  const large=new Blob([blob,new Uint8Array(32*1024**2)]),largeResult=await engine.inspectMetadata({blob:large});assert(largeResult.data.metadata['File:FileSize']===large.size,'large size');assert(largeResult.metrics.sourceReads.maximumBytes<1024**2,'large staging');
  // Oversized valid text metadata must fail without publishing a truncated report.
  const png=new Uint8Array(await(await fetch(root+'exif.png')).arrayBuffer()),text=new Uint8Array(9*1024**2).fill(65),keyword=new TextEncoder().encode('Description\0'),body=new Uint8Array(4+keyword.length+text.length);
  body.set(new TextEncoder().encode('tEXt'));body.set(keyword,4);body.set(text,4+keyword.length);
  let crc=0xffffffff;const table=Uint32Array.from({length:256},(_,v)=>{for(let k=0;k<8;k++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});for(const b of body)crc=table[(crc^b)&255]^(crc>>>8);
  const length=new Uint8Array(4),checksum=new Uint8Array(4);new DataView(length.buffer).setUint32(0,body.length-4);new DataView(checksum.buffer).setUint32(0,(crc^0xffffffff)>>>0);
  let bounded=false;try{await engine.inspectMetadata({blob:new Blob([png.subarray(0,33),length,body,checksum,png.subarray(33)])});}catch(error){bounded=['MEMORY_LIMIT','EXIFTOOL_RUNTIME'].includes(error.code);}assert(bounded,'oversized output must fail');
  assert((await engine.capabilities()).memory.activeReservationBytes===0,'failed extraction reservation');assert((await engine.inspectMetadata({blob})).data.version==='13.55','recovery after output failure');
  return {status:'passed',nativeCases:reference.cases.length,exactOutputs:count,fullGroupedNumericDump:true,htmlExactAfterVirtualPathNormalization:true,thumbnailBytesExact:true,xmpOnlyGpsMatchesNativeAbsence:true,noPixelDecode:true,maximumObservedHeapBytes:heap,wasmMaximumBytes:128*1024**2,peakAccountedBytes:peak,sourceReadMaximumBytes:Math.max(...reads),largeBlobBytes:large.size,largeBlobReads:largeResult.metrics.sourceReads,directCancellationPreservesSource:true,hardCancellationAndRecovery:true,budgetRefusal:true,oversizedOutputRefused:true,recoveryAfterOutputFailure:true,jsonExport:true};
 }finally{engine.dispose();}
}
