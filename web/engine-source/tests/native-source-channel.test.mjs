import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {serveNativeSourceChannel,receiveNativeSourceChannel} from '../src/native-source-channel.js';
const hash='f'.repeat(64);
function source(width,height){let held=0,reads=[];return{width,height,reads,get held(){return held;},async readWindow(rect){reads.push(rect);const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)for(let c=0;c<3;c++)data[(y*rect.width+x)*3+c]=(rect.x+x+3*(rect.y+y)+17*c)%256;held++;let done=false;return{pixels:{...rect,format:'rgb8',data},release(){if(!done){done=true;held--;}}};}};}
function pair(input,{budget=new Budget(16*1024**2),signal}={}){const channel=new MessageChannel(),provider=serveNativeSourceChannel(channel.port1,input,{signal}),receiver=receiveNativeSourceChannel({format:'rgb8-window-source',width:input.width,height:input.height,sha256:hash,port:channel.port2},{budget,signal});return{provider,receiver,budget};}
test('a large native read is transported in bounded parts with exact pixels and ownership preserved',async()=>{
 const input=source(800,600),{provider,receiver,budget}=pair(input);try{const window=await receiver.readWindow({x:0,y:0,width:800,height:600});assert(input.reads.length>1);assert(input.reads.every(r=>r.width*r.height*3<=1024*1024));for(let y=0;y<600;y++)for(let x=0;x<800;x++)for(let c=0;c<3;c++)assert.equal(window.pixels.data[(y*800+x)*3+c],(x+3*y+17*c)%256);assert(budget.snapshot().activeReservationBytes>0);window.release();assert.equal(budget.snapshot().activeReservationBytes,0);assert.equal(input.held,0);}finally{receiver.dispose();await provider.dispose();}
});
test('consumer scratch admission failure releases the earlier output reservation',async()=>{
 const input=source(300,300),budget=new Budget(400000),{provider,receiver}=pair(input,{budget});try{await assert.rejects(receiver.readWindow({x:0,y:0,width:300,height:300}),e=>e.code==='MEMORY_LIMIT');assert.equal(input.reads.length,0);assert.equal(budget.snapshot().activeReservationBytes,0);}finally{receiver.dispose();await provider.dispose();}
});
test('abort while a source read is pending rejects the consumer and releases both leases',async()=>{
 const input=source(3,3),read=input.readWindow;let unblock,started;const begun=new Promise(resolve=>started=resolve);input.readWindow=async rect=>{const value=await read.call(input,rect);started();await new Promise(resolve=>unblock=resolve);return value;};const abort=new AbortController(),{provider,receiver,budget}=pair(input,{signal:abort.signal});const reading=receiver.readWindow({x:0,y:0,width:3,height:3});await begun;abort.abort();await assert.rejects(reading,e=>e.code==='CANCELLED');unblock();await provider.dispose();receiver.dispose();assert.equal(input.held,0);assert.equal(budget.snapshot().activeReservationBytes,0);
});
test('a mismatched native response is rejected instead of changing the consumer pixel grid',async()=>{
 const channel=new MessageChannel(),budget=new Budget(10000);channel.port1.onmessage=({data})=>{if(data.type==='read')channel.port1.postMessage({ticket:data.ticket,pixels:{width:2,height:2,format:'rgb8',data:new Uint8Array(12)}});};const reader=receiveNativeSourceChannel({format:'rgb8-window-source',width:3,height:3,sha256:hash,port:channel.port2},{budget});try{await assert.rejects(reader.readWindow({x:0,y:0,width:1,height:1}),e=>e.code==='INVALID_INPUT');assert.equal(budget.snapshot().activeReservationBytes,0);}finally{reader.dispose();channel.port1.close();}
});


test('provider whenClosed waits for active read and asynchronous lease cleanup before its owner may close',async()=>{
 let start,finishRead,finishRelease,released=false;const started=new Promise(resolve=>start=resolve),readGate=new Promise(resolve=>finishRead=resolve),releaseGate=new Promise(resolve=>finishRelease=resolve);const input={width:2,height:2,async readWindow(){start();await readGate;return{pixels:{width:2,height:2,format:'rgb8',data:new Uint8Array(12)},async release(){await releaseGate;released=true;}};}};
 const{provider,receiver}=pair(input),reading=receiver.readWindow({x:0,y:0,width:2,height:2});await started;let ownerClosed=false;const closing=provider.whenClosed.then(()=>{assert.equal(released,true);ownerClosed=true;});receiver.dispose();await assert.rejects(reading,{code:'CANCELLED'});await new Promise(resolve=>setImmediate(resolve));assert.equal(provider.closed,true);assert.equal(ownerClosed,false);finishRead();await new Promise(resolve=>setImmediate(resolve));assert.equal(ownerClosed,false);finishRelease();await closing;await provider.dispose();assert.equal(ownerClosed,true);
});
