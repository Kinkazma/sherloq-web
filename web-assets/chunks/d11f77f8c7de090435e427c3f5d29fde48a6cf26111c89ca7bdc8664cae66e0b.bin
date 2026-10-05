import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';
import {retainD2prlCheckpoint} from './checkpoint.js';
import {requireValue,checkAbort} from '../../src/errors.js';
function ownDescriptorBanks(zm,cnn){return{get zm(){return zm.data;},get cnn(){return cnn.data;},release(){zm.release();cnn.release();}};}
export function createDescriptors({arena:sharedArena,convolution,math,budget,loadConvolution,loadBatchNorm,operation=(_label,work)=>work()}){
 let busy=false,checkpoint;
 const clear=()=>{if(!checkpoint)return;const old=checkpoint;checkpoint=null;for(const value of old.held)value.release();old.banks?.release();if(!sharedArena)old.arena.dispose();};
 return{
  async run(rgb,{signal,onStage,checkpointKey}={}){
   requireValue(!busy,'Descriptors busy');requireValue(rgb instanceof Float32Array&&rgb.length===3*448*448,'Native-prepared RGB448 tensor required');if(signal?.aborted){clear();checkAbort(signal);}busy=true;
   if(checkpoint&&(checkpoint.key!==checkpointKey||checkpoint.rgb!==rgb))clear();
   const state=checkpoint??{key:checkpointKey,rgb,arena:sharedArena??createWasmTensorArena({budget}),held:new Set(),cursor:0,scale:{}};checkpoint=state;
   const keep=r=>(state.held.add(r),r),drop=r=>{if(r&&state.held.delete(r))r.release();};let position=0,retain=false;
   const step=async work=>{const index=position++;if(index<state.cursor)return;checkAbort(signal);await work();state.cursor=index+1;};
   const trace=(name,getData)=>step(async()=>{checkAbort(signal);await onStage?.(name,getData());checkAbort(signal);});
   const conv=async(name,input)=>{const spec=await operation('descriptor-parameter:'+name,()=>loadConvolution(name,{signal}));try{return keep(await convolution.run({...spec,input},{signal}));}finally{spec.release?.();}};
   const unary=async(op,input,args={})=>keep(await math.run(op,{input,...args},{signal}));
   try{
    state.banks??=await operation('descriptor-banks',()=>{const first=state.arena.allocate(Uint16Array,36*448*448,{signal,zero:false,label:'descriptors:zm'});let second;try{second=state.arena.allocate(Uint16Array,96*448*448,{signal,zero:false,label:'descriptors:cnn'});return ownDescriptorBanks(first,second);}catch(error){first.release();second?.release();throw error;}});
    for(const[scaleIndex,side]of[597,448,298].entries()){
     await step(async()=>{state.scale={};if(side!==448)state.scale.scaled=await unary('resize',rgb,{channels:3,height:448,width:448,outHeight:side,outWidth:side});});
     const s=state.scale,image=()=>s.scaled?.data??rgb;
     await trace(side+'-input',image);
     await step(async()=>{s.real=await conv(side+'-zm-real',image());});await step(async()=>{s.imag=await conv(side+'-zm-imag',image());});
     await trace(side+'-zm-real',()=>s.real.data);await trace(side+'-zm-imag',()=>s.imag.data);
     await step(async()=>{s.magnitude=await unary('magnitude',s.real.data,{imag:s.imag.data});drop(s.real);drop(s.imag);s.real=s.imag=null;});
     if(side!==448)await step(async()=>{const resized=await unary('resize',s.magnitude.data,{channels:12,height:side,width:side,outHeight:448,outWidth:448});drop(s.magnitude);s.magnitude=resized;});
     await trace(side+'-zm-float',()=>s.magnitude.data);
     await step(async()=>{const half=await unary('half',s.magnitude.data);state.banks.zm.set(half.data,scaleIndex*12*448*448);drop(s.magnitude);s.magnitude=null;drop(half);});
     await step(async()=>{s.value=await unary('reflect',image(),{channels:3,height:side,width:side,pad:7});drop(s.scaled);s.scaled=null;});
     await trace(side+'-cnn-input',()=>s.value.data);
     for(const index of[0,3,6,9,12]){
      await step(async()=>{const output=await conv(side+'-cnn-'+index,s.value.data);drop(s.value);s.value=output;});await trace(side+'-cnn-'+index,()=>s.value.data);
      if(index!==12){await step(async()=>{const params=await operation('descriptor-batchnorm:'+side+':'+index,()=>loadBatchNorm(side+'-cnn-'+index,{signal}));let affine;try{affine=await unary('affine',s.value.data,{channels:s.value.shape[1],height:s.value.shape[2],width:s.value.shape[3],...params});}finally{params.release?.();}drop(s.value);s.value=affine;});await trace(side+'-relu-'+index,()=>s.value.data);}
     }
     if(side!==448)await step(async()=>{const resized=await unary('resize',s.value.data,{channels:32,height:side,width:side,outHeight:448,outWidth:448});drop(s.value);s.value=resized;});
     await trace(side+'-cnn-float',()=>s.value.data);
     await step(async()=>{const half=await unary('half',s.value.data);state.banks.cnn.set(half.data,scaleIndex*32*448*448);drop(s.value);s.value=null;drop(half);});
    }
    const result=state.banks;state.banks=null;return result;
   }catch(error){retain=retainD2prlCheckpoint(error,signal,checkpointKey);throw error;}finally{if(!retain)clear();busy=false;}
  },
  releaseCheckpoint(key){requireValue(!busy,'Descriptors busy');if(key===undefined||checkpoint?.key===key)clear();},
  checkpointSnapshot(){return checkpoint?{nextStep:checkpoint.cursor,liveValues:checkpoint.held.size}:null;},
  dispose(){requireValue(!busy,'Descriptors busy');clear();}
 };
}
