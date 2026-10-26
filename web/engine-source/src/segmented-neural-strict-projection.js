import {segmentedNeuralProjection} from './segmented-neural-projection.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireStrictFragmentPlan} from '../experiments/d2prl/strict-fragment-plan.js';
import {requireValue,checkAbort,controlCheckpoint,createCooperator,normalizeResourceError} from './errors.js';
const SIDE=448,N=SIDE*SIDE,FIELDS=['map','mask','target','source','analyzed','candidates'],FLOAT=new Set(['map','target','source']),SCHEMA='sherloq.d2prl-strict-projection/1';
const box=(b,width,height)=>Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]>=0&&b[1]>=0&&b[2]<=width&&b[3]<=height&&b[2]>b[0]&&b[3]>b[1];
/** Project each real 448 grid through the unchanged native processor on its
 * own whole fragment. Then max-compose original positions for every requested
 * acquisition and envelope. A final candidate gate supplements the upstream
 * strict context, never substitutes for it. Plans/banks remain caller-owned. */
export async function segmentedNeuralStrictProjection({width,height,origin=[0,0],jobs,candidateDomain,minimum=500},{budget,spatial,postprocess,signal,onProgress,temporarySession,getTemporarySession,storage='auto',resourceOperation}={}){
 checkAbort(signal);requireValue(budget?.reserve&&[width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=131072)&&Number.isSafeInteger(width*height*15)&&Array.isArray(origin)&&origin.length===2&&origin.every(n=>Number.isSafeInteger(n)&&n>=0)&&Array.isArray(jobs)&&jobs.length>0&&Number.isInteger(minimum)&&minimum>=0&&minimum<=5000,'Native strict projection frame, jobs and budget required');
 const descriptor=candidateDomain?.descriptor??candidateDomain;
 const transport=sourceRegionTransportBytes([descriptor,jobs.map(j=>[j.job,j.plan?.fingerprint,j.plan?.fragments?.map(f=>[f.id,f.bounds,f.originalBounds])])],{allowUndefined:true,allowAliases:true}),metadataBytes=65536+transport*8;
 let metadataReservation=budget.reserve(metadataBytes),metadataRetained=false,headroom,scratch,complete=false,failure,closed=false;const stores={},zoneMetadata=[];
 const bpp=key=>FLOAT.has(key)?4:1;
 const cooperate=createCooperator(signal),workCheckpoint=async()=>{await cooperate();checkAbort(signal);};
 const dispose=async()=>{if(closed)return;const entries=Object.entries(stores),retired=await Promise.allSettled(entries.map(([,s])=>s.dispose()));for(let i=0;i<entries.length;i++)if(retired[i].status==='fulfilled')delete stores[entries[i][0]];const error=retired.find(r=>r.status==='rejected');if(error)throw error.reason;closed=true;if(metadataRetained){budget.retained-=metadataBytes;metadataRetained=false;}};
 try{
  // Capture mutable job labels/bounds before the first asynchronous verification.
  // Signed plans and banks are stable owners, not serialized caller geometry.
  const captured=jobs.map(({job,plan,bank})=>({job:structuredClone(job),plan,bank})),domain=await compileOriginalSourceRegions(descriptor);checkAbort(signal);
  requireValue(!domain.empty&&(!candidateDomain.fingerprint||candidateDomain.fingerprint===domain.fingerprint)&&origin[0]+width<=domain.sourceWidth&&origin[1]+height<=domain.sourceHeight,'Strict projection candidate identity or original grid differs');
  requireValue(domain.rect.x0>=origin[0]&&domain.rect.y0>=origin[1]&&domain.rect.x1<=origin[0]+width&&domain.rect.y1<=origin[1]+height,'The strict projection frame must contain every candidate observation');
  const ids=new Set();let fragments=0;
  for(const {job,plan,bank}of captured){
   requireStrictFragmentPlan(plan);requireValue(job&&typeof job.id==='string'&&job.id.length&&job.id.length<=128&&!ids.has(job.id)&&['region','envelope','whole-image'].includes(job.kind)&&box(job.bounds,domain.sourceWidth,domain.sourceHeight),'Unique native strict jobs required');ids.add(job.id);
   requireValue(plan.jobId===job.id&&plan.kind===job.kind&&plan.sourceSha256===domain.sourceSha256&&plan.sourceWidth===domain.sourceWidth&&plan.sourceHeight===domain.sourceHeight&&plan.modelSide===448&&plan.bounds.map((v,i)=>v+plan.origin[i%2]).every((v,i)=>v===job.bounds[i])&&bank?.planFingerprint===plan.fingerprint&&typeof bank.read==='function','Strict bank, plan and original job coordinates differ');
   for(const f of plan.fragments){requireValue(f.modelSide===448&&f.width>=1&&f.height>=1&&box(f.originalBounds,domain.sourceWidth,domain.sourceHeight)&&f.originalBounds[0]>=origin[0]&&f.originalBounds[1]>=origin[1]&&f.originalBounds[2]<=origin[0]+width&&f.originalBounds[3]<=origin[1]+height,'Strict fragments must remain in their declared original output frame');fragments++;}
  }
  metadataReservation();metadataReservation=null;budget.retain(metadataBytes);metadataRetained=true;
  const n=width*height,block=Math.min(262144,Math.max(width,Math.min(n,262144)));
  // Protect useful processor and composition headroom before optional RAM
  // stores are allocated; storage may spill without altering a native grid.
  headroom=budget.reserve(512*1024**2+2*N*12+2*N*16+block*9+65536);
  for(const key of FIELDS)stores[key]=await createSegmentedBytes(n*bpp(key),{budget,temporarySession,getTemporarySession,storage,signal,owner:'d2prl',label:'strict-projection:'+key});
  headroom();headroom=null;scratch=allocateOwnedTypedArray(Uint8Array,block*9,{budget,owner:'d2prl',label:'strict-projection-composition',operation:resourceOperation});
  const inputBytes=scratch.data.subarray(0,block*4),destBytes=scratch.data.subarray(block*4,block*8),marked=scratch.data.subarray(block*8),inputFloat=new Float32Array(inputBytes.buffer,inputBytes.byteOffset,block),destFloat=new Float32Array(destBytes.buffer,destBytes.byteOffset,block);
  let completed=0,postprocessMs=0,projectionMs=0,compositionMs=0;
  for(const {job,plan,bank}of captured){
   const jobStarted=performance.now(),parts=[];let jobPresent=false;
   for(const f of plan.fragments){
    await controlCheckpoint(signal);requireStrictFragmentPlan(plan);let raw,projected,fragmentFailure;const reads=[];let fragmentPresent=false;
    try{
     raw=allocateOwnedTypedArray(Float32Array,N*3,{budget,owner:'d2prl',label:'strict-projection-native-raw',operation:resourceOperation});
     for(const [i,name]of ['union','target','source'].entries()){
      const r=await bank.read(f.index,name,{signal});reads.push(r);requireValue(r.dtype==='float32'&&r.data instanceof Float32Array&&r.data.length===N&&JSON.stringify(r.shape)===JSON.stringify([1,1,448,448])&&r.fragmentId===f.id,'Strict native projection tensor differs from its 448 grid');
      for(let at=0;at<N;at++){if((at&16383)===0)await workCheckpoint();const value=r.data[at];requireValue(Number.isFinite(value)&&(i!==0||value>=0&&value<=1),'Nonfinite or invalid strict neural probability');raw.data[i*N+at]=value;}
      r.release();reads.pop();
     }
     checkAbort(signal);requireStrictFragmentPlan(plan);
     const started=performance.now();projected=await segmentedNeuralProjection({family:'d2prl',width:f.width,height:f.height,zones:[{id:'fragment-'+f.index,bounds:[0,0,f.width,f.height],raw:raw.data}],side:448,mode:'whole-image',minimum,exclusions:[]},{budget,spatial,postprocess,signal,temporarySession,getTemporarySession,storage,resourceOperation});
     postprocessMs+=projected.metrics.postprocessMs;projectionMs+=projected.metrics.projectionMs;
     const [gx,gy]=[f.originalBounds[0]-origin[0],f.originalBounds[1]-origin[1]],wide=f.width*4>=width,span=wide?width:f.width,rows=Math.max(1,Math.floor(block/Math.max(width,f.width))),composeAt=performance.now();
     for(const key of ['map','mask','target','source','analyzed'])for(let y=0;y<f.height;y+=rows){
      await workCheckpoint();const count=Math.min(rows,f.height-y),bytes=bpp(key),ib=inputBytes.subarray(0,f.width*count*bytes),db=destBytes.subarray(0,span*count*bytes),iv=bytes===4?inputFloat:inputBytes,dv=bytes===4?destFloat:destBytes;
      await projected.stores[key].readInto(ib,y*f.width*bytes);
      if(wide)await stores[key].readInto(db,(gy+y)*width*bytes);else for(let r=0;r<count;r++)await stores[key].readInto(db.subarray(r*f.width*bytes,(r+1)*f.width*bytes),((gy+y+r)*width+gx)*bytes);
      for(let r=0;r<count;r++){
       const ranges=key==='analyzed'?[[f.originalBounds[0],f.originalBounds[2]]]:domain.originalRowIntervals(f.originalBounds[1]+y+r);
       for(const [a,b]of ranges)for(let x=Math.max(0,a-f.originalBounds[0]),end=Math.min(f.width,b-f.originalBounds[0]);x<end;x++){
        const from=r*f.width+x,to=r*span+x+(wide?gx:0),v=iv[from];requireValue(Number.isFinite(v)&&(key==='map'||v===0||v===1),'Native strict projected masks and roles must be binary');
        dv[to]=Math.max(dv[to],v);if(key==='mask'&&v)fragmentPresent=true;
       }
      }
      if(wide)await stores[key].write(db,(gy+y)*width*bytes);else for(let r=0;r<count;r++)await stores[key].write(db.subarray(r*f.width*bytes,(r+1)*f.width*bytes),((gy+y+r)*width+gx)*bytes);
     }
     compositionMs+=performance.now()-composeAt;jobPresent||=fragmentPresent;parts.push({id:f.id,index:f.index,originalBounds:[...f.originalBounds],modelGrid:[448,448],status:fragmentPresent?'ok':'empty',projectionMs:performance.now()-started});
    }catch(error){fragmentFailure=normalizeResourceError(error);throw fragmentFailure;}finally{
     const retired=[];for(const r of reads)try{r.release();}catch(e){retired.push(e);}try{await projected?.dispose();}catch(e){retired.push(e);}try{raw?.release();}catch(e){retired.push(e);}
     if(retired.length){if(fragmentFailure)fragmentFailure.details={...fragmentFailure.details,cleanupErrors:retired.map(e=>({code:e.code,message:e.message}))};else throw retired[0];}
    }
    completed++;onProgress?.({phase:'strict-fragment-projection',jobId:job.id,fragmentId:f.id,completed,total:fragments});checkAbort(signal);
   }
   zoneMetadata.push({id:job.id,kind:job.kind,bounds:job.bounds.map((v,i)=>v-origin[i%2]),originalBounds:[...job.bounds],status:jobPresent?'ok':'empty',fragments:parts,input_side:448,patchmatch_iterations:40,seed:22,min_component:minimum,role_filter:50,elapsedMs:performance.now()-jobStarted});
  }
  let present=false,analyzedPixels=0,candidatePixels=0;
  for(let y=0;y<height;){await workCheckpoint();const rows=Math.min(height-y,Math.max(1,Math.floor(block/width))),count=width*rows,a=inputBytes.subarray(0,count),m=destBytes.subarray(0,count),c=marked.subarray(0,count);await stores.analyzed.readInto(a,y*width);await stores.mask.readInto(m,y*width);
   c.fill(0);for(let row=0;row<rows;row++)for(const [a,b]of domain.originalRowIntervals(origin[1]+y+row)){const begin=Math.max(0,a-origin[0]),end=Math.min(width,b-origin[0]);if(begin<end)c.fill(1,row*width+begin,row*width+end);}
   for(let i=0;i<count;i++){requireValue(!c[i]||a[i]===1,'A requested strict candidate has no projected native context');analyzedPixels+=+!!a[i];candidatePixels+=c[i];present||=!!m[i];}
   await stores.candidates.write(c,y*width);y+=rows;
  }
  requireValue(candidatePixels===domain.countIncluded,'Strict projection lost an admitted original candidate');
  for(const store of Object.values(stores))await store.flush();checkAbort(signal);
  const metadata={schema:SCHEMA,boxes:zoneMetadata.map(z=>z.bounds),zones:zoneMetadata,sourceSha256:domain.sourceSha256,origin:[...origin],originalGrid:[domain.sourceWidth,domain.sourceHeight],candidateFingerprint:domain.fingerprint,status:present?'ok':'empty',min_component:minimum,probability_interpolation:'bilinear',mask_interpolation:'nearest',inference_performed:false,strictProjection:{everyNativeFragmentPreserved:true,fragments,independentJobCount:captured.length,analyzedMeaning:'Native strict CNN context, including declared envelope gaps but excluding every true negative before input',candidatesMeaning:'Exact Original/ceiling/scientific candidate membership; gate supplements the already strict upstream model',composition:'Native max across requested acquisitions and envelope, after native per-fragment postprocessing'}};
  complete=true;return{width,height,stores,metadata,dispose,metrics:{fragments,jobs:captured.length,analyzedPixels,candidatePixels,postprocessMs,projectionMs,compositionMs,metadataBytes,resultBytes:n*15,storage:Object.fromEntries(FIELDS.map(k=>[k,stores[k].storage]))}};
 }catch(error){failure=normalizeResourceError(error);throw failure;}
 finally{
  scratch?.release();headroom?.();metadataReservation?.();if(!complete)try{await dispose();}catch(error){if(failure)failure.details={...failure.details,cleanupError:{code:error.code,message:error.message}};else throw error;}
 }
}
