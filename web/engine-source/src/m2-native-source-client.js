import {serveNativeSourceChannel} from './native-source-channel.js';
import {EngineError} from './errors.js';

/** Retain the borrowed original reader for as long as the worker's result can
 * render from it. The host closes its channel only after its last result pin. */
export function withM2NativeSourceTransport(client,{channelFactory=()=>new MessageChannel()}={}){
 const sources=new Set(),results=new Map(),cleanupFailures=[];let disposed=false;
 async function analyzeNativeRectangle(method,reader,params={},options={}){
  if(disposed)throw new EngineError('DISPOSED','M2 native source transport is closed.');
  const channel=channelFactory();let provider,owner;
  try{
   provider=serveNativeSourceChannel(channel.port1,reader,{signal:options.signal});
   owner={provider,reader};sources.add(owner);
   owner.closed=provider.whenClosed.then(()=>reader.dispose()).finally(()=>{sources.delete(owner);if(results.get(owner.resultId)===owner)results.delete(owner.resultId);});
   // A failed endpoint can close asynchronously while callers are still
   // receiving its original error; retain cleanup failures for dispose().
   owner.closed.catch(error=>cleanupFailures.push(error));
   const image={format:'rgb8-window-source',width:reader.width,height:reader.height,sha256:reader.sha256,origin:reader.origin,sourceRegionDomain:reader.sourceRegionDomain,purpose:reader.purpose,analysisContext:reader.analysisContext,port:channel.port2};
   const descriptor=await client.analyzeNativeSource(method,image,params,options);owner.resultId=descriptor.id;results.set(descriptor.id,owner);
   return descriptor;
  }catch(error){
   channel.port2.close?.();if(provider)await provider.dispose();else channel.port1.close?.();
   try{if(owner)await owner.closed;else await reader.dispose();}catch(cleanup){error.cleanupError=cleanup;}
   throw error;
  }
 }
 return{...client,analyzeNativeRectangle,async release(id){const owner=results.get(id);await client.release(id);await owner?.closed;},async dispose(){if(disposed)return;disposed=true;let failure;try{await client.dispose();}catch(error){failure=error;}for(const owner of [...sources])try{await owner.provider.dispose();await owner.closed;}catch(error){failure??=error;}failure??=cleanupFailures[0];if(failure)throw failure;}};
}
