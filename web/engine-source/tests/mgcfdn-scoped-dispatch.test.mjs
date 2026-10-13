import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {createSegmentationInference} from '../experiments/segmentation/inference.js';import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
import {mgcfdnWorkerSessionKey,mgcfdnWorkerScopeTensor} from '../experiments/segmentation/mgcfdn-scoped-worker.js';
import {prepareNeuralScientificScope} from '../src/neural-scientific-scope.js';
import {createCmsegInference} from '../experiments/segmentation/cmseg-inference.js';
const sha='a'.repeat(64),scope=excluded=>({schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',status:'ready',sourceSha256:sha,width:256,height:256,fingerprint:'b'.repeat(64),regions:[{x0:0,y0:0,x1:256,y1:256}],excluded}),context=s=>({scope:s,width:256,height:256,sourceSha256:sha,bounds:[0,0,256,256]});
test('protocol-only MGCF dispatch forwards admitted positions, requires an actual worker receipt and preserves native input',async()=>{
 const old=globalThis.Worker,messages=[],budget=new Budget(2*1024**3),input=new Float32Array(3*256**2).fill(.125),before=input.slice();let failedReceipt=false;
 globalThis.Worker=class{postMessage(data){messages.push(data);queueMicrotask(()=>this.onmessage({data:{ok:true,raw:new Float32Array(256**2).fill(.25),heapBytes:16*1024**2,ort:{},timings:{},...(data.mgcfScope&&!failedReceipt?{metadata:{scientificScope:{...data.mgcfScope.metadata,graph:{policy:data.mgcfScope.metadata.graphTransform}}}}:{})}}));}terminate(){}};
 const inference=createSegmentationInference({budget,variant:'mgcfdn-16',modelUrl:'http://models.invalid/pinned.onnx'});
 try{
  const full=await inference.run(input,{scientificScope:context(scope([]))});assert.equal(messages[0].mgcfScope,undefined);assert.equal(full.metadata.scientificScope.bypassOriginal,true);full.release();
  const partial=await inference.run(input,{scientificScope:context(scope([[[32,32],[80,32],[80,80],[32,80]]]))});assert(messages[1].mgcfScope.indices instanceof BigInt64Array);assert.equal(messages[1].mgcfScope.side,16);assert(messages[1].mgcfScope.count<256);assert.equal(partial.metadata.scientificScope.bypassOriginal,false);assert.equal(partial.metadata.scientificScope.graph.policy,'mgcfdn-admitted-correlations-query-scatter/1');partial.release();
  failedReceipt=true;await assert.rejects(inference.run(input,{scientificScope:context(scope([[[32,32],[80,32],[80,80],[32,80]]]))}),/receipt missing/);assert.equal(inference.residentBytes,0);
  const count=messages.length;await assert.rejects(inference.run(input,{scientificScope:context(scope([[[0,0],[256,0],[256,256],[0,256]]]))}),{code:'NEURAL_SCOPE_BELOW_GRID'});assert.equal(messages.length,count);assert.deepEqual(input,before);
 }finally{inference.dispose();globalThis.Worker=old;}assert.equal(budget.total(),0);
});
test('MGCF invalid scientific positions are rejected on reused-session requests and scope-free model identity remains native',()=>{
 const model=SEGMENTATION_MODELS['mgcfdn-16'],plain={model},metadata={graphTransform:'mgcfdn-admitted-correlations-query-scatter/1',admittedSources:2,admittedTargets:2,grid:[16,16],gridSha256:'c'.repeat(64)},data={model,mgcfScope:{side:16,count:2,indices:BigInt64Array.of(1n,4n),metadata}};
 assert.notEqual(mgcfdnWorkerSessionKey(data),mgcfdnWorkerSessionKey(plain));assert.equal(mgcfdnWorkerScopeTensor({},plain),null);
 for(const indices of [BigInt64Array.of(4n,1n),BigInt64Array.of(4n,4n),BigInt64Array.of(-1n,4n),BigInt64Array.of(4n,256n)])assert.throws(()=>mgcfdnWorkerSessionKey({...data,mgcfScope:{...data.mgcfScope,indices}}),{code:'INVALID_INPUT'});
});
test('a real RGB pixel island remains explicit when no CMSeg/MGCF latent domain represents it; neither model nor worker starts',async()=>{
 const old=globalThis.Worker,budget=new Budget(2*1024**3),width=1024,height=1024,s={...scope([]),width,height,regions:[{x0:20,y0:20,x1:21,y1:21}]},zones=[{id:'real-island',bounds:[0,0,width,height]}];let workers=0;
 globalThis.Worker=class{constructor(){workers++;throw Error('A below-grid island must never load an inference worker');}};
 const plan=await prepareNeuralScientificScope(s,zones,{width,height,sourceSha256:sha,side:512,budget,requireGridSupport:false,retainMatchingGrid:false});assert.equal(plan.zones.length,1);const scientificScope={scope:s,width,height,sourceSha256:sha,bounds:zones[0].bounds};
 const mgcf=createSegmentationInference({budget,variant:'mgcfdn-16',modelUrl:'http://models.invalid/pinned.onnx'}),cmseg=createCmsegInference({budget,model:SEGMENTATION_MODELS['cmseg-addnoise'],modelUrl:'http://models.invalid/bundle.json'});
 try{await assert.rejects(mgcf.run(new Float32Array(3*256**2),{scientificScope}),{code:'NEURAL_SCOPE_BELOW_GRID'});await assert.rejects(cmseg.run(new Float32Array(3*512**2),{scientificScope}),{code:'NEURAL_SCOPE_BELOW_GRID'});assert.equal(workers,0);assert.equal(budget.total(),0);}finally{mgcf.dispose();cmseg.dispose();plan.release();globalThis.Worker=old;}assert.equal(budget.total(),0);
});
