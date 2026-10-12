import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SelfDMProposalEngine} from '../src/selfdm-proposal.js';
import {SELFDM_PROPOSAL_MODELS,SELFDM_PROPOSAL_CV,SELFDM_PROPOSAL_PREPARE,verifySelfDMProposalModels,loadSelfDMProposalBundle} from '../src/selfdm-proposal-assets.js';
import {Budget} from '../src/cache.js';
import {EngineError,checkAbort} from '../src/errors.js';
import {registerArrayViews} from '../src/allocation.js';
import {selectProposalBoxes,createFirstMatchPaint,paintMatchedPoints,fuseProposalScores} from '../src/selfdm-proposal-process.js';
import {prepareProposalPyramid,proposalDeepMaskWindows,proposalSourcePatch,proposalCRFWindows,proposalSeedsBytes} from '../src/selfdm-proposal-pyramid.js';
import createCV from '../vendor/selfdm-proposal/proposal-cv.mjs';

const MiB=1024**2,plane=512**2;
const models=Object.fromEntries(Object.entries(SELFDM_PROPOSAL_MODELS).map(([name,spec])=>[name,{...spec,url:'https://example.invalid/'+spec.file}]));
const input=()=>({format:'rgb8',width:512,height:512,data:new Uint8Array(plane*3)});
// This is an orchestration fixture, not numerical detector qualification.
// Scientific native parity is exercised separately by the real browser script.
function fixture({fail,hold,boxCount=2}={}){
 const budget=new Budget(3*1024**3),calls=[],pools=[];let active=0,peak=0,outputs=0;
 const poolFactory=()=>({slots:[],drop(){},dispose(){},snapshot(){return {active,peakWorkers:peak};},async run(name,inputs,{signal}){
  checkAbort(signal);calls.push(name);active++;peak=Math.max(peak,active);
  try{await new Promise(resolve=>setImmediate(resolve));checkAbort(signal);await hold?.(name,signal);checkAbort(signal);await fail?.(name,inputs);
   let result;
   if(name==='selfdm')result={probability:{data:new Float32Array(plane).fill(.8),dims:[1,1,512,512]}};
   if(name==='deepmask'){const [,,h,w]=inputs.normalizedRgb.dims,rows=Math.ceil(h/16)-9,cols=Math.ceil(w/16)-9;result={mask:{data:new Float32Array(rows*cols*112**2),dims:[1,rows*cols,112,112]},score:{data:new Float32Array(rows*cols).fill(.5),dims:[1,1,rows,cols]}};}
   if(name==='superpoint')result={keypoints:{data:Float32Array.from([2,3,4,5,6,7,8,9]),dims:[1,4,2]},scores:{data:new Float32Array(4).fill(.8),dims:[1,4]},descriptors:{data:new Float32Array(256*4),dims:[1,256,4]}};
   if(name==='superglue')result={matches0:{data:BigInt64Array.from([0n,1n,2n,3n]),dims:[1,4]},matches1:{data:BigInt64Array.from([0n,1n,2n,3n]),dims:[1,4]},matching_scores0:{data:new Float32Array(4).fill(.7),dims:[1,4]},matching_scores1:{data:new Float32Array(4).fill(.7),dims:[1,4]}};
   if(name==='crf'){const [,,h,w]=inputs.unary.dims;result={probability:{data:new Float32Array(h*w).fill(.7),dims:[1,h,w]}};}
   const reservation=budget.reserve(Object.values(result).reduce((sum,item)=>sum+item.data.byteLength,0)),backing=registerArrayViews(budget,Object.fromEntries(Object.entries(result).map(([name,item])=>[name,item.data])));outputs++;let closed=false;
   return {result,heapBytes:32*MiB,metrics:{provider:'wasm',threads:4,cpuGranted:4,memoryMaximumBytes:128*MiB},release(){if(closed)return;closed=true;outputs--;backing();reservation();}};
  }finally{active--;}
 }});
 const stripPoolFactory=()=>{const value={resourceOperation:null,clear(){},metrics(){return {orchestrationFixture:true};},async run({count,prepare,consume,signal}){for(let i=0;i<count;i++){
  checkAbort(signal);const job=await prepare(i);let out;
  if(job.command==='pyramid'){const {width:w,height:h}=job.window;out={data:new Float32Array(3*w*h),shape:[1,3,h,w]};}
  if(job.command==='mask-box')out=boxCount?{found:true,box:new Int32Array(boxCount===1||i%2===0?[16,16,56,56]:[160,160,200,200])}:{found:false};
  if(job.command==='roi'){const [w,h]=job.resize;out={gray:new Float32Array(w*h),labels:new Int32Array(w*h),labelCount:1};}
  if(job.command==='resize')out={data:new Float32Array(job.target[0]*job.target[1]).fill(.7)};
  await consume(out,i);
 }}};pools.push(value);return value;};
 const image=input(),owner=new SelfDMProposalEngine(image,budget,{maxWorkers:4},{poolFactory,stripPoolFactory});
 return {owner,budget,calls,image,pools,get outputs(){return outputs;},get peak(){return peak;}};
}

