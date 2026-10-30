import {requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';
import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {validateD2prlDescriptor,getD2prlDescriptorLease} from './descriptor-ownership.js';
import {createD2prlGpuKernel} from './evaluator-gpu-kernel.js';
const f=Math.fround,view=new DataView(new ArrayBuffer(4));
// Same finite binary16 ties-to-even rounding as scientific-matching.js. The
// support calculation only receives finite normalized coordinates in [-1,1].
// For MPS, half grid coordinates and integer/2 extents up to1792 make the
// double product+sum exact; one Math.fround reproduces the GPU f32 FMA.
function half(value){view.setFloat32(0,value,true);const u=view.getUint32(0,true),sign=u>>>31?-1:1,e=((u>>>23)&255)-127,m=u&0x7fffff;let q;if(e< -25)return sign*0;if(e< -14){const all=m|0x800000,step=2**(-e-1);q=all/step;const lo=Math.floor(q),r=q-lo;q=lo+(r>.5||r===.5&&(lo&1)?1:0);return sign*q*2**-24;}q=m/8192;const lo=Math.floor(q),r=q-lo;q=lo+(r>.5||r===.5&&(lo&1)?1:0);return sign*(1+q/1024)*2**e;}
export function strictGpuSupportIndices(x,y,side,output,offset=0,arithmetic='cpu'){
 requireValue(Number.isFinite(x)&&Number.isFinite(y)&&Number.isSafeInteger(side)&&side>=2&&['cpu','mps'].includes(arithmetic)&&x>=0&&y>=0&&x<=side-1&&y<=side-1,'Strict finite native sample coordinates');
 const extent=f((side-1)*.5),gx=half(f(f(x-extent)/extent)),gy=half(f(f(y-extent)/extent)),px=arithmetic==='mps'?f(gx*extent+extent):f(f(f(gx+1)*.5)*(side-1)),py=arithmetic==='mps'?f(gy*extent+extent):f(f(f(gy+1)*.5)*(side-1)),x0=Math.floor(px),y0=Math.floor(py),xs=[x0,x0+1,x0,x0+1],ys=[y0,y0,y0+1,y0+1];
 for(let k=0;k<4;k++)output[offset+k]=xs[k]>=0&&ys[k]>=0&&xs[k]<side&&ys[k]<side?ys[k]*side+xs[k]:-1;
 return output;
}
/** Compatible strict pool facade. Native CHW banks stay borrowed until the
 * caller's matching stage has completed. Only the kernel owns GPU copies. */
export async function createStrictFragmentGpuEvaluator({budget,operation,residentForeignLimit=1,kernelFactory=createD2prlGpuKernel,arithmetic='cpu',tileSize=65536}={}){
 requireValue(budget?.reserve&&Number.isSafeInteger(residentForeignLimit)&&residentForeignLimit>=0&&Number.isSafeInteger(tileSize)&&tileSize>=1&&tileSize<=65536,'Strict GPU shared budget and foreign capacity required');
 const kernel=await kernelFactory({budget,operation,arithmetic}),sources=new Map(),foreign=new Map();let residentCapacity=residentForeignLimit;let disposed=false,retirement,busy=false,activeDone=Promise.resolve(),finishActive;
 const stats={backend:'webgpu',computeCalls:0,supportCalls:0,sourcePublications:0,foreignPublications:0};
 const alive=signal=>{checkAbort(signal);requireValue(!disposed,'Strict GPU evaluator disposed');};
 const checkPublication=value=>{if(value.lease)requireValue(getD2prlDescriptorLease(value.data)===value.lease,'Strict descriptor publication changed');};
 return{
  parallelism:1,tileSize,get residentForeignCapacity(){return residentCapacity;},
  get stats(){return{...stats,activeWorkers:0,tileSize,packedCornerTileSize:4096,residentForeignCapacity:residentCapacity,kernel:{...kernel.stats},arithmeticQualification:'experimental-webgpu-requires-exact-oracle-qualification'};},
  async source({data,side,channels,identity,foreignSlot},{signal}={}){
   alive(signal);requireValue(!busy&&data instanceof Uint16Array&&[36,96].includes(channels)&&Number.isSafeInteger(side)&&side>=2&&data.length===channels*side*side&&typeof identity==='string'&&(foreignSlot===undefined||Number.isSafeInteger(foreignSlot)&&foreignSlot>=0&&foreignSlot<residentCapacity),'Native immutable strict CHW source required');
   const binding=kernel.stats?.maxStorageBufferBindingSize;if(Number.isSafeInteger(binding))residentCapacity=Math.min(residentForeignLimit,Math.max(0,Math.floor((binding-4096*13*96*8)/(96*side*side*2))));
   const {lease}=await validateD2prlDescriptor(data,{signal});alive(signal);const value={data,side,channels,identity,lease};if(foreignSlot===undefined){sources.set(channels,value);stats.sourcePublications++;}else{foreign.set(foreignSlot+':'+channels,value);stats.foreignPublications++;}return true;
  },
  async supports({x,y,side},{signal}={}){
   alive(signal);requireValue(x instanceof Float32Array&&y instanceof Float32Array&&x.length===y.length&&x.length>0&&x.length<=13*4096,'Bounded strict support coordinates required');
   const owned=allocateOwnedTypedArray(Int32Array,x.length*4,{budget,owner:'d2prl',label:'strict-gpu-native-supports'});let complete=false,stamp=performance.now();
   try{for(let i=0;i<x.length;i++){strictGpuSupportIndices(x[i],y[i],side,owned.data,i*4,arithmetic);if((i&8191)===0){alive(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}}alive(signal);stats.supportCalls++;complete=true;return{data:owned.data,release:owned.release};}finally{if(!complete)owned.release();}
  },
  async evaluate(input,{signal}={}){
   alive(signal);requireValue(!busy,'Strict GPU evaluator busy');const source=sources.get(input.channels),count=input.end-input.begin;
   requireValue(source&&source.side===input.side&&count>0&&count<=tileSize&&(count<=4096||input.corners?.length===0),'Strict GPU source and bounded native tile required');checkPublication(source);busy=true;activeDone=new Promise(resolve=>{finishActive=resolve;});let result;
   try{const foreignSources=[];for(let slot=0;slot<residentCapacity;slot++){const value=foreign.get(slot+':'+input.channels);if(value){requireValue(value.side===input.side,'Foreign descriptor grid changed');checkPublication(value);foreignSources[slot]=value.data;}}
    result=await kernel.evaluate({...input,source:source.data,cacheSource:!!source.lease,sourceIdentity:source.lease,foreignSources,layout:'CHW-uint16'},{signal});alive(signal);checkPublication(source);for(const value of foreign.values())if(value.channels===input.channels)checkPublication(value);
    requireValue(result.x instanceof Float32Array&&result.y instanceof Float32Array&&result.x.length===count&&result.y.length===count,'Strict GPU result extent');stats.computeCalls++;return result;
   }catch(error){await result?.release?.();throw error;}finally{busy=false;finishActive();finishActive=null;}
  },
  dispose(){if(retirement)return retirement;disposed=true;return retirement=activeDone.then(()=>kernel.dispose()).finally(()=>{sources.clear();foreign.clear();});}
 };
}
