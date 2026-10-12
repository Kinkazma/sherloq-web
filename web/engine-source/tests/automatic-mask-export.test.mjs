import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createCloneCorroboration} from '../src/clone-corroboration.js';
import {exportAutomaticAnalysis} from '../src/automatic-export.js';
import {automaticSnapshotArray} from '../src/automatic-npz-stream.js';
import {unpackScientificNpz} from './automatic-npz-fixture.js';

const native=JSON.parse(await readFile(new URL('./data/clone-entries-native.json',import.meta.url)));
const wasmBinary=await readFile(new URL('../vendor/composition/composition.wasm',import.meta.url));
// These OpenCV reference entries are the exact scientific mask contract, not
// polygons manufactured from their bounding boxes or filtered at source scale.
function nativeMask(name,{dx=0,dy=0}={}){
 const reference=native.masks.find(mask=>mask.name===name).expected[0],rows=reference.pixel_mask;
 const origin=[reference.origin[0]+dx,reference.origin[1]+dy],pixel_mask={width:rows[0].length,height:rows.length,data:Uint8Array.from(rows.flat())},id='d2prl-'+createHash('sha256').update(pixel_mask.data).update(`(${origin[0]}, ${origin[1]}, ${pixel_mask.width}, ${pixel_mask.height})`).digest('hex').slice(0,24);
 return {...structuredClone(reference),id,origin,polygons:reference.polygons.map(p=>p.map(([x,y])=>[x+dx,y+dy])),pixel_mask};
}
const width=47,height=300,excluded=[[[0,254],[6,254],[6,256],[0,256]]];
function masks(){return [nativeMask('sparse',{dx:46,dy:256}),nativeMask('diagonal',{dy:250})];}
function expectedCounts(entries){
 const values=new Uint32Array(width*height);
 for(const entry of entries){const [x,y]=entry.origin,p=entry.pixel_mask;for(let yy=0;yy<p.height;yy++)for(let xx=0;xx<p.width;xx++)if(p.data[yy*p.width+xx])values[(y+yy)*width+x+xx]=1;}
 // The exclusion is an integer rectangle; native fill includes its edges.
 for(let y=254;y<=256;y++)for(let x=0;x<=6;x++)values[y*width+x]=0;
 return values;
}
function snapshot(entries){
 return {version:1,method:'complete_automatic_analysis',results:{d2prl:{mask:automaticSnapshotArray(Uint8Array.from(expectedCounts(entries.filter(entry=>entry.pixel_mask))),{shape:[height,width]})}},states:{d2prl:'done'},errors:{},biomes:entries,corroboration:{entries,excluded,sources:['D2PRL'],metric:'integer_method_search_context_count_not_probability'},image_shape:[height,width,3],decoded_bgr8_sha256:'controlled-native-mask-export-fixture'};
}

test('native one-point and two-point mask contours survive envelope deduplication while classical pairs still merge',async()=>{
 const budget=new Budget(128*1024**2),engine=createCloneCorroboration({budget,wasmBinary}),entries=masks(),before=structuredClone(entries),a=[[0,0],[8,0],[8,8],[0,8]],b=a.map(([x,y])=>[x+15,y]);
 assert.deepEqual(entries.map(entry=>entry.polygons[0].length),[1,2]);assert.deepEqual(entries.map(entry=>entry.count),[1,39]);
 try{
  const result=await engine.uniqueEnvelopes([...entries,{id:'vector-a',source:'PatchMatch SIFT',polygons:[a,b]},{id:'vector-b',source:'PatchMatch Zernike',polygons:[b,a]}]);
  assert.equal(result.length,3);
  for(let i=0;i<entries.length;i++){
   assert.equal(result[i].pixel_mask,entries[i].pixel_mask);assert.equal(result[i].polygons,entries[i].polygons);assert.deepEqual(result[i].origin,entries[i].origin);assert.deepEqual(result[i].member_ids,[entries[i].id]);assert.deepEqual(result[i].corroborating_sources,['D2PRL']);
  }
  assert.deepEqual(result[2].member_ids,['vector-a','vector-b']);assert.deepEqual(entries,before);
 }finally{engine.dispose();}
 assert.equal(budget.total(),0);
});

