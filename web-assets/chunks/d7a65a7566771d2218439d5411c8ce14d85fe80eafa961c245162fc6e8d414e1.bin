import "../../runtime-context.js?v=0.14.5";
// Cheap metadata only. Never allocate a probe or request a garbage collection.
// These values describe different scopes; their subtraction is not free RAM.
export function browserMemoryObservation({performanceObject=globalThis.performance,navigatorObject=globalThis.navigator}={}){
 const read=(object,key)=>{try{const value=object?.[key];return Number.isFinite(value)&&value>=0?value:null;}catch{return null;}};
 let memory;try{memory=performanceObject?.memory;}catch{}
 return {
  deviceMemoryGiB:read(navigatorObject,'deviceMemory'),
  jsHeapSizeLimit:read(memory,'jsHeapSizeLimit'),
  reportedUsedJSHeapSize:read(memory,'usedJSHeapSize'),
  reportedTotalJSHeapSize:read(memory,'totalJSHeapSize'),
  availableAllocationBytes:null,
  scope:'Current JavaScript context; device RAM is approximate; heap counters may include external memory, be cached or unavailable. No aggregate allocation guarantee.',
  measurement:'metadata-only',
 };
}

// Optional host/extension bridge. Ordinary web pages need no extension and
// continue with portable hints. The returned availability is a dated snapshot,
// never a reservation or a browser quota. No privileged API is installed here.
export async function readSystemMemoryHints(systemMemory=globalThis.chrome?.system?.memory){
 if(typeof systemMemory?.getInfo!=='function')return null;
 const info=await systemMemory.getInfo();
 if(!info||!Number.isSafeInteger(info.capacity)||info.capacity<=0||!Number.isSafeInteger(info.availableCapacity)||info.availableCapacity<0||info.availableCapacity>info.capacity)throw new TypeError('Invalid system memory observation.');
 return {systemMemoryCapacityBytes:info.capacity,systemMemoryAvailableBytes:info.availableCapacity,systemMemoryObservedAt:Date.now()};
}

// The optional extension is explicitly addressed. No scanning for extensions,
// storage, cookies, installation, recurring polling or allocation probe.
export async function readExtensionMemoryHints(extensionId,{runtime=globalThis.chrome?.runtime}={}){
 if(typeof extensionId!=='string'||!/^[a-p]{32}$/.test(extensionId))throw new TypeError('Invalid extension ID.');
 if(typeof runtime?.sendMessage!=='function')return null;
 return readSystemMemoryHints({getInfo:()=>new Promise((resolve,reject)=>{
  runtime.sendMessage(extensionId,{type:'sherloq-system-memory-v1'},response=>{const error=runtime.lastError;if(error||response?.error){reject(new Error(error?.message??response.error));return;}resolve(response);});
 })});
}
