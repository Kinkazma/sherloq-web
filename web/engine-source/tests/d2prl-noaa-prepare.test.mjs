import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createPreparation,D2PRL_PREPARATION} from '../experiments/d2prl/prepare.js';
import factory from '../vendor/d2prl/prepare.js';
// Reference hashes: Torch2.8/torchvision0.23 Tensor Resize448, explicit
// antialias=False, align_corners=False. These are preprocessing, not inference.
const cases=[
  {
    "width": 23,
    "height": 1,
    "sha256": "062e51553118b39e1434ae5d8a3cbf8187d838225e7c6ab01f94aa644fc86576"
  },
  {
    "width": 9,
    "height": 7,
    "sha256": "57d1d1b703af449c110e16d68fb464cf720bcc57733c9033cf19b8cdb918a644"
  },
  {
    "width": 448,
    "height": 448,
    "sha256": "e8a236e315466cad0e05a349656803358a358b62307fca606c05e3af79a45edc"
  },
  {
    "width": 511,
    "height": 449,
    "sha256": "53498577d41657ad6ebe45e36b350d1177b1b3764a1abef4f6732fad5447c6de"
  },
  {
    "width": 803,
    "height": 617,
    "sha256": "0548b0ce21fbfbe799455bfd07dbbd59b222ee23b2857d5cdb558af5e69b2a5e"
  }
];
const wasmBinary=new Uint8Array(await readFile(new URL('../vendor/d2prl/prepare.wasm',import.meta.url)));
test('Released D2PRL non-AA preparation matches native Tensor oracle in ordinary and bounded row paths',async()=>{
 const budget=new Budget(128*1024**2),engine=await createPreparation(()=>factory({wasmBinary}),{budget});
 try{assert.equal(engine.identity.id,D2PRL_PREPARATION.id);for(const row of cases){const rgb=Uint8Array.from({length:row.width*row.height*3},(_,i)=>((i*73+(i>>>3)*17)^((i>>>8)*19))&255);let live=0,reads=0,retired=0;
  for(const rowsPerRead of [undefined,1,17]){const result=rowsPerRead===undefined?await engine.run({...row,rgb}):await engine.runRows({...row,async readRows(y,count){assert.equal(live,0);assert.ok(count<=2);live++;reads++;return{pixels:{width:row.width,height:count,format:'rgb8',data:rgb.subarray(y*row.width*3,(y+count)*row.width*3)},async release(){await Promise.resolve();live--;retired++;}};}},{rowsPerRead});try{const data=result.data;assert.equal(createHash('sha256').update(new Uint8Array(data.buffer,data.byteOffset,data.byteLength)).digest('hex'),row.sha256);}finally{result.release();}}
  assert.equal(live,0);assert.equal(reads,retired);
 }}finally{engine.dispose();}assert.equal(budget.total(),0);
});

test('D2PRL async window retirement preserves frozen primary cancellation and reports standalone cleanup failure',async()=>{
 for(const primary of [Object.freeze(Object.assign(new Error('frozen cancellation'),{code:'CANCELLED'})),Object.assign(new Error('mutable cancellation'),{code:'CANCELLED'}),null]){
  const budget=new Budget(128*1024**2),engine=await createPreparation(()=>factory({wasmBinary}),{budget}),cleanup=Object.assign(new Error('retirement failed'),{code:'WINDOW_RETIRE_FAILED'});let retired=0,live=0;
  try{await assert.rejects(engine.runRows({width:3,height:2,async readRows(y,count){const free=budget.reserve(3*count*3);live++;return{get pixels(){if(primary)throw primary;return{width:3,height:count,format:'rgb8',data:new Uint8Array(3*count*3)};},async release(){await Promise.resolve();free();live--;retired++;throw cleanup;}};}}),error=>error===(primary??cleanup));assert.equal(retired,1);assert.equal(live,0);if(primary&&!Object.isFrozen(primary))assert.equal(primary.preparationReadCleanupError.code,cleanup.code);}
  finally{engine.dispose();}assert.equal(budget.total(),0);
 }
});
