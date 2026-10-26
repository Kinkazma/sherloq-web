import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleCachedSource,hasCachedPreviewSamples,retireCachedPreviewSamples} from '../src/cached-parameter-preview.js';
test('pending predicate tracks the exact surface from read admission through its ACK',async()=>{
 let finish,entered;const ready=new Promise(r=>finish=r),started=new Promise(r=>entered=r),surface={async readSampledWindow(){entered();await ready;return{pixels:{width:1,height:1,format:'rgb8',data:new Uint8Array(3)},release(){}};}},image={surface};
 assert.equal(hasCachedPreviewSamples(image),false);const request=sampleCachedSource(image,{x:0,y:0,w:1,h:1,step:1});await started;assert.equal(hasCachedPreviewSamples(image),true);assert.equal(hasCachedPreviewSamples(surface),true);finish();await request;assert.equal(hasCachedPreviewSamples(image),false);await retireCachedPreviewSamples(image);
});
