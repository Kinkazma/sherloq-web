import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleEnergyField,readEnergyWindow} from '../sherloq-browser/assets/energy-native-fields.js';

const CAP=262144;
const fields=['energy_scope','energy_labels','analysis_scope','energy_low_score','energy_high_score','energy_plane_0','energy_plane_1','energy_plane_2'];
const Type=name=>['energy_scope','energy_labels','analysis_scope'].includes(name)?Int32Array:Float32Array;
const value=(name,x,y)=>Type(name)===Int32Array?(x+7*y)%11===0?0:(x*17+y*13)%23-11:Math.fround((x*13+y*19)%997/13-38.25);

function fixture(width,height,{arrays=false,onRead}={}){
 const reads=[],data={width,height},planeSurfaces=Object.fromEntries(fields.map(name=>[name,{id:name,revision:3,width,height}]));
 if(arrays){for(const name of fields.filter(n=>!n.startsWith('energy_plane_')))data[name]=Type(name).from({length:width*height},(_,i)=>value(name,i%width,Math.floor(i/width)));data.energy_planes=Array.from({length:3},(_,q)=>Float32Array.from({length:width*height},(_,i)=>value('energy_plane_'+q,i%width,Math.floor(i/width))));}
 const analysis={id:'native-fields',data,planeSurfaces},engine={async readPlane({surfaceId,revision,rect}){assert.equal(revision,3);assert.ok(rect.width*rect.height<=CAP,'Every transient native window remains at most one MiB');assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=height);reads.push({surfaceId,...rect});const out=new (Type(surfaceId))(rect.width*rect.height);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)out[y*rect.width+x]=value(surfaceId,rect.x+x,rect.y+y);await onRead?.(reads.length,rect);return{plane:{width:rect.width,height:rect.height,data:out}};}};
 return{analysis,engine,reads};
}

// Independent oracle: the previous row reader, before rectangle batching.
async function rowOracle(analysis,name,{width,height,step,centers=false},{engine}={}){
 const d=analysis.data,out=new (Type(name))(width*height),xs=Array.from({length:width},(_,x)=>centers?Math.min(d.width-1,Math.floor((x+.5)*d.width/width)):x*step);
 for(let y=0;y<height;y++){const sy=centers?Math.min(d.height-1,Math.floor((y+.5)*d.height/height)):y*step;for(let start=0;start<width;){let end=start+1;while(end<width&&xs[end]-xs[start]<CAP)end++;const row=await readEnergyWindow(analysis,name,{x:xs[start],y:sy,width:xs[end-1]-xs[start]+1,height:1},{engine});for(let x=start;x<end;x++)out[y*width+x]=row[xs[x]-xs[start]];start=end;}}
 return out;
}

function exact(actual,expected){assert.equal(actual.constructor,expected.constructor);assert.deepEqual(new Uint8Array(actual.buffer,actual.byteOffset,actual.byteLength),new Uint8Array(expected.buffer,expected.byteOffset,expected.byteLength));}

test('batched native windows preserve every field and mask bit against the historical row reader',async()=>{
 for(const arrays of[false,true])for(const grid of[{width:11,height:9,step:3,maxWindowRows:29},{width:23,height:17,centers:true,maxWindowRows:29}])for(const name of fields){const current=fixture(37,29,{arrays}),old=fixture(37,29,{arrays});exact(await sampleEnergyField(current.analysis,name,grid,{engine:current.engine}),await rowOracle(old.analysis,name,grid,{engine:old.engine}));}
});

test('center sampling preserves duplicate coordinates and edge clamps for a larger output grid',async()=>{
 const grid={width:19,height:13,centers:true,maxWindowRows:5};for(const name of['energy_scope','energy_low_score']){const h=fixture(7,5),old=fixture(7,5);exact(await sampleEnergyField(h.analysis,name,grid,{engine:h.engine}),await rowOracle(old.analysis,name,grid,{engine:old.engine}));assert.equal(h.reads.length,1);assert.deepEqual(h.reads[0],{surfaceId:name,x:0,y:0,width:7,height:5});}
});

