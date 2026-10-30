import {d2prlInputSide} from './input-side.js';
import {retainD2prlCheckpoint} from './checkpoint.js';
import {requireValue,checkAbort,EngineError} from '../../src/errors.js';

/** The same five dedicated-union convolutions, four affine calls and DLF
 * sequence. Only intermediate tensor transport changes. The source-scoped
 * descriptor transport owns every paged actor before initialization; returned
 * ordinary1N output remains an independent reader-owned arena loan. */
export function createPagedUnionHead({inputSide,convolution,featureMath,neuralMath,dlf,budget,layers,batchnorm,dlfWeights,layouts,loadParameter,pagedTransport,operation=(_label,work)=>work()}){
 const SIDE=d2prlInputSide(inputSide),N=SIDE*SIDE;
 requireValue([1344,1792].includes(SIDE)&&budget?.limit<=2*1024**3&&layers?.length===5&&batchnorm?.length===4&&typeof loadParameter==='function'&&typeof pagedTransport?.outputFactory==='function'&&typeof pagedTransport?.value==='function','Explicit source-owned large-grid union transport required');
 let busy=false,checkpoint;const retirementFailures=[];
 const note=(primary,cleanup)=>{if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{primary.details={...primary.details,pagedUnionCleanup:cleanup};}catch{}};
 const ack=async work=>{const value=await work();if(value===0||value===false)throw value;};
 async function retire(state,owners){let failed=false,primary;for(const owner of owners)if(state.held.has(owner))try{await ack(()=>owner.release());state.held.delete(owner);state.retiring.delete(owner);}catch(error){retirementFailures.push({message:String(error?.message??error),code:error?.code??null});if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
 function clear(){const state=checkpoint;if(!state)return;if(state.retirement)return state.retirement;state.retiringCheckpoint=true;state.retirement=(async()=>{await retire(state,[...state.held]);if(checkpoint===state)checkpoint=null;})();void state.retirement.catch(()=>{state.retirement=null;});return state.retirement;}
 return{
  async run({offsets,coordinates},{signal,onStage,checkpointKey}={}){
   if(busy)throw new EngineError('BUSY','Paged union head busy');
   const arrays=[offsets?.zm?.x,offsets?.zm?.y,offsets?.cnn?.x,offsets?.cnn?.y,coordinates?.zm?.x,coordinates?.zm?.y,coordinates?.cnn?.x,coordinates?.cnn?.y];
   requireValue(arrays.every(a=>a instanceof Float32Array&&a.length===N),'Complete native PatchMatch outputs required');busy=true;
   let state,borrowedOwner,resultToReturn,failed=false,primary,retain=false;
   try{
    checkAbort(signal);
    if(checkpoint&&(checkpoint.retiringCheckpoint||checkpoint.key!==checkpointKey||checkpoint.offsets!==offsets||checkpoint.coordinates!==coordinates))await clear();
    state=checkpoint??{key:checkpointKey,offsets,coordinates,cursor:0,held:new Set(),retiring:new Set()};checkpoint=state;
    const keep=owner=>{if(owner)state.held.add(owner);requireValue(owner&&typeof owner.release==='function','Owned union result required');return owner;},drop=owner=>{if(owner&&state.held.has(owner))state.retiring.add(owner);};
    const step=async work=>{const index=position++;if(index<state.cursor)return;checkAbort(signal);state.pending??={index,staged:false};requireValue(state.pending.index===index,'Union transport cursor changed');if(!state.pending.staged){await work();state.pending.staged=true;}await retire(state,[...state.retiring]);checkAbort(signal);state.cursor=index+1;state.pending=null;};
    let position=0;
    const get=async(kind,spec)=>{const owner=keep(await operation('union-parameter:'+kind,()=>loadParameter(kind,spec,{signal})));requireValue(owner?.data instanceof Float32Array&&owner.byteLength===spec.bytes,'Owned original union parameter required');return owner;};
    await retire(state,[...state.retiring]);
    borrowedOwner=await operation('union-admission',()=>keep({release:budget.reserve(arrays.reduce((n,a)=>n+a.byteLength,0))}));
    await step(async()=>{state.current??=keep(pagedTransport.outputFactory([1,10,SIDE,SIDE],'float32'));await state.current.initialize({signal});for(const[index,offset]of[[0,0],[1,N],[2,5*N],[3,6*N]])await state.current.writeFlat(offset,arrays[index],{signal});});
    for(let i=0;i<3;i++)for(const kind of['zm','cnn'])await step(async()=>{
     const kernel=[7,9,11][i];state.kernelWeights??=await get('dlf',dlfWeights[kernel]);const c=coordinates[kind];
     state.dlfOutput??=keep(await dlf.run({x:c.x,y:c.y,weights:state.kernelWeights.data,kernel},{signal}));
     await state.current.writeFlat((kind==='zm'?2+i:7+i)*N,state.dlfOutput.scores,{signal});
     await onStage?.('dlf-'+kernel+'-'+kind,state.dlfOutput.scores);drop(state.dlfOutput);state.dlfOutput=null;
     if(kind==='cnn'){drop(state.kernelWeights);state.kernelWeights=null;}
    });
    await step(async()=>{await state.current.seal({signal});await onStage?.('union-input',pagedTransport.value(state.current));});
    for(let i=0;i<layers.length;i++){
     const layer=layers[i];
     await step(async()=>{
      state.weights??=await get('union',layer.weights);state.bias??=await get('union',layer.bias);
      const output=keep(await convolution.run({input:pagedTransport.value(state.current),weights:state.weights.data,bias:state.bias.data,channels:state.current.shape[1],height:SIDE,width:SIDE,outChannels:layer.weights.shape[0],kernel:layer.weights.shape[2],padding:layer.padding,referenceLayout:layouts.records.find(r=>r.name===layer.name),...(i<layers.length-1?{pagedOutputFactory:pagedTransport.outputFactory}:{})},{signal}));
      drop(state.weights);drop(state.bias);state.weights=state.bias=null;drop(state.current);state.current=output;
     });
     await step(()=>onStage?.(layer.name,pagedTransport.value(state.current)));
     if(i<batchnorm.length){const bn=batchnorm[i];await step(async()=>{
      state.params??=await get('union',bn.params);const output=keep(await featureMath.run('affine',{input:pagedTransport.value(state.current),channels:state.current.shape[1],height:SIDE,width:SIDE,params:state.params.data,epsilon:bn.epsilon},{signal}));
      requireValue(JSON.stringify(output.shape)===JSON.stringify(state.current.shape),'Original affine output shape changed');drop(state.params);state.params=null;drop(state.current);state.current=output;
     });await step(()=>onStage?.(layer.name+'-relu',pagedTransport.value(state.current)));}
    }
    // The final original convolution has one channel, so its complete output
    // is bounded by12.25MiB at1792. Keep the original full1N sigmoid call.
    requireValue(state.current.data instanceof Float32Array&&state.current.data.length===N,'Complete original final1N union required');
    state.result??=keep(await neuralMath.run('Sigmoid',[state.current],{},{signal}));await onStage?.('union-sigmoid',state.result.data);checkAbort(signal);
    const result=state.result;await retire(state,[...state.held].filter(owner=>owner!==result&&owner!==borrowedOwner));checkAbort(signal);resultToReturn=result;
   }catch(error){failed=true;primary=error;retain=retainD2prlCheckpoint(error,signal,checkpointKey);throw error;}
   finally{let cleanupFailed=false,cleanupPrimary;try{if(borrowedOwner){state.retiring.add(borrowedOwner);await retire(state,[borrowedOwner]);}}catch(error){cleanupFailed=true;cleanupPrimary=error;}
    if((!resultToReturn&&!retain)||cleanupFailed)try{await clear();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}}
    if(failed||cleanupFailed)busy=false;if(cleanupFailed){if(!failed)throw cleanupPrimary;note(primary,cleanupPrimary);}
   }
   try{checkAbort(signal);}catch(error){try{await clear();}catch(cleanup){note(error,cleanup);}busy=false;throw error;}
   // No await or callback after this independent result handoff.
   state.held.delete(resultToReturn);checkpoint=null;busy=false;return resultToReturn;
  },
  releaseCheckpoint(key){requireValue(!busy,'Paged union head busy');if(key===undefined||checkpoint?.key===key)return clear();},
  checkpointSnapshot(){return checkpoint?{nextStep:checkpoint.cursor,liveValues:checkpoint.held.size,retiring:checkpoint.retiring.size,stagedStep:checkpoint.pending?.staged??false,retiringCheckpoint:!!checkpoint.retiringCheckpoint,retirementFailures:[...retirementFailures]}:null;},
  dispose(){requireValue(!busy,'Paged union head busy');return clear();}
 };
}
