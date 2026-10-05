import {checkAbort} from './errors.js';
import {identifyPrnu} from './prnu.js';
import {segmentedPrnuResidual} from './segmented-prnu.js';
import {PrnuStripPool} from './prnu-strip-pool.js';
export async function segmentedPrnuIdentification(image,p,{budget,database,signal,onProgress,profile={},cache}={}){
 const pool=new PrnuStripPool(budget,{...profile,adaptive:image.prnuScheduling??=new Map()}),residualCached=!!cache;let residual=cache,done=false;
 try{
  const data=await identifyPrnu(null,database,image.sha256,{signal,admit:n=>budget.reserve(n),onProgress:fraction=>onProgress?.({phase:'prnu-matching',completed:fraction,total:1}),memo:async()=>residual??=(await segmentedPrnuResidual(image,{budget,signal,onProgress,pool}))});
  checkAbort(signal);done=true;return {data:{databaseId:p.databaseId,...data},prnuCache:residual,semantics:data.semantics,metrics:{...pool.metrics(),residualCached}};
 }finally{pool.clear();if(!done&&residual!==cache)await residual?.dispose();}
}
