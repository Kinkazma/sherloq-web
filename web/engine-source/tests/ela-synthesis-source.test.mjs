import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createElaSynthesisSource,borrowSynthesisRgb,synthesisRgbContiguousBytes} from '../src/ela-synthesis-source.js';
import {createRgbRecompression} from '../src/jpeg-rgb-stream.js';
import {ElaJpegArchiveBridge} from '../src/ela-jpeg-archive-bridge.js';

function source(width,height,budget,{read,release}={}){
 const data=Uint8Array.from({length:width*height*3},(_,i)=>(i*73+(i>>4)*19)&255),counts={reads:0,bytes:0,releases:0},base=createRgbSurface({byteLength:data.length,storage:'borrowed-original',readInto(out,offset){out.set(data.subarray(offset,offset+out.length));return out;}},{width,height,budget,ownsStore:false}),surface={...base,async readWindow(rect,options){counts.reads++;read?.(counts);const part=await base.readWindow(rect,options);counts.bytes+=part.pixels.data.length;const retire=part.release;part.release=async()=>{await release?.(counts);retire();counts.releases++;};return part;}};
 return{image:{surface,sha256:'a'.repeat(64),provenance:{format:'jpeg'}},data,counts};
}

test('series reads Original once; every CPU quality and render uses the same exact staging',async()=>{
 const budget=new Budget(128*1024**2),input=source(83,79,budget),staging=await createElaSynthesisSource(input.image,{budget}),codec=createRgbRecompression(staging.image,budget),direct=createRgbRecompression(input.image,budget);
 try{assert.equal(input.counts.bytes,input.data.length);const loaded=input.counts.reads;
  for(const quality of[1,29,85,99]){const expected=[],actual=[];await direct.visit(quality,{onBand(original,rgb){expected.push({original:original.slice(),rgb:rgb.slice()});}});const before=input.counts.reads;await codec.visit(quality,{onBand(original,rgb){actual.push({original:original.slice(),rgb:rgb.slice()});}});assert.deepEqual(actual,expected);assert.equal(input.counts.reads,before);}
  assert.equal(staging.metrics.sourcePasses,1);assert.equal(staging.metrics.sourceBytes,input.data.length);assert.equal(staging.metrics.sourceWindows,loaded);assert.equal(staging.metrics.copiedAtImport,false);assert.equal(input.counts.reads,input.counts.releases);
 }finally{await codec.dispose();await direct.dispose();await staging.dispose();await input.image.surface.dispose();}assert.equal(budget.total(),0);
});

test('GPU bridge borrows the financed complete source bank, no copy or new source reads',async()=>{
 const budget=new Budget(32*1024**2),input=source(17,65,budget),staging=await createElaSynthesisSource(input.image,{budget}),bridge=new ElaJpegArchiveBridge(budget),surface=staging.image.surface,at=budget.total(),reads=input.counts.reads;
 try{const one=await bridge.source(surface),two=await bridge.source(surface);assert.equal(one.rgb,two.rgb);assert.deepEqual(one.rgb,input.data);assert.equal(budget.total(),at);assert.equal(input.counts.reads,reads);assert.equal(synthesisRgbContiguousBytes(surface),input.data.length);await bridge.release(bridge.sources,one);await bridge.release(bridge.sources,two);assert.equal(staging.metrics.contiguousBorrowCount,2);
  const pin=borrowSynthesisRgb(surface);let retired=false;const closing=staging.dispose().then(()=>{retired=true;});await Promise.resolve();await Promise.resolve();assert.equal(retired,false);assert.equal(budget.total(),at);pin.release();await closing;assert.equal(retired,true);assert.equal(synthesisRgbContiguousBytes(surface),0);
 }finally{await bridge.dispose();await staging.dispose();await input.image.surface.dispose();}assert.equal(budget.total(),0);
});

test('temporary staging is conditional on native headroom and preserves all pixels',async()=>{
 const budget=new Budget(2*1024**2),input=source(301,99,budget);let disposed=0,creates=0;
 const session={backend:'test',async create(bytes){creates++;const data=new Uint8Array(bytes);return{async write(part,offset){data.set(part,offset);},async readInto(out,offset){out.set(data.subarray(offset,offset+out.length));return out;},async flush(){},async dispose(){disposed++;}};}};input.image.session=session;
 const staging=await createElaSynthesisSource(input.image,{budget,futureBytes:budget.limit});try{assert.equal(staging.metrics.storage,'temporary');assert.equal(creates,1);assert.equal(borrowSynthesisRgb(staging.image.surface),null);const part=await staging.image.surface.readWindow({x:0,y:0,width:301,height:99});assert.deepEqual(part.pixels.data,input.data);part.release();assert.equal(input.counts.bytes,input.data.length);}finally{await staging.dispose();await input.image.surface.dispose();}assert.equal(disposed,1);assert.equal(budget.total(),0);
});

