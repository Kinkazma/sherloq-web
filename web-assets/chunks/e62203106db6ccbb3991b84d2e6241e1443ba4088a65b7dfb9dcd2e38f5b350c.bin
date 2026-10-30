import {d2prlSpatialConfig} from './input-side.js';
import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';
import {retainD2prlCheckpoint} from './checkpoint.js';
import {requireValue,checkAbort} from '../../src/errors.js';
import {publishD2prlDescriptor} from './descriptor-ownership.js';
function ownDescriptorBanks(zm,cnn){
 let revocations=[],published=false,released=false;
 return{get zm(){return zm.data;},get cnn(){return cnn.data;},publish(){
  requireValue(!released,'Released descriptor banks');if(published)return;
  const revoke=publishD2prlDescriptor(zm.data);try{revocations=[revoke,publishD2prlDescriptor(cnn.data)];published=true;}catch(error){revoke();throw error;}
 },release(){if(released)return;released=true;for(const revoke of revocations)revoke();revocations=[];zm.release();cnn.release();}};
}
export function createDescriptors({arena:sharedArena,inputSide=448,convolution,math,budget,loadConvolution,loadBatchNorm,pagedTransport,operation=(_label,work)=>work()}){
 const spatial=d2prlSpatialConfig(inputSide),SIDE=spatial.inputSide,paged=!!pagedTransport;requireValue(!paged||(SIDE!==448&&typeof pagedTransport.createBanks==='function'&&typeof pagedTransport.value==='function'&&typeof pagedTransport.outputFactory==='function'),'Paged descriptors require explicit large-grid transport');let busy=false,checkpoint;const retirementFailures=[];const value=r=>paged?pagedTransport.value(r):r.data;const ack=async work=>{const v=await work();if(v===0||v===false)throw v;};
 const clear=()=>{if(!checkpoint)return;const old=checkpoint;if(!paged){checkpoint=null;for(const value of old.held)value.release();old.banks?.release();if(!sharedArena)old.arena.dispose();return;}if(old.retirement)return old.retirement;old.retiringCheckpoint=true;
  old.retirement=(async()=>{let failed=false,primary;for(const held of [...old.held])try{await ack(()=>held.release());old.held.delete(held);old.retiring.delete(held);}catch(error){retirementFailures.push({message:String(error?.message??error),code:error?.code??null});if(!failed){failed=true;primary=error;}}if(old.banks)try{await ack(()=>old.banks.release());old.banks=null;}catch(error){retirementFailures.push({message:String(error?.message??error),code:error?.code??null});if(!failed){failed=true;primary=error;}}if(failed)throw primary;if(checkpoint===old)checkpoint=null;})();void old.retirement.catch(()=>{old.retirement=null;});return old.retirement;};
 return{
  async run(rgb,{signal,onStage,checkpointKey}={}){
   requireValue(!busy,'Descriptors busy');requireValue(rgb instanceof Float32Array&&rgb.length===3*SIDE*SIDE,'Native-prepared RGB448 tensor required');if(signal?.aborted){if(paged)await clear();else clear();checkAbort(signal);}busy=true;
   if(checkpoint&&(paged&&checkpoint.retiringCheckpoint||checkpoint.key!==checkpointKey||checkpoint.rgb!==rgb)){if(paged)try{await clear();}catch(error){busy=false;throw error;}else clear();}
   const state=checkpoint??{key:checkpointKey,rgb,arena:paged?null:sharedArena??createWasmTensorArena({budget,maximumTensorBytes:SIDE===1792?2**32:2**31}),held:new Set(),retiring:new Set(),cursor:0,scale:{}};checkpoint=state;
   const keep=r=>(state.held.add(r),r),drop=r=>{if(paged){if(r&&state.held.has(r))state.retiring.add(r);}else if(r&&state.held.delete(r))r.release();};let position=0,retain=false,failed=false,primary;
   const step=async work=>{const index=position++;if(index<state.cursor)return;checkAbort(signal);if(!paged){await work();state.cursor=index+1;return;}state.pending??={index,staged:false};requireValue(state.pending.index===index,'Native descriptor transport cursor changed');if(!state.pending.staged){await work();state.pending.staged=true;}let cleanupFailed=false,cleanupPrimary;for(const held of [...state.retiring])try{await ack(()=>held.release());state.retiring.delete(held);state.held.delete(held);}catch(error){retirementFailures.push({message:String(error?.message??error),code:error?.code??null});if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}}if(cleanupFailed)throw cleanupPrimary;checkAbort(signal);state.cursor=index+1;state.pending=null;};
   const trace=(name,getData)=>step(async()=>{checkAbort(signal);await onStage?.(name,getData());checkAbort(signal);});
   const conv=async(name,input)=>{const spec=await operation('descriptor-parameter:'+name,()=>loadConvolution(name,{signal}));try{return keep(await convolution.run({...spec,input,...(paged?{pagedOutputFactory:pagedTransport.outputFactory}:{})},{signal}));}finally{spec.release?.();}};
   const unary=async(op,input,args={})=>keep(await math.run(op,{input,...args},{signal}));
   try{
    state.banks??=await operation('descriptor-banks',()=>{if(paged)return pagedTransport.createBanks(SIDE);const first=state.arena.allocate(Uint16Array,36*SIDE*SIDE,{signal,zero:false,label:'descriptors:zm'});let second;try{second=state.arena.allocate(Uint16Array,96*SIDE*SIDE,{signal,zero:false,label:'descriptors:cnn'});return ownDescriptorBanks(first,second);}catch(error){first.release();second?.release();throw error;}});if(paged)await state.banks.initialize({signal});
    for(const[scaleIndex,side]of spatial.featureSides.entries()){
     const name=[597,448,298][scaleIndex];
     await step(async()=>{state.scale={};if(side!==SIDE)state.scale.scaled=await unary('resize',rgb,{channels:3,height:SIDE,width:SIDE,outHeight:side,outWidth:side});});
     const s=state.scale,image=()=>s.scaled?value(s.scaled):rgb;
     await trace(side+'-input',image);
     await step(async()=>{s.real=await conv(name+'-zm-real',image());});await step(async()=>{s.imag=await conv(name+'-zm-imag',image());});
     await trace(side+'-zm-real',()=>value(s.real));await trace(side+'-zm-imag',()=>value(s.imag));
     await step(async()=>{s.magnitude=await unary('magnitude',value(s.real),{imag:value(s.imag)});drop(s.real);drop(s.imag);s.real=s.imag=null;});
     if(side!==SIDE)await step(async()=>{const resized=await unary('resize',value(s.magnitude),{channels:12,height:side,width:side,outHeight:SIDE,outWidth:SIDE});drop(s.magnitude);s.magnitude=resized;});
     await trace(side+'-zm-float',()=>value(s.magnitude));
     await step(async()=>{const half=await unary('half',value(s.magnitude));if(paged)await state.banks.copyScale('zm',scaleIndex,value(half),{signal});else state.banks.zm.set(value(half),scaleIndex*12*SIDE*SIDE);drop(s.magnitude);s.magnitude=null;drop(half);});
     await step(async()=>{s.value=await unary('reflect',image(),{channels:3,height:side,width:side,pad:7});drop(s.scaled);s.scaled=null;});
     await trace(side+'-cnn-input',()=>value(s.value));
     for(const index of[0,3,6,9,12]){
      await step(async()=>{const output=await conv(name+'-cnn-'+index,value(s.value));drop(s.value);s.value=output;});await trace(side+'-cnn-'+index,()=>value(s.value));
      if(index!==12){await step(async()=>{const params=await operation('descriptor-batchnorm:'+side+':'+index,()=>loadBatchNorm(name+'-cnn-'+index,{signal}));let affine;try{affine=await unary('affine',value(s.value),{channels:s.value.shape[1],height:s.value.shape[2],width:s.value.shape[3],...params});}finally{params.release?.();}drop(s.value);s.value=affine;});await trace(side+'-relu-'+index,()=>value(s.value));}
     }
     if(side!==SIDE)await step(async()=>{const resized=await unary('resize',value(s.value),{channels:32,height:side,width:side,outHeight:SIDE,outWidth:SIDE});drop(s.value);s.value=resized;});
     await trace(side+'-cnn-float',()=>value(s.value));
     await step(async()=>{const half=await unary('half',value(s.value));if(paged)await state.banks.copyScale('cnn',scaleIndex,value(half),{signal});else state.banks.cnn.set(value(half),scaleIndex*32*SIDE*SIDE);drop(s.value);s.value=null;drop(half);});
    }
    if(paged)await state.banks.publish({signal});else state.banks.publish();const result=state.banks;state.banks=null;return result;
   }catch(error){failed=true;primary=error;retain=retainD2prlCheckpoint(error,signal,checkpointKey);throw error;}finally{try{if(!retain){if(paged)try{await clear();}catch(error){if(!failed)throw error;retirementFailures.push({message:String(error?.message??error),code:error?.code??null});}else clear();}}finally{busy=false;}}
  },
  releaseCheckpoint(key){requireValue(!busy,'Descriptors busy');if(key===undefined||checkpoint?.key===key)return clear();},
  checkpointSnapshot(){return checkpoint?{nextStep:checkpoint.cursor,liveValues:checkpoint.held.size,retiring:checkpoint.retiring?.size??0,stagedStep:checkpoint.pending?.staged??false,retiringCheckpoint:!!checkpoint.retiringCheckpoint,retirementFailures:[...retirementFailures]}:null;},
  dispose(){requireValue(!busy,'Descriptors busy');return clear();}
 };
}
