import "../../runtime-context.js?v=0.30.0";
import {allocateTypedArray} from './allocation.js';
import {EngineError,checkAbort} from './errors.js';
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {WaveletStripPool,appendWaveletCleanup} from './wavelet-strip-pool.js';

// An optional bounded memo of the authoritative immutable pixel predicate.
// Values are 0=unseen,1=false,2=true. No row/polygon approximation is used.
export async function createSsgMembershipMemo(domain,{budget,origin=[0,0],width,height,maxBytes=4*1024**2,signal}={}){
 checkAbort(signal);
 if(!domain||!Object.isFrozen(domain)||!domain.descriptor||typeof domain.containsOriginal!=='function')return null;
 if(![width,height,...origin].every(Number.isSafeInteger)||width<1||height<1)return null;
 let canonical;try{canonical=await compileOriginalSourceRegions(domain.descriptor);}catch{return null;}
 checkAbort(signal);
 if(canonical!==domain)return null;
 const x0=Math.max(0,origin[0]),y0=Math.max(0,origin[1]),x1=Math.min(domain.sourceWidth,origin[0]+width),y1=Math.min(domain.sourceHeight,origin[1]+height),w=x1-x0,h=y1-y0,bytes=w*h;
 if(![x0,y0,x1,y1,w,h,bytes,maxBytes].every(Number.isSafeInteger)||w<1||h<1||bytes>maxBytes)return null;
 const charge=bytes+4096,available=budget?.limit-budget?.retained-budget?.active-(budget?.cacheBytes??0);
 if(!Number.isSafeInteger(available)||available<charge||typeof budget.registerBacking!=='function'||typeof budget.registerReclaimer!=='function')return null;
 const contains=domain.containsOriginal,pool=new WaveletStripPool(budget,{workerFactory:null,resourceOwner:'ssg'});
 let data,credit,backing,unregister,pending,requested=false,retired=false,hits=0,misses=0;
 const thenable=value=>value&&typeof value.then==='function';
 function advance(){
  if(pending)return pending;
  if(retired)return;
  const next=(run,accept)=>{const result=run();if(thenable(result)){const work=Promise.resolve(result).then(()=>{accept();pending=null;return advance();});pending=work;void work.catch(()=>{if(pending===work)pending=null;});return work;}accept();return advance();};
  if(backing)return next(backing,()=>{backing=null;data=null;});
  if(unregister)return next(unregister,()=>{unregister=null;});
  if(credit)return next(credit,()=>{credit=null;});
  data=null;retired=true;
 }
 // The existing transform registry keeps failed creation/retirement reachable
 // until ACK, including when no localizer could be returned to its caller.
 const owner=pool.ownCleanup(()=>{requested=true;return advance();});
 function releaseIdle(){requested=true;let result,failed=false,primary;try{result=advance();}catch(error){failed=true;primary=error;}finally{void owner.retire().catch(()=>{});}if(failed)throw primary;if(thenable(result)||!retired)throw new EngineError('BUSY','SSG membership memo awaits retirement acknowledgement.');}
 try{credit=budget.reserve(charge);checkAbort(signal);data=allocateTypedArray(Uint8Array,bytes,{label:'bounded exact SSG membership memo'});backing=budget.registerBacking('array-buffer',bytes,{owner:'ssg-membership',label:'exact immutable pixel predicate memo',identity:data.buffer});unregister=budget.registerReclaimer(()=>{const before=budget.total();releaseIdle();return before-budget.total();},{owner:'ssg-membership',allocationKind:'array-buffer'});checkAbort(signal);}
 catch(primary){let acknowledged=true;try{await owner.retire();}catch(error){acknowledged=false;appendWaveletCleanup(primary,error);}if(acknowledged&&primary instanceof EngineError&&['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(primary.code))return null;throw primary;}
 return{
  contains(x,y){if(requested||!data||!Number.isInteger(x)||!Number.isInteger(y)||x<x0||y<y0||x>=x1||y>=y1)return contains.call(domain,x,y);const at=(y-y0)*w+x-x0,prior=data[at];if(prior){hits++;return prior===2;}const value=contains.call(domain,x,y);misses++;data[at]=value?2:1;return value;},
  release(){requested=true;return owner.retire();},
  releaseIdle,
  get stats(){return{bytes,hits,misses,requested,retired};}
 };
}