test('the unchanged GPU archive visit shares staging across qualities and retires its borrow after a render failure',async()=>{
 const budget=new Budget(32*1024**2),input=source(17,65,budget),staging=await createElaSynthesisSource(input.image,{budget}),bridge=new ElaJpegArchiveBridge(budget,{createGpu:()=>({async run(rgb,width,height,quality){return{rgb:rgb.map(v=>(v+quality)&255),coefficients:new Int16Array(1),runtime:{totalMs:0},release(){}};},dispose(){}}),createEncoder:()=>({async encode(coefficients,width,height,quality,{writeEncoded}){await writeEncoded(Uint8Array.of(quality));return{heapCapacityBytes:0,heapMaximumBytes:0,totalMs:0};},dispose(){}})}),reads=input.counts.reads;
 try{for(const quality of[29,85]){let encoded=0,bands=0;await bridge.visit(staging.image.surface,quality,{writeEncoded:bytes=>{encoded+=bytes.length;},onEncoded(){},onBand(original,rgb,{y,rows}){assert.deepEqual(original,input.data.subarray(y*17*3,(y+rows)*17*3));assert.deepEqual(rgb,original.map(v=>(v+quality)&255));bands++;}});assert.equal(encoded,1);assert.equal(bands,3);assert.equal(bridge.sources.size,0);assert.equal(input.counts.reads,reads);}
  await assert.rejects(bridge.visit(staging.image.surface,20,{writeEncoded(){},onEncoded(){},onBand(){throw Error('render refused');}}),/render refused/);assert.equal(bridge.sources.size,0);assert.equal(staging.metrics.contiguousBorrowCount,3);
 }finally{await bridge.dispose();await staging.dispose();await input.image.surface.dispose();}assert.equal(budget.total(),0);
});

test('cancel and failed source ACK retain retryable cleanup instead of refunding early',async()=>{
 const budget=new Budget(32*1024**2),stop=new AbortController(),cancelled=source(37,65,budget,{read(counts){if(counts.reads===2)stop.abort();}});await assert.rejects(createElaSynthesisSource(cancelled.image,{budget,signal:stop.signal}),{code:'CANCELLED'});assert.equal(budget.total(),0);await cancelled.image.surface.dispose();
 let refuse=true;const failed=source(11,9,budget,{release(){if(refuse)throw Object.assign(Error('read ACK refused'),{code:'BUSY'});}});let error;try{await createElaSynthesisSource(failed.image,{budget});}catch(value){error=value;}assert.equal(error.code,'BUSY');assert.ok(error.cleanupOwner);assert.ok(budget.total()>0);refuse=false;await error.cleanupOwner.dispose();await failed.image.surface.dispose();assert.equal(budget.total(),0);
});

test('the source bank keeps its entire credit through asynchronous backing ACK and a refused ACK is retryable',async()=>{
 for(const refused of[false,true]){const budget=new Budget(32*1024**2),register=budget.registerBacking.bind(budget);let resolve,releases=0;const ack=new Promise(done=>{resolve=done;});budget.registerBacking=(kind,bytes,options)=>options?.label==='synthesis-original-rgb'?()=>{releases++;if(refused&&releases===1)throw Error('backing ACK refused');return ack.then(()=>bytes);}:register(kind,bytes,options);const input=source(17,13,budget),staging=await createElaSynthesisSource(input.image,{budget});
  if(refused)await assert.rejects(staging.dispose(),/backing ACK refused/);let done=false;const pending=staging.dispose().then(()=>{done=true;});for(let i=0;i<10;i++)await Promise.resolve();assert.equal(done,false);assert.equal(budget.total(),input.data.length);resolve();await pending;await input.image.surface.dispose();assert.equal(budget.total(),0);assert.equal(releases,refused?2:1);
 }
});

test('a refused recompression retirement keeps its input RAM bank until the codec retry ACK',async()=>{
 const budget=new Budget(32*1024**2),input=source(17,13,budget),staging=await createElaSynthesisSource(input.image,{budget});let refuses=true,retired=0;staging.image.rgbRecompression={dispose(){if(refuses)throw Error('codec retirement refused');retired++;}};
 await assert.rejects(staging.dispose(),/codec retirement refused/);assert.equal(budget.total(),input.data.length);assert.equal(retired,0);refuses=false;await staging.dispose();assert.equal(retired,1);assert.equal(budget.total(),0);await input.image.surface.dispose();
});
