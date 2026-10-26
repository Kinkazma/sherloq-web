import "../../runtime-context.js?v=0.25.0";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {planAdmittedNativeContexts} from './admitted-native-context-cover.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
export const ZERO_CONTEXT_PLAN_VERSION='canonical-admitted-native-zero-contexts/1';

// Resources in one phase are independent. A refused phase retains its owners
// and prevents retirement of later (source/credit) phases. Falsy ACKs are real.
export function createZeroRetirement({signal,onOwner}={}){
 const controller=new AbortController(),resources=new Map(),waiting=new Set();let closed=false,closing=false,pending;
 const owner={signal:signal?AbortSignal.any([signal,controller.signal]):controller.signal,
  get state(){return{closed,closing,pending:!!pending,resources:[...resources.values()].reduce((n,s)=>n+s.size,0),waiting:waiting.size};},
  add(retire,phase=0){requireValue(typeof retire==='function'&&!closed,'A live ZERO retirement callback is required.');if(!resources.has(phase))resources.set(phase,new Set());resources.get(phase).add(retire);return retire;},
  waitUntil(promise){const p=Promise.resolve(promise);waiting.add(p);void p.finally(()=>waiting.delete(p)).catch(()=>{});return p;},
  cancel(){controller.abort();},
  dispose(){if(closed)return Promise.resolve();if(pending)return pending;closing=true;controller.abort();
   const task=(async()=>{while(waiting.size)await Promise.allSettled([...waiting]);for(const phase of [...resources.keys()].sort((a,b)=>a-b)){const group=resources.get(phase);let failed=false,primary;for(const retire of group)try{await retire();group.delete(retire);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}closed=true;})();pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;}
 };owner.release=()=>owner.dispose();onOwner?.(owner);return owner;
}

/** No RGB. Ownership is solely a presentation selection, never a vote filter. */
export async function planZeroNativeContexts(view,{budget,signal,onOwner}={}){
 const owner=createZeroRetirement({signal,onOwner});let finish;const done=new Promise(r=>finish=r);owner.waitUntil(done);let failed=false,primary;
 try{
  requireValue(view?.domain?.descriptor&&budget?.reserve,'A certified ZERO view and budget are required.');
  const plan=await planAdmittedNativeContexts(view,{minimumWidth:16,minimumHeight:16,alignmentX:1,alignmentY:1,retainNonOwningContexts:true,budget,signal:owner.signal});owner.add(()=>plan.dispose(),1);checkAbort(owner.signal);
  if(plan.contexts.length>8192)throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','The complete ZERO context collection exceeds its admitted bound.',{details:{phase:'zero-context-plan',reason:'context-count-exceeds-consumer-limit',limit:8192,required:plan.contexts.length}});
  for(const r of plan.contexts)if(r.width>65500||r.height>65500||r.width*r.height>=2**31)throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','ZERO native-limit-aware interior contexts are not enumerated.',{details:{phase:'zero-context-plan',reason:'native-limit-aware-maxima-not-enumerated',bounds:[r.x,r.y,r.x+r.width,r.y+r.height]}});
  owner.add(budget.reserve(8192+plan.contexts.reduce((n,c)=>n+sourceRegionTransportBytes(c)*4+4096,0)),2);
  const contexts=plan.contexts.map((r,index)=>Object.freeze({x:r.x,y:r.y,width:r.width,height:r.height,id:'zero-context-'+index,bounds:Object.freeze([r.x,r.y,r.x+r.width,r.y+r.height]),originalBounds:Object.freeze([r.x+view.domain.origin[0],r.y+view.domain.origin[1],r.x+r.width+view.domain.origin[0],r.y+r.height+view.domain.origin[1]]),jpegOrigin:Object.freeze([0,0]),ownedRectangles:r.ownedRectangles,ownedPixels:r.ownedPixels}));
  return Object.freeze({version:ZERO_CONTEXT_PLAN_VERSION,domainFingerprint:view.domain.fingerprint,contexts:Object.freeze(contexts),unsupportedRectangles:plan.unsupportedRectangles,selectedPixels:plan.sourceAdmittedPixels,uniqueObservedPixels:plan.uniqueObservedPixels,contextObservedPixels:plan.contextObservedPixels,noNativeSupportPixels:plan.noNativeSupportPixels,preservedRectangle:plan.preservedRectangle,ownership:'first canonical context in y/x/bottom/right order, presentation only',owner,dispose:()=>owner.dispose()});
 }catch(error){failed=true;primary=error;throw error;}finally{finish();if(failed)try{await owner.dispose();}catch{} }
}
