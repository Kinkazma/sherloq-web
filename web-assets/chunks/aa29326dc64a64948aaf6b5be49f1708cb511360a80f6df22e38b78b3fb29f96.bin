import "../../runtime-context.js?v=0.30.0";
// Provisional scalar presentation only. Never a scientific result/export.
import {allocateOwnedTypedArray,allocateWasmMemory} from './allocation.js';
import {requireValue,checkAbort,EngineError,controlCheckpoint} from './errors.js';
import {ssgMapKey,ssgRoiKey} from './ssg-localization-cache.js';
const scalarKeys=['maskThreshold','minimumArea','ssimRadius','ssimOpening','roiRadius'];
const current=(signal,isCurrent)=>{checkAbort(signal);if(!isCurrent())throw new EngineError('CANCELLED','SSG retained checkpoint, source or domain changed.');};
export function createSsgProvisionalProxy({budget,stageCache,identity,known,candidates,groups,moduleFactory,maxSide=512,checkpointCurrent=()=>true}){
 requireValue(Number.isSafeInteger(maxSide)&&maxSide>=16&&maxSide<=512,'Bounded SSG provisional side required.');
 const life=new AbortController(),banks=new Map();let closed=false,active=false,done=Promise.resolve(),module,heapCredit,initialization;
 const maximumHeapBytes=Math.ceil((maxSide*maxSide*220+64*1024**2)/65536)*65536;
 const retireBank=b=>{if(b.held)return;for(const owner of b.owners)owner.release();b.owners.length=0;b.closed=true;};
 const clear=()=>{const before=budget.total();for(const[key,bank]of banks)if(!bank.held){banks.delete(key);retireBank(bank);}return before-budget.total();};
 const unregister=budget.registerReclaimer?.(clear,{owner:'ssg-provisional-scalars'});
 async function native(){if(module)return module;if(initialization)return initialization;heapCredit=budget.reserve(maximumHeapBytes);initialization=(async()=>{try{const m=await moduleFactory({wasmMemory:allocateWasmMemory({initial:512,maximum:maximumHeapBytes/65536}),maximumHeapBytes});module=m;return m;}catch(e){heapCredit();heapCredit=null;throw e;}finally{initialization=null;}})();return initialization;}
 async function sample(loan,plan,signal,isCurrent){
  const key=JSON.stringify([loan.stages.map(s=>s.key),plan.step]);let b=banks.get(key);if(b)return b;
  const width=Math.ceil(identity.width/plan.step),height=Math.ceil(identity.height/plan.step),n=width*height,owners=[];
  const own=(Type,count,label)=>{const owner=allocateOwnedTypedArray(Type,count,{budget,owner:'ssg-provisional-scalars',label});owners.push(owner);return owner.data;};
  try{
   const mask=own(Uint8Array,n,'conservative sampled native membership'),roi=own(Float64Array,n,'sampled native ROI'),stages=groups.map(()=>({values:own(Float64Array,2*n,'sampled two native SSIM fields'),valid:own(Uint8Array,2*n,'sampled native direct validity')}));let checkpoint=performance.now()+8;
   for(let y=0;y<height;y++){for(let x=0;x<width;x++){
    const left=x*plan.step,top=y*plan.step,right=Math.min(identity.width,left+plan.step),bottom=Math.min(identity.height,top+plan.step),sx=left+Math.floor((right-left-1)/2),sy=top+Math.floor((bottom-top-1)/2),source=sy*identity.width+sx,out=y*width+x;let admitted=true;
    for(let yy=top;yy<bottom&&admitted;yy++)for(let xx=left;xx<right;xx++){const id=yy*identity.width+xx;if(!known[id]||!candidates[id]){admitted=false;break;}}
    if(admitted){mask[out]=1;roi[out]=loan.stages[0].values[source];for(let group=0;group<groups.length;group++)for(let direction=0;direction<2;direction++){const s=loan.stages[group+1],at=direction*identity.width*identity.height+source;if(s.valid[at]){stages[group].values[direction*n+out]=s.values[at];stages[group].valid[direction*n+out]=1;}}}
   }if(performance.now()>=checkpoint){await controlCheckpoint(signal);current(signal,isCurrent);checkpoint=performance.now()+8;}}
   current(signal,isCurrent);b={key,width,height,n,step:plan.step,mask,roi,stages,owners,held:0};banks.set(key,b);return b;
  }catch(e){for(const owner of owners)owner.release();throw e;}
 }
 return{clear,
  async render(params,{plan,signal,isCurrent=checkpointCurrent}={}){
   requireValue(!closed&&!active,'SSG provisional renderer is closed or busy.');const combined=signal?AbortSignal.any([signal,life.signal]):life.signal;current(combined,()=>checkpointCurrent()&&isCurrent());requireValue(Number.isSafeInteger(plan?.step)&&plan.step>=1&&Math.ceil(identity.width/plan.step)<=maxSide&&Math.ceil(identity.height/plan.step)<=maxSide,'Provisional grid exceeds admitted bounds.');
   // An accepted-model-free checkpoint has no ROI/SSIM stages to borrow.
   // Its negative presentation owns only the two bounded zero output planes.
   if(!groups.length){
    ssgRoiKey({...identity,...params}); // Preserve the existing identity/scalar admission without borrowing a stage.
    active=true;let finish;done=new Promise(r=>finish=r);let resultOwner,supportOwner,returned=false;const start=performance.now();
    try{
     const width=Math.ceil(identity.width/plan.step),height=Math.ceil(identity.height/plan.step),n=width*height;
     resultOwner=allocateOwnedTypedArray(Uint8Array,n,{budget,owner:'ssg-provisional-scalars',label:'empty accepted-model-free SSG mask'});
     current(combined,()=>checkpointCurrent()&&isCurrent());
     supportOwner=allocateOwnedTypedArray(Uint8Array,n,{budget,owner:'ssg-provisional-scalars',label:'empty accepted-model-free SSG direct support'});
     current(combined,()=>checkpointCurrent()&&isCurrent());let retired=false;
     const frame={mask:resultOwner.data,direct:supportOwner.data,width,height,logicalWidth:identity.width,logicalHeight:identity.height,step:plan.step,exact:false,provisional:true,exportable:false,params:Object.fromEntries(scalarKeys.map(k=>[k,params[k]])),provenance:{sourceSha256:identity.sourceSha256,contextFingerprint:identity.contextFingerprint,candidateFingerprint:identity.candidateFingerprint,sourceRevision:identity.sourceRevision,checkpointKey:identity.checkpointKey,scalarParameters:Object.fromEntries(scalarKeys.map(k=>[k,params[k]])),empty:true,evaluationStatus:'no accepted native geometric model; no SSIM score claimed',approximation:'Empty accepted-model-free checkpoint; two zero presentation planes on a temporary bounded grid; no ROI or SSIM stage evaluated.',effectiveDisplayOpening:Math.round(params.ssimOpening/plan.step)},milliseconds:performance.now()-start,release(){if(retired)return;retired=true;resultOwner.release();supportOwner.release();}};returned=true;return frame;
    }finally{if(!returned){resultOwner?.release();supportOwner?.release();}active=false;finish();}
   }
   const keys=[ssgRoiKey({...identity,...params}),...groups.map((g,index)=>ssgMapKey({...identity,sigma:params.ssimRadius,groupIndex:index,matrix:g.matrix}))],loan=stageCache.borrowAll(keys);if(!loan)return null;
   active=true;let finish;done=new Promise(r=>finish=r);let bank,resultOwner,supportOwner,returned=false;const pointers=[];let m,primary;const start=performance.now();
   try{bank=await sample(loan,plan,combined,()=>checkpointCurrent()&&isCurrent());bank.held++;m=await native();current(combined,()=>checkpointCurrent()&&isCurrent());const alloc=bytes=>{const p=m._malloc(Math.max(8,bytes));if(!p)throw new EngineError('MEMORY_LIMIT','Bounded provisional SSG allocation failed.');pointers.push(p);return p;},n=bank.n,knownPtr=alloc(n),roi=alloc(n*8),maps=alloc(n*16),valid=alloc(n*2),points=alloc(groups.reduce((largest,g)=>Math.max(largest,g.points.byteLength),8)),out=alloc(n),direct=alloc(n);m.HEAPU8.set(bank.mask,knownPtr);m.HEAPF64.set(bank.roi,roi/8);resultOwner=allocateOwnedTypedArray(Uint8Array,n,{budget});supportOwner=allocateOwnedTypedArray(Uint8Array,n,{budget});const opening=Math.round(params.ssimOpening/plan.step);
    for(let group=0;group<groups.length;group++){await controlCheckpoint(combined);current(combined,()=>checkpointCurrent()&&isCurrent());m.HEAPF64.set(bank.stages[group].values,maps/8);m.HEAPU8.set(bank.stages[group].valid,valid);for(let j=0;j<groups[group].points.length;j++)m.HEAPF64[points/8+j]=(groups[group].points[j]+.5)/plan.step-.5;const status=m._ssg_split_post(maps,valid,knownPtr,knownPtr,roi,points,groups[group].points.length/2,bank.width,bank.height,params.maskThreshold,params.minimumArea,opening,out,direct);requireValue(status===0,'Invalid provisional SSG native status.');current(combined,()=>checkpointCurrent()&&isCurrent());for(let j=0;j<n;j++){resultOwner.data[j]|=m.HEAPU8[out+j];supportOwner.data[j]|=m.HEAPU8[direct+j];}}
    current(combined,()=>checkpointCurrent()&&isCurrent());returned=true;let retired=false;return{mask:resultOwner.data,direct:supportOwner.data,width:bank.width,height:bank.height,logicalWidth:identity.width,logicalHeight:identity.height,step:plan.step,exact:false,provisional:true,exportable:false,params:Object.fromEntries(scalarKeys.map(k=>[k,params[k]])),provenance:{sourceSha256:identity.sourceSha256,contextFingerprint:identity.contextFingerprint,candidateFingerprint:identity.candidateFingerprint,sourceRevision:identity.sourceRevision,checkpointKey:identity.checkpointKey,scalarParameters:Object.fromEntries(scalarKeys.map(k=>[k,params[k]])),approximation:'Sampled native SSIM and ROI; conservative whole-cell membership; morphology and connectivity computed only on a temporary coarse presentation grid, separately per group then union.',effectiveDisplayOpening:opening},milliseconds:performance.now()-start,release(){if(retired)return;retired=true;resultOwner.release();supportOwner.release();}};
   }catch(e){primary=e;throw e;}finally{const failures=[];for(const p of pointers)try{m._free(p);}catch(e){failures.push(e);}bank&&(bank.held--);loan.release();if(!returned){resultOwner?.release();supportOwner?.release();}active=false;finish();if(failures.length){if(primary&&Object.isExtensible(primary))primary.cleanupErrors=failures;else if(!primary)throw new AggregateError(failures);}}
  },
  disposeIdle(){requireValue(!active&&!initialization,'Cannot retire an active provisional renderer.');closed=true;life.abort();clear();module?._ssg_full_shutdown?.();module=null;heapCredit?.();heapCredit=null;unregister?.();},
  async dispose(){closed=true;life.abort();await done;clear();module?._ssg_full_shutdown?.();module=null;heapCredit?.();heapCredit=null;unregister?.();}
 };
}
