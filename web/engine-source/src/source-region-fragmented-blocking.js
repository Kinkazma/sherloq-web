import {segmentedBlocking} from './segmented-blocking.js';
import {blockingParams} from './wavelet-blocking.js';
import {waveletStreamHeapBytes} from './wavelet-stream-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';

// Complete geometry rectangles, rather than arbitrary storage tiles, define
// independent native db8 contexts. No excluded RGB enters either wavelet axis.
export async function sourceRegionBlocking({task,original,derived,view,domain,budget,signal,onProgress,publishResult,profile={},cpuKernel='auto'}){
 const p=blockingParams(task.params),width=domain.width,height=domain.height,identity=domain.sourceSha256+'/'+domain.fingerprint,prior=derived.blockingCache,cached=!prior?.disposed&&prior?.sourceRegionIdentity===identity?prior:null,entries=new Map(),fragments=[],tables={},tableOwners=[],cooperate=createCooperator(signal),nativeHeap=Math.max(8*1024**2,waveletStreamHeapBytes()),extraHeap=Math.max(0,nativeHeap-waveletStreamHeapBytes());
 let ownedHeap=nativeHeap;const heapOwnerships=[];let output,scope,surface,scopeSurface,current,staging,published=false,committed=false,failure,sourceReads=0,analysed=0,hits=0,cacheBytes=0,resultBytes=0,resultHeld=false;
 const next={sourceRegionIdentity:identity,entries,disposed:false,async dispose(){if(this.disposed)return;this.disposed=true;const results=await Promise.allSettled([...entries.values()].map(entry=>entry.dispose()));budget.retained-=cacheBytes;cacheBytes=0;entries.clear();const bad=results.find(row=>row.status==='rejected');if(bad)throw bad.reason;}},make=bytes=>createSegmentedBytes(bytes,{budget,signal,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession});
 try{
  heapOwnerships.push(budget.reserve(extraHeap));staging=budget.reserve(32768*16+65536);output=await make(width*height*3);scope=await make(width*height);
  // This original copy is presentation only, never a scientific input.
  for(let y=0;y<height;y++)for(let x=0;x<width;x+=32768){await cooperate();const n=Math.min(32768,width-x),part=await original.surface.readWindow({x:domain.origin[0]+x,y:domain.origin[1]+y,width:n,height:1},{signal});try{await output.write(part.pixels.data,(y*width+x)*3);}finally{part.release();}}
  for(const rect of view.admittedRectangles()){
   await cooperate();const key=[rect.x,rect.y,rect.width,rect.height].join('/'),old=cached?.entries.get(key),index=fragments.length;
   requireValue(!cached||old,'Cached blocking context differs from its verified domain.');
   const metadata=budget.reserve(2048+sourceRegionTransportBytes(rect)*4);let kept=false;
   try{
    const image={surface:{descriptor:{width:rect.width,height:rect.height,format:'rgb8'},readWindow(r={x:0,y:0,width:rect.width,height:rect.height},hooks={}){requireValue([r.x,r.y,r.width,r.height].every(Number.isSafeInteger)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=rect.width&&r.y+r.height<=rect.height,'Blocking RGB request exceeds its exact fragment.');sourceReads++;return view.readWindow({x:rect.x+r.x,y:rect.y+r.y,width:r.width,height:r.height},hooks);}},session:original.session,ensureTemporarySession:original.ensureTemporarySession};
    current=await segmentedBlocking(image,p,{budget,signal,profile:{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},cache:old,accountedHeapBytes:ownedHeap,onProgress:e=>onProgress?.({...e,sourceFragment:index})});const grown=Math.max(8*1024**2,waveletStreamHeapBytes());if(grown>ownedHeap){heapOwnerships.push(budget.reserve(grown-ownedHeap));ownedHeap=grown;}checkAbort(signal);
    entries.set(key,current.blockingCache);if(old)hits++;else{const bytes=2048+sourceRegionTransportBytes(rect)*4;budget.retain(bytes);cacheBytes+=bytes;}
    const tableName='noise_'+index,noise=current.tableRecords.noise;tables[tableName]=noise;tableOwners.push(noise.surface);kept=true;
    fragments.push({id:'native-fragment-'+index,bounds:[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height],originalBounds:[domain.origin[0]+rect.x,domain.origin[1]+rect.y,domain.origin[0]+rect.x+rect.width,domain.origin[1]+rect.y+rect.height],...current.data,table:tableName,detailCached:!!old});
    for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x+=32768){await cooperate();const n=Math.min(32768,rect.width-x),part=await current.surface.readWindow({x,y,width:n,height:1},{signal});try{await output.write(part.pixels.data,((rect.y+y)*width+rect.x+x)*3);await scope.write(new Uint8Array(n).fill(1),(rect.y+y)*width+rect.x+x);}finally{part.release();}}
    await current.surface.dispose();current=null;analysed+=rect.width*rect.height;onProgress?.({phase:'source-region-blocking-context',completed:analysed,total:domain.countIncluded});
   }finally{metadata();if(current&&kept)current.tableRecords={};}
  }
  requireValue(analysed===domain.countIncluded&&fragments.length>0,'Blocking contexts must cover every admitted native sample exactly.');await output.flush();await scope.flush();checkAbort(signal);
  const data={width,height,block:p.block,fragments,sourceRegionFingerprint:domain.fingerprint,contextPolicy:'Independent exact native RGB rectangles, native db8 axes, native per-context MAD and normalization.'},metrics={fragmentCount:fragments.length,selectedPixels:domain.countIncluded,analysedPixels:analysed,sourceReads,detailCached:hits===fragments.length,cachedFragments:hits},semantics='Native db8 blocking evidence on each exact admitted RGB context. Each native noise table and native context normalization are retained separately; this composite is not one global wavelet transform. Excluded pixels retain original presentation only.';
  resultBytes=4096+sourceRegionTransportBytes(data)*4;budget.retain(resultBytes);resultHeld=true;const inner=createRgbSurface(output,{width,height,budget});let disposed=false;surface={...inner,async dispose(){if(disposed)return;disposed=true;try{await inner.dispose();}finally{budget.retained-=resultBytes;}}};scopeSurface=createMaskSurface(scope,{width,height,budget,range:[0,1],semantics:'1=processed in its exact native db8 context;0=excluded original presentation.'});
  const bundle=publishResult(task.imageId,{surface,maskRecords:{analysis_scope:{surface:scopeSurface}},tableRecords:tables,data,metrics,semantics});published=true;resultHeld=false;derived.blockingCache=cached??next;committed=true;if(!cached)await prior?.dispose();
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,data,metrics,semantics,provenance:{params:p,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],excludedParticipation:'absent-before-native-db8-axes-and-MAD',nativeContexts:fragments.map(({bounds,originalBounds,detailDimensions,sourceMode})=>({bounds,originalBounds,detailDimensions,sourceMode})),originalEncodedBytesPreserved:true}};
 }catch(error){failure=normalizeResourceError(error);throw failure;}
 finally{
  staging?.();const errors=[];if(!committed){for(const[key,value]of entries)if(cached?.entries.get(key)===value)entries.delete(key);try{await next.dispose();}catch(error){errors.push(error);}}
  if(current){for(const owner of[current.surface,...Object.values(current.tableRecords??{}).map(row=>row.surface),...(![...entries.values(),...(cached?.entries.values()??[])].includes(current.blockingCache)?[current.blockingCache]:[])])try{await owner?.dispose();}catch(error){errors.push(error);}}
  if(!published)for(const owner of[surface??output,scopeSurface??scope,...tableOwners])try{await owner?.dispose();}catch(error){errors.push(error);}if(resultHeld&&!surface)budget.retained-=resultBytes;for(const free of heapOwnerships)free();
  if(errors.length){if(failure)failure.details={...failure.details,cleanupErrors:errors.map(error=>({code:error.code,message:error.message}))};else throw errors[0];}
 }
}