test('exact masked votes and exclusions cross native 256-row boundaries without rasterizing their short contours',async()=>{
 const budget=new Budget(128*1024**2),engine=createCloneCorroboration({budget,wasmBinary}),entries=masks(),expected=expectedCounts(entries),duplicated=[...entries,{...entries[1],id:'same-mask-other-pass',search_context:'another-pass'}];
 try{
  for(const byContext of [false,true]){
   const values=new Uint32Array(width*height);await engine.stripes({width,height,entries:duplicated,excluded,byContext,stripRows:17},strip=>values.set(strip.values,strip.top*width));assert.deepEqual(values,expected);
  }
  assert.equal(expected[255*width+5],0);assert.equal(expected[257*width+7],1);assert.equal(expected[256*width+46],1);assert.equal(expected.reduce((sum,v)=>sum+v,0),37);
 }finally{engine.dispose();}
 assert.equal(budget.total(),0);
});

test('the complete automatic NPZ preserves short native contours, exact mask arrays, origins, identities and votes',async()=>{
 const budget=new Budget(128*1024**2),entries=masks(),before=structuredClone(entries),input=snapshot(entries),archive=await exportAutomaticAnalysis(input,{scope:'native mask export, no neural inference'},{storage:'memory'},{budget,wasmBinary});
 try{
  assert.equal(budget.total(),archive.byteLength,'Only the owned finished archive remains reserved');
  const bytes=new Uint8Array(archive.byteLength);await archive.store.readInto(bytes);const arrays=unpackScientificNpz(bytes),metadata=JSON.parse(arrays.metadata_json.text),deduplicated=metadata.corroboration.deduplicated_envelopes;
  assert.deepEqual(metadata.biomes.map(entry=>[entry.id,entry.origin,entry.polygons]),entries.map(entry=>[entry.id,entry.origin,entry.polygons]));assert.deepEqual(deduplicated.map(entry=>[entry.id,entry.origin,entry.polygons,entry.member_ids]),entries.map(entry=>[entry.id,entry.origin,entry.polygons,[entry.id]]));
  for(let i=0;i<entries.length;i++)for(const prefix of ['root_biomes','root_corroboration_entries','root_corroboration_deduplicated_envelopes']){
   const array=arrays[prefix+'_'+i+'_pixel_mask'],mask=entries[i].pixel_mask;assert.equal(array.dtype,'|u1');assert.deepEqual(array.shape,[mask.height,mask.width]);assert.deepEqual(array.data,mask.data);
  }
  assert.deepEqual(arrays.root_corroboration_counts.data,Uint8Array.from(expectedCounts(entries)));
  const contexts=arrays.root_corroboration_context_counts.data;assert.deepEqual(new Uint32Array(contexts.buffer,contexts.byteOffset,contexts.byteLength/4),expectedCounts(entries));
  assert.deepEqual(entries,before);assert.equal(metadata.corroboration.entries.length,2);assert.equal(deduplicated.length,2);
 }finally{await archive.dispose();}
 assert.equal(budget.total(),0);
});

test('invalid classical polygons remain rejected and their cleanup does not poison later masked exports',async()=>{
 const budget=new Budget(128*1024**2),engine=createCloneCorroboration({budget,wasmBinary}),entries=masks(),invalid={id:'invalid-vector',source:'PatchMatch SIFT',polygons:[[[0,0],[0,1]]]},before=structuredClone(entries);
 try{
  await assert.rejects(engine.uniqueEnvelopes([...entries,invalid]),{code:'INVALID_INPUT'});assert.equal((await engine.uniqueEnvelopes(entries)).length,2);assert.deepEqual(entries,before);
 }finally{engine.dispose();}
 assert.equal(budget.total(),0);
 await assert.rejects(exportAutomaticAnalysis(snapshot([...entries,invalid]),{}, {storage:'memory'},{budget,wasmBinary}),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);
 const archive=await exportAutomaticAnalysis(snapshot(entries),{}, {storage:'memory'},{budget,wasmBinary});await archive.dispose();assert.equal(budget.total(),0);assert.deepEqual(entries,before);
});
