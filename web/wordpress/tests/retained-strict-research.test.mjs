import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRetainedParameters,renderRetainedWindow,renderRetainedPreview} from '../sherloq-browser/assets/retained-parameter-preview.js';
import {renderResearch} from '../../engine-source/src/research-view.js';
import {strictResearchFixture,sampleWindow} from '../../engine-source/tests/helpers/strict-research-fixture.mjs';
for(const method of ['focal','adaifl'])for(const mode of ['overlay','map',...(method==='adaifl'?['mask']:[])])test(method+' '+mode+' retained final and adaptive proxy use the same native fragment maps',async()=>{
 const h=strictResearchFixture(method),operation='ai.localization.'+method,output={id:'owned-research',operation,data:h.data,provenance:{params:{}},metrics:{}},updated=updateRetainedParameters({output,operation,view:{mode}});assert(updated);assert.equal(updated.parameterViews[0].retainedParameterView.nativeData,h.data);assert.equal(updated.metrics.previewCommit.nativeAnalysisCalls,0);
 const expected=(await renderResearch(h.pixels,h.data,{mode},{reserveMemory:()=>{}})).pixels;
 for(const step of [1,2,3]){const tile={x:1,y:1,w:10,h:6,step},pixels=await renderRetainedWindow({display:updated.parameterViews[0],tile,readSource:r=>sampleWindow(h.pixels,r)});assert.deepEqual(pixels,sampleWindow(expected,tile));}
 const preview=await renderRetainedPreview({output,operation,view:{mode},source:h.pixels,maxSide:12,readSource:g=>sampleWindow(h.pixels,{w:g.w,h:g.h,step:g.step})});assert(preview);assert.deepEqual(preview.pixels.data,expected.data);
});
