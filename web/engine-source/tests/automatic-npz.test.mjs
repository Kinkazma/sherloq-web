import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {streamAutomaticNpz,automaticSnapshotArray as array} from '../src/automatic-npz-stream.js';import {automaticNpzFixture,unpackScientificNpz} from './automatic-npz-fixture.js';import {streamScientificNpz} from '../src/scientific-npz-stream.js';
const reference=JSON.parse(await readFile(new URL('./data/automatic-npz-native.json',import.meta.url))),sha=x=>createHash('sha256').update(x).digest('hex');
test('native automatic snapshot recursively exports all dtypes, shapes and Python scientific scalars',async()=>{
 const budget=new Budget(16*1024**2),{snapshot,raw}=automaticNpzFixture(reference),source=raw.float32;
 let maxRead=0;snapshot.results.float32=array({byteLength:source.byteLength,readInto(out,at){maxRead=Math.max(maxRead,out.length);out.set(new Uint8Array(source.buffer,at,out.length));}},{shape:reference.shapes.float32,descr:'<f4'});
 const result=await streamAutomaticNpz(snapshot,{engine:'M5',exactInteger:9007199254740997n},{storage:'memory'},{budget});
 try{const bytes=new Uint8Array(result.byteLength);await result.store.readInto(bytes);assert.equal(sha(bytes),result.sha256);for(const data of Object.values(raw))data.fill(typeof data[0]==='bigint'?0n:0);const records=unpackScientificNpz(bytes);assert.deepEqual(Object.keys(records).filter(x=>!x.endsWith('json')),Object.keys(reference.arrays));for(const [key,expected]of Object.entries(reference.arrays)){assert.equal(records[key].dtype,expected.dtype,key);assert.deepEqual(records[key].shape,expected.shape,key);assert.equal(sha(records[key].data),expected.sha256,key);}assert.equal(records.metadata_json.text,reference.metadataText);assert.equal(records.browser_provenance_json.text,'{"engine":"M5","exactInteger":9007199254740997}');assert.ok(maxRead<=65536*4);assert.ok(budget.total()>0);}
 finally{await result.dispose();await result.dispose();}assert.equal(budget.total(),0);
});
test('invalid snapshots, path collisions, boolean payloads and cancellation cannot publish partial archives',async()=>{
 const budget=new Budget(16*1024**2),a=array(new Uint8Array([1]),{shape:[1]}),circular={};circular.self=circular;
 for(const snapshot of [circular,{a:new Float32Array([1])},{a_b:a,a:{b:a}},undefined,{x:[undefined]},{x:new Date()},{x:array(new Uint8Array([2]),{shape:[1],descr:'|b1'})},{'metadata_json/escape':a}]){await assert.rejects(streamAutomaticNpz(snapshot,{}, {storage:'memory'},{budget}),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);}
 const {snapshot}=automaticNpzFixture(reference),controller=new AbortController();await assert.rejects(streamAutomaticNpz(snapshot,{}, {storage:'memory'},{budget,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(budget.total(),0);
 await assert.rejects(streamAutomaticNpz(snapshot,{}, {maxBytes:100},{budget}),{code:'EXPORT_LIMIT'});assert.equal(budget.total(),0);
 const tiny=new Budget(1);await assert.rejects(streamAutomaticNpz(snapshot,{}, {},{budget:tiny}),{code:'MEMORY_LIMIT'});assert.equal(tiny.total(),0);
 await assert.rejects(streamScientificNpz(Array(65534).fill({}),{}, {},{}, {budget}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);
});

test('Optional undefined browser metrics cannot abort a complete scientific archive',async()=>{
 const budget=new Budget(16*1024**2),values=Float32Array.of(0,.25,1),snapshot={results:{patchmatch:{browser_details:{metrics:{residentAdmission:{fits:false,peakBytes:undefined,reason:'Resident WASM allowance exceeded'}}},field:array(values,{shape:[1,3]})}},absent:undefined,zero:0,no:false,unknown:null};
 const result=await streamAutomaticNpz(snapshot,{}, {storage:'memory'},{budget});try{const bytes=new Uint8Array(result.byteLength);await result.store.readInto(bytes);const records=unpackScientificNpz(bytes),meta=JSON.parse(records.metadata_json.text);assert.deepEqual(meta.results.patchmatch.browser_details.metrics.residentAdmission,{fits:false,reason:'Resident WASM allowance exceeded'});assert.equal(Object.hasOwn(meta,'absent'),false);assert.equal(meta.zero,0);assert.equal(meta.no,false);assert.equal(meta.unknown,null);assert.deepEqual([...new Float32Array(records.root_results_patchmatch_field.data.buffer)],[0,.25,1]);assert.equal(Object.hasOwn(snapshot.results.patchmatch.browser_details.metrics.residentAdmission,'peakBytes'),true);}finally{await result.dispose();}assert.equal(budget.total(),0);
});
