import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {Budget} from '../src/cache.js';import {EngineError,requireValue,checkAbort} from '../src/errors.js';import {sourcePrefixMetadataBytes} from '../src/source-prefix-integrity.js';import {retireCompositeOwners} from '../src/composite-owner-release.js';
const source=(await readFile(new URL('../src/media-image-source.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replaceAll('export async function','async function')+'\nloadExtendedImage;';
async function run(failures){
 const budget=new Budget(256*1024**2),calls=[],failed=new Set(),primary=new EngineError('TEST_DECODE','Seal failed before publishing the source.');
 function owner(name,lease=budget.reserve(1)){let retired=false;return {async dispose(){calls.push(name);if(!retired){retired=true;lease();}if(failures.includes(name)&&!failed.has(name)){failed.add(name);throw new EngineError('TEST_'+name.toUpperCase(),name+' retirement refused.');}}};}
 const encoded=owner('source'),session=owner('session');encoded.adoptIntegrity=async()=>{};let store;
 const load=vm.runInNewContext(source,{Blob,Uint8Array,performance,sourcePrefixMetadataBytes,requireValue,checkAbort,retireCompositeOwners,
  createBlobSource:()=>encoded,createTemporarySession:async()=>session,
  createSegmentedBytes:async(n,options)=>{await options.getTemporarySession({});store={...owner('store'),storage:'memory',async write(){},async flush(){}};return store;},
  createRgb16Bank:async()=>({...owner('nativeBank'),store:{storage:'memory'},async writeBand(){},async seal(){throw primary;}}),
  createRgbSurface:()=>({async dispose(){calls.push('surface');if(failures.includes('surface'))throw new EngineError('TEST_SURFACE','surface retirement refused.');await store.dispose();}}),
  createOwnedNativeColorMetadata:async(_,options)=>({...owner('metadata',options.reserve(16)),color:{},provenance:{}}),replaceNativeColorMetadata:(target,color)=>Object.assign(target,color),
  mediaCodecJob:async(_,payload,{onRequest})=>{await onRequest('decode-header',{width:1,height:1,nativeDepth:16,codecMemoryBytes:1024,format:'png'});await onRequest('decoded-native-band',{bytes:new Uint8Array(6),y:0,rows:1});await onRequest('decoded-band',{bytes:new Uint8Array(3),y:0,rows:1});return{header:{},sourceIntegrity:{byteLength:payload.blob.size,sha256:'test'},provenance:{}};}
 });let caught;try{await load(new Blob([new Uint8Array(8)]),{budget});}catch(e){caught=e;}assert.equal(caught,primary);assert.equal(budget.total(),0);return{caught,calls};
}
test('every source owner is attempted despite independent retirement failures',async()=>{
 for(const failure of ['surface','store','nativeBank','metadata','session','source']){
  const {caught,calls}=await run([failure]);for(const name of ['surface','store','nativeBank','metadata','session','source'])assert.ok(calls.includes(name),failure+' prevented '+name+' retirement');
  assert.ok(caught.cleanupErrors.some(e=>e.code==='TEST_'+failure.toUpperCase()));
 }
});
test('simultaneous retirement failures remain secondary to the original decode error',async()=>{
 const names=['surface','store','nativeBank','metadata','session','source'],{caught,calls}=await run(names);assert.deepEqual(calls,names);assert.equal(caught.cleanupErrors.length,names.length);assert.deepEqual(caught.cleanupErrors.map(e=>e.code),names.map(n=>'TEST_'+n.toUpperCase()));
});
test('successful retirement does not invent a cleanup error or retire the display store twice',async()=>{
 const {caught,calls}=await run([]);assert.equal(caught.cleanupErrors,undefined);assert.deepEqual(calls,['surface','store','nativeBank','metadata','session','source']);
});
