import {payloadBytes} from './pixel-operations.js';
import {DenseCopyEngine} from './dense-copy.js';
import {denseImageParams} from './dense-image.js';
import {DENSE_PROFILES} from './dense-profiles.js';
import {pairedBiomes} from './copy-biomes.js';
import {biomeSides,verifyCopyGeometry,createGeometryKernel} from './copy-geometry.js';
import {copyPalette} from './copy-subbiomes.js';
import {createSparseSurface} from './m3-sparse-surface.js';
import {sparseCopyViewParams} from './sparse-copy-view.js';
import {requireValue,checkAbort} from './errors.js';
const geometry={pairedBiomes,biomeSides,verifyCopyGeometry,createGeometryKernel,copyPalette};
export const DENSE_OPERATION='tampering.copyMove.dense';
export const denseCapability=()=>({id:DENSE_OPERATION,status:'available',backends:['cpu','auto','webgpu'],algorithms:[...DENSE_PROFILES],regions:['full-frame','independent','compare'],exports:['json','png','npz'],coordinates:'original-pixel-centres'});
export function denseCopyParams(input={}){
 const {model='Similarity',tolerance=50,geometricThreshold=3,geometricMinimum=6,...rest}=input;
 requireValue(['None','Similarity','Affine','Homography'].includes(model)&&Number.isFinite(tolerance)&&tolerance>=0&&Number.isFinite(geometricThreshold)&&geometricThreshold>0&&Number.isInteger(geometricMinimum)&&geometricMinimum>=4,'Invalid dense geometry options.');
 const p=denseImageParams({...rest,coherence:model!=='None',errorThreshold:geometricThreshold,minimumComponent:geometricMinimum});
 const {coherence,errorThreshold,minimumComponent,...params}=p;
 return {...params,model,tolerance,geometricThreshold,geometricMinimum};
}
// Full fields stay in the worker. A published surface borrows them for scientific
// export; the source cache holds one additional reference for view-only redraws.
export function createDenseAdapter({budget,profile,version,publishResult,create=(image,budget,options)=>new DenseCopyEngine(image,budget,options),render=createSparseSurface}){
 const records=new Map();
 async function clearImage(id){const selected=[...records].filter(([key])=>id===undefined||id===key);for(const [key,r]of selected){records.delete(key);try{await r.cached?.release();}finally{await r.engine.dispose();}}}
 return {clearImage,dispose:()=>clearImage(),async run(task,image,{signal,onProgress,knownHeapBytes=0}={}){
  const p=denseCopyParams(task.params),view=sparseCopyViewParams(task.view),backend=task.backend??'auto';
  requireValue(['cpu','auto','webgpu'].includes(backend),'Invalid dense backend.');requireValue(!task.regions?.length,'Dense polygons belong in params.regions.');checkAbort(signal);
  let r=records.get(task.imageId);if(!r){r={engine:create(image.segmented?image:image.pixels,budget,{profile,geometry}),cached:null};records.set(task.imageId,r);}
  const identity=JSON.stringify([p,backend]),started=performance.now();let owned,surfaceRecord,published=false,lease,outputLease;
  try{
   lease=budget.reserve(knownHeapBytes);
   const reused=r.cached?.identity===identity;
   if(!reused){const old=r.cached;r.cached=null;await old?.release();const value=await r.engine.analyze(p,{signal,onProgress,backend,checkpointKey:'clone-panel:'+task.imageId});let refs=1;r.cached={identity,value,retain(){refs++;},async release(){if(--refs===0)await value.release();}};}
   owned=r.cached;owned.retain();const raw=owned.value;
   surfaceRecord=await render(image,raw,view,{budget,signal});checkAbort(signal);
   const {release,dense_maps,metrics,...small}=raw;
   // The public worker transfers all returned typed arrays. Copy only the compact
   // evidence so transport cannot detach the worker-owned archive/cache arrays.
   outputLease=budget.reserve(payloadBytes(small));const data=structuredClone(small);
   const fields=dense_maps.map(({width,height,shift,pass,context})=>({width,height,shift,pass,context}));
   const provenance={engine:version,operation:DENSE_OPERATION,params:p,backendRequested:backend,backend:data.backend??'see field metrics',originalSha256:image.sha256,decode:structuredClone(image.provenance),native:'core/cloning2.py',coordinates:'original-pixel-centres'};
   surfaceRecord.provenance=provenance;surfaceRecord.denseAnalysis={raw,params:p,backend,style:surfaceRecord.style,visible:surfaceRecord.visible};
   const surface=surfaceRecord.surface,dispose=surface.dispose.bind(surface),hold=owned;owned=null;let disposal;
   surface.dispose=()=>disposal??=Promise.resolve().then(async()=>{try{await dispose();}finally{await hold.release();}});
   const output={id:task.id,imageId:task.imageId,operation:DENSE_OPERATION,status:'ok',layout:'surface',data:{...data,params:p,dense_fields:fields,metadata:{method:'dense',profile:p.profile,fieldStorage:'worker-owned; full fields in NPZ',result_reused:reused}},surface:surface.descriptor,style:surfaceRecord.style,visible:surfaceRecord.visible,legend:surfaceRecord.legend,provenance,metrics:{...metrics,totalMs:performance.now()-started,cache:{...metrics?.cache,result:reused},preflightExecutions:0,memory:budget.snapshot()}};
   // Check before registration, so a throwing progress consumer cannot orphan it.
   onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);publishResult(task.imageId,surfaceRecord);published=true;return output;
  }finally{try{if(surfaceRecord&&!published)await surfaceRecord.surface.dispose();}finally{await owned?.release();outputLease?.();lease?.();}}
 }};
}
