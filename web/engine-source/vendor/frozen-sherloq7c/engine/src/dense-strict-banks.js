import {acknowledgeDenseRetirement,onceDenseRetirement,retireDenseOwners,countedDenseOwner,denseConstructionOwner,cleanupDenseOwners} from './dense-owner-retirement.js';
import {denseDescriptorShape} from './dense-math.js';
import {denseJobMemory} from './dense-pool.js';
import {denseSearchContexts} from './dense-profiles.js';
import {ElasticWorkerPool} from './elastic-worker-pool.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';

const READ_PIXELS=8192;
// Preparatory component only. No operation capability is opened here: native
// coherence, geometry and strict highpass/NCC still need their own integration.
export async function prepareStrictDenseBanks({view,domain,original,pass,regions=[],texture=2},{budget,signal,onProgress,maxWorkers=1,onRetirementOwner,workerFactory=()=>new Worker(new URL('./dense-strict-descriptor-worker.js',import.meta.url),{type:'module'})}={}){
 requireValue(view?.domain?.fingerprint===domain?.fingerprint&&typeof view.readWindow==='function','Strict dense view and domain identities differ.');
 // The view's verified compiled domain is authoritative; a copied wrapper
 // cannot change its dimensions/origin while borrowing the same fingerprint.
 domain=view.domain;
 requireValue(Number.isInteger(maxWorkers)&&maxWorkers>=1&&Number.isFinite(texture)&&texture>=0,'Invalid strict dense preparation profile.');
 const recipe=structuredClone(pass),selection=structuredClone(regions);
 denseSearchContexts(selection,false);requireValue(selection.length<=2,'A native dense search context has at most two candidate polygons.');
 const support=Math.max(recipe.patch,recipe.targetPatch),shape=denseDescriptorShape(domain.width,domain.height,recipe.method,support),fragments=[],owners=[];
 const cooperate=createCooperator(signal);
 let workerBytes=0,ioBytes=0,pool,metadata,staging,success=false,failure,failed=false,readPixels=0;const owner=denseConstructionOwner(owners,{onRetirementOwner},async()=>{await retireDenseOwners(owners.filter(value=>!value.denseMetadataOnly));await retireDenseOwners(owners.filter(value=>value.denseMetadataOnly));});
 const create=async bytes=>{const workspace=workerBytes+ioBytes+READ_PIXELS*shape.dimensions*8+READ_PIXELS*2,storage=bytes+workspace>budget.limit-budget.retained-budget.active?'temporary':'auto';const store=await createSegmentedBytes(bytes,{budget,signal,storage,temporarySession:original?.session,getTemporarySession:original?.ensureTemporarySession,shared:true,owner:'patchmatch',label:'strict-native-descriptor-bank'});owners.push(store);return store;};
 try{
  metadata=budget.reserve(4096+sourceRegionTransportBytes({recipe,selection})*4);

  for(const r of view.admittedRectangles()){
   checkAbort(signal);await cooperate();checkAbort(signal);
   const bounds=[r.x,r.y,r.x+r.width,r.y+r.height],evaluable=Math.min(r.width,r.height)>3*support;
   const f={...r,bounds,originalBounds:bounds.map((v,i)=>v+domain.origin[i%2]),status:evaluable?'pending':'native-not-evaluable',reason:evaluable?null:'native-dimensions-must-exceed-three-supports',requestedPatch:recipe.patch,targetPatch:recipe.targetPatch,support};fragments.push(f);
   if(evaluable){
    const job={width:r.width,height:r.height,pass:recipe,gray:new Float32Array(0),mask:new Uint8Array(0),sourceImage:{width:r.width,height:r.height,surface:{descriptor:{format:'rgb8'}}}};
    let memory;try{memory=denseJobMemory(job);}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;f.compactDescriptors=true;memory=denseJobMemory({...job,compactDescriptors:true});}
    // Full arrays needlessly duplicate these already segmented banks. Use the
    // existing exact provider when their native resident plan cannot fit.
    if(memory.workspace+memory.output>budget.limit-budget.retained-budget.active&&!f.compactDescriptors){f.compactDescriptors=true;memory=denseJobMemory({...job,compactDescriptors:true});} 
    workerBytes=Math.max(workerBytes,memory.workspace+memory.output);ioBytes=Math.max(ioBytes,r.width*r.height*3+READ_PIXELS*3+65536);
   }
  }
  // Geometry metadata has an explicit owner even if every native context is
  // intrinsically too small. It is not converted into an empty score field.
  const freeMetadata=metadata;metadata=null;const metadataBytes=4096+sourceRegionTransportBytes({recipe,selection})*4+sourceRegionTransportBytes(fragments)*4+fragments.length*1024;freeMetadata();budget.retain(metadataBytes);
  let metadataReleased=false;owners.push({denseMetadataOnly:true,dispose(){if(metadataReleased)return;metadataReleased=true;budget.retained-=metadataBytes;}});
  const first=await create(shape.width*shape.height*shape.dimensions*4),second=recipe.reflection||recipe.patch!==recipe.targetPatch?await create(first.byteLength):first,mask=await create(shape.width*shape.height),coverage=await create(shape.width*shape.height);
  const jobs=fragments.filter(f=>f.status==='pending');
  staging=budget.reserve(READ_PIXELS*shape.dimensions*8+READ_PIXELS*2);
  let prepared=0,eligible=0;
  if(jobs.length){
   pool=new ElasticWorkerPool(budget,{maxWorkers,workerBytes,ioBytes,workerFactory,label:'strict-dense-context',resourceOwner:'patchmatch'});
   await pool.run(jobs.length,{signal,onProgress,phase:'strict-dense-descriptors',prepare:async(index,{signal,reserveInput})=>{
    const r=jobs[index],free=reserveInput(r.width*r.height*3),rgb=new Uint8Array(r.width*r.height*3);let complete=false;
    // A resource retry replaces the same unpublished rows from its beginning.
    prepared-=r.streamedCentres??0;eligible-=r.streamedEligible??0;r.streamedChunks=0;r.streamedCentres=0;r.streamedEligible=0;
    try{
     for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x+=READ_PIXELS){checkAbort(signal);await cooperate();checkAbort(signal);const w=Math.min(READ_PIXELS,r.width-x),part=await view.readWindow({x:r.x+x,y:r.y+y,width:w,height:1},{signal});try{rgb.set(part.pixels.data,(y*r.width+x)*3);readPixels+=w;}finally{part.release();}}
     const local=selection.map(p=>p.map(([x,y])=>[x-r.x,y-r.y]));complete=true;
     return{message:{rgb,width:r.width,height:r.height,pass:recipe,texture,regions:local,compactDescriptors:r.compactDescriptors===true},transfer:[rgb.buffer],release:free};
    }finally{if(!complete)free();}
   },consumeChunk:async(index,result)=>{
    checkAbort(signal);const r=jobs[index],native=denseDescriptorShape(r.width,r.height,recipe.method,support);
    requireValue(r.compactDescriptors&&result.token===(r.streamedChunks??0)+1&&result.width===native.width&&result.height===native.height&&result.dimensions===native.dimensions&&result.shift===native.shift&&Number.isSafeInteger(result.x)&&Number.isSafeInteger(result.y)&&result.x>=0&&result.y>=0&&result.y<native.height&&result.length===Math.min(READ_PIXELS,native.width-result.x)&&result.y*native.width+result.x===(r.streamedCentres??0)&&result.first instanceof Float32Array&&result.first.length===result.length*native.dimensions&&result.second instanceof Float32Array&&result.second.length===result.first.length&&result.mask instanceof Uint8Array&&result.mask.length===result.length,'Invalid streamed native descriptor page.');
    const to=((r.y+result.y)*shape.width+r.x+result.x);
    await first.write(new Uint8Array(result.first.buffer,result.first.byteOffset,result.first.byteLength),to*shape.dimensions*4);
    if(second!==first)await second.write(new Uint8Array(result.second.buffer,result.second.byteOffset,result.second.byteLength),to*shape.dimensions*4);
    await mask.write(result.mask,to);await coverage.write(new Uint8Array(result.length).fill(1),to);
    prepared+=result.length;for(const value of result.mask){const admitted=Number(value!==0);eligible+=admitted;r.streamedEligible=(r.streamedEligible??0)+admitted;}
    r.streamedChunks=result.token;r.streamedCentres=(r.streamedCentres??0)+result.length;
   },consume:async(index,result)=>{
    checkAbort(signal);const r=jobs[index],native=denseDescriptorShape(r.width,r.height,recipe.method,support);
    if(result.streamed){
     requireValue(r.compactDescriptors&&result.width===native.width&&result.height===native.height&&result.shift===shape.shift&&result.dimensions===shape.dimensions&&result.chunks===r.streamedChunks&&r.streamedCentres===native.width*native.height,'Streamed native descriptor context is incomplete.');
     r.status='prepared';r.descriptorStorage=result.descriptorStorage;r.descriptorBounds=[r.x,r.y,r.x+native.width,r.y+native.height];r.sourceCentreOrigin=[r.x+shape.shift,r.y+shape.shift];r.nativeShape={...native};return;
    }
    requireValue(result.width===native.width&&result.height===native.height&&result.shift===shape.shift&&result.dimensions===shape.dimensions&&result.first instanceof Float32Array&&result.second instanceof Float32Array&&result.first.length===native.width*native.height*shape.dimensions&&result.second.length===result.first.length&&result.mask instanceof Uint8Array&&result.mask.length===native.width*native.height,'Strict native descriptor response changed its grid.');
    for(let y=0;y<native.height;y++)for(let x=0;x<native.width;x+=READ_PIXELS){checkAbort(signal);await cooperate();checkAbort(signal);const width=Math.min(READ_PIXELS,native.width-x),from=(y*native.width+x),to=((r.y+y)*shape.width+r.x+x),bytes=width*shape.dimensions*4;
     await first.write(new Uint8Array(result.first.buffer,result.first.byteOffset+from*shape.dimensions*4,bytes),to*shape.dimensions*4);
     if(second!==first)await second.write(new Uint8Array(result.second.buffer,result.second.byteOffset+from*shape.dimensions*4,bytes),to*shape.dimensions*4);
     await mask.write(result.mask.subarray(from,from+width),to);await coverage.write(new Uint8Array(width).fill(1),to);prepared+=width;
     for(let i=0;i<width;i++)eligible+=Number(result.mask[from+i]!==0);
    }
    r.status='prepared';r.descriptorBounds=[r.x,r.y,r.x+native.width,r.y+native.height];r.sourceCentreOrigin=[r.x+shape.shift,r.y+shape.shift];r.nativeShape={...native};
   }});
  }
  for(const store of new Set([first,second,mask,coverage]))await store.flush();checkAbort(signal);const execution=pool?.snapshot()??null;pool?.dispose();pool=null;
  const result={...shape,first,second,mask,coverage,fragments,pass:recipe,sourceRegionFingerprint:domain.fingerprint,sourceRegionOrigin:[...domain.origin],semantics:'Native descriptors and texture from exact admitted RGB contexts; a common source-coordinate bank preserves cross-context candidates. Unprepared positions have no descriptor observation and mask0. This preparatory component is not a completed DenseCopy geometry/detail result.',metrics:{readPixels,preparedCentres:prepared,eligibleCentres:eligible,contextCount:fragments.length,unavailableContexts:fragments.length-jobs.length,execution},dispose:owner.dispose};
  owner.publish();success=true;return result;
 }catch(error){failed=true;failure=error===0||error===false?error:normalizeResourceError(error);throw failure;}
 finally{
  pool?.dispose();staging?.();metadata?.();
  if(!success)await cleanupDenseOwners(()=>owner.dispose(),{failed,primary:failure});
 }
}