test('Proposal rejects dimensions with empty native scales before workers, caches or pixels mutate',async()=>{
 let created=0;const budget=new Budget(2*1024**3),image={format:'rgb8',width:4,height:4,data:new Uint8Array(4*4*3)},owner=new SelfDMProposalEngine(image,budget,{maxWorkers:4},{poolFactory(){created++;}});
 await assert.rejects(owner.analyze({}, {models}),{code:'INVALID_INPUT'});
 assert.equal(created,0);assert.equal(budget.total(),0);assert.equal(image.data.length,48);await owner.dispose();
});

test('Pinned graph and CV identities cannot be silently exchanged',()=>{
 assert.deepEqual(Object.keys(verifySelfDMProposalModels(models)),['selfdm','deepmask','superpoint','superglue','crf']);
 assert.throws(()=>verifySelfDMProposalModels({...models,superglue:{...models.superglue,sha256:'f'.repeat(64)}}),{code:'INVALID_INPUT'});
});

test('A verified manifest resolves only pinned scientific components and returns its staging lease',async()=>{
 const original=globalThis.fetch,budget=new Budget(1*MiB);
 const data=new TextEncoder().encode(JSON.stringify({schema:1,family:'selfdm-proposal',models:SELFDM_PROPOSAL_MODELS,cv:{...SELFDM_PROPOSAL_CV,file:'seeds.wasm'},prepare:SELFDM_PROPOSAL_PREPARE}));
 globalThis.fetch=async()=>new Response(data,{status:200});
 try{const bundle=await loadSelfDMProposalBundle({id:'bundle',url:'https://example.invalid/bundle/manifest.json',bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')},{budget});assert.equal(bundle.models.crf.url,'https://example.invalid/bundle/convcrf-dynamic.onnx');assert.equal(bundle.cv.url,'https://example.invalid/bundle/seeds.wasm');assert.equal(budget.total(),0);}
 finally{globalThis.fetch=original;}
});

test('Native first-match SEEDS painting and ordered overlap fusion preserve their formulas',()=>{
 const target=createFirstMatchPaint(Int32Array.from([0,0,1,1]),2);
 paintMatchedPoints(target,Float32Array.from([0,0,1,0,0,1]),BigInt64Array.from([0n,1n,2n]),Float32Array.from([.25,.99,.75]),2);
 assert.deepEqual([...target.labels],[-10,-10,-10,-10]);assert.deepEqual([...target.scores],[.25,.25,.75,.75]);
 const score=new Float32Array(16).fill(.5),boxes=selectProposalBoxes([[0,0,2,2],[2,2,4,4]],score,4,4);
 const maps=boxes.map(()=>new Float32Array(4).fill(.75)),full=fuseProposalScores(boxes,maps,score,4,4,new Array(8));
 assert.equal(full.fellBackToInitial,false);assert.ok(Math.abs(full.score[0]-1/(1+Math.exp(-3)))<1e-14);assert.equal(full.score[3],0);
 assert.equal(fuseProposalScores(boxes,maps,score,4,4,new Array(7)).fellBackToInitial,true);
});

test('A late download failure preserves every completed sibling/checkpoint, retry runs only CRF, final output survives disposal',async()=>{
 let refused=false;const f=fixture({fail(name){if(name==='crf'&&!refused){refused=true;throw new EngineError('NETWORK_TRANSIENT','503 model fetch',{details:{url:models.crf.url,status:503},cause:new TypeError('network unavailable')});}}});
 const pixels=f.image.data.slice();
 try{
  await assert.rejects(f.owner.analyze({}, {models}),error=>error.code==='NETWORK_TRANSIENT'&&error.details.status===503&&error.cause.message==='network unavailable');
  assert.equal(f.peak,7);assert.equal(f.calls.filter(name=>name==='deepmask').length,15);assert.ok(f.budget.cacheBytes>0);assert.equal(f.outputs,0);
  const previous=f.calls.length,result=await f.owner.analyze({}, {models});
  assert.deepEqual(f.calls.slice(previous),['crf']);assert.equal(result.metrics.inferenceExecutions,1);assert.equal(result.metrics.cacheHits,13);assert.equal(result.metadata.matchedPoints,8);assert.equal(result.metadata.fellBackToInitial,false);
  assert.deepEqual(f.image.data,pixels);await f.owner.dispose();assert.equal(f.budget.total(),plane*4);assert.equal(f.outputs,0);assert.equal(result.raw[0],Math.fround(.7));result.release();result.release();assert.equal(f.outputs,0);assert.equal(f.budget.total(),0);
 }finally{await f.owner.dispose();}
});

test('A one-proposal native fallback skips SEEDS/SuperPoint/SuperGlue completely',async()=>{
 const f=fixture({boxCount:1});try{const result=await f.owner.analyze({}, {models});assert.equal(result.metadata.proposals.length,1);assert.equal(result.metadata.fellBackToInitial,true);assert.equal(f.calls.includes('superpoint'),false);assert.equal(f.calls.includes('superglue'),false);result.release();}finally{await f.owner.dispose();}assert.equal(f.budget.total(),0);
});

test('A failed independent scale drains siblings and retries only its missing checkpoint',async()=>{
 let refused=false;const f=fixture({boxCount:0,fail(name,inputs){if(name==='deepmask'&&inputs.normalizedRgb.dims[2]===250&&!refused){refused=true;throw new EngineError('NETWORK_TRANSIENT','Missing scale model');}}});
 try{
  await assert.rejects(f.owner.analyze({}, {models}),{code:'NETWORK_TRANSIENT'});assert.equal(f.calls.filter(name=>name==='deepmask').length,15);assert.equal(f.outputs,0);
  const before=f.calls.length,result=await f.owner.analyze({}, {models});assert.deepEqual(f.calls.slice(before),['deepmask','crf','crf','crf','crf']);assert.equal(result.metrics.cacheHits,8);result.release();
 }finally{await f.owner.dispose();}assert.equal(f.budget.total(),0);
});

test('Disposal cancels all active scale calls, preserves source and settles before releasing ownership',async()=>{
 let started;const ready=new Promise(resolve=>{started=resolve;}),f=fixture({hold(name,signal){if(name!=='deepmask')return;started();return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new EngineError('CANCELLED','Scale cancelled')),{once:true});});}}),pixels=f.image.data.slice();
 const pending=f.owner.analyze({}, {models});await ready;const rejection=assert.rejects(pending,{code:'CANCELLED'});await f.owner.dispose();await rejection;
 assert.equal(f.outputs,0);assert.equal(f.budget.total(),0);assert.deepEqual(f.image.data,pixels);assert.equal(f.owner.running,false);
});

