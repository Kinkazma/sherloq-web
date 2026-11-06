import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
import {energyFrameBudget,assertEnergyFrameBudget} from '../sherloq-browser/assets/energy-frame-budget.js';
import {EngineError} from '../sherloq-browser/assets/unified-engine/src/errors.js';
const worker=await readFile(new URL('../sherloq-browser/assets/engine-worker.js',import.meta.url),'utf8'),start=worker.indexOf('async function renderNormalNativePreview('),end=worker.indexOf('function normalNativeCandidate(',start),renderer=worker.slice(start,end);
function fixture({available,restricted=false,refuseCopy=false}={}){
 const width=80,height=600,n=width*height,original=Uint8Array.from({length:n*3},(_,i)=>(i*17+Math.floor(i/(width*3)))%256),data={width,height,energy_labels:new Int32Array(n).fill(1),regionColors:[{id:1,rgb:[13,170,90]}],energy_scope:new Int32Array(n).fill(1),energy_low_score:new Float32Array(n).fill(.2),energy_high_score:new Float32Array(n).fill(.6)},analysis={data,...(restricted?{sourceRegionDomain:{kind:'membership'}}:{})},desc={width,height,surface:{id:'same-original',revision:7}},controller=new AbortController(),reads=[],metrics=[],sources=[];let onRead,renderCalls=0,surfaceCalls=0;
 const required=3*n+3*width*Math.min(256,height),scratchProof={leaseId:'real-owner-credit',reservedBytes:2*1024**2,ownedBytes:2*1024**2-(available??required),availableBytes:available??required};
 const read=async rect=>{reads.push({...rect});assert(rect.height<=256);const part=new Uint8Array(rect.width*rect.height*3);for(let row=0;row<rect.height;row++)part.set(original.subarray(((rect.y+row)*width+rect.x)*3,((rect.y+row)*width+rect.x+rect.width)*3),row*rect.width*3);await onRead?.(reads.length);return{width:rect.width,height:rect.height,format:'rgb8',data:part};};
 function CopyArray(length){if(refuseCopy&&length===3*n)throw new RangeError('Controlled optional RGB allocation refusal');return new Uint8Array(length);}CopyArray.prototype=Uint8Array.prototype;
 const ctx=vm.createContext({Uint8Array:CopyArray,RangeError,Number,Math,EngineError,engine:{async readPixels({surfaceId,revision,rect}){assert.equal(surfaceId,desc.surface.id);assert.equal(revision,desc.surface.revision);return{pixels:await read(rect)};}},consumerBudget:8*1024**2,lastPixels:null,energyFrameBudget,assertEnergyFrameBudget,ADAPTIVE_PREVIEW_MAX_PIXELS:4096**2,previewNow:()=>performance.now(),energySourceDescriptor:()=>desc,sourceRegionDomainShape:()=>restricted?'membership':'identity',cancelled:()=>new EngineError('CANCELLED','cancelled'),renderEnergy:async(d,source,p,options)=>{renderCalls++;sources.push(source);return renderEnergy(d,source,p,options);},renderEnergySurface:async()=>{surfaceCalls++;return{width,height,format:'rgb8',data:new Uint8Array(3*n)};}});new vm.Script(renderer).runInContext(ctx);
 return{width,height,n,data,analysis,original,desc,controller,reads,metrics,sources,required,scratchProof,renderCalls:()=>renderCalls,surfaceCalls:()=>surfaceCalls,onRead:fn=>onRead=fn,render:(view={view:'overlay',opacity:70},proof=scratchProof)=>ctx.renderNormalNativePreview(analysis,view,{signal:controller.signal,scratchProof:proof,onSourceRead:value=>metrics.push(value)}),reference:view=>renderEnergy(data,{width,height,data:original},view,{cooperate:async()=>{}})};
}
test('a funded temporary Original copy preserves RGB bytes and leaves no retained source data',async()=>{
 const h=fixture(),view={view:'overlay',opacity:70},expected=await h.reference(view);for(let i=0;i<2;i++){const actual=await h.render(view);assert.deepEqual(actual.data,expected.data);assert.equal(h.sources.at(-1).data,undefined,'the local Original buffer is removed after render');assert.equal(h.metrics.at(-1).copyBytes,3*h.n);assert.equal(h.metrics.at(-1).scratchProof.requiredBytes,h.required);assert.equal(h.metrics.at(-1).scratchProof.copyAdmitted,true);assert(h.metrics.at(-1).sourceReadMs>=0);}assert.equal(h.reads.length,2*Math.ceil(h.height/256),'a later render reads again instead of retaining Original RGB');assert(h.reads.every(r=>r.height<=256));
});
test('insufficient financed surplus keeps the existing row reader and identical RGB',async()=>{
 const h=fixture(),view={view:'overlay',opacity:70},proof={...h.scratchProof,availableBytes:h.required-1,ownedBytes:h.scratchProof.reservedBytes-h.required+1},actual=await h.render(view,proof),expected=await h.reference(view);assert.deepEqual(actual.data,expected.data);assert.equal(h.metrics[0].copyBytes,0);assert.equal(h.metrics[0].scratchProof.copyAdmitted,false);assert.equal(h.sources[0].data,undefined);assert.equal(h.reads.length,Math.ceil(h.height/256));
});
test('labels and score maps do not read Original even when its temporary copy is funded',async()=>{
 for(const view of [{view:'labels',opacity:70},{view:'scores',field:'high',scoreView:'map',threshold:.1}]){const h=fixture(),actual=await h.render(view),expected=await h.reference(view);assert.deepEqual(actual.data,expected.data);assert.equal(h.reads.length,0);assert.equal(h.metrics[0].copyBytes,0);assert.equal(h.metrics[0].sourceReadMs,0);}
});
test('score overlays including Both keep their byte-exact native presentation with the financed Original',async()=>{
 for(const field of ['high','both']){const h=fixture(),view={view:'scores',field,scoreView:'overlay',threshold:.1},actual=await h.render(view),expected=await h.reference(view);assert.deepEqual(actual.data,expected.data);assert.equal(actual.width,h.width*(field==='both'?2:1));assert.equal(h.metrics[0].copyBytes,3*h.n);assert.equal(h.sources[0].data,undefined);}
});
test('restricted or surface candidates retain their existing renderer and source policy',async()=>{
 const h=fixture({restricted:true}),view={view:'overlay',opacity:70},actual=await h.render(view),expected=await h.reference(view);assert.deepEqual(actual.data,expected.data);assert.equal(h.metrics[0].copyBytes,0);const s=fixture();s.analysis.planeSurfaces={energy_low_score:{id:'native-low'}};await s.render();assert.equal(s.surfaceCalls(),1);assert.equal(s.renderCalls(),0);assert.equal(s.reads.length,0);assert.equal(s.metrics[0].copyBytes,0);
});
test('cancellation during a copy never reaches rendering or publishes a retained Original buffer',async()=>{
 const h=fixture();h.onRead(count=>{if(count===2)h.controller.abort();});await assert.rejects(h.render(),{code:'CANCELLED'});assert.equal(h.reads.length,2);assert.equal(h.renderCalls(),0);assert.equal(h.sources.length,0);assert.equal(h.metrics.length,1);assert.equal(h.metrics[0].copyBytes,3*h.n);assert(!Object.values(h.metrics[0]).some(ArrayBuffer.isView));
});

test('a refused optional RGB constructor falls back to identical rows without changing the financed credit',async()=>{
 const h=fixture({refuseCopy:true}),view={view:'overlay',opacity:70},proof=Object.freeze(h.scratchProof),before=JSON.stringify(proof),actual=await h.render(view,proof),expected=await h.reference(view);assert.deepEqual(actual.data,expected.data);assert.equal(h.metrics[0].copyBytes,0);assert.equal(h.metrics[0].sourceCopyDeclined,'allocation');assert.equal(h.metrics[0].scratchProof.copyAdmitted,false);assert.equal(JSON.stringify(proof),before);assert.equal(h.sources[0].data,undefined);assert.equal(h.reads.length,Math.ceil(h.height/256));
});
