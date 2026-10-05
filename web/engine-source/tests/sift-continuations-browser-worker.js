import create from '../vendor/sift-paged/sift-paged.js';
import {continuationFixture,continuationRun} from './helpers/sift-continuation-oracle.js';
const assert=(value,message)=>{if(!value)throw Error(message);};
self.onmessage=async()=>{try{const wasm=new Uint8Array(await(await fetch('../vendor/sift-paged/sift-paged.wasm')).arrayBuffer()),reports=[];
 for(const [layers,w,h] of [[3,603,439],[4,517,515]]){
  const input=await continuationFixture(create,wasm,layers,w,h),legacy=await continuationRun(input,{layers,wasm,canonical:false});
  for(const backend of navigator.gpu?['cpu','webgpu']:['cpu']){const batch=await continuationRun(input,{layers,wasm,canonical:true,backend});assert(JSON.stringify(batch.outputs)===JSON.stringify(legacy.outputs),'Native seed or orientation bits changed '+backend);assert(JSON.stringify(batch.ranking)===JSON.stringify(legacy.ranking),'Global selection, descriptor or G2NN ordering changed '+backend);assert(batch.rounds>1&&batch.escapes>0,'Continuation paths not covered');reports.push({backend,layers,w,h,seeds:input.seeds.length,rounds:batch.rounds,escapes:batch.escapes,legacyPyramids:legacy.builds,batchPyramids:batch.builds,rankedPoints:batch.ranking.points.length/7,g2nnPairs:batch.ranking.pairs.length/4,radius:input.radius,exact:true});}
 }
 postMessage({result:{reports}});
 }catch(error){postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}};
