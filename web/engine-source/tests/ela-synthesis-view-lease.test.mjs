import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {retireCompositeOwners} from '../src/composite-owner-release.js';
import {createElaSynthesisAccumulator} from '../src/ela-synthesis-accumulator.js';
import {createOriginalSourceRegionsState} from '../src/source-region-geometry.js';
import {elaSynthesisPresentation} from '../src/ela-synthesis-presentation.js';

const trackerKey='__sherloqSynthesisViewLeaseTest',tracker=globalThis[trackerKey]={domains:0,identities:0,contains:0};
const sourceURL=new URL('../src/ela-synthesis-service.js',import.meta.url);
const moduleURL=name=>new URL('../src/'+name,import.meta.url).href;
const shim=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const domainShim=shim(`import {prepareSourceRegionDomain as actual} from ${JSON.stringify(moduleURL('source-region-dispatch.js'))};export async function prepareSourceRegionDomain(...args){globalThis.${trackerKey}.domains++;const domain=await actual(...args);return{...domain,contains:(x,y)=>{globalThis.${trackerKey}.contains++;return domain.contains(x,y);}};}`);
const cacheShim=shim(`export {createElaSynthesisCache} from ${JSON.stringify(moduleURL('ela-synthesis-cache.js'))};import {elaSynthesisCacheKey as actual} from ${JSON.stringify(moduleURL('ela-synthesis-cache.js'))};export async function elaSynthesisCacheKey(...args){globalThis.${trackerKey}.identities++;return actual(...args);}`);
const serviceSource=(await readFile(sourceURL,'utf8')).replace("from './source-region-dispatch.js'",`from ${JSON.stringify(domainShim)}`).replace("from './ela-synthesis-cache.js'",`from ${JSON.stringify(cacheShim)}`).replace(/from '(\.\/[^']+)'/g,(_,relative)=>'from '+JSON.stringify(new URL(relative,sourceURL).href));
const{createElaSynthesisService}=await import(shim(serviceSource));
const engineSource=await readFile(new URL('../src/index.js',import.meta.url),'utf8'),publishStart=engineSource.indexOf(' async function publishSynthesis('),publishCode=engineSource.slice(publishStart,engineSource.indexOf(' async function prepareElaSynthesisNativeHeadroom(',publishStart));

async function fixture({scope='identity'}={}){
 const budget=new Budget(4*1024**2),native={sha256:'a'.repeat(64),provenance:{decoder:'fixture',format:'jpeg'},surface:{descriptor:{id:'original',revision:1,width:3,height:1,format:'rgb8'},readWindow(){throw Error('Presentation preparation must not read Original pixels');}}},images=new Map([['image',native]]),published=new Map(),entries=new Map();let readersClosed=0;
 const cache={async reader({key}){const entry=entries.get(key.key);if(!entry)return null;return{meta:entry.meta,manifest:{persistent:true,backend:'fixture'},byteLength:entry.bytes.length,readInto(target,offset){target.set(entry.bytes.subarray(offset,offset+target.length));return target;},async close(){readersClosed++;}};},async writer({key,meta}){const parts=[];return{append({bytes}){parts.push(bytes.slice());},commit(){entries.set(key.key,{meta:structuredClone(meta),bytes:Uint8Array.from(parts.flatMap(p=>[...p]))});},abort(){}};},close(){}};
 const createStore=async byteLength=>{const data=new Uint8Array(byteLength);budget.retain(byteLength);let closed=false;return{byteLength,storage:'memory',write(bytes,offset){data.set(bytes,offset);},readInto(target,offset){target.set(data.subarray(offset,offset+target.length));return target;},flush(){},dispose(){if(!closed){closed=true;budget.retained-=byteLength;}}};};
 const service=createElaSynthesisService({budget,cache,getImage:id=>{const original=images.get(id);if(!original)throw Error('Source unloaded');return original;},getSurface:id=>published.get(id),publish:(id,record)=>{published.set(record.surface.descriptor.id,record.surface);return record.surface.descriptor;},createAccumulator:(options,hooks)=>createElaSynthesisAccumulator({...options,createStore},hooks)});
 const regions=await createOriginalSourceRegionsState({sourceSha256:native.sha256,width:3,height:1});
 if(scope==='membership')await regions.add('exclusion',{x0:1,y0:0,x1:2,y1:1},{id:'hole'});
 if(scope==='rectangle')await regions.add('acquisition',{x0:1,y0:0,x1:3,y1:1},{id:'crop'});
 const snapshot=regions.snapshot(),job=await service.begin({imageId:'image',params:{recompression:{codec:'gif',lossless:false}},sourceRegionDomain:snapshot}),width=job.width,data=Uint8Array.from({length:width*3},(_,i)=>10+i),frame={descriptor:{id:'frame',revision:1,width,height:1,format:'rgb8'},async readWindow({x=0,y=0,width:w=width,height:h=1}={}){const fee=budget.reserve(w*h*3);return{pixels:{width:w,height:h,format:'rgb8',data:data.slice(x*3,(x+w)*3)},release:fee};}};
 published.set('frame',frame);await service.append({id:job.id,result:{id:'frame',imageId:'image',operation:'ela.classic',status:'ok',surface:frame.descriptor,sourceRegionDomain:job.sourceRegionDomain,provenance:{originalSha256:native.sha256,params:job.axis.states[0].params}}});const result=await service.finish({id:job.id});
 const close=async()=>{for(const[id,surface]of published)if(id!=='frame')await surface.dispose();await service.close();assert.equal(budget.total(),0);};
 return{budget,native,images,service,published,result,regions,cacheEntries:entries,close,get readersClosed(){return readersClosed;}};
}

