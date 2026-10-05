import test from 'node:test';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import{Budget}from'../src/cache.js';import{streamScientificNpz}from'../src/scientific-npz-stream.js';import{zeroNpz}from'../src/npz.js';
test('Cooperative scientific export preserves float64/int32 bits and Unicode across scalar/hash block boundaries',async()=>{
 const width=65539,height=1,n=width*height,budget=new Budget(64*1024**2),arrays=[],data={width,height,metadata:{note:'é🐦'.repeat(34000)}},provenance={operation:'jpeg.zero',fixture:'public synthetic export only'};
 for(const key of ['luminance','luminance_jpeg','votes','votes_jpeg','mask_f','mask_f_reg','mask_m','mask_m_reg','grid_log10_nfa']){
  const floating=key.startsWith('luminance')||key==='grid_log10_nfa',count=key==='grid_log10_nfa'?64:n,a=data[key]=floating?Float64Array.from({length:count},(_,i)=>i%11===0?-0:(i%17-8)*Math.PI/100):Int32Array.from({length:count},(_,i)=>i%3?2147483647-i:-2147483648+i),bytes=new Uint8Array(a.buffer),elementBytes=a.BYTES_PER_ELEMENT;
  arrays.push({key,descr:floating?'<f8':'<i4',count,elementBytes,shape:key==='grid_log10_nfa'?[64]:[height,width],read:(out,first,length)=>out.set(bytes.subarray(first*elementBytes,(first+length)*elementBytes))});
 }
 const expected=zeroNpz({data,provenance},32*1024**2),result=await streamScientificNpz(arrays,data.metadata,provenance,{storage:'memory'},{budget});
 try{const actual=new Uint8Array(result.byteLength);await result.store.readInto(actual);assert.deepEqual(actual,expected.bytes);assert.equal(result.sha256,createHash('sha256').update(actual).digest('hex'));assert.equal(result.metrics.maximumScalarChunk,65536);assert.ok(result.metrics.assemblyMs>=0&&result.metrics.hashMs>=0);}finally{await result.store.dispose();await result.session?.dispose();}
 assert.equal(budget.total(),0);
});
