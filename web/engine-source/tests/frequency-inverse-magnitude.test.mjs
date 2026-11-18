import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {frequencyStreamMath} from '../src/frequency-stream-math.js';
import {segmentedDft} from '../src/segmented-dft.js';
import {createComplexPlane} from '../src/segmented-complex-plane.js';
const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);

const bits=v=>new Uint32Array(v.buffer,v.byteOffset,v.length);
function source(values,width,height){return {width,height,async read(x,y,w,h){const result=new Float32Array(w*h*2);for(let row=0;row<h;row++)result.set(values.subarray(((y+row)*width+x)*2,((y+row)*width+x+w)*2),row*w*2);return result;}};}
for(const [width,height,block]of [[1,37,41],[37,1,41],[20,18,137],[360,360,4096]])test(`fused inverse magnitude preserves every native bit ${width}x${height}`,async()=>{
 const budget=new Budget(96*1024**2),math=await frequencyStreamMath(),total=width*height;
 const gray=Float32Array.from({length:total},(_,i)=>Math.fround(((i*137+i%31*43)%65536)/3)),spectrum=math.full(gray,width,height),saved=spectrum.slice(),crop={width:Math.max(1,width-3),height:Math.max(1,height-2)};
 const full=math.full(spectrum,width,height,true),expected=math.polar(full,{reconstruction:true,total,columns:width});let lo=Infinity,hi=-Infinity;
 for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++){const v=expected[y*width+x];lo=Math.min(lo,v);hi=Math.max(hi,v);}
 const result=await segmentedDft(source(spectrum,width,height),{budget,inverse:true,inverseMagnitude:crop,blockPixels:block});
 try{const actual=await result.read(0,0,width,height);assert.equal(actual.length,expected.length);assert.deepEqual(bits(actual),bits(expected));assert.deepEqual(result.magnitudeStats,{minimum:lo,maximum:hi});assert.deepEqual(spectrum,saved);}finally{await result.dispose();}
 assert.equal(budget.total(),0);
});
test('fused reconstruction cancellation releases its intermediate planes',async()=>{
 const budget=new Budget(64*1024**2),controller=new AbortController(),width=60,height=45,values=Float32Array.from({length:width*height*2},(_,i)=>i%71-35);
 await assert.rejects(segmentedDft(source(values,width,height),{budget,inverse:true,inverseMagnitude:{width,height},blockPixels:128,signal:controller.signal,onProgress:event=>{if(event.phase==='frequency-reconstruction')controller.abort();}}),{code:'CANCELLED'});
 assert.equal(budget.total(),0);
});

function diskFixture(budget,{refuseRows=false}={}){
 const files=[];let refusing=refuseRows;
 const session={backend:'opfs',async create(byteLength){const number=files.length,data=new Uint8Array(byteLength),credit=budget.reserve(17),file={closed:false,async readInto(out,at){out.set(data.subarray(at,at+out.byteLength));return out;},async write(input,at){data.set(input,at);},async flush(){},async dispose(){if(number===0&&refusing)throw Object.assign(Error('rows refused retirement'),{code:'STORAGE_IO'});if(!file.closed){file.closed=true;credit();}}};files.push(file);return file;}};
 return{session,files,allowRowsRetire(){refusing=false;},async force(){refusing=false;for(const file of files)await file.dispose();}};
}
function retirementInput(width=7,height=5){return{width,height,async read(x,y,w,h){return Float32Array.from({length:w*h*2},(_,i)=>Math.sin((y+Math.floor(i/(w*2)))*width+x+i*.37));}};}


test('one-component tiled scalar transport preserves payloads and owns only its scalar byte extent',async()=>{
 const width=131,height=129,budget=new Budget(4*1024**2),disk=diskFixture(budget),plane=await createComplexPlane(width,height,{components:1,budget,storage:'temporary',temporarySession:disk.session,temporaryTileSize:128}),data=new Float32Array(width*height),words=new Uint32Array(data.buffer),patterns=[0,0x80000000,0x7fc00123,1,0x7f800000,0xff800000,0x3f800001];for(let i=0;i<words.length;i++)words[i]=patterns[i%patterns.length];
 try{assert.equal(plane.store.byteLength,data.byteLength);await plane.write(data,0,0,width,height);const part=await plane.read(127,120,4,9),expected=new Float32Array(4*9);for(let row=0;row<9;row++)bytes(expected).set(bytes(data).subarray(((120+row)*width+127)*4,((120+row)*width+131)*4),row*4*4);assert.deepEqual(bytes(part),bytes(expected));await plane.store.promote();assert.deepEqual(bytes(await plane.read(0,0,width,height)),bytes(data));}finally{await plane.dispose();}assert.equal(budget.total(),0);
});

test('fused inverse cancellation retires row and scalar transaction owners before refunding admission',async()=>{
 const budget=new Budget(64*1024**2),disk=diskFixture(budget),stop=new AbortController();await assert.rejects(segmentedDft(retirementInput(),{budget,inverse:true,inverseMagnitude:{width:5,height:3},storage:'temporary',temporarySession:disk.session,blockPixels:13,signal:stop.signal,onProgress:event=>{if(event.phase==='dft-columns')stop.abort();}}),{code:'CANCELLED'});assert.equal(disk.files.length,2);assert.ok(disk.files.every(file=>file.closed));assert.equal(budget.total(),0);
});

test('a refused final row retirement retains a reachable owner for scalar output and admission, then retries to zero',async()=>{
 const budget=new Budget(64*1024**2),disk=diskFixture(budget,{refuseRows:true});let failure;
 try{await segmentedDft(retirementInput(),{budget,inverse:true,inverseMagnitude:{width:5,height:3},storage:'temporary',temporarySession:disk.session,blockPixels:13});assert.fail('rows retirement must refuse');}catch(error){failure=error;}
 try{assert.equal(failure.code,'STORAGE_IO');assert.ok(budget.total()>0,'refused owners retain their credits');assert.equal(typeof failure.cleanupOwner?.dispose,'function','the caller must retain a retry handle for rows, scalar output and admission');let refusedRetry;try{await failure.cleanupOwner.dispose();assert.fail('durable rows refusal must remain visible');}catch(error){refusedRetry=error;}assert.equal(refusedRetry.code,'STORAGE_IO');assert.ok(budget.total()>0);assert.equal(typeof refusedRetry.cleanupOwner?.dispose,'function');disk.allowRowsRetire();await refusedRetry.cleanupOwner.dispose();assert.ok(disk.files.every(file=>file.closed));assert.equal(budget.total(),0);}finally{await disk.force();}
});

test('temporary fused magnitude preserves full OpenCV reconstruction and cropped extrema',async()=>{
 const width=135,height=144,budget=new Budget(64*1024**2),disk=diskFixture(budget),math=await frequencyStreamMath(),values=Float32Array.from({length:width*height*2},(_,i)=>Math.sin(i*.71)*32000),expected=math.polar(math.full(values,width,height,true),{reconstruction:true,total:width*height,columns:width}),crop={width:131,height:137};
 const plane=await segmentedDft(source(values,width,height),{budget,inverse:true,inverseMagnitude:crop,storage:'temporary',temporarySession:disk.session,blockPixels:2048});let minimum=Infinity,maximum=-Infinity;for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++){minimum=Math.min(minimum,expected[y*width+x]);maximum=Math.max(maximum,expected[y*width+x]);}
 try{assert.deepEqual(bytes(await plane.read(0,0,width,height)),bytes(expected));assert.deepEqual(plane.magnitudeStats,{minimum,maximum});}finally{await plane.dispose();}assert.equal(budget.total(),0);
});
