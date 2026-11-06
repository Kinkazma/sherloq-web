import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {EngineError} from '../sherloq-browser/assets/unified-engine/src/errors.js';
import {energyFrameBudget,assertEnergyFrameBudget} from '../sherloq-browser/assets/energy-frame-budget.js';
const source=await readFile(new URL('../sherloq-browser/assets/engine-worker.js',import.meta.url),'utf8');
const part=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const energyView=part('async function energyView(','async function disposeParameterPreview('),snapshot=part('function immutablePreviewPixels(','async function automaticEla('),display=part('function resultDisplay(','function energySourceDescriptor(');
const branchStart=source.indexOf("}else if(action==='view-energy'){")+"}else if(action==='view-energy'){".length,branch=source.slice(branchStart,source.indexOf("}else if(action==='energy-histogram')",branchStart));
function fixture({reduced=false}={}){
 const width=64,height=48,nativeScores=Float32Array.of(.25,.5,.75),scientific={id:'native-result',imageId:'original',data:{width,height,nativeScores},provenance:{originalSha256:'same-source'}},rendered={width:reduced?32:width,height:reduced?24:height,format:'rgb8',data:new Uint8Array((reduced?32*24:width*height)*3).fill(41),presentation:{nativeResolution:!reduced,view:'scores',threshold:.2},preview:reduced,...(reduced?{logicalWidth:width,logicalHeight:height}:{})};
 const ctx=vm.createContext({EngineError,energyFrameBudget,assertEnergyFrameBudget,ADAPTIVE_PREVIEW_MAX_SIDE:4096,Number,Math,Uint8Array,Float32Array,lastEnergy:scientific,lastPixels:null,displayRevision:0,parameterDraft:true,parameterDraftKind:'energy',consumerBudget:32*1024**2,controller:new AbortController(),energyMaxima:{},energySignedRanges:{},engine:{},energySourceDescriptor:()=>({width,height,surface:{id:'source'}}),isEnergyContextCollection:()=>false,adaptivePreviewPlan:()=>({side:reduced?32:64,token:{id:1}}),previewNow:()=>0,windowPixels:()=>{throw Error('Renderer fixture must not read source');},renderEnergy:async()=>rendered,renderEnergySurface:async()=>rendered,observePreview:()=>({token:{id:1},milliseconds:1}),cancelled:()=>Object.assign(Error('cancelled'),{code:'CANCELLED'})});
 new vm.Script(energyView+snapshot+display+`\nasync function dispatch(payload){let result;${branch}\nreturn result;}globalThis.dispatch=dispatch;`).runInContext(ctx);
 return{ctx,rendered,scientific,nativeScores};
}
test('full native-size held Energy view is still an inline immutable provisional RGB snapshot',async()=>{
 const h=fixture(),before=h.nativeScores.slice(),answer=await h.ctx.dispatch({resultId:'native-result',presentation:{view:'scores',threshold:.2},preview:{adaptive:true}});assert.equal(answer.display.preview,true);assert.equal(answer.pixels.preview,true);assert.equal(answer.pixels.width,64);assert.equal(answer.pixels.height,48);assert.equal(answer.pixels.logicalWidth,64);assert.equal(answer.pixels.logicalHeight,48);assert.notEqual(answer.pixels.data,h.rendered.data);assert.equal(answer.pixels.data.length,64*48*3);assert.deepEqual(h.nativeScores,before);assert.equal(h.ctx.lastEnergy,h.scientific);assert.equal(h.ctx.parameterDraft,true,'A provisional view must not clear native export guard');h.rendered.data.fill(99);assert.ok(answer.pixels.data.every(v=>v===41),'A newer worker render cannot overwrite the already returned RGB');
});
test('exact final Energy view keeps its remote native display and clears the draft guard',async()=>{
 const h=fixture(),answer=await h.ctx.dispatch({resultId:'native-result',presentation:{view:'scores',threshold:.2}});assert.equal(answer.pixels,undefined);assert.equal(answer.display.preview,undefined);assert.equal(answer.display.width,64);assert.equal(answer.display.height,48);assert.equal(h.ctx.parameterDraft,false);assert.equal(h.ctx.parameterDraftKind,null);
});
test('sampled Energy view preserves native logical geometry in its bounded inline snapshot',async()=>{
 const h=fixture({reduced:true}),answer=await h.ctx.dispatch({resultId:'native-result',presentation:{view:'scores',threshold:.2},preview:{adaptive:true}});assert.equal(answer.pixels.width,32);assert.equal(answer.pixels.height,24);assert.equal(answer.pixels.logicalWidth,64);assert.equal(answer.pixels.logicalHeight,48);assert.equal(answer.display.width,64);assert.equal(answer.display.height,48);assert.equal(answer.display.previewStep,2);assert.notEqual(answer.pixels.data,h.rendered.data);
});
test('stale retained Energy id never renders or returns an inline frame',async()=>{
 const h=fixture();await assert.rejects(h.ctx.dispatch({resultId:'different',preview:{adaptive:true}}),/Stale energy result/);assert.equal(h.ctx.lastPixels,null);assert.equal(h.ctx.displayRevision,0);
});
