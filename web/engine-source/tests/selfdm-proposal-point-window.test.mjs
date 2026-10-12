import test from 'node:test';
import assert from 'node:assert/strict';
import {proposalPointWindows,runProposalPointWindows} from '../src/selfdm-proposal-point-window.js';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';

const MiB=1024**2;
test('SuperPoint RF windows partition the complete native grid with stride-aligned halo and preserve odd image remainders',()=>{
 for(const [width,height] of [[8,8],[47,33],[320,287],[512,512],[2000,1500]]){
  const g=proposalPointWindows(width,height),seen=new Uint8Array(g.cols*g.rows);
  for(const w of g.windows){
   assert.equal(w.sx%8,0);assert.equal(w.sy%8,0);assert.ok(w.width<=352&&w.height<=352);
   for(let y=w.y;y<w.y1;y++)for(let x=w.x;x<w.x1;x++){
    seen[y*g.cols+x]++;assert.ok(x-w.sx/8>=0&&x-w.sx/8<Math.floor(w.width/8));assert.ok(y-w.sy/8>=0&&y-w.sy/8<Math.floor(w.height/8));
    assert.ok(w.sx===0||(x*8-w.sx)>=48);assert.ok(w.sy===0||(y*8-w.sy)>=48);
   }
  }
  assert.ok(seen.every(value=>value===1));assert.equal(g.denseWidth,Math.floor(width/8)*8);assert.equal(g.denseHeight,Math.floor(height/8)*8);
  assert.ok(g.windows.some(w=>w.sx+w.width===width));assert.ok(g.windows.some(w=>w.sy+w.height===height));
 }
});

function fixture(width,height,{fail,postFail}={}){
 const budget=new Budget(256*MiB),gray=Float32Array.from({length:width*height},(_,i)=>i),calls=[];let active=0,peak=0,leases=0;
 const runGraph=async(name,inputs,workspace,outputBytes,details)=>{
  calls.push({name,...details});active++;peak=Math.max(peak,active);
  try{
   await new Promise(resolve=>setImmediate(resolve));await fail?.(name,details);let result;
   if(name==='superpoint'){
    const [,,h,w]=inputs.image.dims,cols=Math.floor(w/8),rows=Math.floor(h/8),dw=cols*8,dh=rows*8,first=inputs.image.data[0],sy=Math.floor(first/width),sx=first%width;
    const scores=new Float32Array(dw*dh),descriptors=new Float32Array(256*cols*rows);
    for(let y=0;y<dh;y++)for(let x=0;x<dw;x++)scores[y*dw+x]=(1+(sy+y)*width+sx+x)/(width*height+1);
    for(let c=0;c<256;c++)for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)descriptors[(c*rows+y)*cols+x]=c*1000000+(sy/8+y)*Math.floor(width/8)+sx/8+x;
    result={dense_scores:{data:scores,dims:[1,1,dh,dw]},dense_descriptors:{data:descriptors,dims:[1,256,rows,cols]}};
   }else{
    await postFail?.();const g=proposalPointWindows(width,height),s=inputs.dense_scores.data,d=inputs.dense_descriptors.data;
    for(let y=0;y<g.denseHeight;y++)for(let x=0;x<g.denseWidth;x++)assert.equal(s[y*g.denseWidth+x],Math.fround((1+y*width+x)/(width*height+1)));
    for(let c=0;c<256;c++)for(let y=0;y<g.rows;y++)for(let x=0;x<g.cols;x++)assert.equal(d[(c*g.rows+y)*g.cols+x],Math.fround(c*1000000+y*g.cols+x));
    result={keypoints:{data:new Float32Array([4,4]),dims:[1,1,2]},scores:{data:new Float32Array([.8]),dims:[1,1]},descriptors:{data:new Float32Array(256),dims:[1,256,1]}};
   }
   const release=budget.reserve(Object.values(result).reduce((sum,value)=>sum+value.data.byteLength,0));leases++;let closed=false;
   return {result,release(){if(!closed){closed=true;leases--;release();}}};
  }finally{active--;}
 };
 const run=()=>runProposalPointWindows({gray,width,height,budget,cacheKey:'point-state',runGraph,maxWorkers:7});
 return {budget,calls,run,get peak(){return peak;},get leases(){return leases;}};
}

test('Window scores and descriptors reconstruct exact global fields; postprocess and output ownership remain singular',async()=>{
 const f=fixture(831,641),result=await f.run();assert.equal(f.peak,7);assert.equal(f.calls.filter(value=>value.name==='superpoint-post').length,1);assert.equal(f.budget.cacheBytes,0);assert.equal(f.leases,1);
 assert.equal(f.budget.total(),result.result.keypoints.data.byteLength+result.result.scores.data.byteLength+result.result.descriptors.data.byteLength);result.release();assert.equal(f.budget.total(),0);assert.equal(f.leases,0);
});

test('A failed dense download drains active siblings and preserves only the missing central windows for retry',async()=>{
 let refused=false;const f=fixture(831,641,{fail(name,details){if(name==='superpoint'&&details.tile===2&&!refused){refused=true;throw new EngineError('ASSET_HTTP','503 graph',{details:{status:503}});}}});
 await assert.rejects(f.run(),error=>error.code==='ASSET_HTTP'&&error.details.status===503);assert.equal(f.leases,0);assert.equal(f.peak,7);
 const retained=f.budget.get('point-state'),completed=[...retained.value.done].map((value,index)=>value?index:null).filter(value=>value!==null);assert.ok(completed.length>=6);assert.ok(!completed.includes(2));assert.equal(f.budget.active,0);
 const before=f.calls.length,result=await f.run(),retried=f.calls.slice(before).filter(value=>value.name==='superpoint').map(value=>value.tile);assert.ok(retried.includes(2));assert.ok(retried.every(tile=>!completed.includes(tile)));result.release();assert.equal(f.budget.total(),0);
});

test('A late postprocess download retries no consumed dense window; cache eviction retires all backing',async()=>{
 let refused=false;const f=fixture(320,287,{postFail(){if(!refused){refused=true;throw new EngineError('ASSET_HTTP','503 global post',{details:{status:503}});}}});
 await assert.rejects(f.run(),{code:'ASSET_HTTP'});const before=f.calls.length,result=await f.run();assert.deepEqual(f.calls.slice(before).map(value=>value.name),['superpoint-post']);result.release();assert.equal(f.budget.total(),0);
 refused=false;await assert.rejects(f.run(),{code:'ASSET_HTTP'});f.budget.clearPrefix('point-state');assert.equal(f.budget.total(),0);assert.equal(f.budget.resourceSnapshot().domains['array-buffer'].backings,0);
});