test('A progress consumer failure cannot leak the transferred final probability lease',async()=>{
 const f=fixture({boxCount:0});try{await assert.rejects(f.owner.analyze({}, {models,onProgress(event){if(event.phase==='complete')throw Error('progress observer failed');}}),/progress observer failed/);assert.equal(f.outputs,0);}finally{await f.owner.dispose();}assert.equal(f.budget.total(),0);
});

test('Imported CV growth uses the admitted maximum rather than compile-time2GiB overgrowth',async()=>{
 const bytes=await readFile(new URL('../vendor/selfdm-proposal/seeds.wasm',import.meta.url)),cap=33*MiB,module=await createCV({wasmBinary:bytes,wasmMemory:new WebAssembly.Memory({initial:256,maximum:cap/65536}),memoryMaximumBytes:cap});
 assert.equal(createHash('sha256').update(bytes).digest('hex'),SELFDM_PROPOSAL_CV.sha256);
 const pointer=module._malloc(32*MiB);assert.ok(pointer,'Useful near-cap allocation should fit');assert.ok(module.HEAPU8.byteLength<=cap);module._free(pointer);
 assert.equal(module._malloc(40*MiB),0,'Exceeding the real cap remains a refusal');assert.ok(module.HEAPU8.byteLength<=cap);
});

