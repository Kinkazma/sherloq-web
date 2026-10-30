// PRIVATE contract prototype. Uses the existing Native ticket, scalar replay,
// convolution retirement actions and caller registry. No GPU/PM integration.
import {NativeMpsRandom} from './random-mps.js';
import {randomCandidates,wrapOffsets,propagateOffsets,createCandidateWorkspace} from './candidates.js';
import {createConvolutionSyncRetirement,createConvolutionIndependentRetirement,preserveConvolutionPrimary} from './convolution-retirement.js';
import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
const frames=new WeakMap();export const residentPlanFrame=owner=>frames.get(owner)?.();
export function createResidentCandidatePlan({random,pair,bounds,side,kind='random',budget,adoptOwner,signal}={}){
 requireValue(budget?.reserve&&typeof adoptOwner==='function'&&Number.isSafeInteger(side)&&side>=2&&side<=448&&['random','propagate'].includes(kind),'Private plan extent/owner');
 const n=side*side,life=new AbortController(),selected=signal?AbortSignal.any([signal,life.signal]):life.signal,loans=new Set();let packed,ticket,stateBefore,materializing,materialized,closed=false,retired=false,waitGpuAck,ackFlight,gpuAcked=true,committed=false,workspace,nonlocalPin,nonlocalFrame;
 const credit=bytes=>{const record={value:null,backing:null,free:null};record.retirement=createConvolutionSyncRetirement([()=>record.backing?.(),()=>record.free?.(),()=>{record.value=null;record.free=null;loans.delete(record);}]);loans.add(record);record.free=budget.reserve(bytes);return record;};
 const float=count=>{const record=credit(count*4);record.value=new Float32Array(count);record.backing=budget.registerBacking?.('array-buffer',count*4,{owner:'d2prl',label:'private-resident-plan',identity:record.value.buffer});return record.value;};
 const rollback=()=>{if(ticket?.active)ticket.rollback();};
 const acknowledge=async()=>{if(gpuAcked)return;if(ackFlight)return ackFlight;const task=Promise.resolve().then(waitGpuAck).then(()=>{gpuAcked=true;});ackFlight=task;void task.finally(()=>{if(ackFlight===task)ackFlight=null;}).catch(()=>{});return task;};
 let owner;
 owner={residentPlan:true,
  get ticketActive(){return !!ticket?.active;},get recipeBytes(){return packed?.byteLength??0;},get committed(){return committed;},get retired(){return retired;},
  adoptGpuRetirement(ack){requireValue(!closed&&gpuAcked&&typeof ack==='function','One acknowledged GPU handoff at a time');waitGpuAck=ack;gpuAcked=false;},
  async drainGpu(){await acknowledge();},
  async commitAfterGpu(){await acknowledge();checkAbort(selected);requireValue(!closed,'Resident plan already closed');ticket?.commit();committed=true;},
  materialize(){
   checkAbort(selected);requireValue(!closed,'Resident plan closed');if(materializing)return materializing;if(materialized)return Promise.resolve(materialized);
   const task=(async()=>{const ownPair={x:packed.subarray(0,n),y:packed.subarray(n,2*n)},hooks={signal:selected,allocate:float};let value;
    if(kind==='random'){
     // CPU replay uses the existing scalar generator with the exact saved state.
     // The caller's live reserved ticket and cursor are never advanced here.
     const replay=new NativeMpsRandom({stateBytes:stateBefore});let supplied=false;
     try{const source={async values(count){requireValue(!supplied&&count===2*n,'One exact source tensor replay');supplied=true;let record;const noise=await replay.values(count,{signal:selected,account:bytes=>{record=credit(bytes);}});record.value=noise;record.backing=budget.registerBacking?.('array-buffer',noise.byteLength,{owner:'d2prl',label:'private-resident-replay',identity:noise.buffer});return noise;}};const materializedNonlocal=nonlocalFrame?await pair.materialize():null,ownBounds=materializedNonlocal?.bounds??Object.fromEntries(['minX','maxX','minY','maxY'].map((key,i)=>[key,packed.subarray((2+i)*n,(3+i)*n)]));value=await randomCandidates(materializedNonlocal?.pair??ownPair,ownBounds,side,source,hooks);}finally{await replay.dispose();}
    }else{credit(32*side+512);workspace=createCandidateWorkspace(side);value=await propagateOffsets(ownPair,side,{...hooks,geometry:s=>workspace.geometry(s)});}
    value=await wrapOffsets(value,side,{signal:selected,inPlace:true});checkAbort(selected);materialized=value;return value;
   })();materializing=task;void task.finally(()=>{if(materializing===task)materializing=null;}).catch(()=>{});return task;
  },
  // clear() may ignore a returned Promise. Logical rollback is synchronous;
  // the existing registry still owns all bytes until dispose obtains real ACK.
  release(){closed=true;life.abort();rollback();void owner.dispose().catch(()=>{});},
  async dispose(){
   if(retired)return;closed=true;life.abort();rollback();await materializing?.catch(()=>{});await acknowledge();
   nonlocalPin?.release();nonlocalPin=null;workspace?.dispose();workspace=null;createConvolutionIndependentRetirement([...loans].map(record=>({release:()=>record.retirement.release()}))).release();packed=materialized=stateBefore=null;retired=true;
  }
 };
 frames.set(owner,()=>({packed,ticket,side,kind,signal:selected,closed,nonlocal:nonlocalFrame?{counters:nonlocalFrame.counters,key:nonlocalFrame.key}:undefined}));
 adoptOwner(owner);
 try{
  checkAbort(selected);credit(512);
  if(pair?.deferredNonlocal){
   requireValue(side===448&&kind==='random'&&pair.published,'Whole448 deferred nonlocal plan required');
   nonlocalPin=pair.borrow(()=>owner.dispose());nonlocalFrame=nonlocalPin.frame();
   requireValue(nonlocalFrame&&!nonlocalFrame.closed&&nonlocalFrame.side===side,'Live deferred nonlocal input');packed=nonlocalFrame.packed;
  }else{
   requireValue(pair?.x instanceof Float32Array&&pair.y instanceof Float32Array&&pair.x.length===n&&pair.y.length===n,'Owned candidate input');
   if(kind==='random')requireValue(['minX','maxX','minY','maxY'].every(k=>bounds?.[k] instanceof Float32Array&&bounds[k].length===n),'Native source bounds');
   packed=float((kind==='random'?6:2)*n);packed.set(pair.x);packed.set(pair.y,n);
   if(kind==='random')for(const [i,key]of ['minX','maxX','minY','maxY'].entries())packed.set(bounds[key],(2+i)*n);
  }
  if(kind==='random'){requireValue(typeof random?.reserveSource==='function','Native source ticket required');stateBefore=random.stateBytes();ticket=random.reserveSource(2*n,{signal:selected});}
  return owner;
 }catch(error){try{owner.release();}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw error;}
}
