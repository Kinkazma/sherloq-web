import test from'node:test';import assert from'node:assert/strict';import{Budget}from'../src/cache.js';import{createVigWindowGpu}from'../src/mgcfdn-vig-window-gpu.js';
const gate=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
function input(M=512,ci=640,co=640,groups=1){return{input:Float32Array.from({length:ci*M},(_,i)=>i%M/8192+Math.floor(i/M)/1024),weight:new Float32Array(ci/groups*co),bias:Float32Array.from({length:co},(_,i)=>i/2048),geometry:[ci,M===256?16:64,M===256?16:M/64,co,1,0,1,groups]};}
function setup({M=512,childRefusal,deviceRefusal,waitCreate,onCreating,getterPrimary,compute}={}){
 const budget=new Budget(4*1024**3),parents=[],calls=[];let creates=0,pipeline;
 const factory=async({budget:given,reserveOwned,onOwner,onOutputOwner})=>{
  assert.equal(given,budget);creates++;const device={async run(p,{onSubmitted}={}){
   calls.push(p);const oh=Math.floor((p.height+2*(p.padding??0)-p.kernel)/(p.stride??1))+1,ow=Math.floor((p.width+2*(p.padding??0)-p.kernel)/(p.stride??1))+1,plane=oh*ow;
   const credit=reserveOwned((pipeline?0:2*1024**2)+p.outChannels*plane*4);pipeline??=credit.split(2*1024**2);const free=credit.split(p.outChannels*plane*4);credit();onSubmitted?.();
   const data=new Float32Array(p.outChannels*plane);if(compute)compute(p,data);else for(let c=0;c<p.outChannels;c++)for(let i=0;i<plane;i++)data[c*plane+i]=p.bias[c]+p.input[i%p.input.length];
   const child={get data(){if(getterPrimary)throw getterPrimary;return data;},async release(){const refusal=childRefusal?.();if(refusal?.refuse)throw refusal.value;free();}};onOutputOwner(child);return child;
  },async dispose(){const refusal=deviceRefusal?.();if(refusal?.refuse)throw refusal.value;pipeline?.();pipeline=undefined;}};onOwner(device);onCreating?.();await waitCreate;return device;
 };
 const lane=createVigWindowGpu({budget,contextCells:M,onOwner:o=>parents.push(o),gpuFactory:factory});assert.equal(parents.length,1);return{lane,budget,calls,get creates(){return creates;}};
}
test('Controlled RGB stem keeps native3x3 domains and exact64/16 bias-after channel partition',async()=>{
 const h=setup(),v={input:new Float32Array(3*256**2),weight:new Float32Array(80*3*9),bias:Float32Array.from({length:80},(_,i)=>i/128),geometry:[3,256,256,80,3,1,2,1]},a=await h.lane.run(v);
 assert.equal(h.calls.length,2);assert.deepEqual(h.calls.map(p=>[p.channels,p.height,p.width,p.outChannels,p.kernel,p.padding,p.stride,p.groups]),[[3,256,256,64,3,1,2,1],[3,256,256,16,3,1,2,1]]);assert.deepEqual(h.calls.map(p=>p.referenceLayout.biasAfterRanges),[[],[[0,16],[16336,16384]]]);for(let c=0;c<80;c++)assert.equal(a.data[c*128**2],c/128);a.release();await h.lane.release();assert.equal(h.budget.total(),0);
});
test('Controlled common grouped4 preserves all groups and complete M512 spatial row packing',async()=>{
 const h=setup(),v=input(512,1280,1280,4),a=await h.lane.run(v);assert.equal(h.calls.length,1);assert.equal(h.calls[0].groups,4);assert.equal(h.calls[0].weights.length,1280*320);assert.equal(h.calls[0].kernel,1);for(let c=0;c<1280;c++)for(const r of[0,255,256,511])assert.equal(a.data[c*512+r],Math.fround(v.bias[c]+v.input[r]));assert.ok(a.gpu.peakAccountedBytes<=64*1024**2);a.release();await h.lane.release();assert.equal(h.budget.total(),0);
});
test('Controlled M4096 pointwise streams complete1024-row products at the native64MiB cap',async()=>{
 const h=setup({M:4096}),v=input(4096,2560,640),a=await h.lane.run(v);assert.deepEqual(h.calls.map(p=>p.width),[1024,1024,1024,1024]);assert.ok(h.calls.every(p=>p.height===1&&p.channels===2560&&p.outChannels===640&&p.kernel===1));for(let part=0;part<4;part++)for(const c of[0,1,2559])for(const r of[0,1023])assert.equal(h.calls[part].input[c*1024+r],v.input[c*4096+part*1024+r]);for(const r of[0,1023,1024,4095])assert.equal(a.data[r],v.input[r]);assert.ok(a.gpu.peakAccountedBytes<=64*1024**2);a.release();await h.lane.release();assert.equal(h.budget.total(),0);
});
test('Controlled M512 graph distance retains all640 ordered factors/all512 targets and native FP32 post order',async()=>{
 const h=setup({compute(p,out){assert.equal(p.channels,640);assert.equal(p.outChannels,512);assert.equal(p.kernel,1);assert.equal(p.hasBias,true);assert.ok(p.bias.every(v=>v===0));for(let j=0;j<512;j++)for(let i=0;i<12;i++)out[j*12+i]=p.weights[j*640]*p.input[i];}}),normal=new Float32Array(640*512),sums=new Float32Array(512);for(let j=0;j<512;j++){normal[j]=j/512;sums[j]=normal[j]*normal[j];}
 const a=await h.lane.distance({normal,sums,first:250,count:12});assert.equal(h.calls.length,1);for(let j=0;j<512;j++)for(let i=0;i<12;i++){let v=Math.fround((j/512)*((250+i)/512)*-2);v=Math.fround(sums[250+i]+v);v=Math.fround(v+sums[j]);assert.equal(a.data[i*512+j],-v);}a.release();await h.lane.release();assert.equal(h.budget.total(),0);
});
for(const value of[undefined,null,false,0,'',Object.freeze({code:'ACK_REFUSED'})])test('Refused GPU producerACK retained through next job and parent retry: '+String(value),async()=>{
 let refuse=true;const h=setup({childRefusal:()=>({refuse,value})});await assert.rejects(h.lane.run(input()),e=>Object.is(e,value));const sent=h.calls.length,held=h.budget.total();assert.ok(held>0);await assert.rejects(h.lane.run(input()),e=>Object.is(e,value));assert.equal(h.calls.length,sent);await assert.rejects(h.lane.release(),e=>Object.is(e,value));assert.equal(h.budget.total(),held);refuse=false;await h.lane.release();assert.equal(h.budget.total(),0);
});
test('Frozen native output primary survives primitive producer and device retirement failures',async()=>{
 const primary=Object.freeze({code:'OUTPUT_PRIMARY'});let child=true,device=true;const h=setup({getterPrimary:primary,childRefusal:()=>({refuse:child,value:false}),deviceRefusal:()=>({refuse:device,value:0})});await assert.rejects(h.lane.run(input()),e=>e===primary);await assert.rejects(h.lane.release(),e=>e===false);child=false;await assert.rejects(h.lane.release(),e=>e===0);assert.ok(h.budget.total()>0);device=false;await h.lane.release();assert.equal(h.budget.total(),0);
});
test('Parent published synchronously; late GPU constructor cancellation waits ACK and coalesces',async()=>{
 const entered=gate(),wait=gate(),h=setup({onCreating:entered.resolve,waitCreate:wait.promise}),running=h.lane.run(input());await entered.promise;const held=h.budget.total(),one=h.lane.release(),two=h.lane.release();assert.equal(one,two);let closed=false;one.then(()=>closed=true);await Promise.resolve();assert.equal(closed,false);assert.equal(h.budget.total(),held);wait.resolve();await assert.rejects(running,{code:'CANCELLED'});await one;assert.equal(h.budget.total(),0);
});
test('Spatial adjacency on a token bank and unsupported M reject before native device',async()=>{
 const h=setup();await assert.rejects(h.lane.run({...input(),geometry:[640,64,8,640,3,1,1,1]}),/geometry/);assert.equal(h.creates,0);assert.throws(()=>setup({M:4352}),/channels4096/);await h.lane.release();assert.equal(h.budget.total(),0);
});
