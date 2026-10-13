import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {createSelfDMScientificScopeInput} from '../src/selfdm-scientific-scope.js';
import {restrictProposalDenseScores,restrictProposalPoints,restrictProposalMask,proposalScopedMean,createProposalCRFScientificScope,createProposalPointAdmission} from '../src/selfdm-proposal-scope.js';
import {runProposalPointWindows} from '../src/selfdm-proposal-point-window.js';
import {createFirstMatchPaint,paintMatchedPoints,selectProposalBoxes} from '../src/selfdm-proposal-process.js';
const rectangle=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],sha='a'.repeat(64);
const binarySha=async values=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(values)))].map(v=>v.toString(16).padStart(2,'0')).join('');
async function scopeFixture(excluded=[],width=512,height=512){
 const budget=new Budget(16*1024**2),scope=await createSelfDMScientificScopeInput({scope:{schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',sourceSha256:sha,width,height,fingerprint:'test',status:'ready',regions:[{x0:0,y0:0,x1:width,y1:height}],excluded},width,height,sourceSha256:sha,bounds:[0,0,width,height]},{budget});return {scope,budget};
}

test('Proposal point compaction preserves channel-major descriptors and native ordering before matching',async()=>{
 const {scope,budget}=await scopeFixture([rectangle(0,0,256,512)]),count=4,keypoints=Float32Array.from([2,2,6,2,2,6,6,6]),scores=Float32Array.from([.1,.2,.3,.4]),descriptors=Float32Array.from({length:256*count},(_,i)=>100*Math.floor(i/count)+i%count),points={keypoints,scores,descriptors,count};
 try{const kept=await restrictProposalPoints(points,{scope,rect:[0,0,512,512],width:8,height:8});assert.equal(kept.count,2);assert.deepEqual([...kept.keypoints],[6,2,6,6]);assert.deepEqual([...kept.scores],[Math.fround(.2),Math.fround(.4)]);for(let c=0;c<256;c++)assert.deepEqual([...kept.descriptors.subarray(c*2,c*2+2)],[c*100+1,c*100+3]);assert.match(kept.scopeFiltering.stage,/before-SuperGlue/);}finally{scope.release();}assert.equal(budget.total(),0);
});
test('Excluded dense scores cannot enter native NMS/TopK or suppress an acquisition peak',async()=>{
 const {scope,budget}=await scopeFixture([rectangle(0,0,256,512)]),scores=new Float32Array(8*8).fill(.1);scores[2*8+2]=.99;scores[2*8+6]=.9;
 try{const receipt=await restrictProposalDenseScores(scores,{scope,rect:[0,0,512,512],width:8,height:8,denseWidth:8,denseHeight:8});assert.equal(scores[18],0);assert.equal(scores[22],Math.fround(.9));assert.equal(receipt.total,64);assert.ok(receipt.excluded>0);assert.match(receipt.stage,/before-native-NMS/);}finally{scope.release();}assert.equal(budget.total(),0);
});
test('Proposal scoring and SEEDS propagation never use excluded pixels',async()=>{
 const {scope,budget}=await scopeFixture([rectangle(0,0,255,512)]),score=new Float32Array(512**2).fill(.8);for(let y=0;y<512;y++)for(let x=0;x<256;x++)score[y*512+x]=.01;
 try{
  assert.equal(proposalScopedMean([0,0,256,10],score,512,scope),0);assert.equal(proposalScopedMean([250,0,270,10],score,512,scope),Math.fround(.8));
  const boxes=selectProposalBoxes([[0,0,256,10],[250,0,270,10]],score,512,512,{mean:(r,s,w)=>proposalScopedMean(r,s,w,scope)});assert.equal(boxes.length,1);
  const labels=Int32Array.from([-1,0,0,-1]),paint=createFirstMatchPaint(labels,1);paintMatchedPoints(paint,Float32Array.from([1,0]),BigInt64Array.of(0n),Float32Array.of(.75),2);assert.deepEqual([...paint.scores],[0,.75,.75,0]);
 }finally{scope.release();}assert.equal(budget.total(),0);
});
test('DeepMask exclusions enter candidate masks before native Top500 banks',async()=>{
 const {scope,budget}=await scopeFixture([rectangle(0,0,512,200)]),mask=new Float32Array(112**2).fill(.8);
 try{const receipt=await restrictProposalMask(mask,{scope,width:512,height:512,scale:1,row:4,col:4});assert.equal(receipt.admitted,0);assert.ok(mask.every(v=>v===0));}finally{scope.release();}assert.equal(budget.total(),0);
});
test('CRF whole pooling cells reject thin diagonal exclusions; native rectangular pooling phase is preserved',async()=>{
 const {scope,budget}=await scopeFixture([[[8.1,8.1],[8.2,8.1],[20.2,20.1],[20.1,20.1]]]),window={sx:0,sy:0,width:47,height:33,x:0,y:0,x1:47,y1:33};let crf;
 try{crf=await createProposalCRFScientificScope(scope,window,{budget});assert.deepEqual(crf.inputs.scientific_scope_coarse.dims,[1,1,9,12]);assert.ok(crf.metadata.excludedCells>0);assert.match(crf.metadata.stage,/before-unary-message/);assert.ok(crf.inputs.scientific_scope_coarse.data.some(v=>v===0));assert.equal(crf.metadata.gridSha256,await binarySha(crf.inputs.scientific_scope_coarse.data));assert.equal(crf.metadata.outputScopeSha256,await binarySha(crf.inputs.scientific_scope_output.data));assert.deepEqual(crf.metadata.coarseShape,[9,12]);assert.deepEqual(crf.metadata.outputShape,[33,47]);assert.equal(crf.metadata.gridDtype,'uint8');}finally{crf?.release();scope.release();}assert.equal(budget.total(),0);
});

test('An admitted point cannot sample a bilinear descriptor from an excluded neighbouring cell',async()=>{
 const {scope,budget}=await scopeFixture([rectangle(8,0,15,512)]);let admission;
 try{admission=await createProposalPointAdmission(scope,[0,0,512,512],512,512,{budget});assert.equal(scope.admitsResizedPoint(7,20,[0,0,512,512],512,512),true);assert.equal(admission.admits(7,20),false);assert.equal(admission.admits(100,100),true);
  const grid=Uint8Array.from({length:64**2},(_,i)=>scope.admitsResizedRectangle([(i%64)*8,Math.floor(i/64)*8,(i%64)*8+7,Math.floor(i/64)*8+7],[0,0,512,512],512,512)?1:0);assert.equal(admission.metadata.gridSha256,await binarySha(grid));assert.deepEqual(admission.metadata.grid,[64,64]);assert.deepEqual(admission.metadata.rectangle,[0,0,512,512]);assert.deepEqual(admission.metadata.resize,[512,512]);
  const scores=new Float32Array(512**2).fill(.8);await restrictProposalDenseScores(scores,{scope,admission,rect:[0,0,512,512],width:512,height:512,denseWidth:512,denseHeight:512});assert.equal(scores[20*512+7],0);assert.equal(scores[100*512+100],Math.fround(.8));
 }finally{admission?.release();scope.release();}assert.equal(budget.total(),0);
});

test('Scoped SuperPoint retry retains completed CNN windows but never reuses a different scientific domain',async()=>{
 const budget=new Budget(64*1024**2),gray=new Float32Array(64),calls=[];let fail=true,restrictions=0;
 const runGraph=async(name,inputs)=>{
  calls.push(name);if(name==='superpoint-post'){assert.equal(inputs.dense_scores.data[0],0);if(fail){fail=false;throw new EngineError('ASSET_HTTP','post unavailable');}return {result:{},release(){}};}
  return {result:{dense_scores:{data:new Float32Array(64).fill(.9),dims:[1,1,8,8]},dense_descriptors:{data:new Float32Array(256),dims:[1,256,1,1]}},release(){}};
 };
 const options={gray,width:8,height:8,budget,cacheKey:'scoped-point',runGraph,maxWorkers:4,scopeIdentity:'scope-a',restrictScoresBeforePost:async scores=>{restrictions++;scores[0]=0;return {admitted:63,excluded:1};}};
 await assert.rejects(runProposalPointWindows(options),{code:'ASSET_HTTP'});assert.equal(budget.active,0);
 await assert.rejects(runProposalPointWindows({...options,scopeIdentity:'scope-b'}),{code:'INVALID_INPUT'});assert.equal(budget.active,0);
 const before=calls.length,result=await runProposalPointWindows(options);assert.deepEqual(calls.slice(before),['superpoint-post']);assert.equal(restrictions,1);assert.equal(result.scopeFiltering.excluded,1);result.release();assert.equal(budget.total(),0);
});

test('Cancellation during score restriction keeps domain identity and retries restriction before post',async()=>{
 const budget=new Budget(64*1024**2),controller=new AbortController();let restrictions=0,post=0;
 const runGraph=async name=>name==='superpoint'?{result:{dense_scores:{data:new Float32Array(64).fill(.9),dims:[1,1,8,8]},dense_descriptors:{data:new Float32Array(256),dims:[1,256,1,1]}},release(){}}:(post++,{result:{},release(){}});
 const options={gray:new Float32Array(64),width:8,height:8,budget,cacheKey:'cancel-point',runGraph,maxWorkers:4,scopeIdentity:'scope-a',restrictScoresBeforePost:async scores=>{scores[0]=0;if(!restrictions++){controller.abort();throw new EngineError('CANCELLED','restriction cancelled');}return {admitted:63,excluded:1};}};
 await assert.rejects(runProposalPointWindows({...options,signal:controller.signal}),{code:'CANCELLED'});assert.equal(post,0);assert.equal(budget.active,0);
 await assert.rejects(runProposalPointWindows({...options,scopeIdentity:'scope-b'}),{code:'INVALID_INPUT'});
 const result=await runProposalPointWindows(options);assert.equal(restrictions,2);assert.equal(post,1);result.release();assert.equal(budget.total(),0);
});
