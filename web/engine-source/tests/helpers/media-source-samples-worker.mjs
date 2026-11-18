// Test-only browser adapter: the production media handler and SDK run unchanged
// in a real isolated Node worker. Faults affect only the optional Ping artifact.
import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{hardwareConcurrency:1},configurable:true});
globalThis.self=globalThis;globalThis.crossOriginIsolated=false;
const resources=[],originalFetch=globalThis.fetch;globalThis.fetch=async(input,options)=>{
 const url=new URL(input);if(url.protocol!=='file:')return originalFetch(input,options);
 resources.push(url.pathname.split('/').slice(-3).join('/'));
 try{return new Response(await readFile(url));}catch{return new Response(null,{status:404});}
};
const m=await import('../../vendor/media/magick/index.js');let ping=0,read=0;
const realPing=m.MagickImage.prototype.ping,realRead=m.MagickImage.prototype.read,realArtifact=m.MagickImage.prototype.getArtifact;
m.MagickImage.prototype.ping=function(...args){ping++;return realPing.apply(this,args);};
m.MagickImage.prototype.read=function(...args){read++;return realRead.apply(this,args);};
if(workerData.fault)m.MagickImage.prototype.getArtifact=function(key){
 if(key!=='sherloq:source-samples')return realArtifact.call(this,key);
 if(workerData.fault==='getter')throw Object.freeze(new Error('Optional metadata refused.'));
 return{missing:null,json:'{',oversize:' '.repeat(16384),schema:'{"schema":"foreign"}'}[workerData.fault];
};
globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message.done?{...message,testCalls:{ping,read},testResources:resources}:message,transfer);
let ready=false;const queued=[];parentPort.on('message',data=>ready?self.onmessage({data}):queued.push(data));
await import(workerData.module);ready=true;for(const data of queued)self.onmessage({data});
