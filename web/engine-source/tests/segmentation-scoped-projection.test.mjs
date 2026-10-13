import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentationZones} from '../experiments/segmentation/zones.js';
import {segmentedNeuralProjection} from '../src/segmented-neural-projection.js';
import {compileForgeryscopeScientificScope} from '../src/forgeryscope-scientific-scope.js';

test('exact original-coordinate holes remain empty after neural projection and overlap composition; raw grids and context flags remain truthful',async()=>{
 const width=40,height=32,bounds=[8,4,32,28],raw=new Float32Array(24**2).fill(.875),before=raw.slice(),sourceSha256='a'.repeat(64);
 const scope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',status:'ready',sourceSha256,width,height,fingerprint:'b'.repeat(64),regions:[{x0:8,y0:4,x1:31,y1:27}],excluded:[[[12,10],[20,10],[16,19]],[[23,8],[24,8],[24,23],[23,23]]]};
 const scientificScope={scope,sourceSha256,identity:JSON.stringify(scope),policy:'native-candidate-domain-v2'},input={width,height,side:512,kind:'sigmoid',zones:[{id:'a',bounds,raw,rawWidth:24,rawHeight:24},{id:'overlap',bounds,raw:raw.slice(),rawWidth:24,rawHeight:24}],scientificScope},budget=new Budget(64*1024**2),spatial={run(){assert.fail('Original native grids must not be resampled');}};
 const contiguous=await createSegmentationZones({budget,spatial}).run(input),stored=await segmentedNeuralProjection({...input,family:'segmentation'},{budget,spatial});
 try{
  const compiled=compileForgeryscopeScientificScope(scope,{width,height,sourceSha256}),map=new Float32Array(width*height),mask=new Uint8Array(map.length),analyzed=new Uint8Array(map.length);
  for(let y=bounds[1];y<bounds[3];y++)for(let x=bounds[0];x<bounds[2];x++){const i=y*width+x;analyzed[i]=1;if(compiled.admits(x,y)){map[i]=.875;mask[i]=1;}}
  for(const [name,expected]of Object.entries({map,mask,analyzed})){
   assert.deepEqual(contiguous[name],expected);const output=new Uint8Array(expected.byteLength);await stored.stores[name].readInto(output);assert.deepEqual(output,new Uint8Array(expected.buffer));
  }
  assert.equal(contiguous.mask[12*width+16],0);assert.equal(contiguous.analyzed[12*width+16],1,'An excluded candidate still belonged to the original convolution context');
  assert.match(contiguous.metadata.scientificProjection.analyzedMeaning,/context coverage/);assert.deepEqual(raw,before);assert.deepEqual(input.zones[1].raw,before);
 }finally{contiguous.release();await stored.dispose();}assert.equal(budget.total(),0);
});

test('projection rejects source identity mismatch before allocating stores or changing a native grid',async()=>{
 const budget=new Budget(64*1024**2),raw=new Float32Array(8*8).fill(.75),scope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',status:'ready',sourceSha256:'a'.repeat(64),width:8,height:8,fingerprint:'b'.repeat(64),regions:[{x0:0,y0:0,x1:8,y1:8}],excluded:[]};
 const input={width:8,height:8,side:512,kind:'sigmoid',mode:'whole-image',zones:[{id:'image',bounds:[0,0,8,8],raw,rawWidth:8,rawHeight:8}],scientificScope:{scope,sourceSha256:'c'.repeat(64),identity:'wrong',policy:'native-candidate-domain-v2'}};
 await assert.rejects(createSegmentationZones({budget,spatial:{run(){assert.fail();}}}).run(input),/source identity/);
 await assert.rejects(segmentedNeuralProjection({...input,family:'segmentation'},{budget}),/source identity/);assert.equal(budget.total(),0);assert.ok(raw.every(v=>v===.75));
});
