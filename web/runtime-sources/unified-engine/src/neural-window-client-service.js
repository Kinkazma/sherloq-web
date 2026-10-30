import "../../runtime-context.js?v=0.30.0";
import {neuralWindowRuntimeQuota} from './neural-window-memory-plan.js';
import {Budget} from './cache.js';
import {requireValue} from './errors.js';
import {createNeuralWindowHost} from './neural-window-host.js';
import {createNeuralWindowOrtPool} from './neural-window-ort-pool.js';
import {captureNeuralWindowBinding} from './neural-window-job-owner.js';
let applicationService;
/** Window-global owner, independent of a particular engine client. The caller
 * must also keep the declared quota escrowed in its Worker Native budget.
 * Closing a client connection refunds its jobs/port only, never the host heap. */
export function createNeuralWindowClientService({limitBytes,hostMaximumBytes,quotaBytes,onOwner,poolFactory=createNeuralWindowOrtPool}={}){
 requireValue(Number.isSafeInteger(limitBytes)&&limitBytes>0&&(quotaBytes===undefined||limitBytes>=quotaBytes)&&typeof onOwner==='function','The actual application profile must fund the persistent Window runtime.');
 const budget=new Budget(limitBytes),connections=new Set(),roots=new Set();let pool,closing=false,flight;
 const service={
  get snapshot(){return{scope:'application-Window',totalFundedBytes:budget.total(),backings:budget.resources.backings.size,pool:pool?.snapshot??{quotaBytes:0,initializationStarted:false,retainedDevices:0},connectionCount:connections.size,persistentQuotaBytes:pool?.snapshot.quotaBytes??0,hostMaximumBytes:pool?.snapshot.hostMaximumBytes??hostMaximumBytes??null,limitBytes};},
  admitProfileLimit(nextLimit){requireValue(!closing&&Number.isSafeInteger(nextLimit)&&nextLimit>0&&nextLimit>=(pool?.snapshot.quotaBytes??0),'The explicitly selected profile cannot fund the persistent Window runtime.');if(nextLimit>limitBytes){budget.limit=nextLimit;limitBytes=nextLimit;}return service.snapshot;},
  async prepareRuntimeCapacity(plan){requireValue(!closing&&plan&&Number.isSafeInteger(plan.hostMaximumBytes)&&Number.isSafeInteger(plan.persistentQuotaBytes)&&plan.persistentQuotaBytes<=limitBytes&&plan.persistentQuotaBytes===neuralWindowRuntimeQuota(plan.hostMaximumBytes),'The actual Native runtime plan must fit this application profile.');plan=Object.freeze({hostMaximumBytes:plan.hostMaximumBytes,persistentQuotaBytes:plan.persistentQuotaBytes});if(!pool){hostMaximumBytes=plan.hostMaximumBytes;quotaBytes=plan.persistentQuotaBytes;pool=poolFactory({budget,hostMaximumBytes,quotaBytes,onOwner:owner=>roots.add(owner),factoryURL:new URL('../vendor/m3-ort/window-admitted/factory.mjs',import.meta.url)});}else if(plan.hostMaximumBytes>pool.snapshot.hostMaximumBytes){while(pool.snapshot.activeJobs)await pool.whenIdle();pool.admitCapacity({hostMaximumBytes:plan.hostMaximumBytes,quotaBytes:plan.persistentQuotaBytes});}return service.snapshot;},
  open({port,nonce,binding,maximumJobBytes,onOwner:adopt,onTransportFailure}={}){
   requireValue(!closing&&typeof adopt==='function'&&(pool||Number.isSafeInteger(hostMaximumBytes)&&Number.isSafeInteger(quotaBytes)),'Application Window service is closing or missing a client owner.');const captured=captureNeuralWindowBinding(binding);
   // Registration is performed by host before its connection reservation.
   return createNeuralWindowHost({port,nonce,binding:captured,budget,maximumJobBytes,onOwner:host=>{connections.add(host);adopt(host);},onClosed:host=>connections.delete(host),onTransportFailure,describeResult:value=>pool?.executionFacts?.(value),execute:(payload,hooks)=>{
    pool??=poolFactory({budget,hostMaximumBytes,quotaBytes,onOwner:owner=>roots.add(owner)});return pool.execute(payload,hooks);
   }});
  },
  closeApplicationJobs(){closing=true;if(flight)return flight;flight=(async()=>{let failed=false,primary;for(const host of [...connections])try{await host.close();}catch(error){if(!failed){failed=true;primary=error;}}if(!connections.size)for(const root of roots)try{await root.closeJobs();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;return service.snapshot;})();void flight.catch(()=>{flight=null;});return flight;}
 };
 onOwner(service);return service;
}
export function applicationNeuralWindowClientService(options){
 if(!applicationService)applicationService=createNeuralWindowClientService(options);
 else{requireValue(options.limitBytes>=applicationService.snapshot.persistentQuotaBytes,'The current application profile cannot fund its existing Window neural runtime.');applicationService.admitProfileLimit(options.limitBytes);options.onOwner(applicationService);}
 return applicationService;
}
export function neuralWindowApplicationSnapshot(){return applicationService?.snapshot??null;}
