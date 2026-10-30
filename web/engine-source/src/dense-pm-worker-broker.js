import {EngineError,requireValue,serializeEngineError,deserializeEngineError} from './errors.js';
import {createDensePmReverse} from './dense-pm-reverse.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';

// One job/one worker. Raw feature cache aliases are never transferred. The
// parent first admits the temporary bank publication and reverse heap; only
// then may this side materialize its working copies.
export function createDensePmWorkerBroker(post,{createReverse=createDensePmReverse}={}){
 let serial=0,active;
 const wait=kind=>new Promise((resolve,reject)=>{requireValue(active&&!active.waiter,'Dense GPU worker already awaiting a reply');active.waiter={kind,resolve,reject};});
 return {
  async handle(message){
   const packet=message?.gpuPm;if(!packet)return false;
   requireValue(active&&packet.id===active.id,'Unexpected dense GPU worker reply');
   if(packet.kind==='reverse'){
    requireValue(active.reverse&&packet.state instanceof Uint32Array,'Missing dense native reverse owner');
    try{const state=active.reverse.apply(packet.state);post({gpuPm:{id:active.id,kind:'reversed',sequence:packet.sequence,state}},[state.buffer]);}
    catch(error){post({gpuPm:{id:active.id,kind:'reversed-error',sequence:packet.sequence,error:serializeEngineError(error)}});}
    return true;
   }
   const waiter=active.waiter;requireValue(waiter&&[waiter.kind,'error'].includes(packet.kind),'Unexpected dense GPU worker reply phase');active.waiter=null;
   if(packet.kind==='error')waiter.reject(deserializeEngineError(packet.error));else waiter.resolve(packet);return true;
  },
  async run({width,height,dimensions,second=false,options={},packed=false,activeCount,mask:inputMask,banks}){
   requireValue(!active&&typeof banks==='function','Dense worker GPU broker is busy');const n=width*height;if(packed)requireValue(inputMask instanceof Uint8Array&&inputMask.length===n&&Number.isSafeInteger(activeCount)&&activeCount>=2&&activeCount<n,'Invalid active dense worker offer');active={id:++serial,reverse:null,waiter:null};const id=active.id;let accepted=false,hasFailure=false,primary;
   try{
    const accept=wait('accepted');post({gpuPm:{id,kind:'offer',width,height,dimensions,second,options,...(packed?{packed:true,activeCount}:{})}});const offer=await accept;if(!offer.accepted)return null;accepted=true;
    let activeIndices;if(packed){activeIndices=new Int32Array(activeCount);let slot=0;for(let i=0;i<n;i++)if(inputMask[i]){requireValue(slot<activeCount,'Active eligibility grew after admission');activeIndices[slot++]=i;}requireValue(slot===activeCount,'Active eligibility changed after admission');}const {first,second:other=first,mask}=await banks(activeIndices);requireValue(first instanceof Float32Array&&other instanceof Float32Array&&mask instanceof Uint8Array&&(second||other===first)&&first.length===(packed?activeCount:n)*dimensions&&other.length===first.length,'Invalid dense worker bank publication');
    active.reverse=await createReverse(first,other,mask,width,height,{...options,dimensions,reuseSymmetricScores:first===other,nativeDistanceInvariant:true,activeIndices});
    const ready=wait('done'),packet={gpuPm:{id,kind:'ready',width,height,dimensions,first,second:other,mask,heapBytes:active.reverse.heapBytes,reverseScoreReuse:active.reverse.symmetricScoreReuse===true,...(packed?{activeIndices}:{})}};
    post(packet,[...new Set([first.buffer,other.buffer,mask.buffer,...(activeIndices?[activeIndices.buffer]:[])])]);const done=await ready;return done.field??null;
   }catch(error){hasFailure=true;primary=error;throw error;}
   finally{
    let retireFailed=false,retirement;try{await active.reverse?.dispose();}catch(error){retireFailed=true;retirement=error;}
    // The parent retains extra credits until this explicit ACK or termination.
    // A rejected native close must never publish a successful retirement.
    if(!retireFailed&&accepted)try{const acknowledged=wait('retired-ack');post({gpuPm:{id,kind:'retired'}});await acknowledged;}catch(error){retireFailed=true;retirement=error;}
    active=null;if(retireFailed){if(hasFailure)attachGpuCleanup(primary,retirement);else throw retirement;}
   }
  }
 };
}
