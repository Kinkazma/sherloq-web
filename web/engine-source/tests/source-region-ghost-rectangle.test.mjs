import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {createSourceRegionRecord} from '../src/source-region-record.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {segmentedGhostMaps,segmentedGhostShape} from '../src/segmented-ghosts.js';
import {ghostMaps,ghostParams,ghostView} from '../src/ghost-maps.js';
import {jpegCodec} from '../src/jpeg.js';
const sha='a'.repeat(64);
test('native rectangle Ghosts matches the independent maintained RGB crop across circular phases and odd borders',async()=>{
 const budget=new Budget(256*1024**2),width=99,height=83,pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>(i*73+(i>>>5)*19)&255)},surface=contiguousSurface(pixels,budget),original={surface,sha256:sha},state=await createOriginalSourceRegionsState({width,height,sourceSha256:sha});await state.add('acquisition',{x0:5,y0:7,x1:96,y1:80});const domain=await compileOriginalSourceRegions(state.snapshot()),derived=createSourceRegionRecord(original,domain,{budget}),data=new Uint8Array(domain.width*domain.height*3);for(let y=0;y<domain.height;y++)data.set(pixels.data.subarray(((y+7)*width+5)*3,((y+7)*width+96)*3),y*domain.width*3);const independent={width:domain.width,height:domain.height,format:'rgb8',data};
 try{for(const [x,y]of[[0,0],[7,3]]){const p=ghostParams({low:25,high:75,step:20,x,y,grayscale:false,includeOriginal:false}),release=budget.reserve(segmentedGhostShape(derived,p).admissionBytes);try{const actual=await segmentedGhostMaps(derived,p,{budget,maxWorkers:4}),expected=await ghostMaps(independent,p,{},{codec:jpegCodec});for(const key of ['qualities','raw','maps'])assert.deepEqual(actual.data[key],expected.data[key],key+' at phase '+x+','+y);for(const key of ['cols','rows','blockSize','layout','roll','sourceDimensions','completeExtent'])assert.deepEqual(actual.data[key],expected.data[key],key);await ghostView(actual,p,{},{});await ghostView(expected,p,{},{});assert.deepEqual(actual.data.views,expected.data.views);const science=actual.data.raw.slice();await ghostView(actual,{...p,grayscale:true},{},{});assert.deepEqual(actual.data.raw,science,'presentation must not change native raw energies');}finally{release();}}
 }finally{await derived.rgbRecompression?.dispose();await derived.surface.dispose();await surface.dispose();}assert.equal(budget.active,0);assert.equal(budget.retained,0);
});
