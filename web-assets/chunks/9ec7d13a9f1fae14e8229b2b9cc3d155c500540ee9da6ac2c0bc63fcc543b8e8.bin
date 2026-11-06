// Internal authority. No public metrics or object-shaped certificate is trusted.
const zeros=new WeakMap();
const fail=(code,message)=>Object.assign(new Error(message),{code});
const numeric=['1e-2','1e-4','1e-7'];
// k*2^31+29787 is an exact integer below 2^53; the quotient is never
// close enough to an integer for binary64 rounding to alter floor.
export const zero16Scale=59575;
export function expandPackedZero16(code){return Math.floor((code*2147483648+29787)/59575);}
function readExpandedZero(owner,target,first){
 if(owner.packingBits!==16)return owner.bank.readInto(target,first);
 const bank=owner.bank;if(!(target instanceof Uint32Array)||target.length>65536||!Number.isSafeInteger(first)||first<0||first>bank.length-target.length||bank.segments.some(s=>s.buffer===target.buffer))throw fail('INVALID_INPUT','Invalid widened zero-target span.');
 let done=0;while(done<target.length){const at=first+done,k=Math.floor(at/bank.segmentElements),within=at%bank.segmentElements,count=Math.min(target.length-done,bank.segments[k].length-within),segment=bank.segments[k];for(let j=0;j<count;j++)target[done+j]=expandPackedZero16(segment[within+j]);done+=count;}return target;
}
export function brandPackedZero(token,owner,{source,budget,precision,summary,quality='precision'}={}){
 const bits=owner?.packingBits??32,Type=bits===16?Uint16Array:Uint32Array;
 if(!['precision','fast'].includes(quality)||quality==='precision'&&owner?.approximation!==undefined||quality==='fast'&&(owner?.approximation!=='fixed-newton-steps'||bits!==32))throw fail('INVALID_INPUT','Zero quality does not match its private endpoint contract.');
 if(zeros.has(token)||!owner||![16,32].includes(bits)||owner.bank?.Type!==Type||owner.bank?.byteLength!==(bits/8)*source?.width*source?.height||bits===16&&!['1e-2','1e-4'].includes(precision)||owner.micro!==0||owner.state!=='live'||owner.levelSource!==source||!source?.immutable||!budget||!Number.isFinite(owner.bound)||owner.bound<0||!['reference',...numeric].includes(precision))throw fail('INVALID_INPUT','Invalid private zero certificate.');
 zeros.set(token,{token,owner,source,width:source.width,height:source.height,budget,precision,quality,summary:structuredClone(summary),pins:0,retiring:false,deferred:null,onRetired:null});
}
export function deferPackedZeroRelease(token,release){const z=zeros.get(token);if(!z)return false;z.retiring=true;if(z.pins){z.deferred=release;return true;}return false;}
export function notePackedZeroRetired(token){const z=zeros.get(token);if(z){z.retiring=true;z.onRetired?.();}}
function compatible(z,source,budget,precision,quality='precision'){return !!z&&!z.retiring&&z.owner.state==='live'&&z.source===source&&source.width===z.width&&source.height===z.height&&z.budget===budget&&z.quality===quality&&(quality==='fast'?z.precision===precision:precision==='reference'?z.precision==='reference':z.precision!=='reference'&&z.owner.bound<Number(precision)*.45);}
export function borrowPackedZero(token,{source,budget,precision,quality='precision'}={}){
 const z=zeros.get(token);if(!compatible(z,source,budget,precision,quality))throw fail('INVALID_INPUT','Unbranded, retired or incompatible zero target.');
 z.pins++;let released=false;
 return Object.freeze({bound:z.owner.bound,summary:structuredClone(z.summary),
  readInto(target,first){if(released||z.owner.state!=='live')throw fail('DISPOSED','Zero borrow was released.');return readExpandedZero(z.owner,target,first);},
  release(){if(released)return;released=true;z.pins--;if(!z.pins&&z.deferred){const fn=z.deferred;z.deferred=null;fn();}}
 });
}
export function createZeroTargetStore(budget,{maximum=2}={}){
 const entries=new Set();let closed=false;
 function drop(z){if(z.pins)return false;z.retiring=true;z.token.release();if(z.owner.state==='retired')entries.delete(z);return true;}
 function reclaim(bytes=0){const before=budget.total();for(const z of [...entries]){if(budget.total()+bytes<=budget.limit)break;if(!z.pins)drop(z);}return before-budget.total();}
 const unregister=budget.registerReclaimer?.(reclaim,{owner:'sherloq7c-zero-cache',label:'certified-source-zero',allocationKind:'array-buffer'});
 function clear(){const errors=[];for(const z of [...entries])try{if(z.pins){z.retiring=true;z.token.release();}else drop(z);}catch(e){errors.push(e);}if(errors.length)throw new AggregateError(errors,'Zero cache retirement incomplete.');}
 return Object.freeze({
  keep(token,source,precision,quality='precision'){if(closed)throw fail('DISPOSED','Zero cache closed.');const z=zeros.get(token);if(!compatible(z,source,budget,precision,quality))return false;if(entries.has(z))return true;for(const old of [...entries])if(old.source===source&&old.precision===z.precision&&old.quality===z.quality&&!old.pins)drop(old);while(entries.size>=maximum){const old=[...entries].find(x=>!x.pins);if(!old)return false;drop(old);}z.onRetired=()=>entries.delete(z);entries.add(z);return true;},
  find(source,precision,quality='precision'){for(const z of [...entries].reverse())if(compatible(z,source,budget,precision,quality)){entries.delete(z);entries.add(z);return z.token;}return null;},
  summary(token){const z=zeros.get(token);if(!z||!entries.has(z)||z.retiring)throw fail('DISPOSED','Zero cache entry unavailable.');return structuredClone({...z.summary,maxErrorBound:z.quality==='fast'?null:z.owner.bound,zeroPackedCache:true,...(z.quality==='fast'?{quality:'fast',strictEndpointMaxErrorBound:z.owner.bound,guaranteedConvergenceFraction:false}:{})});},
  beforeNativeAdmission(plans){if(closed||!Array.isArray(plans)||!plans.length)return;const free=Math.max(0,budget.limit-budget.total()),candidates=[...entries].filter(z=>!z.pins&&!z.retiring&&z.owner.state==='live'),reclaimable=candidates.reduce((n,z)=>n+z.owner.bank.byteLength,0);const best=amount=>{const i=plans.findIndex(n=>Number.isFinite(n)&&n>=0&&n<=amount);return i<0?plans.length:i;};const current=best(free),desired=best(free+reclaimable);if(desired>=current)return;for(const z of candidates){if(best(Math.max(0,budget.limit-budget.total()))<=desired)break;drop(z);}},
  remove(token){const z=zeros.get(token);if(z&&entries.has(z)){if(z.pins){z.retiring=true;z.token.release();}else drop(z);}},
  clear,dispose(){clear();closed=true;unregister?.();},
  memory(){return{entries:entries.size,bytes:[...entries].reduce((n,z)=>n+(z.owner.bank?.byteLength??0),0),pinned:[...entries].reduce((n,z)=>n+z.pins,0)};}
 });
}
