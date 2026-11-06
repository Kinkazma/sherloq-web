// Ordered, retryable ACK barriers used only by the three classical SIFT tools.
// A step is removed after its promise fulfils; false/zero rejection values are
// real failures and do not become successful cleanup through truthiness tests.
export function classicSiftRetirement(steps,onDone){
 let cursor=0,active,done=false;
 const release=()=>{if(done)return;if(active)return active;const task=(async()=>{while(cursor<steps.length){await steps[cursor]();cursor++;}await onDone?.();done=true;})();active=task;void task.finally(()=>{if(active===task)active=null;}).catch(()=>{});return task;};
 Object.defineProperty(release,'retired',{get:()=>done});return release;
}
export async function classicSiftRetireAll(steps){let failed=false,primary;for(const step of steps)try{await step();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
export function attachClassicSiftCleanup(primary,error){if(primary&&typeof primary==='object')try{if(Object.isExtensible(primary))primary.cleanupErrors=[...(primary.cleanupErrors??[]),error];}catch{}}
const failedOwners=new WeakMap();
export function keepClassicSiftRetirement(budget,owner){let owners=failedOwners.get(budget);if(!owners){owners=new Set();failedOwners.set(budget,owners);}owners.add(owner);}
export function forgetClassicSiftRetirement(budget,owner){failedOwners.get(budget)?.delete(owner);}
export async function drainClassicSiftRetirements(budget){await classicSiftRetireAll([...(failedOwners.get(budget)??[])].map(owner=>()=>owner.close()));}
export async function withClassicSiftCleanup(work,cleanup,{budget}={}){let failed=false,primary;try{return await work();}catch(error){failed=true;primary=error;throw error;}finally{try{await cleanup();}catch(error){if(budget){const owner={async close(){await cleanup();forgetClassicSiftRetirement(budget,owner);}};keepClassicSiftRetirement(budget,owner);}if(failed)attachClassicSiftCleanup(primary,error);else throw error;}}}
export function classicSiftOwnedRelease(budget,release){const owner={close:null};let active;const close=()=>{if(active)return active;const task=(async()=>{try{await release();forgetClassicSiftRetirement(budget,owner);}catch(error){keepClassicSiftRetirement(budget,owner);throw error;}})();active=task;void task.finally(()=>{if(active===task)active=null;}).catch(()=>{});return task;};owner.close=close;return close;}
