import test from 'node:test';import assert from 'node:assert/strict';
import {parameterPreviewPolicy} from '../sherloq-browser/assets/parameter-preview-policy.js';
import {projectParameterPreviewParams,createParameterPreview} from '../sherloq-browser/assets/tool-parameter-preview.js';
test('every Noisesniffer setting commits natively and offers retained/adaptive or distinct cold previews',()=>{
 for(const key of ['blockSize','cellSize','samplesPerBin','lowFrequencyFraction','lowNoiseFraction','view']){const p=parameterPreviewPolicy('noise.noisesniffer',key);assert.equal(p.kind,'retained');assert.equal(p.strategy,'noisesniffer-native-cache');assert.equal(p.targetMs,50);assert.equal(p.final,'native');assert.equal(p.fallback,'pixel-proxy');}
});
test('only spatial cell support is projected for the sampled draft; native parameters are unchanged',()=>{
 const input={blockSize:7,cellSize:100,samplesPerBin:20000,lowFrequencyFraction:.1,lowNoiseFraction:.5,view:'mask'},before=structuredClone(input),answer=projectParameterPreviewParams('noise.noisesniffer',input,{width:200,height:100,logicalWidth:2000,logicalHeight:1000});assert.equal(answer.params.cellSize,10);for(const key of Object.keys(input).filter(k=>k!=='cellSize'))assert.equal(answer.params[key],input[key]);assert.deepEqual(input,before);
});
test('cold Noisesniffer draft has its own encoded source and never receives a native result or scientific output',async()=>{
 let loaded,runs=0,released=0;const input={width:12,height:10,format:'rgb8',data:new Uint8Array(360).fill(70)},preview=createParameterPreview({side:128,readSource:async()=>({pixels:input,sourceIdentity:'native',logicalWidth:120,logicalHeight:100}),engineFactory:async()=>({load:async value=>{loaded=value;return{id:value.id,surface:{id:'draft-source',revision:1,width:12,height:10,format:'rgb8'}};},run:async()=>{runs++;return{pixels:input};},dispose:async()=>{}}),reserve:async()=>({id:1}),release:async()=>{released++;}});
 const params={blockSize:3,cellSize:100,samplesPerBin:20000,lowFrequencyFraction:.1,lowNoiseFraction:.5,view:'mask'},answer=await preview.preview({operation:'noise.noisesniffer',params,sourceIdentity:'native',logicalWidth:120,logicalHeight:100});assert.notEqual(loaded.id,'native');assert.equal(loaded.provenance.derived,true);assert.ok(loaded.bytes.length>360);assert.equal(answer.data,undefined);assert.equal(answer.exact,false);assert.equal(answer.metrics.scientificFinalChanged,false);assert.match(answer.metrics.analysisApproximation,/provisional/);assert.equal(runs,1);await preview.dispose();assert.equal(released,1);
});
