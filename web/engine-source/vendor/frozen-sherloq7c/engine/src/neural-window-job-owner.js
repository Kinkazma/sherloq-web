import {EngineError,checkAbort,requireValue} from './errors.js';

export const neuralWindowBindingKeys=Object.freeze(['sourceId','sourceSha256','sourceWidth','sourceHeight','domainFingerprint','generation','family']);
export function captureNeuralWindowBinding(binding){
 requireValue(binding&&typeof binding.sourceId==='string'&&binding.sourceId.length>0&&/^[a-f0-9]{64}$/.test(binding.sourceSha256??'')&&/^[a-f0-9]{64}$/.test(binding.domainFingerprint??'')&&Number.isSafeInteger(binding.sourceWidth)&&binding.sourceWidth>0&&Number.isSafeInteger(binding.sourceHeight)&&binding.sourceHeight>0&&Number.isSafeInteger(binding.generation)&&binding.generation>0&&['xfeat-local','efficient-loftr-native-stage','xfeat-glue-operator'].includes(binding.family),'An exact neural Window source/domain binding is required.');
 return Object.freeze(Object.fromEntries(neuralWindowBindingKeys.map(key=>[key,binding[key]])));
}
export function sameNeuralWindowBinding(a,b){return!!a&&!!b&&neuralWindowBindingKeys.every(key=>a[key]===b[key]);}
export async function neuralWindowAck(action){const value=await action();if(value===0||value===false)throw value;return value;}

/** One already-admitted transport job. Native resources, transferred output
 * receipt and job funding are independent of the persistent Window runtime.
 * A failed retirement keeps this owner and retries no scientific work. */
export function createNeuralWindowJobOwner({binding,budget,bytes,onOwner,onClosed=()=>{},execute,validate=()=>{},releaseFunding}={}){
 const captured=captureNeuralWindowBinding(binding);
 requireValue(budget?.reserve&&Number.isSafeInteger(bytes)&&bytes>0&&typeof onOwner==='function'&&typeof execute==='function','Funded neural Window job owner required.');
 const native=new Set(),outputs=new Set();let fee,admitted=false,started=false,compute,settled=false,prepared=false,received=false,cancelled=false,closed=false,flight,value,nativeFlight;
 let failed=false,primary,cleanupFailed=false,cleanupPrimary;
 const fail=error=>{if(!failed){failed=true;primary=error;}};
 const retireNative=()=>{
  if(nativeFlight)return nativeFlight;
  const task=Promise.resolve().then(async()=>{let errorSeen=false,error;for(const resource of [...native])try{await neuralWindowAck(()=>resource.dispose());native.delete(resource);}catch(cause){if(!errorSeen){errorSeen=true;error=cause;}}if(errorSeen){cleanupFailed=true;cleanupPrimary=error;throw error;}cleanupFailed=false;cleanupPrimary=undefined;});
  nativeFlight=task;void task.finally(()=>{if(nativeFlight===task)nativeFlight=null;}).catch(()=>{});return task;
 };
 const owner={binding:captured,
  get state(){return{admitted,started,settled,prepared,received,cancelled,closed,nativeOwners:native.size,outputOwners:outputs.size,funded:!!fee,failed,cleanupFailed};},
  get outcome(){return{failed,error:primary,cleanupFailed,cleanupError:cleanupPrimary};},
  cancel(){cancelled=true;},
  async start(payload,currentBinding=captured){
   requireValue(admitted&&!closed&&!started&&sameNeuralWindowBinding(captured,currentBinding),'Window job identity changed or ticket already consumed.');
   started=true;
   compute=(async()=>{try{
    value=await execute(payload,{onOwner(resource){requireValue(resource&&typeof resource.dispose==='function','A native graph owner must be adopted before construction.');native.add(resource);},onOutputOwner(resource){requireValue(resource&&typeof resource.dispose==='function','A complete output owner must be adopted before copying.');outputs.add(resource);}});
    validate(value);if(cancelled)fail(new EngineError('CANCELLED','Neural Window job cancelled after native work.'));
   }catch(error){fail(error);}finally{settled=true;}})();
   await compute;
   return owner.prepare(currentBinding);
  },
  async prepare(currentBinding=captured){
   requireValue(sameNeuralWindowBinding(captured,currentBinding),'Window job binding changed before prepare.');await compute;
   try{await retireNative();}catch(error){if(!failed)fail(error);throw primary;}
   if(cancelled&&!failed)fail(new EngineError('CANCELLED','Neural Window job cancelled before output publication.'));
   if(failed){await owner.close();throw primary;}
   requireValue(started&&settled&&!closed,'Window job cannot publish before settled native ACK.');prepared=true;
   return value;
  },
  async acknowledgeReceived(currentBinding=captured){
   requireValue(prepared&&sameNeuralWindowBinding(captured,currentBinding),'Complete output must be adopted under the captured binding.');received=true;value=undefined;return owner.close();
  },
  close({peerTerminated=false}={}){
   if(closed)return Promise.resolve();if(flight)return flight;
   flight=(async()=>{
    await compute;
    try{await retireNative();}catch(error){if(failed)throw primary;throw error;}
    // Prepared output cannot become an orphan. An actual receiver adoption or
    // trusted physical peer termination is required before its credit leaves.
    if(prepared&&!received&&!peerTerminated&&!cancelled)throw new EngineError('BUSY','Complete Window output is awaiting its receiver ownership ACK.');
    let outputFailed=false,outputPrimary;for(const resource of [...outputs])try{await neuralWindowAck(()=>resource.dispose());outputs.delete(resource);}catch(error){if(!outputFailed){outputFailed=true;outputPrimary=error;}}
    if(outputFailed){if(failed)throw primary;throw outputPrimary;}
    value=undefined;
    if(fee){await neuralWindowAck(()=>releaseFunding?releaseFunding(fee):fee());fee=null;}
    cleanupFailed=false;cleanupPrimary=undefined;closed=true;onClosed(owner);
   })();void flight.catch(()=>{}).finally(()=>{flight=null;});return flight;
  }
 };
 // Registration precedes funding, verification, import and native construction.
 onOwner(owner);
 fee=budget.reserve(bytes);admitted=true;
 return owner;
}
