import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../sherloq-browser/assets/engine-worker.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('async function energyView('),source.indexOf('async function disposeParameterPreview('));

async function render({preview={maxWidth:4096,maxHeight:4096},scoped=false,surface=true,admittedSide=3072,both=false,initialSide=4096}={}){
 const memory={policyAvailableBytes:123456789,knownHeapCapacityBytes:33554432},analysis={imageId:'source',data:{width:3822,height:7716},...(surface?{planeSurfaces:{}}:{})},presentation={view:'scores',field:both?'both':'high',threshold:17},calls=[];
 const context=vm.createContext({lastEnergy:analysis,lastPixels:null,energyMaxima:{},energySignedRanges:{},controller:new AbortController(),contextEnergyView:null,consumerBudget:1000000000,
  energySourceDescriptor:a=>{assert.equal(a,analysis);return{width:3822,height:7716,surface:{id:'original',revision:1}};},
  isEnergyContextCollection:()=>scoped,energyContextOptions:()=>({sourceFragment:'fragment'}),
  previewBounds:p=>Math.min(p.maxWidth,p.maxHeight),
  engine:{capabilities(){calls.push({kind:'memory'});return{memory};},samplePlane(){},readDisplay(){}},
  admitEnergySurfacePreview(a,p,options){assert.equal(a,analysis);assert.equal(p,presentation);assert.equal(options.memory,memory);assert.equal(options.directNumericSampling,true);assert.equal(options.rgbBudgetReserved,true);calls.push({kind:'admission',options});return{maxSide:admittedSide,constrainedByMemory:admittedSide<4096,requiredBytes:1000,availableBytes:memory.policyAvailableBytes};},
  adaptivePreviewPlan(p,width,height,key,identity,sampling){calls.push({kind:'plan',preview:p,width,height,key,sampling});return{side:Math.min(p.maxWidth,p.maxHeight,initialSide),key};},
  previewNow:()=>0,energyFrameBudget:p=>{calls.push({kind:'rgb',plan:p});return p;},assertEnergyFrameBudget(){},windowPixels(){},
  renderEnergySurface:async(a,s,p,options)=>{calls.push({kind:'surface',options});return{width:100,height:200};},
  renderEnergy:async(a,s,p,options)=>{calls.push({kind:'contiguous',options});return{width:100,height:200};},
  createEnergyContextView:()=>({render:async(a,p,options)=>{calls.push({kind:'scoped',options});return{width:100,height:200};}}),
  observePreview:(plan,started,pixels)=>({token:{side:plan.side},pixels:pixels.width*pixels.height})
 });
 new vm.Script(body).runInContext(context);
 const before=JSON.stringify({analysis,presentation,preview});
 const pixels=await context.energyView(presentation,preview);
 assert.equal(JSON.stringify({analysis,presentation,preview}),before,'admission never rewrites source, scientific data or settings');
 return{calls,pixels};
}

test('actual adaptive surface grid is admitted before both RGB and render admission',async()=>{
 const{calls,pixels}=await render();assert.deepEqual(calls.map(c=>c.kind),['plan','memory','admission','plan','rgb','surface']);
 const plan=calls.filter(c=>c.kind==='plan').at(-1),rgb=calls.find(c=>c.kind==='rgb'),surface=calls.find(c=>c.kind==='surface');
 assert.equal(plan.preview.maxWidth,3072);assert.equal(plan.preview.maxHeight,3072);assert.equal(plan.sampling,'proportional');
 assert.equal(rgb.plan.preview.maxWidth,3072);assert.equal(surface.options.preview.maxWidth,3072);assert.equal(surface.options.rgbBudgetReserved,true);
 assert.equal(pixels.previewMemoryAdmission.constrainedByMemory,true);assert.equal(pixels.adaptivePreview.token.side,3072);
});
test('a fully admitted side is preserved and both-score logical width is unchanged',async()=>{
 const{calls,pixels}=await render({admittedSide:4096,both:true});const plan=calls.find(c=>c.kind==='plan');
 assert.equal(plan.width,7644);assert.equal(plan.height,7716);assert.equal(plan.preview.maxWidth,4096);assert.equal(pixels.previewMemoryAdmission.constrainedByMemory,false);
});
test('the selected sampled grid is checked even when its requested bound could have used cheap native bands',async()=>{
 const{calls,pixels}=await render({initialSide:4000,admittedSide:3000});const admission=calls.find(c=>c.kind==='admission');
 assert.equal(admission.options.preview.maxWidth,4000);assert.equal(admission.options.preview.maxHeight,4000);assert.equal(pixels.adaptivePreview.token.side,3000);
});
test('native results never run provisional workspace admission or reduce their grid',async()=>{
 const{calls,pixels}=await render({preview:null});assert.deepEqual(calls.map(c=>c.kind),['rgb','surface']);
 assert.equal(calls[0].plan.preview,null);assert.equal(calls[1].options.preview,undefined);assert.equal(pixels.previewMemoryAdmission,undefined);
});
test('contiguous and scoped context paths retain their existing admission routes',async()=>{
 for(const spec of[{surface:false},{scoped:true}]){const{calls,pixels}=await render(spec);assert.equal(calls.some(c=>c.kind==='memory'||c.kind==='admission'),false);assert.equal(calls.find(c=>c.kind==='plan').preview.maxWidth,4096);assert.equal(pixels.previewMemoryAdmission,undefined);}
});