test('the real Core publication validates one view once and reuses it through aliasing and rendering',async()=>{
 const h=await fixture(),calls=[];try{
  const context=vm.createContext({budget:h.budget,busy:false,RUNTIME_RESERVE:32,knownHeapBytes:()=>0,idle(){assert.equal(context.busy,false);},synthesisService:()=>h.service,async synthesisSourceAlias(value){calls.push(value);return{context:value,owned:false,surface:value.original.surface.descriptor};},synthesisSourceAnswer:(answer)=>answer,resultSurfaces:{release(){throw Error('No owned alias');}},retireCompositeOwners});
  new vm.Script(publishCode).runInContext(context);tracker.domains=tracker.identities=tracker.contains=0;
  const answer=await context.publishSynthesis({id:'view',imageId:'image',key:h.result.synthesis.key,sourceRegionDomain:h.result.sourceRegionDomain,presentation:{scale:2}},{},false);
  assert.equal(tracker.domains,1);assert.equal(tracker.identities,1);assert.equal(calls.length,1);assert.equal(calls[0].original,h.native);
  const window=await h.published.get(answer.surface.id).readWindow();assert.deepEqual([...window.pixels.data],[20,22,24,26,28,30,32,34,36]);window.release();assert.equal(tracker.contains,0,'Whole-source membership never runs per pixel');
  assert.equal(answer.sourceRegionDomain.fingerprint,h.result.sourceRegionDomain.fingerprint);assert.equal(answer.metrics.recompressions,0);assert.equal(context.busy,false);
 }finally{await h.close();}
});

test('membership holes and cropped origins retain their exact RGB and membership checks',async()=>{
 for(const scope of ['membership','rectangle']){const h=await fixture({scope});try{tracker.contains=0;const answer=await h.service.render({imageId:'image',key:h.result.synthesis.key,sourceRegionDomain:h.result.sourceRegionDomain,presentation:{scale:2}}),window=await h.published.get(answer.surface.id).readWindow();
  assert.deepEqual([...window.pixels.data],scope==='membership'?[20,22,24,13,14,15,32,34,36]:[20,22,24,26,28,30]);window.release();assert.ok(tracker.contains>0);assert.deepEqual(answer.sourceRegionOrigin,scope==='rectangle'?[1,0]:[0,0]);
 }finally{await h.close();}}
});

test('a view lease rejects a replaced Source or mutated axis before publication',async()=>{
 for(const mutation of ['source','surface','decode','axis']){const h=await fixture();try{const view=await h.service.openView({imageId:'image',key:h.result.synthesis.key,sourceRegionDomain:h.result.sourceRegionDomain}),before=h.published.size;
  if(mutation==='source')h.images.set('image',{...h.native});else if(mutation==='surface')h.native.surface={...h.native.surface};else if(mutation==='decode')h.native.provenance.decoder='changed';else h.cacheEntries.values().next().value.meta.synthesisAxis.states[0].value++;
  await assert.rejects(view.render({presentation:{scale:2}}),{code:'INVALID_INPUT'});await view.close();assert.equal(h.published.size,before);
 }finally{await h.close();}}
});

test('closing an in-flight view waits for its local reader ACK and cancels publication',async()=>{
 const h=await fixture();try{const view=await h.service.openView({imageId:'image',key:h.result.synthesis.key}),before=h.published.size,pending=view.render({presentation:{scale:2}});let closed=false;const close=view.close().then(()=>closed=true);assert.equal(closed,false);
  await assert.rejects(pending,{code:'CANCELLED'});await close;assert.equal(closed,true);assert.equal(h.published.size,before);assert.throws(()=>view.render(),{code:'INVALID_INPUT'});
 }finally{await h.close();}
});

test('abort and mutable request keys cannot publish a different or stale view',async()=>{
 const h=await fixture();try{const key=structuredClone(h.result.synthesis.key),stop=new AbortController(),view=await h.service.openView({imageId:'image',key},{signal:stop.signal}),before=h.published.size;stop.abort();await assert.rejects(view.render(),{code:'CANCELLED'});await view.close();assert.equal(h.published.size,before);
  const current=structuredClone(h.result.synthesis.key),second=await h.service.openView({imageId:'image',key:current});current.key='b'.repeat(64);current.canonical='changed';const answer=await second.render({presentation:{scale:2}});await second.close();assert.equal(answer.synthesis.key.key,h.result.synthesis.key.key);assert.equal(answer.synthesis.key.canonical,h.result.synthesis.key.canonical);
 }finally{await h.close();}
});

test('the whole-source fast loop is byte-identical to the membership loop across gain, contrast, grayscale and RGB halos',async()=>{
 for(const grayscale of [false,true])for(const scale of [1,3,19]){const budget=new Budget(1024**2),data=Uint8Array.from({length:81},(_,i)=>(i*37+13)%256),reader=()=>({meta:{width:27,height:1},byteLength:data.length,readInto(target,offset){target.set(data.subarray(offset,offset+target.length));},close(){}}),presentation={scale,contrast:37,grayscale},fast=elaSynthesisPresentation(reader(),{budget,presentation}),masked=elaSynthesisPresentation(reader(),{budget,presentation,contains:()=>true});
  try{for(const rect of[{x:0,y:0,width:27,height:1},{x:3,y:0,width:19,height:1}]){const a=await fast.surface.readWindow(rect),b=await masked.surface.readWindow(rect);assert.deepEqual(a.pixels.data,b.pixels.data);a.release();b.release();}}finally{await fast.surface.dispose();await masked.surface.dispose();}assert.equal(budget.total(),0);
 }
});
