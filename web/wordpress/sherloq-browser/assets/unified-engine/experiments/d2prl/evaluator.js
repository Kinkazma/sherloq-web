// Experimental evaluator units only. Does not enable a D2PRL detector operation.
import {requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';
const PAGE=16*1024*1024,MAX=512*1024*1024;
export async function createEvaluator(factory,{account=()=>{}}={}){
 account(PAGE);let module=await factory(),busy=false,disposed=false;
 return {
  get residentBytes(){return disposed?0:module.HEAPU8.length;},
  async evaluate({features,offsetX,offsetY,side,channels,candidates,referenceThreads=8},{signal,onProgress,account=()=>{}}={}){
   requireValue(!disposed,'Evaluator disposed');requireValue(!busy,'Evaluator busy');
   const n=side*side;
   requireValue(Number.isInteger(side)&&side>=2&&side<=448&&(channels===36||channels===96)&&Number.isInteger(candidates)&&candidates>=1&&candidates<=13,'Unsupported evaluator dimensions');
   requireValue(Number.isInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'Unsupported native reference thread layout');
   requireValue(features instanceof Uint16Array&&features.length===channels*n&&offsetX instanceof Float32Array&&offsetY instanceof Float32Array&&offsetX.length===candidates*n&&offsetY.length===candidates*n,'Half descriptors and float32 offsets required');
   checkAbort(signal);busy=true;const pointers=[];
   try{
    let lastYield=performance.now();const checkpoint=async()=>{checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}};
    for(let i=0;i<features.length;i++){requireValue((features[i]&0x7c00)!==0x7c00,'Nonfinite descriptor');if((i&8191)===0)await checkpoint();}
    for(let i=0;i<offsetX.length;i++){requireValue(Number.isFinite(offsetX[i])&&Number.isFinite(offsetY[i]),'Nonfinite offset');if((i&8191)===0)await checkpoint();}
    const required=features.byteLength+offsetX.byteLength+offsetY.byteLength+n*8+1024*1024,target=Math.max(module.HEAPU8.length,Math.ceil(required/PAGE)*PAGE);
    requireValue(target<=MAX,'Evaluator memory limit');account(target-module.HEAPU8.length+n*8);
    const allocate=bytes=>{const p=module._malloc(bytes);if(!p)throw Error('Evaluator allocation failed');pointers.push(p);return p;};
    const fp=allocate(features.byteLength),xp=allocate(offsetX.byteLength),yp=allocate(offsetY.byteLength),out=allocate(n*8);
    module.HEAPU8.set(new Uint8Array(features.buffer,features.byteOffset,features.byteLength),fp);
    module.HEAPU8.set(new Uint8Array(offsetX.buffer,offsetX.byteOffset,offsetX.byteLength),xp);
    module.HEAPU8.set(new Uint8Array(offsetY.buffer,offsetY.byteOffset,offsetY.byteLength),yp);
    for(let begin=0;begin<n;begin+=64){checkAbort(signal);requireValue(module._d2prl_evaluate_range(fp,xp,yp,side,channels,candidates,begin,Math.min(n,begin+64),out,out+n*4,0,referenceThreads)===1,'Evaluator rejected range');onProgress?.(Math.min(n,begin+64)/n);await checkpoint();}
    checkAbort(signal);return {x:module.HEAPF32.slice(out/4,out/4+n),y:module.HEAPF32.slice(out/4+n,out/4+2*n)};
   }finally{for(const p of pointers)module._free(p);busy=false;}
  },
  dispose(){requireValue(!busy,'Evaluator busy');disposed=true;module=null;}
 };
}
