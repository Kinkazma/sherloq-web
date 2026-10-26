import {retainD2prlCheckpoint} from './checkpoint.js';
import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';
// Private composed DLF + dedicated union head. Inputs are actual PatchMatch
// outputs. Only checkpoint parameters are loaded; no expected activation input.
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
const SIDE = 448, N = SIDE * SIDE;
export function createUnionHead({arena:sharedArena,dlf, convolution, featureMath, neuralMath, budget, layers, batchnorm, dlfWeights, layouts, loadParameter, ownedParameters=false, operation=(_label,work)=>work()}) {
  requireValue(budget && layers?.length === 5 && batchnorm?.length === 4 && typeof loadParameter === 'function', 'Union model dependencies');
  let busy=false,checkpoint;
  const clear=()=>{if(!checkpoint)return;const old=checkpoint;checkpoint=null;old.current?.release();old.pending?.release();old.result?.release();for(const value of old.held)value.release();if(!sharedArena)old.arena.dispose();};
  const parameter = async (kind, spec, signal) => {
    if(ownedParameters){let value;try{value=await loadParameter(kind,spec,{signal});checkAbort(signal);requireValue(value?.data instanceof Float32Array&&value.byteLength===spec.bytes&&typeof value.release==='function','Owned union parameter');return value;}catch(error){value?.release();throw error;}}
    const staging = budget.reserve(4 * spec.bytes),release=staging.split(spec.bytes);
    try {
      const data = await loadParameter(kind, spec, {signal}); checkAbort(signal);
      requireValue(data instanceof Float32Array && data.byteLength === spec.bytes, 'Union parameter');
      return {data,release};
    }catch(error){release();throw error;}finally{staging?.();}
  };
  return {
    async run({offsets,coordinates},{signal,onStage,checkpointKey}={}){
      if(busy)throw new EngineError('BUSY','Union head busy');
      const arrays=[offsets?.zm?.x,offsets?.zm?.y,offsets?.cnn?.x,offsets?.cnn?.y,coordinates?.zm?.x,coordinates?.zm?.y,coordinates?.cnn?.x,coordinates?.cnn?.y];
      requireValue(arrays.every(a=>a instanceof Float32Array&&a.length===N),'PatchMatch448 outputs required');if(signal?.aborted){clear();checkAbort(signal);}busy=true;
      if(checkpoint&&(checkpoint.key!==checkpointKey||checkpoint.offsets!==offsets||checkpoint.coordinates!==coordinates))clear();
      const state=checkpoint??{key:checkpointKey,offsets,coordinates,arena:sharedArena??createWasmTensorArena({budget}),cursor:0,held:new Set()};checkpoint=state;let borrowed,retain=false,position=0;
      const step=async work=>{const index=position++;if(index<state.cursor)return;checkAbort(signal);await work();state.cursor=index+1;};
      const get=async(kind,spec)=>{const value=await operation('union-parameter:'+kind,()=>parameter(kind,spec,signal));state.held.add(value);return value;};
      const free=value=>{value.release();state.held.delete(value);};
      try{
        borrowed=await operation('union-admission',()=>budget.reserve(arrays.reduce((n,a)=>n+a.byteLength,0)));
        await step(async()=>{state.current=await operation('union-input',()=>{const result=state.arena.allocate(Float32Array,10*N,{signal,zero:false,label:'union-input'});result.shape=[1,10,SIDE,SIDE];return result;});state.current.data.set(arrays[0],0);state.current.data.set(arrays[1],N);state.current.data.set(arrays[2],5*N);state.current.data.set(arrays[3],6*N);});
        for(let i=0;i<3;i++)for(const kind of['zm','cnn'])await step(async()=>{
          const kernel=[7,9,11][i];state.kernelWeights??=await get('dlf',dlfWeights[kernel]);const c=coordinates[kind];
          const values=await dlf.run({x:c.x,y:c.y,weights:state.kernelWeights.data,kernel},{signal});
          try{state.current.data.set(values.scores,(kind==='zm'?2+i:7+i)*N);await onStage?.('dlf-'+kernel+'-'+kind,values.scores);}finally{values.release();}
          if(kind==='cnn'){free(state.kernelWeights);state.kernelWeights=null;}
        });
        await step(()=>onStage?.('union-input',state.current.data));
        for(let i=0;i<layers.length;i++){
          const layer=layers[i];
          await step(async()=>{
            state.weights??=await get('union',layer.weights);state.bias??=await get('union',layer.bias);
            const output=await convolution.run({input:state.current.data,weights:state.weights.data,bias:state.bias.data,channels:state.current.shape[1],height:SIDE,width:SIDE,outChannels:layer.weights.shape[0],kernel:layer.weights.shape[2],padding:layer.padding,referenceLayout:layouts.records.find(r=>r.name===layer.name)},{signal});
            free(state.weights);free(state.bias);state.weights=state.bias=null;state.current.release();state.current=output;
          });
          await step(()=>onStage?.(layer.name,state.current.data));
          if(i<batchnorm.length){const bn=batchnorm[i];await step(async()=>{
            state.params??=await get('union',bn.params);const output=await featureMath.run('affine',{input:state.current.data,channels:state.current.shape[1],height:SIDE,width:SIDE,params:state.params.data,epsilon:bn.epsilon},{signal});output.shape=state.current.shape;free(state.params);state.params=null;state.current.release();state.current=output;
          });await step(()=>onStage?.(layer.name+'-relu',state.current.data));}
        }
        state.result??=await neuralMath.run('Sigmoid',[state.current],{},{signal});await onStage?.('union-sigmoid',state.result.data);checkAbort(signal);const result=state.result;state.result=null;return result;
      }catch(error){retain=retainD2prlCheckpoint(error,signal,checkpointKey);throw error;}finally{borrowed?.();if(!retain)clear();busy=false;}
    },
    releaseCheckpoint(key){requireValue(!busy,'Union head busy');if(key===undefined||checkpoint?.key===key)clear();},
    checkpointSnapshot(){return checkpoint?{nextStep:checkpoint.cursor}:null;},
    dispose(){requireValue(!busy,'Union head busy');clear();}
  };
}
