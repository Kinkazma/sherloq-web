import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {prepareEnergy} from '../src/energy-prepare.js';
import {segmentEnergy} from '../src/energy-segment.js';
import {referenceLogFunction} from '../src/energy-log-reference.js';
import {energyLogData} from '../src/energy-log-data.js';
const log=referenceLogFunction({minimumBits:973078528,maximumBits:1157627904},new Uint8Array(energyLogData().buffer));

test('scale1 remains the native area gate; a tiled scale2 grid preserves physical strong/minimum support and exact admission',async()=>{
 const w=8,h=8,n=w*h,low=new Float32Array(n),high=new Float32Array(n),scope=new Int32Array(n).fill(7);for(let y=0;y<3;y++)for(let x=0;x<4;x++)low[y*w+x]=5;
 const base={width:w,height:h,energy_scope:scope,energy_low_score:low,energy_high_score:high,energy_summary:[{id:7,bbox:[0,0,w,h]}],metadata:{block:4}},small=await segmentEnergy(base,{minimum:3,thresholds:[5,5]},{draftSpatialScale:2});assert.equal(small.regions[0].pixels,12);assert.equal(small.regions[0].strong_pixels,12);
 const big={...base,width:w*2,height:h*2,energy_scope:new Int32Array(n*4).fill(7),energy_low_score:new Float32Array(n*4),energy_high_score:new Float32Array(n*4),energy_summary:[{id:7,bbox:[0,0,w*2,h*2]}]};for(let y=0;y<h*2;y++)for(let x=0;x<w*2;x++)big.energy_low_score[y*w*2+x]=low[Math.floor(y/2)*w+Math.floor(x/2)];
 const native=await segmentEnergy(big,{minimum:3,thresholds:[5,5]}),explicit=await segmentEnergy(big,{minimum:3,thresholds:[5,5]},{draftSpatialScale:1});assert.deepEqual(native,explicit);assert.equal(native.regions[0].pixels,48);assert.equal(native.regions[0].strong_pixels,48);for(let y=0;y<h*2;y++)for(let x=0;x<w*2;x++)assert.equal(native.labels[y*w*2+x],small.labels[Math.floor(y/2)*w+Math.floor(x/2)]);
 low[2*w+3]=0;assert.equal((await segmentEnergy(base,{minimum:3,thresholds:[5,5]},{draftSpatialScale:2})).regions.length,0,'one missing coarse support falls below48native pixels');await assert.rejects(segmentEnergy(base,{}, {draftSpatialScale:0}),{code:'INVALID_INPUT'});
});
test('draft minimum support and original panel IDs retain holes and never allow a later overlapping panel to overwrite another identity',async()=>{
 const width=8,height=4,n=width*height,image={width,height,format:'rgb8',data:new Uint8Array(3*n).fill(100)},planes=new Float32Array(3*n).fill(1),scope=Int32Array.from({length:n},(_,i)=>i===0?0:i===1?-1:i%width<4?17:29),polygons=[[[0,0],[7,0],[7,3],[0,3]],[[0,0],[7,0],[7,3],[0,3]]];
 const native=await prepareEnergy(image,planes,[.01,.99],log,{panelDetector:async()=>[polygons[0]]});assert.equal(native.energy_summary.length,0,'native minimum64 remains unchanged');
 const draft=await prepareEnergy(image,planes,[.01,.99],log,{panelDetector:async()=>polygons,minimumPanelSamples:1,draftSourceScope:scope,panelIds:[17,29]});assert.deepEqual(draft.energy_summary.map(p=>p.id),[17,29]);for(let i=0;i<n;i++)assert.equal(draft.energy_scope[i],Math.max(0,scope[i]));assert.equal(draft.energy_low_score[0],0);assert.equal(draft.energy_high_score[1],0);await assert.rejects(prepareEnergy(image,planes,[.01,.99],log,{minimumPanelSamples:0}),{code:'INVALID_INPUT'});
});

// The declared native corpus may be supplied by CI or by a local resource root;
// it is borrowed in place and is not duplicated into the source tree.
const fixtureRoot=process.env.SHERLOQ_ENERGY_FIXTURES?pathToFileURL(process.env.SHERLOQ_ENERGY_FIXTURES.replace(/\/?$/,'/')):new URL('../fixtures/ela-energy/',import.meta.url);
let corpus=false;try{await access(new URL('segmentation.json',fixtureRoot));await access(new URL('preparation.json',fixtureRoot));corpus=true;}catch{}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('default hooks preserve all native segmentation labels/regions and preparation score/scope/statistic bytes',{skip:!corpus},async()=>{
 for(const type of ['segmentation','preparation']){const ref=JSON.parse(await readFile(new URL(type+'.json',fixtureRoot))),compressed=await readFile(new URL(ref.payload.file,fixtureRoot)),payload=gunzipSync(compressed),bytes=p=>payload.subarray(p.offset,p.offset+p.length),typed=(p,Type)=>{const b=bytes(p);return new Type(b.buffer,b.byteOffset,b.length/Type.BYTES_PER_ELEMENT);};assert.equal(hash(compressed),ref.payload.compressedSha256);assert.equal(hash(payload),ref.payload.sha256);
  for(const row of ref.cases){if(type==='segmentation'){const base={width:row.width,height:row.height,metadata:{block:row.block},energy_summary:row.summary,energy_scope:typed(row.energy_scope,Int32Array),energy_low_score:typed(row.energy_low_score,Float32Array),energy_high_score:typed(row.energy_high_score,Float32Array),...(row.energy_allowed?{energy_allowed:bytes(row.energy_allowed)}:{})},actual=await segmentEnergy(base,{thresholds:row.thresholds,minimum:row.minimum,offset:row.offset},{draftSpatialScale:1});assert.deepEqual(new Uint8Array(actual.labels.buffer),new Uint8Array(bytes(row.labels)),row.name);assert.deepEqual(actual.regions,row.regions,row.name);
   }else{const actual=await prepareEnergy({width:row.width,height:row.height,format:'rgb8',data:bytes(row.image)},typed(row.planes,Float32Array),row.quantiles,log);for(const key of ['energy_low_score','energy_high_score','energy_scope'])assert.deepEqual(new Uint8Array(actual[key].buffer),new Uint8Array(bytes(row[key])),row.name+' '+key);assert.deepEqual(actual.energy_summary,row.summary,row.name);}
  }
 }
});
