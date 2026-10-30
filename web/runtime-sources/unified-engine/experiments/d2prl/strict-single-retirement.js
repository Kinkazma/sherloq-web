import{requireValue,checkAbort}from'../../src/errors.js';
import{preserveConvolutionPrimary}from'./convolution-retirement.js';
// Qualified model callers adopt this owner before any descriptor borrow.
// Without a retirement parent, legacy borrowers keep their old release policy.
export function createStrictSingleRetirement({budget,engine,result,mask,features,complete}={}){
 const life=new AbortController(),releasedFeatures=new Set(),errors=[];let adopted=false,fee,retired=false,closing,engineDone=false,outputDone=false,maskDone=false,dropOutput=false,admitted=false,active=false,idle=Promise.resolve(),finishActive;
 const remember=e=>{if(errors.length<64&&!errors.some(x=>Object.is(x,e)))errors.push(e);};
 const owner={
  get signal(){return life.signal;},get retired(){return retired;},get retirementErrors(){return[...errors];},
  admit({parentAdopted=false}={}){checkAbort(life.signal);requireValue(!admitted,'One wrapper admission');admitted=true;adopted=parentAdopted;active=true;idle=new Promise(resolve=>finishActive=resolve);if(adopted)fee=budget.reserve(2048);checkAbort(life.signal);},
  seal(){if(active){active=false;finishActive();}},
  dispose(){
   if(retired)return Promise.resolve();if(closing)return closing;life.abort();
   const task=(async()=>{
    // Empty pre-adoption disposal must not depend on admit/seal: the parent
    // can await this ACK before returning its adoption callback. Once admit
    // opens the job, seal covers every outstanding bank/factory/run await.
    await idle;
    dropOutput||=!complete();const failures=[];
    const settle=async actions=>{const rows=await Promise.allSettled(actions.map(action=>Promise.resolve().then(action)));for(const row of rows)if(row.status==='rejected'){failures.push(row.reason);remember(row.reason);}};
    const actions=[];let outputAttempted=false;
    if(dropOutput&&!outputDone){outputAttempted=true;actions.push(async()=>{await result()?.release();outputDone=true;});}
    if(!engineDone)actions.push(async()=>{await engine()?.dispose();engineDone=true;});
    await settle(actions);
    if(!engineDone){dropOutput=true;if(!outputDone&&!outputAttempted)await settle([async()=>{await result()?.release();outputDone=true;}]);}
    // An adopted parent retains RAM loans until the actor can no longer read.
    // The legacy no-parent path keeps its prior borrower release contract.
    if(engineDone||!adopted){
     const borrowers=[];if(!maskDone)borrowers.push(async()=>{await mask()?.release();maskDone=true;});
     for(const value of features())if(!releasedFeatures.has(value))borrowers.push(async()=>{await value.release();releasedFeatures.add(value);});
     await settle(borrowers);
    }
    if(failures.length){for(const secondary of failures.slice(1))preserveConvolutionPrimary(failures[0],secondary);throw failures[0];}
    requireValue(engineDone&&(!dropOutput||outputDone)&&maskDone&&features().every(x=>releasedFeatures.has(x)),'Wrapper retirement ACK incomplete');
    try{await fee?.();fee=null;}catch(error){remember(error);throw error;}retired=true;
   })();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;
  }
 };return owner;
}
