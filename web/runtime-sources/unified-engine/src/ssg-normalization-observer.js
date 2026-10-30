import "../../runtime-context.js?v=0.30.0";
// Private development observer only. Metadata is bounded/prepaid; no pixels,
// coefficients, hash pass, source read, Worker, timer or computation is created.
const attached=new WeakMap();
export function attachSsgNormalizationObservation(source,observer){if(observer)attached.set(source,observer);}
export const ssgNormalizationObservation=source=>attached.get(source);
export function createSsgNormalizationObserver({maximumRows=64,maximumSources=8,now=()=>performance.now()}={}){
 const charge=131072,rows=[],sources=[],active=new Set();let budget,free,closed=false,closing,omitted=0,declined=0;
 const snapshot=()=>({scope:'private passive normalization metadata',chargeBytes:free?charge:0,omitted,declined,sources:structuredClone(sources),rows:structuredClone(rows)});
 return{
  openSource(description,b){
   try{
    if(closed||sources.length>=maximumSources){declined++;return null;}
    if(!free){if(!b||!Number.isSafeInteger(b.limit)||typeof b.total!=='function'||b.limit-b.total()<charge){declined++;return null;}free=b.reserve(charge);budget=b;}
    if(b!==budget){declined++;return null;}
    const value=description(),id=sources.length;sources.push({id,...value,budgetLimitBytes:budget.limit});
    return{id,
     begin(context,consumer='unlabeled',kind='fresh-normalization'){
      if(closed||rows.length+active.size>=maximumRows){omitted++;return null;}
      const started=now(),row={sourceId:id,contextIndex:context.index,bounds:[...context.bounds],width:context.width,height:context.height,consumer,kind,budgetBeginBytes:budget.total(),budgetLimitBytes:budget.limit,sourceWindowCount:0,sourceWindowBytes:0,allocationMs:0,sourceWindowMs:0,sourceReadAwaitMs:0,interpolationMs:0,cooperationMs:0,retirementMs:0};let finish,done=false;const handle={row,ended:new Promise(r=>finish=r),finish(fields){if(done)return;done=true;try{Object.assign(row,fields,{totalMs:now()-started,budgetEndBytes:budget.total()});rows.push(row);}catch{omitted++;}finally{active.delete(handle);finish();}}};active.add(handle);return handle;
     }
    };
   }catch{declined++;return null;}
  },
  snapshot,
  dispose(){if(closing)return closing;closed=true;const task=(async()=>{await Promise.all([...active].map(x=>x.ended));await free?.();free=null;rows.length=0;sources.length=0;})();closing=task;void task.finally(()=>{if(free&&closing===task)closing=null;}).catch(()=>{});return task;}
 };
}
