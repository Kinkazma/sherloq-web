import test from 'node:test';import assert from 'node:assert/strict';
import {prnuNcc,prnuNccStored,PRNU_NCC_WORKSPACE_BYTES} from '../src/prnu-ncc.js';
import {numpyBufferedSum as sum} from '../src/numpy-sum.js';import {Budget} from '../src/cache.js';
function previous(first,second){const width=Math.min(first.width,second.width),height=Math.min(first.height,second.height),n=width*height,a=new Float64Array(n),b=new Float64Array(n);for(let y=0;y<height;y++){a.set(first.values.subarray(y*first.width,y*first.width+width),y*width);b.set(second.values.subarray(y*second.width,y*second.width+width),y*width);}const ma=sum(a)/n,mb=sum(b)/n,aa=new Float64Array(n),bb=new Float64Array(n),ab=new Float64Array(n);for(let i=0;i<n;i++){a[i]-=ma;b[i]-=mb;aa[i]=a[i]*a[i];bb[i]=b[i]*b[i];ab[i]=a[i]*b[i];}const den=Math.sqrt(sum(aa)*sum(bb));return den>1e-10?sum(ab)/den:0;}
const fp=(width,height,seed)=>({width,height,values:Float64Array.from({length:width*height},(_,i)=>Math.sin(i*seed)*100+(i%37)/1000)});
const stored=fp=>({width:fp.width,height:fp.height,store:{readInto(target,offset){target.set(new Uint8Array(fp.values.buffer,offset,target.length));}}});
test('bounded PRNU NCC preserves NumPy reductions across crops and 8192 boundaries',async()=>{
 const budget=new Budget(PRNU_NCC_WORKSPACE_BYTES);for(const [w,h] of [[1,1],[7,1],[128,1],[8191,1],[8192,1],[8193,1],[173,127]]){const a=fp(w,h,.9),b=fp(w+3,h+2,1.3),expected=previous(a,b);assert.equal(prnuNcc(a,b),expected);assert.equal(await prnuNccStored(stored(a),stored(b),{admit:n=>budget.reserve(n)}),expected);assert.equal(budget.total(),0);}
 const abort=new AbortController(),a=fp(173,127,.9);await assert.rejects(prnuNccStored(stored(a),stored(a),{signal:abort.signal,admit:n=>budget.reserve(n),onProgress:()=>abort.abort()}),{code:'CANCELLED'});assert.equal(budget.total(),0);
});

test('HDF5 fingerprints ingest progressively into disposable stores and retain native scores',async()=>{
 const {readFile}=await import('node:fs/promises'),{readPrnuDatabase}=await import('../src/prnu-hdf5.js');
 const bytes=new Uint8Array(await readFile(new URL('../fixtures/prnu-snapshot.h5',import.meta.url))),budget=new Budget(256*1024**2);let created=0,disposed=0,maxWrite=0;
 const createFingerprintStore=async size=>{created++;const data=new Uint8Array(size);let closed=false;return {write(value,at){maxWrite=Math.max(maxWrite,value.length);data.set(value,at);},readInto(target,at){target.set(data.subarray(at,at+target.length));},flush(){},dispose(){if(!closed){disposed++;closed=true;}}};};
 const opts={maxWorkingBytes:budget.limit,admit:n=>budget.reserve(n)},original=await readPrnuDatabase(bytes,opts),storedDb=await readPrnuDatabase(bytes,{...opts,createFingerprintStore});
 assert.equal(storedDb.layout,'segmented');assert.equal(storedDb.cameras.length,original.cameras.length);
 for(let i=0;i<original.cameras.length;i++){const a=original.cameras[i].fingerprint,b=storedDb.cameras[i].fingerprint;assert.equal(await prnuNccStored(a,b,opts),prnuNcc(a,a));}
 await storedDb.dispose();assert.equal(created,disposed);assert.ok(maxWrite<=8192*8);assert.equal(budget.total(),0);
 const controller=new AbortController();await assert.rejects(readPrnuDatabase(bytes,{...opts,signal:controller.signal,createFingerprintStore:async n=>{const store=await createFingerprintStore(n);controller.abort();return store;}}),{code:'CANCELLED'});assert.equal(created,disposed);assert.equal(budget.total(),0);
});
