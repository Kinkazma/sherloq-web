import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {prepareSegmentationScientificMask} from '../src/segmentation-scientific-scope.js';
const sha='a'.repeat(64),scope=(excluded=[],width=512,height=512)=>({schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',status:'ready',sourceSha256:sha,width,height,fingerprint:'b'.repeat(64),regions:[{x0:0,y0:0,x1:width,y1:height}],excluded});
const context=s=>({scope:s,width:s.width,height:s.height,sourceSha256:sha,bounds:[0,0,s.width,s.height]});
test('native-cell domains preserve complete admission, original coordinates and a hash of the actual admission grid',async()=>{
 const budget=new Budget(1024**2),s=scope(),original=structuredClone(s);assert.equal(await prepareSegmentationScientificMask(undefined),null);
 const d=await prepareSegmentationScientificMask(context(s),{rows:64,inputSide:512,originX:0,originY:0,strideX:8,strideY:8,budget});assert.equal(d.admitted,4096);assert.equal(d.partial,false);assert.equal(d.metadata.gridSha256,createHash('sha256').update(d.values).digest('hex'));assert.deepEqual(s,original);d.release();assert.equal(budget.total(),0);
});
test('thin oblique excluded polygons inside a latent cell refuse it even with an admitted centre and corners',async()=>{
 const budget=new Budget(1024**2),s=scope([[[5,5],[5.25,5],[6.25,6],[6,6]]]),d=await prepareSegmentationScientificMask(context(s),{rows:64,inputSide:512,originX:0,originY:0,strideX:8,strideY:8,interpolation:'selfdm-opencv-linear',budget});assert.equal(d.values[65],0);assert.equal(d.values[0],1);assert(d.admitted<4096);assert.equal(d.metadata.interpolation,'selfdm-opencv-linear');d.release();assert.equal(budget.total(),0);
});
test('Pillow antialias and OpenCV linear source support are explicit, not a claimed CNN receptive field',async()=>{
 const budget=new Budget(1024**2),s=scope([[[12,0],[13,0],[13,2048],[12,2048]]],2048,2048),results=[];
 for(const interpolation of ['pillow-bilinear','selfdm-opencv-linear']){const d=await prepareSegmentationScientificMask(context(s),{rows:64,inputSide:512,originX:0,originY:0,strideX:8,strideY:8,interpolation,budget});assert(d.admitted<4096);assert.match(d.metadata.cnnContext,/unchanged/);results.push(d.values.slice());d.release();}
 assert.equal(budget.total(),0);
});
test('OpenCV interpolation actually bypasses Pillow antialias support rather than merely changing its label',async()=>{
 const budget=new Budget(1024**2),s=scope([[[4,0],[4.1,0],[4.1,2048],[4,2048]]],2048,2048),values=[];
 for(const interpolation of ['pillow-bilinear','selfdm-opencv-linear']){const d=await prepareSegmentationScientificMask(context(s),{rows:1,columns:512,inputSide:512,originX:0,originY:0,strideX:1,strideY:1,interpolation,budget});values.push(d.values[0]);d.release();}
 assert.deepEqual(values,[0,1]);assert.equal(budget.total(),0);
});
test('cancellation, invalid centre conventions and admission failures retain no grids',async()=>{
 const budget=new Budget(1024**2),controller=new AbortController();controller.abort();await assert.rejects(prepareSegmentationScientificMask(context(scope()),{rows:64,inputSide:512,budget,signal:controller.signal}),{code:'CANCELLED'});assert.equal(budget.total(),0);
 await assert.rejects(prepareSegmentationScientificMask(context(scope()),{rows:64,inputSide:512,strideX:0,budget}),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);
 const tiny=new Budget(16);await assert.rejects(prepareSegmentationScientificMask(context(scope()),{rows:64,inputSide:512,budget:tiny}),{code:'MEMORY_LIMIT'});assert.equal(tiny.total(),0);
});