test('DeepMask windows retain every global grid cell exactly once with a real receptive-field halo',()=>{
 for(const [width,height] of [[32,32],[416,320],[512,512],[831,641],[12000,8000]])for(let index=0;index<7;index++){
  const g=proposalDeepMaskWindows(width,height,2**(-2.5+index*.5)),seen=new Uint8Array(g.rows*g.cols);
  for(const w of g.windows){assert.equal(w.x%16,0);assert.equal(w.y%16,0);assert.ok(w.width<=704&&w.height<=704);
   for(let y=w.row0;y<w.row1;y++)for(let x=w.col0;x<w.col1;x++){seen[y*g.cols+x]++;assert.ok(x-w.x/16>=0);assert.ok(y-w.y/16>=0);assert.ok(x-w.x/16<Math.ceil(w.width/16)-9);assert.ok(y-w.y/16<Math.ceil(w.height/16)-9);}
   const p=proposalSourcePatch(width,height,g.ow,g.oh,w);assert.ok(p.x>=0&&p.y>=0&&p.x+p.width<=width&&p.y+p.height<=height);
  }
  assert.ok(seen.every(value=>value===1));
 }
});

test('CRF windows partition original rectangular pixels and retain the native AvgPool4 phase',()=>{
 for(const [width,height] of [[32,32],[47,33],[416,320],[512,512],[831,641],[1200,801]]){
  const seen=new Uint8Array(width*height),phase=size=>Math.ceil(((4-size%4)%4)/2);
  for(const w of proposalCRFWindows(width,height)){
   assert.ok(w.width<=304&&w.height<=304);assert.equal((w.sx+phase(width)-phase(w.width))%4,0);assert.equal((w.sy+phase(height)-phase(w.height))%4,0);
   for(let y=w.y;y<w.y1;y++)for(let x=w.x;x<w.x1;x++)seen[y*width+x]++;
  }
  assert.ok(seen.every(value=>value===1));
 }
});

test('SEEDS admits the native histogram hierarchy rather than a fixed small-image cap',()=>{
 const small=proposalSeedsBytes(320,240),large=proposalSeedsBytes(2000,1500);
 assert.ok(small>16*MiB&&small<96*MiB);assert.ok(large>500*MiB&&large<1024*MiB);assert.equal(large%MiB,0);
});

test('A mid-scale interruption retains consumed windows and retries only missing DeepMask windows',async()=>{
 let refused=false;const f=fixture({boxCount:0,fail(name,inputs){if(name==='deepmask'&&inputs.normalizedRgb.dims[2]===544&&inputs.normalizedRgb.dims[3]===532&&!refused){refused=true;throw new EngineError('NETWORK_TRANSIENT','Interrupted third native window');}}});
 try{
  await assert.rejects(f.owner.analyze({}, {models}),{code:'NETWORK_TRANSIENT'});assert.equal(f.calls.filter(name=>name==='deepmask').length,9);
  const before=f.calls.length,result=await f.owner.analyze({}, {models});assert.equal(f.calls.slice(before).filter(name=>name==='deepmask').length,7);assert.equal(result.metadata.fellBackToInitial,true);result.release();
 }finally{await f.owner.dispose();}assert.equal(f.budget.total(),0);
});

test('Cropped pyramid source windows retain the whole-pyramid global interpolation coordinates',async()=>{
 const binary=await readFile(new URL('../vendor/selfdm-proposal/seeds.wasm',import.meta.url)),cap=64*MiB,module=await createCV({wasmBinary:binary,wasmMemory:new WebAssembly.Memory({initial:256,maximum:cap/65536}),memoryMaximumBytes:cap});
 for(const [width,height] of [[47,33],[831,641]]){
  const rgb=Uint8Array.from({length:width*height*3},(_,i)=>(i*31+i%11)%256),scale=2**.5,g=proposalDeepMaskWindows(width,height,scale),whole=prepareProposalPyramid(rgb,width,height,scale,module),pw=g.ow+160,ph=g.oh+160;
  for(const window of [g.windows[0],g.windows[Math.floor(g.windows.length/2)],g.windows.at(-1)]){
   const patch=proposalSourcePatch(width,height,g.ow,g.oh,window),pixels=new Uint8Array(patch.width*patch.height*3);
   for(let y=0;y<patch.height;y++)pixels.set(rgb.subarray(((patch.y+y)*width+patch.x)*3,((patch.y+y)*width+patch.x+patch.width)*3),y*patch.width*3);
   const part=prepareProposalPyramid(pixels,width,height,scale,module,{window,patch});
   for(let c=0;c<3;c++)for(let y=0;y<window.height;y++)assert.deepEqual(part.data.subarray((c*window.height+y)*window.width,(c*window.height+y+1)*window.width),whole.data.subarray((c*ph+y+window.y)*pw+window.x,(c*ph+y+window.y)*pw+window.x+window.width));
  }
 }
 assert.ok(module.HEAPU8.byteLength<=cap);
});
