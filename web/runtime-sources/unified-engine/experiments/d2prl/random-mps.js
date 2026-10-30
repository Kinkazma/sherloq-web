// PyTorch 2.8 MPS torch.rand(float32), independent scalar implementation.
// Each nonempty tensor advances the host Philox stream by ONE four-word block,
// then uses that block as the initial counter of a second Philox4x32-10 stream.
// The inner stream emits four adjacent values per counter, using its low23 bits.
// No captured tensors, model inputs, filesystem access or native-result lookup.
// Sources: PyTorch v2.8.0 MPSGeneratorImpl.mm / mps/operations/Distributions.mm;
// ATen/core/PhiloxRNGEngine.h; TensorFlow v2.20 random_distributions_utils.h.
// Apple WWDC22 "Accelerate machine learning with Metal" identifies the MPSGraph
// generator as Philox compatible with TensorFlow. Qualification is separate.
import {requireValue,checkAbort,controlCheckpoint,normalizeResourceError} from '../../src/errors.js';

export const MPS_RANDOM_ALGORITHM='pytorch-2.8-mps-philox4x32-10-float32/v1';
const INV23=2**-23,MASK23=0x7fffff;
const validWord=x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff;
function uint64(value,label){
 requireValue(typeof value==='bigint'||typeof value==='string'&&/^\d+$/.test(value)||Number.isSafeInteger(value),label+' must be an unsigned64 integer');
 const number=BigInt(value);requireValue(number>=0n&&number<=0xffffffffffffffffn,label+' exceeds unsigned64');return number;
}

// The 16-bit products and their carry sums fit exactly in JS's integer range.
// Math.imul supplies the low word; these splits preserve the complete high word.
function highSA(x){const lo=x&65535,hi=x>>>16;return (53841*hi+Math.floor((((8019*lo)>>>16)+53841*lo+8019*hi)/65536))>>>0;}
function highSB(x){const lo=x&65535,hi=x>>>16;return (52638*hi+Math.floor((((36183*lo)>>>16)+52638*lo+36183*hi)/65536))>>>0;}
function block(a,b,c,d,k0,k1,out){
 for(let round=0;round<10;round++){
  const x=(highSB(c)^b^k0)>>>0,y=Math.imul(0xcd9e8d57,c)>>>0;
  const z=(highSA(a)^d^k1)>>>0,w=Math.imul(0xd2511f53,a)>>>0;
  a=x;b=y;c=z;d=w;k0=(k0+0x9e3779b9)>>>0;k1=(k1+0xbb67ae85)>>>0;
 }
 out[0]=a;out[1]=b;out[2]=c;out[3]=d;return out;
}

// One host block per nonempty tensor, shared by values() and a source ticket.
function advanceTensor(generator){
 const outer=new Uint32Array(4);block(generator.offsetLo,generator.offsetHi,0,0,generator.seedLo,generator.seedHi,outer);
 generator.state.set(outer,1);generator.offsetLo=(generator.offsetLo+1)>>>0;if(generator.offsetLo===0)generator.offsetHi=(generator.offsetHi+1)>>>0;return outer;
}
async function fillInner(counter,key,output,signal){
 const inner=new Uint32Array(4);let [a,b,c,d]=counter,stamp=performance.now();
 for(let i=0;i<output.length;i+=4){
  block(a,b,c,d,key[0],key[1],inner);
  output[i]=(inner[0]&MASK23)*INV23;
  if(i+1<output.length)output[i+1]=(inner[1]&MASK23)*INV23;
  if(i+2<output.length)output[i+2]=(inner[2]&MASK23)*INV23;
  if(i+3<output.length)output[i+3]=(inner[3]&MASK23)*INV23;
  a=(a+1)>>>0;if(a===0){b=(b+1)>>>0;if(b===0){c=(c+1)>>>0;if(c===0)d=(d+1)>>>0;}}
  if((i&8191)===0){checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}
 }
 checkAbort(signal);return output;
}

