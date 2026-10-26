import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {renderResearch} from '../src/research-view.js';
import {createResearchSurface} from '../src/m3-research-surface.js';
import {streamM3ResearchNpz} from '../src/m3-research-export.js';
import {strictResearchFixture,sampleWindow} from './helpers/strict-research-fixture.mjs';
async function oracle(pixels,data,mode){const result=pixels.data.slice();for(const f of data.fragments){const [x,y,r,b]=f.bounds,source=sampleWindow(pixels,{x,y,w:r-x,h:b-y}),rendered=await renderResearch(source,f,{mode},{reserveMemory:()=>{}});for(let row=0;row<b-y;row++)result.set(rendered.pixels.data.subarray(row*source.width*3,(row+1)*source.width*3),((y+row)*pixels.width+x)*3);}return{...pixels,data:result};}
for(const method of ['focal','adaifl'])for(const mode of ['overlay','map',...(method==='adaifl'?['mask']:[])])test(method+' '+mode+' native fragments equal independent native-grid rendering, outside pixels stay original',async()=>{
 const {pixels,data}=strictResearchFixture(method),expected=await oracle(pixels,data,mode),full=await renderResearch(pixels,data,{mode},{reserveMemory:()=>{}});assert.deepEqual(full.pixels,expected);assert.equal(full.style.outsideDomain,'original-unanalysed');
 for(const step of [1,2,3])for(const [x,y,w,h]of[[0,0,12,8],[2,1,9,6],[4,3,5,4]]){const tile={x,y,w,h,step},part=sampleWindow(pixels,tile),rendered=await renderResearch(part,data,{mode},{reserveMemory:()=>{},origin:[x,y],sourceSize:[pixels.width,pixels.height],step});assert.deepEqual(rendered.pixels,sampleWindow(expected,tile));}
});
test('a live research surface owns every native fragment across transfer of the public raw reply',async()=>{
 const h=strictResearchFixture('adaifl'),budget=new Budget(4*1024**2);let reads=0;const source={descriptor:{width:h.width,height:h.height},async readWindow({x,y,width,height}){reads++;const pixels=sampleWindow(h.pixels,{x,y,w:width,h:height});return{pixels,release(){}};}};
 const record=await createResearchSurface({surface:source},h.data,{mode:'map'},{budget}),before=await oracle(h.pixels,h.data,'map');structuredClone(h.data,{transfer:h.data.fragments.flatMap(f=>[f.map.buffer,f.mask.buffer])});assert.equal(h.data.fragments[0].map.byteLength,0);
 const answer=await record.surface.readWindow({x:2,y:2,width:8,height:5});assert.deepEqual(answer.pixels,sampleWindow(before,{x:2,y:2,w:8,h:5}));assert.equal(reads,1);answer.release();record.surface.dispose();assert.equal(budget.total(),0);
});
test('native fragment rendering rejects bad bounds and finite-grid identity before painting',async()=>{
 const h=strictResearchFixture();h.data.fragments[0].bounds=[0,0,13,8];await assert.rejects(renderResearch(h.pixels,h.data,{mode:'map'},{reserveMemory:()=>{}}),/fragment bounds/);
 const other=strictResearchFixture();other.data.fragments[0].map[0]=NaN;await assert.rejects(renderResearch(other.pixels,other.data,{mode:'map'},{reserveMemory:()=>{}}),/Non-finite/);
});
function storedEntries(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),entries=new Map();for(let at=0;view.getUint32(at,true)===0x04034b50;){const size=view.getUint32(at+18,true),nameLength=view.getUint16(at+26,true),extra=view.getUint16(at+28,true),name=new TextDecoder().decode(bytes.subarray(at+30,at+30+nameLength)),start=at+30+nameLength+extra;entries.set(name,bytes.slice(start,start+size));at=start+size;}return entries;}
test('scientific export preserves every native fragment grid and exact source placement, without an invented global map',async()=>{
 const {data}=strictResearchFixture('adaifl'),budget=new Budget(8*1024**2),out=await streamM3ResearchNpz({data},{operation:'ai.localization.adaifl'},{storage:'memory'},{budget});
 try{const bytes=new Uint8Array(out.byteLength);await out.store.readInto(bytes,0);const entries=storedEntries(bytes);assert(!entries.has('map.npy'));for(const [i,fragment]of data.fragments.entries()){const bytes=entries.get('fragment_'+i+'_map.npy'),headerLength=new DataView(bytes.buffer).getUint16(8,true),payload=bytes.slice(10+headerLength);assert.deepEqual(new Float32Array(payload.buffer),fragment.map);assert(entries.has('fragment_'+i+'_mask.npy'));}const bounds=entries.get('fragment_bounds.npy'),offset=10+new DataView(bounds.buffer).getUint16(8,true);assert.deepEqual([...new Int32Array(bounds.slice(offset).buffer)],data.fragments.flatMap(f=>f.bounds));assert.equal(out.metrics.arrays,7);
 }finally{await out.store.dispose();await out.session?.dispose();}assert.equal(budget.total(),0);
});
