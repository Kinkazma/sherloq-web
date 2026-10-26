import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {checkAbort} from '../src/errors.js';
import {scopedAutomaticForgeryscope} from '../src/automatic-forgeryscope-stream.js';

// Real aggregate field facade and Budget. The analyzer is a controlled field
// owner: this tests retained reads/retirement, never a neural-model result.
const fields=['mask','map','candidates','geometric','branch_microscopy','branch_blots','branch_lanes'];
function fixture(){
 const budget=new Budget(1024**2),width=16,height=16,n=width*height,sourceSha256='a'.repeat(64),fingerprint='b'.repeat(64),controller=new AbortController(),reads=[];
 const scientificScope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',width,height,sourceSha256,fingerprint,status:'ready',text:{status:'complete'},regions:[{x0:0,y0:0,x1:16,y1:16}],excluded:[]};
 let released=0;const native=Object.fromEntries(fields.map((name,index)=>{const a=name==='map'?Float32Array.from({length:n},(_,i)=>i/256):Uint8Array.from({length:n},(_,i)=>(i+index)%251),bytes=new Uint8Array(a.buffer);return[name,{length:n,elementType:a.constructor.name,async readBytes(out,offset,{signal}={}){checkAbort(signal);reads.push({name,signal});out.set(bytes.subarray(offset,offset+out.length));return out;}}];}));
 const analyzer={async analyze(){return{width,height,...native,metadata:{scientific_scope:{fingerprint},status:'empty'},provenance:{controlledFieldOwner:true},metrics:{},release(){released++;}};}};
 return{budget,width,height,n,controller,reads,scientificScope,analyzer,image:{sha256:sourceSha256,pixels:{format:'rgb8',width,height,data:new Uint8Array(n*3)}},get released(){return released;}};
}
test('retained automatic Forgeryscope fields use the current read signal after the completed run is cancelled',async()=>{
 const f=fixture();let result;try{
  result=await scopedAutomaticForgeryscope(f.image,{width:f.width,height:f.height,scientificScope:f.scientificScope},{analyzer:f.analyzer,budget:f.budget,signal:f.controller.signal});
  const first=new Uint8Array(16);await result.stores.mask.readInto(first,7);f.controller.abort();
  for(const name of fields){const a=new Uint8Array(16),b=new Uint8Array(16),fresh=new AbortController();await result.stores[name].readInto(a,7,{signal:fresh.signal});await result.stores[name].readInto(b,7);assert.deepEqual(a,b);}
  const analyzed=new Uint8Array(16);await result.stores.analyzed.readInto(analyzed,7);assert.ok(analyzed.every(v=>v===1));
 }finally{await result?.release();}assert.equal(f.released,1);assert.equal(f.budget.total(),0);
});
test('fresh cancellation and closed ownership remain enforced on every retained automatic field',async()=>{
 const f=fixture();const result=await scopedAutomaticForgeryscope(f.image,{width:f.width,height:f.height,scientificScope:f.scientificScope},{analyzer:f.analyzer,budget:f.budget,signal:f.controller.signal});
 const cancel=new AbortController();cancel.abort();const before=f.reads.length;
 try{for(const store of Object.values(result.stores))await assert.rejects(Promise.resolve().then(()=>store.readInto(new Uint8Array(4),0,{signal:cancel.signal})),{code:'CANCELLED'});assert.equal(f.reads.length,before);}
 finally{await result.release();}
 for(const store of Object.values(result.stores))await assert.rejects(Promise.resolve().then(()=>store.readInto(new Uint8Array(4),0)),{code:'INVALID_INPUT'});
 await result.release();assert.equal(f.released,1);assert.equal(f.budget.total(),0);
});
