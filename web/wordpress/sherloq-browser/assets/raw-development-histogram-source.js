import {EngineError} from './unified-engine/src/errors.js';
import {withRetirementOwner} from './unified-engine/src/owner-retirement-error.js';
import {createNativeColorClient} from './native-color-client.js?v=0.33.2';

// One histogram-only development pair. The Original, its sensor and other
// panels keep their own descriptors. View sessions never own a second credit.
export async function createRawDevelopmentHistogramSource({quality,nativeOptions,isCurrent,onOwner,createDisplaySurface,onInvalidate=()=>{},beforeRetire=()=>{}}){
 if(![0,3,4].includes(quality)||typeof onOwner!=='function'||typeof isCurrent!=='function'||typeof createDisplaySurface!=='function')throw new EngineError('INVALID_INPUT','A captured RAW histogram development owner is required.');
 let reader,surface,failureOwner,closing=false,closed=false,disposal,drain,invalidationLevel=-1,peerRetiring=false;const sessions=new Set(),requests=new Set();
 const current=()=>!closing&&!closed&&isCurrent();
 const cancelled=()=>new EngineError('CANCELLED','The RAW histogram development changed.');
 const check=()=>{if(!current())throw cancelled();};
 function track(task){requests.add(task);void task.then(()=>requests.delete(task),()=>requests.delete(task));return task;}
 function drop(event={}){closing=true;peerRetiring||=event.retiring===true;const level=peerRetiring?1:0;if(invalidationLevel>=level)return true;const effective={...event,retiring:peerRetiring};surface?.close();for(const session of sessions)session.invalidate(effective);const ack=onInvalidate(effective);if(ack===false||ack===0||ack?.then)throw new EngineError('BUSY','RAW histogram display references remain live.');invalidationLevel=level;return true;}
 function drainConsumers(event={}){if(drain)return drain;const task=(async()=>{for(const session of [...sessions])await session.dispose();await Promise.allSettled([...requests]);const ack=await beforeRetire(event);if(ack===false||ack===0)throw new EngineError('BUSY','RAW histogram consumers have not retired.');})();drain=task;void task.catch(()=>{if(drain===task)drain=null;});return task;}
 const owner={
  quality,get surface(){return surface;},get closed(){return closed;},get current(){return current();},get originalCurrent(){return isCurrent();},
  get nativeCapability(){return reader?.capabilityFor('rgb16')??null;},
  openSession({signal,onInvalidate:invalidate=()=>{},beforeRetire:retire=()=>{}}={}){
   check();let sessionClosed=false,sessionClosing=false,retirement;const frames=new Set(),pending=new Set();
   const valid=()=>current()&&!sessionClosed&&!sessionClosing&&!signal?.aborted;
   const session={
    get capability(){return reader.capabilityFor('rgb16');},width:reader.capabilityFor('rgb16').width,height:reader.capabilityFor('rgb16').height,
    invalidate(event={}){sessionClosing=true;const ack=invalidate(event);if(ack===false||ack===0||ack?.then)throw new EngineError('BUSY','RAW histogram view references remain live.');return true;},
    readPixels(rect){if(!valid())return Promise.reject(cancelled());const task=(async()=>{let p;try{p=await reader.readSibling('rgb16',rect);frames.add(p);if(!valid())throw cancelled();return p;}catch(primary){if(p)try{await session.releasePixels(p);}catch(cleanup){throw withRetirementOwner(primary,session,cleanup);}throw primary;}})();pending.add(task);void task.then(()=>pending.delete(task),()=>pending.delete(task));return task;},
    readSampledPixels(tile){if(!valid())return Promise.reject(cancelled());const task=(async()=>{let p;try{p=await reader.readSampledSibling('rgb16',tile);frames.add(p);if(!valid())throw cancelled();return p;}catch(primary){if(p)try{await session.releasePixels(p);}catch(cleanup){throw withRetirementOwner(primary,session,cleanup);}throw primary;}})();pending.add(task);void task.then(()=>pending.delete(task),()=>pending.delete(task));return task;},
    adoptReturnedPixels(p){reader.adoptReturnedPixels(p);frames.add(p);return p;},
    async releasePixels(p){const ack=await reader.releasePixels(p);frames.delete(p);return ack;},
    dispose(){if(sessionClosed)return Promise.resolve();if(retirement)return retirement;const task=(async()=>{session.invalidate();await Promise.allSettled([...pending]);const ack=await retire();if(ack===false||ack===0)throw new EngineError('BUSY','RAW histogram view consumers remain live.');for(const p of frames)p.data=null;for(const p of [...frames])await session.releasePixels(p);sessionClosed=true;sessions.delete(session);})().catch(primary=>{throw withRetirementOwner(primary,session,primary);});retirement=task;void task.finally(()=>{if(retirement===task)retirement=null;}).catch(()=>{});return task;},
   };sessions.add(session);return session;
  },
  dispose(){if(closed)return Promise.resolve();if(disposal)return disposal;const task=(async()=>{drop();await drainConsumers();await reader?.dispose();await failureOwner?.dispose();closed=true;})().catch(primary=>{throw withRetirementOwner(primary,owner,primary);});disposal=task;void task.finally(()=>{if(disposal===task)disposal=null;}).catch(()=>{});return task;},
  snapshot(){return{closed,closing,sessions:sessions.size,requests:requests.size,quality,uiBytes:48*1024**2};},
 };
 try{
  onOwner(owner);check();reader=await createNativeColorClient({...nativeOptions,rawRepresentation:{schema:'sherloq.source-representation/1',kind:'raw-demosaic-rgb',quality,view:'rgb16'},onInvalidate:drop,beforeRetire:drainConsumers});check();await reader.prepareSibling('sdr8');check();
  const display=reader.displayDescriptor;if(!display||display.format!=='rgb8'||display.width!==reader.capability.width||display.height!==reader.capability.height)throw new EngineError('INVALID_INPUT','RAW development has no owned SDR display grid.');
  surface=createDisplaySurface(display,{
   readDisplay(tile){check();return track((async()=>{const pixels=await reader.readDisplay(tile);check();return{pixels};})());},
   readPixels(rect){check();return track((async()=>{const pixels=await reader.readRenderedPixels(rect);check();return{pixels};})());},isCurrent:current,
  });check();return owner;
 }catch(primary){if(!reader&&primary?.cleanupOwner)failureOwner=primary.cleanupOwner;try{await owner.dispose();}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;}
}