// Detached error replay of an already reserved source. This never reads or
// advances a live generator and reuses the same scalar fillInner primitive.
export async function fillNativeMpsSource({counter,key,output},{signal}={}){
 requireValue(counter?.length===4&&key?.length===2&&Array.from(counter).every(validWord)&&Array.from(key).every(validWord)&&output instanceof Float32Array&&output.length<=2**28,'Exact detached MPS source replay');checkAbort(signal);return fillInner(Array.from(counter),Array.from(key),output,signal);
}

/** Mathematical Philox primitive, exported for independent integer validation. */
export function philox4x32_10(counter,key,output=new Uint32Array(4)){
 requireValue(counter?.length===4&&key?.length===2&&Array.from(counter).every(validWord)&&Array.from(key).every(validWord)&&output instanceof Uint32Array&&output.length===4,'Invalid Philox block');
 return block(counter[0],counter[1],counter[2],counter[3],key[0],key[1],output);
}

/** Matching successful torch.rand tensor calls, not a continuous word cursor.
 * A call's count is its flattened float32 length; shape does not change its
 * stream. Empty tensors do not advance state. Cancellation restores the local
 * cursor so the browser's existing retry/checkpoint contract remains atomic.
 */
export class NativeMpsRandom{
 constructor(options={}){
  requireValue(options&&typeof options==='object'&&Object.keys(options).every(key=>key==='seed'||key==='stateBytes'||key==='fill'),'MPS RNG requires an explicit seed or native MPS state; a CPU MT state is not interchangeable');
  const {seed=22,stateBytes,fill}=options;
  requireValue(fill===undefined||fill&&typeof fill.fill==='function'&&typeof fill.dispose==='function','Optional MPS random fill backend requires fill/dispose');
  // The optional backend owns only inner block generation. Host state, empty
  // calls, snapshots and rollback remain here. Ownership transfers to this RNG.
  this.fillBackend=fill;this.busy=false;this.disposed=false;
  if(stateBytes!==undefined)this.restoreStateBytes(stateBytes);
  else this.manualSeed(seed);
 }
 live(){requireValue(!this.disposed,'MPS random generator disposed');}
 manualSeed(seed=22){
  this.live();requireValue(!this.busy,'MPS random generator busy');const number=uint64(seed,'Seed');
  this.seedLo=Number(number&0xffffffffn);this.seedHi=Number(number>>32n);this.offsetLo=0;this.offsetHi=0;
  this.state=Uint32Array.of(1,1,1,1,1,this.seedLo,this.seedHi);return this;
 }
 snapshot(){
  this.live();return {algorithm:MPS_RANDOM_ALGORITHM,seedLo:this.seedLo,seedHi:this.seedHi,offsetLo:this.offsetLo,offsetHi:this.offsetHi,state:Array.from(this.state)};
 }
 restore(saved){
  this.live();requireValue(!this.busy&&saved?.algorithm===MPS_RANDOM_ALGORITHM&&[saved.seedLo,saved.seedHi,saved.offsetLo,saved.offsetHi].every(validWord)&&saved.state?.length===7&&Array.from(saved.state).every(validWord),'Invalid MPS random snapshot');
  requireValue(saved.state[0]===1&&saved.state[5]===saved.seedLo&&saved.state[6]===saved.seedHi,'MPS random snapshot key mismatch');
  this.seedLo=saved.seedLo;this.seedHi=saved.seedHi;this.offsetLo=saved.offsetLo;this.offsetHi=saved.offsetHi;this.state=Uint32Array.from(saved.state);return this;
 }
 stateBytes(){
  const saved=this.snapshot(),bytes=new Uint8Array(44),view=new DataView(bytes.buffer);
  saved.state.forEach((value,index)=>view.setUint32(index*4,value,true));
  view.setUint32(28,saved.seedLo,true);view.setUint32(32,saved.seedHi,true);view.setUint32(36,saved.offsetLo,true);view.setUint32(40,saved.offsetHi,true);return bytes;
 }
 restoreStateBytes(bytes){
  this.live();requireValue(!this.busy&&(Array.isArray(bytes)||bytes instanceof Uint8Array)&&bytes.length===44&&Array.from(bytes).every(v=>Number.isInteger(v)&&v>=0&&v<=255),'Invalid native MPS state bytes');
  const copy=Uint8Array.from(bytes),view=new DataView(copy.buffer),state=Array.from({length:7},(_,i)=>view.getUint32(i*4,true));
  return this.restore({algorithm:MPS_RANDOM_ALGORITHM,state,seedLo:view.getUint32(28,true),seedHi:view.getUint32(32,true),offsetLo:view.getUint32(36,true),offsetHi:view.getUint32(40,true)});
 }
 /** Private prototype: reserves exactly one nonempty tensor call. The caller
  * must commit or roll back in finally. No noise array is allocated or exposed.
  * A failed fused transport may fill a preadmitted CPU output from the SAME
  * ticket without drawing again. Counter/key are immutable snapshots.
  */
 reserveSource(count,{signal,account=()=>{}}={}){
  this.live();requireValue(!this.busy&&Number.isSafeInteger(count)&&count>0&&count<=2**28,'Invalid nonempty MPS source tensor');checkAbort(signal);account(512);
  const saved=this.snapshot();this.busy=true;let active=true,filling=false;const generator=this;
  try{
   const counter=Object.freeze(Array.from(advanceTensor(this))),key=Object.freeze([this.seedLo,this.seedHi]);
   const close=commit=>{requireValue(!filling,'MPS source fill busy');if(!active)return;if(!commit){generator.busy=false;generator.restore(saved);}active=false;generator.busy=false;};
   return Object.freeze({algorithm:MPS_RANDOM_ALGORITHM,count,counter,key,get active(){return active;},
    async fill(output,{signal:fillSignal=signal}={}){
     requireValue(active&&!filling&&output instanceof Float32Array&&output.length===count,'Invalid active MPS source output');checkAbort(fillSignal);filling=true;
     try{if(generator.fillBackend)await generator.fillBackend.fill({counter:Uint32Array.from(counter),key:Uint32Array.from(key),output},{signal:fillSignal});else await fillInner(counter,key,output,fillSignal);checkAbort(fillSignal);return output;}finally{filling=false;}
    },commit(){close(true);},rollback(){close(false);}
   });
  }catch(error){this.busy=false;this.restore(saved);throw error;}
 }
 /** Two consecutive native tensor calls, reserved and retired atomically.
  * Inner values remain random-access by their original native pixel index.
  */
 reserveSourcePair(count,{signal,account=()=>{}}={}){
  this.live();requireValue(!this.busy&&Number.isSafeInteger(count)&&count>0&&count<=2**28,'Invalid nonempty MPS tensor pair');checkAbort(signal);account(1024);
  const saved=this.snapshot();this.busy=true;let active=true,filling=false;const generator=this;
  try{
   const counters=Object.freeze([Object.freeze(Array.from(advanceTensor(this))),Object.freeze(Array.from(advanceTensor(this)))]),key=Object.freeze([this.seedLo,this.seedHi]);
   const close=commit=>{requireValue(!filling,'MPS tensor pair fill busy');if(!active)return;if(!commit){generator.busy=false;generator.restore(saved);}active=false;generator.busy=false;};
   return Object.freeze({algorithm:MPS_RANDOM_ALGORITHM,kind:'native-tensor-pair',count,counters,key,get active(){return active;},
    async fill(outputs,{signal:fillSignal=signal}={}){
     requireValue(active&&!filling&&Array.isArray(outputs)&&outputs.length===2&&outputs.every(output=>output instanceof Float32Array&&output.length===count),'Invalid active MPS pair outputs');
     const[a,b]=outputs,targets=[a,b];requireValue(a.buffer!==b.buffer||a.byteOffset+a.byteLength<=b.byteOffset||b.byteOffset+b.byteLength<=a.byteOffset,'MPS tensor pair outputs overlap');checkAbort(fillSignal);filling=true;
     try{for(let axis=0;axis<2;axis++){if(generator.fillBackend)await generator.fillBackend.fill({counter:Uint32Array.from(counters[axis]),key:Uint32Array.from(key),output:targets[axis]},{signal:fillSignal});else await fillInner(counters[axis],key,targets[axis],fillSignal);}checkAbort(fillSignal);return outputs;}finally{filling=false;}
    },commit(){close(true);},rollback(){close(false);}
   });
  }catch(error){this.busy=false;this.restore(saved);throw error;}
 }
 /** An iteration consumes its ordered native tensor calls exactly once. No
  * sub-ticket can commit independently or lock the other branch. GPU consumers
  * use immutable source metadata; CPU replay fills the same source on error.
  */
 reserveSources(counts,{signal,account=()=>{}}={}){
  this.live();requireValue(!this.busy&&Array.isArray(counts)&&counts.length>=1&&counts.length<=6&&counts.every(count=>Number.isSafeInteger(count)&&count>0&&count<=2**28),'Invalid ordered MPS source schedule');checkAbort(signal);account(512*(counts.length+1));
  const saved=this.snapshot();this.busy=true;let active=true,filling=false;const generator=this;
  try{
   const lengths=Object.freeze([...counts]),sources=Object.freeze(lengths.map(count=>Object.freeze({count,counter:Object.freeze(Array.from(advanceTensor(this)))}))),key=Object.freeze([this.seedLo,this.seedHi]);
   const close=commit=>{requireValue(!filling,'MPS source schedule fill busy');if(!active)return;if(!commit){generator.busy=false;generator.restore(saved);}active=false;generator.busy=false;};
   return Object.freeze({algorithm:MPS_RANDOM_ALGORITHM,kind:'native-source-schedule',sources,key,get active(){return active;},
    async fillSource(index,output,{signal:fillSignal=signal}={}){
     requireValue(active&&!filling&&Number.isInteger(index)&&index>=0&&index<sources.length&&output instanceof Float32Array&&output.length===sources[index].count,'Invalid active scheduled source output');checkAbort(fillSignal);filling=true;
     try{const {counter}=sources[index];if(generator.fillBackend)await generator.fillBackend.fill({counter:Uint32Array.from(counter),key:Uint32Array.from(key),output},{signal:fillSignal});else await fillInner(counter,key,output,fillSignal);checkAbort(fillSignal);return output;}finally{filling=false;}
    },commit(){close(true);},rollback(){close(false);}
   });
  }catch(error){this.busy=false;this.restore(saved);throw error;}
 }
 async values(count,{signal,account=()=>{}}={}){
  this.live();requireValue(!this.busy&&Number.isSafeInteger(count)&&count>=0&&count<=2**28,'Invalid MPS random tensor length');checkAbort(signal);account(count*4+512);
  let output;try{output=new Float32Array(count);}catch(error){throw normalizeResourceError(error,{requestedBytes:count*4,allocationKind:'array-buffer',allocation:'d2prl-mps-random-output'});}
  if(count===0)return output;
  const saved=this.snapshot();this.busy=true;
  try{const counter=advanceTensor(this),key=Uint32Array.of(this.seedLo,this.seedHi);
   if(this.fillBackend)await this.fillBackend.fill({counter,key,output},{signal});else await fillInner(counter,key,output,signal);
   checkAbort(signal);return output;
  }catch(error){this.busy=false;this.restore(saved);throw error;}finally{this.busy=false;}
 }
 dispose(){
  requireValue(!this.busy,'MPS random generator busy');
  if(!this.disposed){this.state=null;this.disposed=true;this.retiringFill=this.fillBackend;this.fillBackend=null;}
  if(!this.retiringFill)return this.closing;if(this.closing)return this.closing;
  const task=Promise.resolve().then(()=>this.retiringFill.dispose());this.closing=task;
  task.then(()=>{this.retiringFill=null;},()=>{if(this.closing===task)this.closing=null;});return task;
 }
}
