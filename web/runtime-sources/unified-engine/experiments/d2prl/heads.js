// Experimental complete head composition. No native activation substitution.
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
import {retainD2prlCheckpoint} from './checkpoint.js';
export function createHeads({unionHead, unet, math, roles, budget, operation=(_label,work)=>work()}) {
 let busy=false,checkpoint;
 const clear=()=>{if(!checkpoint)return;const old=checkpoint;checkpoint=null;for(const name of ['dedicated','general','union','roles'])old[name]?.release();unet.releaseCheckpoint?.(old.key);unionHead.releaseCheckpoint?.(old.key);};
 return{
  async run({rgb,patchmatch},{signal,onStage,onUnetNode,onRoleProgress,checkpointKey}={}){
   if(busy)throw new EngineError('BUSY','D2PRL heads busy');requireValue(rgb instanceof Float32Array&&rgb.length===3*448**2,'Prepared RGB448 required');if(signal?.aborted){clear();checkAbort(signal);}busy=true;
   if(checkpoint&&(checkpoint.key!==checkpointKey||checkpoint.rgb!==rgb||checkpoint.patchmatch!==patchmatch))clear();
   const state=checkpoint??{key:checkpointKey,rgb,patchmatch};checkpoint=state;const transient=new Set();let borrowed,retain=false;
   const keep=value=>(transient.add(value),value),free=value=>{value.release();transient.delete(value);};
   try{
    borrowed=await operation('heads-admission',()=>budget.reserve(rgb.byteLength+8*448**2*4));
    if(!state.union){
     state.dedicated??=await unionHead.run(patchmatch,{signal,onStage,checkpointKey});
     state.general??=await unet.run(rgb,{signal,onNode:onUnetNode,checkpointKey});
     await onStage?.('unet-sigmoid',state.general.data);
     const product=keep(await math.run('Mul',[state.dedicated,state.general],{},{signal})),overlap=keep(await math.run('SumAll',[product],{referenceThreads:8},{signal}));free(product);
     const total=keep(await math.run('SumAll',[state.general],{referenceThreads:8},{signal}));
     const decision={overlap:overlap.data[0],threshold:Math.fround(total.data[0]*0.5)};decision.combineMaximum=decision.overlap>decision.threshold;free(overlap);free(total);
     const union=decision.combineMaximum?await math.run('Max',[state.dedicated,state.general],{},{signal}):state.dedicated;
     if(union!==state.dedicated)state.dedicated.release();state.dedicated=null;state.general.release();state.general=null;state.union=union;state.decision=decision;
    }
    await onStage?.('combined-union',state.union.data);
    state.roles??=await roles.run({rgb,coordinates:patchmatch.coordinates,union:state.union.data},{signal,onProgress:onRoleProgress});
    await onStage?.('target',state.roles.target);await onStage?.('source',state.roles.source);checkAbort(signal);
    const union=state.union,result=state.roles;state.union=null;state.roles=null;let released=false;
    return{get union(){return union.data;},target:result.target,source:result.source,decision:state.decision,roleRuntime:{heapCapacityBytes:result.heapBytes??null,ort:result.ort,parameterLoading:result.parameterLoading},release(){if(released)return;released=true;union.release();result.release();}};
   }catch(error){retain=retainD2prlCheckpoint(error,signal,checkpointKey);throw error;}
   finally{for(const value of transient)value.release();borrowed?.();if(!retain)clear();busy=false;}
  },
  releaseCheckpoint(key){requireValue(!busy,'D2PRL heads busy');if(key===undefined||checkpoint?.key===key)clear();},
  snapshot(){return checkpoint?{dedicated:!!checkpoint.dedicated,general:!!checkpoint.general,union:!!checkpoint.union,roles:!!checkpoint.roles,unet:unet.snapshot?.()}:null;},
  dispose(){requireValue(!busy,'D2PRL heads busy');clear();unet.dispose?.();unionHead.dispose?.();}
 };
}