test('1536×1024 native sampling uses seven bounded rectangles instead of 1024 row reads',async()=>{
 const grid={width:1536,height:1024,step:1,maxWindowRows:1024},h=fixture(1536,1024),old=fixture(1536,1024);exact(await sampleEnergyField(h.analysis,'energy_scope',grid,{engine:h.engine}),await rowOracle(old.analysis,'energy_scope',grid,{engine:old.engine}));assert.equal(old.reads.length,1024);assert.equal(h.reads.length,7);assert.equal(h.reads.reduce((n,r)=>n+r.width*r.height,0),1536*1024);assert(h.reads.every(r=>r.width===1536&&r.width*r.height<=CAP));
});

test('default transport keeps the historical one-row admission and exact output',async()=>{
 const grid={width:1536,height:1024,step:1},h=fixture(1536,1024),old=fixture(1536,1024);exact(await sampleEnergyField(h.analysis,'energy_scope',grid,{engine:h.engine}),await rowOracle(old.analysis,'energy_scope',grid,{engine:old.engine}));assert.equal(h.reads.length,1024);assert(h.reads.every(r=>r.height===1));
});

test('maxWindowRows limits native Y span rather than sparse sample count',async()=>{
 for(const grid of[{width:6,height:5,step:4,maxWindowRows:5},{width:6,height:5,centers:true,maxWindowRows:5}]){const h=fixture(29,21),old=fixture(29,21);exact(await sampleEnergyField(h.analysis,'energy_scope',grid,{engine:h.engine}),await rowOracle(old.analysis,'energy_scope',grid,{engine:old.engine}));assert(h.reads.every(r=>r.height<=5));}
});

test('memory-limited transport bisects Y to admitted windows while preserving historical row samples',async()=>{
 const grid={width:1536,height:1024,step:1,maxWindowRows:1024},h=fixture(1536,1024),old=fixture(1536,1024),attempts=[],read=h.engine.readPlane;
 h.engine.readPlane=async request=>{attempts.push(request.rect);if(request.rect.width*request.rect.height*4>512*1024)throw Object.assign(Error('Only512KiB remain for the numeric transport window'),{code:'MEMORY_LIMIT'});return read(request);};
 exact(await sampleEnergyField(h.analysis,'energy_scope',grid,{engine:h.engine}),await rowOracle(old.analysis,'energy_scope',grid,{engine:old.engine}));
 assert(attempts.some(r=>r.width*r.height*4>512*1024));assert(h.reads.every(r=>r.width*r.height*4<=512*1024));assert(h.reads.length<old.reads.length);assert.equal(old.reads.length,1024);
});

test('memory fallback reaches exactly one native row and preserves a refused row error',async()=>{
 const h=fixture(37,29),read=h.engine.readPlane,attempts=[];h.engine.readPlane=async request=>{attempts.push(request.rect);if(request.rect.height>1)throw Object.assign(Error('Only a single native row is admitted'),{code:'MEMORY_LIMIT'});return read(request);};
 const grid={width:10,height:8,step:3,maxWindowRows:29},old=fixture(37,29);exact(await sampleEnergyField(h.analysis,'energy_low_score',grid,{engine:h.engine}),await rowOracle(old.analysis,'energy_low_score',grid,{engine:old.engine}));assert(h.reads.every(r=>r.height===1));assert.equal(h.reads.length,8);
 const denied=Object.assign(Error('The historical one-row transport is also denied'),{code:'MEMORY_LIMIT'}),refused=fixture(37,29);let calls=0;refused.engine.readPlane=async()=>{calls++;throw denied;};await assert.rejects(sampleEnergyField(refused.analysis,'energy_scope',{width:37,height:29,step:1,maxWindowRows:29},{engine:refused.engine}),error=>error===denied);assert(calls<=1+Math.ceil(Math.log2(29)),'Bisection terminates once the historical single row is refused');
});

