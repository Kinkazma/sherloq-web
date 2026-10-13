import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectIndividualSubimages,individualSubimageProvenance} from '../sherloq-browser/assets/individual-subimages.js';
import {neuralSelection} from '../sherloq-browser/assets/tool-catalog.js';
import {subimageData} from '../../engine-source/src/auto-zones.js';

const geometry={width:200,height:120,sourceSha256:'f'.repeat(64)};
const data={coordinates:'original-pixel-centres',boundsConvention:'half-open',regions:[{id:'a',bounds:[10,11,51,62]},{id:'b',bounds:[100,12,155,63]}],polygons:[[[10,11],[50,11],[50,61],[10,61]],[[100,12],[154,12],[154,62],[100,62]]]};
test('Neural selection uses half-open panel bounds without a common envelope, classification or model inference',async()=>{
 const before=structuredClone(data);let calls=0;
 const client={async detectSubimages(){calls++;return data;},run(){throw Error('No clone computation during detection.');}};
 const rectangles=await detectIndividualSubimages(client,{...geometry,neural:true});
 assert.equal(calls,1);assert.equal(rectangles.length,2);assert.ok(rectangles.every(r=>!r.envelope));assert.deepEqual(data,before);
 assert.deepEqual(neuralSelection(rectangles,'regions',true),{params:{selectionPresent:true},regions:data.regions.map(r=>({...r,kind:'region'}))});
 const provenance=individualSubimageProvenance(rectangles,geometry);assert.equal(provenance.sourceSha256,geometry.sourceSha256);assert.equal(provenance.boundsConvention,'half-open');assert.equal(provenance.proposals.length,2);
 assert.equal(individualSubimageProvenance(rectangles,{...geometry,sourceSha256:'a'.repeat(64)}),null);
 assert.equal(individualSubimageProvenance(rectangles,{...geometry,width:201}),null);
});
test('Existing sparse detection retains its envelope and empty detection has no whole-image fallback',async()=>{
 const rectangles=await detectIndividualSubimages({detectSubimages:async()=>data},geometry);
 assert.equal(rectangles.length,3);assert.equal(rectangles[2].envelope,true);assert.equal(rectangles[0].detection,undefined);
 assert.deepEqual(await detectIndividualSubimages({detectSubimages:async()=>({regions:[]})},{...geometry,neural:true}),[]);
});
test('Malformed detector bounds/polygons are refused without rounding or clipping their identity',async()=>{
 for(const bad of [
  {...data,boundsConvention:'closed'},
  {regions:[{bounds:[1.5,2,50,51]}]},
  {regions:[{bounds:[0,0,201,10]}]},
  {regions:[{bounds:[4,4,4,10]}]},
  {regions:[{id:'same',bounds:[1,1,2,2]},{id:'same',bounds:[3,3,4,4]}]},
  {...data,polygons:[[[10,11],[51,11],[50,61]],data.polygons[1]]},
 ])await assert.rejects(detectIndividualSubimages({detectSubimages:async()=>bad},{...geometry,neural:true}),e=>e.code==='INVALID_INPUT');
});
test('Actual native flat-gutter detector returns original panels consumed unchanged by neural ROI selection',async()=>{
 const width=200,height=120,pixels=new Uint8Array(width*height*3).fill(255);
 for(const [x0,y0,x1,y1]of [[12,17,80,99],[110,17,178,99]])for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const at=(y*width+x)*3;pixels[at]=30+(x*7+y*3)%90;pixels[at+1]=60+(x*3+y*11)%100;pixels[at+2]=20+(x+y*5)%100;
 }
 const before=pixels.slice();const native=await subimageData({width,height,format:'rgb8',data:pixels},{},{},{reserveMemory(){}});
 assert.equal(native.data.regions.length,2);const rectangles=await detectIndividualSubimages({detectSubimages:async()=>native.data},{width,height,sourceSha256:geometry.sourceSha256,neural:true});
 assert.deepEqual(neuralSelection(rectangles,'regions',true).regions.map(r=>r.bounds),native.data.regions.map(r=>r.bounds));assert.deepEqual(pixels,before);
});
