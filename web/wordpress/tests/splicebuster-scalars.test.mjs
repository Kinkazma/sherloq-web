import test from 'node:test';
import assert from 'node:assert/strict';
import {readSplicebusterScalar} from '../sherloq-browser/assets/splicebuster-ui.js';

function fixture(){
 const values={range0:Float64Array.of(4,12),range1:Float64Array.of(4,12,20),map:Float64Array.of(1.000000000000001,NaN,3.000000000000003,4.000000000000004,5.000000000000005,6.000000000000006),valid:Uint8Array.of(1,0,1,1,1,0)},calls=[];
 return {values,calls,options:{width:30,height:24,metadata:{mapShape:[2,3],metadata:{stride:8}},readArray:async(field,offset,length)=>{calls.push({field,offset,length});return values[field].subarray(offset,offset+length);}}};
}
test('source-centre mapping matches half-cell boundaries, earlier-centre ties, NaNs and exact f64 scores',async()=>{
 const t=fixture(),before=Object.fromEntries(Object.entries(t.values).map(([k,v])=>[k,v.slice()]));
 const out=await readSplicebusterScalar({...t.options,rect:{x:0,y:0,width:26,height:18}});
 assert.ok(out instanceof Float64Array);assert.equal(out[0],t.values.map[0]);assert.notEqual(out[0],Math.fround(out[0]));
 assert.equal(out[8],t.values.map[0],'x=8 lies at the tie and chooses the earlier centre');assert.ok(Number.isNaN(out[9]));assert.equal(out[17],t.values.map[2]);
 assert.equal(out[8*26+8],t.values.map[0]);assert.equal(out[9*26+8],t.values.map[3]);
 assert.equal(out[16*26+24],t.values.map[5],'the last outer half-cell boundary is included');assert.ok(Number.isNaN(out[16*26+25]));assert.ok(Number.isNaN(out[17*26]));
 assert.deepEqual(t.calls.filter(x=>x.field==='map'),[{field:'map',offset:0,length:3},{field:'map',offset:3,length:3}]);
 for(const [key,value]of Object.entries(t.values))assert.deepEqual(value,before[key],key+' must remain immutable');
});
test('validity stays Uint8 and a native subwindow reads its global grid offset',async()=>{
 const t=fixture(),valid=await readSplicebusterScalar({...t.options,field:'valid',rect:{x:0,y:0,width:26,height:18}});
 assert.ok(valid instanceof Uint8Array);assert.equal(valid[0],1);assert.equal(valid[9],0);assert.equal(valid[25],0);assert.equal(valid[17*26],0);
 t.calls.length=0;const out=await readSplicebusterScalar({...t.options,rect:{x:18,y:11,width:5,height:3}});
 assert.ok([...out].every(value=>value===t.values.map[5]));assert.deepEqual(t.calls.filter(x=>x.field==='map'),[{field:'map',offset:5,length:1}]);
});
test('100MP source geometry reads bounded spans using the 1234-column scientific grid',async()=>{
 const rows=1234,cols=1234,origin=67.5,calls=[],rect={x:8000,y:9000,width:257,height:65};
 const out=await readSplicebusterScalar({width:10000,height:10000,metadata:{mapShape:[rows,cols],metadata:{stride:8}},rect,readArray:async(field,offset,length)=>{
  calls.push({field,offset,length});assert.ok(length*8<=4*1024**2);
  return Float64Array.from({length},(_,i)=>field==='range0'||field==='range1'?origin+(offset+i)*8:1e9+(offset+i)/2**20);
 }});
 for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){
  const row=Math.round((rect.y+y-origin)/8),col=Math.round((rect.x+x-origin)/8);assert.equal(out[y*rect.width+x],1e9+(row*cols+col)/2**20);
 }
 const reads=calls.filter(x=>x.field==='map');assert.ok(reads.length<rect.height);assert.ok(reads.every(x=>x.length<=34&&x.offset>=1000*cols));assert.ok(reads.every(x=>x.length<rows*cols));assert.notEqual(out[0],Math.fround(out[0]));
});
test('singleton-axis stride and empty abstention return explicit outside values',async()=>{
 const scalar=async(field)=>field==='range0'?Float64Array.of(10):field==='range1'?Float64Array.of(14):Float64Array.of(2.25);
 const out=await readSplicebusterScalar({width:30,height:30,metadata:{mapShape:[1,1],metadata:{stride:4}},rect:{x:11,y:7,width:7,height:7},readArray:scalar});
 assert.ok(Number.isNaN(out[0]));assert.equal(out[1*7+1],2.25);assert.equal(out[5*7+5],2.25);assert.ok(Number.isNaN(out[6*7+6]));
 for(const field of ['map','valid']){
  const values=await readSplicebusterScalar({width:30,height:30,metadata:{mapShape:[0,0]},rect:{x:0,y:0,width:3,height:2},field,readArray(){assert.fail('Abstention must not issue a read');}});
  assert.ok([...values].every(value=>field==='map'?Number.isNaN(value):value===0));
 }
});
test('oversized/invalid requests and type mismatches fail before false scalar values are published',async()=>{
 const t=fixture();await assert.rejects(readSplicebusterScalar({...t.options,width:10000,height:10000,rect:{x:0,y:0,width:1024,height:513}}),{code:'MEMORY_LIMIT'});assert.equal(t.calls.length,0);
 await assert.rejects(readSplicebusterScalar({...t.options,field:'confidence',rect:{x:0,y:0,width:1,height:1}}),{code:'INVALID_INPUT'});
 await assert.rejects(readSplicebusterScalar({...t.options,rect:{x:-1,y:0,width:1,height:1}}),{code:'INVALID_INPUT'});
 await assert.rejects(readSplicebusterScalar({...t.options,rect:{x:0,y:0,width:1,height:1},readArray:async()=>new Float32Array(2)}),{code:'INVALID_INPUT'});
});
test('cancellation after the first coordinate read stops subsequent reads',async()=>{
 const t=fixture(),controller=new AbortController();let calls=0;
 await assert.rejects(readSplicebusterScalar({...t.options,signal:controller.signal,rect:{x:1,y:1,width:3,height:2},readArray:async(...args)=>{calls++;const values=await t.options.readArray(...args);controller.abort();return values;}}),{code:'CANCELLED'});assert.equal(calls,1);
});
