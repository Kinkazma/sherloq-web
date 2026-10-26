import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createCmsegWindowContextHead} from '../src/cmseg-window-context-head.js';
import {CMSEG_WINDOW_NATIVE_SHAPES as shapes} from '../experiments/segmentation/cmseg-window-cnn-runtime.js';
const MiB=1024**2;
const zone=(id,b,kind='acquisition')=>({id,kind,enabled:true,x0:b[0],y0:b[1],x1:b[2],y1:b[3],polygon:[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]]});
async function fixture(){const state=await createOriginalSourceRegionsState({sourceSha256:'c'.repeat(64),width:32,height:16});await state.replaceZones([zone('whole',[0,0,32,16]),zone('negative',[14,0,18,16],'exclusion')],{enabled:true,positiveMode:'selected'});const d=await compileOriginalSourceRegions(state.snapshot());return{window:{fingerprint:d.fingerprint,contextDomain:d,candidateDomain:d},contexts:[{id:'arbitrary-first',bounds:[0,0,14,16]},{id:'other-name',bounds:[18,0,32,16]}]};}
function interfaces(budget,{refuseSource=false,cancelAfterDecode}={}){
 const calls=[],correlations=[];let encoded=0,decoded=0,allowed=!refuseSource;
 return{calls,correlations,allowSource(){allowed=true;},sourceOwner:{release(){if(!allowed)throw 0;},assertCurrent(){}},
  async prepare(context){calls.push(['prepare',context.bounds]);const free=budget.reserve(3*512**2*4);return{input:new Float32Array(3*512**2).fill(context.bounds[0]===0?1:2),release:free};},
  cnn:{async encode(input){const index=++encoded;calls.push(['encode',index,input[0]]);const size=shapes.reduce((n,s)=>n+4*s.reduce((a,b)=>a*b,1),0),free=budget.reserve(size);return{values:Object.fromEntries(shapes.map((shape,i)=>['x'+(i+1),{shape,data:new Float32Array(shape.reduce((a,b)=>a*b,1)).fill(index)}])),release:free};},async decode(feeds){const index=decoded++;calls.push(['decode',index]);assert.equal(feeds.x1.data[0],index+1);assert.equal(feeds.x5.data[0],index+1);for(const [name,k,side]of [['c2',24,128],['c3',32,64],['c4',96,32]]){assert.deepEqual(feeds[name].shape,[1,k,side,side]);assert.equal(feeds[name].data[0],index===0?.25:.75);assert.equal(feeds[name].data.at(-1),index===0?.25:.75);}const free=budget.reserve(4*512**2),value={values:{probability:{shape:[1,1,512,512],data:new Float32Array(512**2).fill(index===0?.125:.875)}},release:free};cancelAfterDecode?.(decoded);return value;}},
  createCorrelation({maxWorkers,onOwner}){const api={async run({plan,input,nativeFma,backend,alpha}){assert.equal(maxWorkers,10);assert.equal(input[0],1);assert.equal(input[plan.contexts[1].offset],2);correlations.push({side:plan.side,nativeFma,backend,alpha,count:plan.count});const free=budget.reserve(4*plan.k*plan.count),data=Float32Array.from({length:plan.k*plan.count},(_,i)=>i%plan.count<plan.contexts[1].offset?.25:.75);return{data,release:free};},release(){}};onOwner?.(api);return api;}
 };
}
for(const backbone of [false,true])test('One CMSeg head keeps all three native common banks and each original spatial decoder (0NN,'+backbone+')',async()=>{
 const f=await fixture(),budget=new Budget(2*1024*MiB),i=interfaces(budget),model={id:'controlled0NN',...(backbone?{backbone:{native:true}}:{}),correlation:[{topk:24,alpha:2},{topk:32,alpha:3},{topk:96,alpha:4}]},head=createCmsegWindowContextHead({...f,model,backend:'webgpu',profile:{maxWorkers:10},budget,...i});let result;
 try{result=await head.run();assert.deepEqual(i.correlations,[{side:128,nativeFma:backbone,backend:'webgpu',alpha:2,count:32768},{side:64,nativeFma:backbone,backend:'cpu',alpha:3,count:8192},{side:32,nativeFma:backbone,backend:'cpu',alpha:4,count:2048}]);assert.equal(i.calls.filter(v=>v[0]==='encode').length,2);assert.equal(i.calls.filter(v=>v[0]==='decode').length,2);assert.deepEqual(result.contexts.map(v=>v.probability[0]),[.125,.875]);assert.deepEqual(result.receipt.nativeTopK,[24,32,96]);assert.equal(result.receipt.requestedMaxWorkers,10);}finally{await head.release();}assert.equal(budget.total(),0);
});
test('CMSeg head source ACK0 retains output credits until actual retry (0NN)',async()=>{
 const f=await fixture(),budget=new Budget(2*1024*MiB),i=interfaces(budget,{refuseSource:true}),head=createCmsegWindowContextHead({...f,model:{id:'controlled0NN',correlation:[{topk:24,alpha:2},{topk:32,alpha:3},{topk:96,alpha:4}]},backend:'cpu',profile:{maxWorkers:10},budget,...i});await head.run();let caught=false;try{await head.release();}catch(error){caught=true;assert.equal(error,0);}assert.ok(caught);assert.ok(budget.total()>0);i.allowSource();await head.release();assert.equal(budget.total(),0);
});
test('CMSeg cancellation after last native-shaped decoder does not publish partial output (0NN)',async()=>{
 const controller=new AbortController(),f=await fixture(),budget=new Budget(2*1024*MiB),i=interfaces(budget,{cancelAfterDecode:n=>{if(n===2)controller.abort();}}),head=createCmsegWindowContextHead({...f,model:{id:'controlled0NN',correlation:[{topk:24,alpha:2},{topk:32,alpha:3},{topk:96,alpha:4}]},backend:'cpu',profile:{maxWorkers:10},budget,...i,signal:controller.signal});await assert.rejects(head.run());await head.release();assert.equal(budget.total(),0);
});
