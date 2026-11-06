import {EngineError,requireValue} from './errors.js';
import {captureNeuralWindowBinding} from './neural-window-job-owner.js';
import {encodeNeuralWindowFailure} from './neural-window-host.js';
/** Private main-Worker control seam only. An engine reset must await close()
 * before physical termination; the application runtime quota is unaffected. */
export function createNeuralWindowClientLink({worker,service,onOwner,onFailure=()=>{}}={}){
 requireValue(worker?.postMessage&&service?.open&&service?.prepareRuntimeCapacity&&typeof onOwner==='function','Window bridge requires its current Worker and strong application service.');
 const connections=new Map();let serial=0,closing=false,flight;
 const post=message=>worker.postMessage(message),fail=(ticket,error,retired)=>post({neuralWindowControl:{ticket,kind:'failed',failure:encodeNeuralWindowFailure(error),retired}});
 const link={get snapshot(){return{connections:connections.size,closing,applicationRuntime:service.snapshot};},
  accept(message){const request=message?.neuralWindowRequest;if(!request)return false;
   requireValue(Number.isSafeInteger(request.ticket)&&request.ticket>0&&['connect','disconnect'].includes(request.kind),'Invalid private Window request.');const ticket=request.ticket;
   if(request.kind==='disconnect'){const entry=connections.get(ticket);if(!entry){post({neuralWindowControl:{ticket,kind:'retired'}});return true;}void entry.close().then(()=>post({neuralWindowControl:{ticket,kind:'retired'}}),error=>fail(ticket,error,false));return true;}
   requireValue(!closing&&ticket>serial&&!connections.has(ticket),'Stale private Window connection.');serial=ticket;const binding=captureNeuralWindowBinding(request.binding),plan=Object.freeze({...request.memoryPlan});
   requireValue(plan&&Number.isSafeInteger(plan.hostMaximumBytes)&&Number.isSafeInteger(plan.persistentQuotaBytes)&&Number.isSafeInteger(request.maximumJobBytes)&&request.maximumJobBytes>0,'Complete private Window memory plan required.');
   let opening=Promise.resolve(),finish,host,channel,closed=false,retiring;const entry={close(){if(closed)return Promise.resolve();if(retiring)return retiring;retiring=(async()=>{await opening;await host?.close();channel?.port2.close();closed=true;connections.delete(ticket);})();void retiring.catch(()=>{retiring=null;});return retiring;}};connections.set(ticket,entry);
   opening=new Promise(resolve=>finish=resolve);
   void (async()=>{let failed=false,primary;try{
    await service.prepareRuntimeCapacity(plan);if(closing)throw new EngineError('CANCELLED','Window connection closed before attachment.');channel=new MessageChannel();const nonce=crypto.randomUUID().replaceAll('-','');host=service.open({port:channel.port1,nonce,binding,maximumJobBytes:request.maximumJobBytes,onOwner:o=>{host=o;},onTransportFailure:(error,receipt)=>{try{post({neuralWindowControl:{ticket,nonce,kind:'transport-failure',failure:encodeNeuralWindowFailure(error),retired:receipt.retired===true}});}catch(cause){onFailure(cause);}}});
    worker.postMessage({neuralWindowControl:{ticket,kind:'connected',nonce,binding,port:channel.port2,persistentRuntime:service.snapshot}},[channel.port2]);
   }catch(error){failed=true;primary=error;}finally{finish();}
   if(failed){let retired=false;try{await entry.close();retired=true;}catch{}try{fail(ticket,primary,retired);}catch(error){onFailure(error);}}
   })();return true;
  },
  close(){closing=true;if(flight)return flight;flight=(async()=>{let failed=false,primary;for(const entry of [...connections.values()])try{await entry.close();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;})();void flight.catch(()=>{flight=null;});return flight;}
 };onOwner(link);return link;
}
