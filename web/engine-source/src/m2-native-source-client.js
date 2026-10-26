import {serveNativeSourceChannel} from './native-source-channel.js';
import {EngineError} from './errors.js';

/** Retain the borrowed original reader until the worker's dependent owner ACKs.
 * Strict CFA opts into retryable retirement; legacy model contracts stay separate. */
export function withM2NativeSourceTransport(client,{channelFactory=()=>new MessageChannel()}={}){
 const sources=new Set(),results=new Map(),failedCfaSources=new Set();let disposed=false,closing=false,disposal,gracefulCfa=false;
 const attach=(primary,cleanup)=>{if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{primary.cleanupError=cleanup;}catch{}};
 function retireReader(owner){
  if(owner.retired)return Promise.resolve();if(owner.retiring)return owner.retiring;
  const task=(async()=>{await owner.reader.dispose();owner.retired=true;sources.delete(owner);failedCfaSources.delete(owner);if(results.get(owner.resultId)===owner)results.delete(owner.resultId);})();
  owner.retiring=task.finally(()=>{owner.retiring=null;});return owner.retiring;
 }
 async function retirePendingNativeSources(){
  if(!failedCfaSources.size)return;
  const owners=[...failedCfaSources];
  for(const owner of owners)if(owner.resultId!==undefined&&!owner.hostAcknowledged){await client.release(owner.resultId);owner.hostAcknowledged=true;}
  const pending=owners.filter(owner=>!owner.hostAcknowledged);
  if(pending.length){await client.clearCache();for(const owner of pending)owner.hostAcknowledged=true;}
  for(const owner of owners){if(!owner.posted)await owner.provider?.dispose();else await owner.provider.whenClosed;await retireReader(owner);}
 }
 async function analyzeNativeRectangle(method,reader,params={},options={}){
  if(disposed)throw new EngineError('DISPOSED','M2 native source transport is closed.');
  if(closing){const error=new EngineError('BUSY','M2 native source retirement is waiting for its child ACK; retry dispose.');const owner={reader,posted:false,hostAcknowledged:true};sources.add(owner);try{await retireReader(owner);}catch(cleanup){attach(error,cleanup);}throw error;}
  const qualifiedCfa=method==='cfa'&&reader.purpose==='analysis-native-contexts'&&reader.analysisContext==='native-cfa-contexts-only';if(qualifiedCfa)gracefulCfa=true;
  const channel=channelFactory(),analysisAbort=new AbortController(),abort=()=>analysisAbort.abort();let provider,owner;
  options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
  const detach=()=>options.signal?.removeEventListener('abort',abort);
  try{
   provider=serveNativeSourceChannel(channel.port1,reader,qualifiedCfa?{}:{signal:analysisAbort.signal});
   owner={provider,reader,qualifiedCfa,posted:false,hostAcknowledged:false};sources.add(owner);
   // A qualified provider's closure alone is not its child's retirement ACK.
   // Legacy sources retain their existing automatic close notification.
   if(!qualifiedCfa)provider.whenClosed.then(()=>retireReader(owner)).catch(error=>{owner.cleanupFailure=error;});
   await retirePendingNativeSources();
   const image={format:'rgb8-window-source',width:reader.width,height:reader.height,sha256:reader.sha256,origin:reader.origin,sourceRegionDomain:reader.sourceRegionDomain,purpose:reader.purpose,analysisContext:reader.analysisContext,port:channel.port2};
   const descriptor=await client.analyzeNativeSource(method,image,params,{...options,onPosted(){owner.posted=true;}});
   owner.resultId=descriptor.id;results.set(descriptor.id,owner);
   if(analysisAbort.signal.aborted||provider.closed){const error=new EngineError('CANCELLED','The native source analysis was cancelled before result ownership transferred.');try{await client.release(descriptor.id);owner.hostAcknowledged=true;}catch(cleanup){attach(error,cleanup);}throw error;}
   detach();return descriptor;
  }catch(error){
   if(qualifiedCfa&&owner?.posted){failedCfaSources.add(owner);throw error;}
   channel.port2.close?.();try{if(provider)await provider.dispose();else channel.port1.close?.();if(owner)await retireReader(owner);else await reader.dispose();}catch(cleanup){if(qualifiedCfa&&owner){owner.hostAcknowledged=true;failedCfaSources.add(owner);}attach(error,cleanup);}
   throw error;
  }finally{detach();}
 }
 return{...client,analyzeNativeRectangle,retirePendingNativeSources,
  analyzeNativeContexts(method,reader,params={},options={}){const expected={cfa:'native-cfa-contexts-only',trufor:'native-trufor-contexts-only',rita:'native-rita-contexts-only'}[method];if(!expected||reader.purpose!=='analysis-native-contexts'||reader.analysisContext!==expected||reader.preparationContext!==undefined)throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','This explicit scientific context does not match a qualified M2 consumer.');return analyzeNativeRectangle(method,reader,params,options);},
  async release(id){const owner=results.get(id);await client.release(id);if(owner){owner.hostAcknowledged=true;await owner.provider.whenClosed;await retireReader(owner);}},
  dispose(){if(disposed)return Promise.resolve();if(disposal)return disposal;closing=true;
   const completeSources=async()=>{let failed=false,failure;for(const owner of [...sources])try{await owner.provider?.dispose();await retireReader(owner);}catch(error){if(!failed){failed=true;failure=error;}}if(failed)throw failure;};
   const task=(async()=>{if(gracefulCfa){if(typeof client.disposeGracefully!=='function')throw new EngineError('INVALID_INPUT','Strict CFA source ownership requires graceful M2 disposal.');await client.disposeGracefully(completeSources);}else{await client.dispose();await completeSources();}
    // The local source ACK also precedes termination of the graceful Worker.
    disposed=true;
   })();disposal=task.finally(()=>{disposal=undefined;});return disposal;
  }
 };
}
