import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const auditedRoot=resolve(process.env.SHERLOQ_AUDIT_ROOT??fileURLToPath(new URL('../../../',import.meta.url)));
import {MessageChannel} from 'node:worker_threads';
import {writeFileSync} from 'node:fs';
const {exportByteStore,readByteStore}=await import(pathToFileURL(resolve(auditedRoot,'src/portable-byte-store.js')));
globalThis.MessageChannel=MessageChannel;
const guard=(promise,label)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Fixture timeout: '+label)),1000);})]).finally(()=>clearTimeout(timer));};
const track=promise=>{const state={settled:false};state.promise=promise.then(()=>{state.settled=true;state.outcome='resolved';},error=>{state.settled=true;state.outcome='rejected';state.error={name:error.name,code:error.code,message:error.message};});return state;};
async function ownerNull(){
 const bank=Uint8Array.of(41,42,43,44),store={byteLength:bank.length,readInto(target,offset=0){target.set(bank.subarray(offset,offset+target.length));},write(){},flush(){}};
 const pin=await exportByteStore(store,{writable:true,forceBroker:true}),port=pin.descriptor.port,post=port.postMessage.bind(port),reader=await readByteStore(pin.descriptor);
 let first=true;port.postMessage=(data,transfer)=>{if(first){first=false;return post(null);}return post(data,transfer);};
 let barrierResolve;const barrier=new Promise(resolve=>barrierResolve=resolve);const observer=event=>{if(event.data?.id===999)barrierResolve(event.data);};port.addEventListener('message',observer);
 const pending=track(reader.readInto(new Uint8Array(4)));
 // Ordered marker proves that the owner processed the malformed request and
 // advanced its queue. The original id=1 request still receives no response.
 post({id:999,op:'read',offset:0,length:4});
 try{const marker=await guard(barrier,'owner marker');await Promise.resolve();const settledAfterMarker=pending.settled;await reader.dispose();await guard(pending.promise,'owner cleanup');return{case:'null-request-to-owner',markerReply:Array.from(new Uint8Array(marker.buffer)),settledAfterMarker,afterDispose:pending};}
 finally{port.removeEventListener('message',observer);await reader.dispose();await pin.release();}
}
async function peerNull(){
 const {port1:owner,port2:peer}=new MessageChannel();
 const exceptions=[];const uncaught=error=>{exceptions.push({name:error.name,message:error.message,stack:error.stack});};process.on('uncaughtException',uncaught);
 owner.onmessage=()=>{owner.postMessage(null);owner.postMessage({id:999,buffer:new ArrayBuffer(0)});};owner.start();
 const reader=await readByteStore({kind:'broker',byteLength:4,storage:'temporary',writable:true,blockBytes:65536,port:peer});
 let barrierResolve;const barrier=new Promise(resolve=>barrierResolve=resolve);const observer=event=>{if(event.data?.id===999)barrierResolve();};peer.addEventListener('message',observer);
 const pending=track(reader.readInto(new Uint8Array(4)));
 try{await guard(barrier,'peer marker');await new Promise(resolve=>setImmediate(resolve));const settledAfterMarker=pending.settled;await reader.dispose();await guard(pending.promise,'peer cleanup');return{case:'null-response-to-reader',exceptions,settledAfterMarker,afterDispose:pending};}
 finally{process.removeListener('uncaughtException',uncaught);peer.removeEventListener('message',observer);await reader.dispose();owner.close();}
}
const results=[await ownerNull(),await peerNull()];for(const item of results)delete item.afterDispose.promise;
writeFileSync(new URL('./port-null-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