test('only a read MEMORY_LIMIT is retried; other errors and cancellation remain primary',async()=>{
 for(const code of['INVALID_INPUT','NOT_FOUND','CANCELLED']){const failure=Object.assign(Error(code),{code}),h=fixture(37,29);let calls=0;h.engine.readPlane=async()=>{calls++;throw failure;};await assert.rejects(sampleEnergyField(h.analysis,'energy_scope',{width:37,height:29,step:1},{engine:h.engine}),error=>error===failure);assert.equal(calls,1);}
 const controller=new AbortController(),h=fixture(37,29);let calls=0;h.engine.readPlane=async()=>{calls++;controller.abort();throw Object.assign(Error('Denied while cancellation arrived'),{code:'MEMORY_LIMIT'});};await assert.rejects(sampleEnergyField(h.analysis,'energy_scope',{width:37,height:29,step:1},{engine:h.engine,signal:controller.signal}),{code:'CANCELLED'});assert.equal(calls,1);
});

test('wide sparse grids tile in X and Y without changing centers or exceeding the one MiB transport',async()=>{
 const grid={width:8,height:3,centers:true,maxWindowRows:9},h=fixture(800003,9),old=fixture(800003,9);exact(await sampleEnergyField(h.analysis,'energy_low_score',grid,{engine:h.engine}),await rowOracle(old.analysis,'energy_low_score',grid,{engine:old.engine}));assert(h.reads.length>1);assert(h.reads.some(r=>r.x>0));assert(h.reads.every(r=>r.width*r.height<=CAP));
});

test('normal stacked planes and synthesis single plane use the same exact coordinate sampler',async()=>{
 for(const count of[1,3]){const h=fixture(31,27),n=31*27,packed=new Float32Array(n*count);for(let q=0;q<count;q++)for(let i=0;i<n;i++)packed[q*n+i]=value('energy_plane_'+q,i%31,Math.floor(i/31));h.analysis.data.energy_planes=packed;if(count===1){h.analysis.data.energyPlaneCount=1;h.analysis.data.metadata={method:'ela_energy_synthesis',energy:{planeCount:1,quality_confirmation:'median-already-aggregated'}};}for(let q=0;q<count;q++){const grid={width:13,height:11,step:2},actual=await sampleEnergyField(h.analysis,'energy_plane_'+q,grid,{engine:h.engine});for(let y=0;y<11;y++)for(let x=0;x<13;x++)assert.equal(actual[y*13+x],packed[q*n+y*2*31+x*2]);}assert.equal(h.reads.length,0);}
});

test('pre-aborted or mid-read cancellation never returns a partial field or starts another rectangle',async()=>{
 const before=fixture(1536,1024);await assert.rejects(sampleEnergyField(before.analysis,'energy_scope',{width:1536,height:1024,step:1},{engine:before.engine,signal:AbortSignal.abort()}),{code:'CANCELLED'});assert.equal(before.reads.length,0);
 const controller=new AbortController(),during=fixture(1536,1024,{onRead:n=>{if(n===2)controller.abort();}});await assert.rejects(sampleEnergyField(during.analysis,'energy_scope',{width:1536,height:1024,step:1,maxWindowRows:1024},{engine:during.engine,signal:controller.signal}),{code:'CANCELLED'});assert.equal(during.reads.length,2);
});

test('cumulative copy cooperation admits a queued cancellation even for immediately fulfilled native reads',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'performance');let clock=0;Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock+=9}});
 try{const controller=new AbortController(),h=fixture(37,29,{onRead:()=>{setTimeout(()=>controller.abort(),0);}});await assert.rejects(sampleEnergyField(h.analysis,'energy_low_score',{width:37,height:29,step:1},{engine:h.engine,signal:controller.signal}),{code:'CANCELLED'});assert.equal(h.reads.length,1);}finally{Object.defineProperty(globalThis,'performance',original);}
});

test('invalid sampled geometry and native coordinates remain rejected',async()=>{
 const h=fixture(13,9);for(const grid of[{width:0,height:1,step:1},{width:1,height:1,step:0},{width:2049,height:1,step:1},{width:8,height:6,step:2},{width:1,height:1,step:1,maxWindowRows:0},{width:1,height:1,step:1,maxWindowRows:1.5}])await assert.rejects(sampleEnergyField(h.analysis,'energy_scope',grid,{engine:h.engine}),{code:'INVALID_INPUT'});assert.equal(h.reads.length,0);
});
