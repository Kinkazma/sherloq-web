import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {resolveRecompressionPlan,deriveRecompressionPlan} from '../src/recompression-plan.js';
import {selectedProbeParams,selectedPlanFromBase,createSelectedPlanResolver,selectionIdentity,createSelectedCodec} from '../src/recompression-probe.js';
import {segmentedRecompressionLosses} from '../src/segmented-recompression.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {recompressPixels} from '../src/recompression-surface.js';
import {disposeRecompressionCodecs} from '../src/recompression-codec-client.js';
import {gray} from '../src/pixel-utils.js';

const png=Uint8Array.of(137,80,78,71,13,10,26,10),jpeg=Uint8Array.of(255,216,255,217),bmp=Uint8Array.of(66,77),gif=Uint8Array.from('GIF89a',c=>c.charCodeAt(0));
const webpLossless=Uint8Array.of(82,73,70,70,13,0,0,0,87,69,66,80,86,80,56,76,1,0,0,0,0),webpUnknown=webpLossless.subarray(0,12);
const cfg=(codec,extra={})=>({codec,lossless:false,...extra});
const axes=['fixed','relative','sweep'],qualities=Array.from({length:101},(_,q)=>q);
// This is the preceding two-resolution algorithm, kept independent of the new
// selectedPlanFromBase/deriveRecompressionPlan/resolver entry points.
async function historicalSelectedPlan(params,image,{quality=params?.quality||params?.recompression?.quality||75,paletteAxis='relative',signal}={}){
 const base=await resolveRecompressionPlan({...params,quality:params?.quality||params?.recompression?.quality||75},image,{signal});
 if(base.stage.codec==='jpeg'&&!base.stage.lossless)return null;
 const selected={...params,recompression:{...params.recompression,codec:base.stage.codec}};
 const plan=await resolveRecompressionPlan(selectedProbeParams(selected,quality,{paletteAxis}),{provenance:{format:base.sourceFormat}},{signal});
 return{...plan,sourceMode:base.sourceMode,selection:base.selection};
}
function headerImage(initial=png,{provenance={format:'misleading-format'},onRead,onRelease,poisonLoan=false}={}){
 let bytes=initial.slice();const audit={reads:0,releases:0,requests:[]};
 const image={provenance,source:{get byteLength(){return bytes.length;},async read(start,length,options={}){audit.reads++;audit.requests.push({start,length,signal:options.signal});await onRead?.(audit.reads,options);const loan=bytes.slice(start,start+length);return{bytes:loan,async release(){audit.releases++;if(poisonLoan)loan.fill(0);await onRelease?.(audit.releases);}};}}};
 return{image,audit,setBytes:value=>{bytes=value.slice();}};
}
const cases=[
 ['WebP explicit', {quality:75,recompression:cfg('webp')},{bytes:png}],
 ['WebP nested quality', {recompression:cfg('webp',{quality:67})},{bytes:png}],
 ['PNG normalized palette', {quality:75,recompression:cfg('png')},{bytes:png}],
 ['PNG explicit190', {quality:75,recompression:cfg('png',{paletteColors:190})},{bytes:png}],
 ['PNG explicit191', {quality:75,recompression:cfg('png',{paletteColors:191})},{bytes:png}],
 ['Source PNG normalized palette', {quality:0,recompression:cfg('source')},{bytes:png,provenance:{format:'jpeg'}}],
 ['Source PNG explicit palette and nested anchor', {quality:0,recompression:cfg('source',{quality:67,paletteColors:19})},{bytes:png}],
 ['Source BMP palette', {quality:75,recompression:cfg('source')},{bytes:bmp}],
 ['Source WebP prior lossless, requested lossy', {quality:75,recompression:cfg('source')},{bytes:webpLossless,provenance:{format:'png'}}],
 ['Source WebP inferred prior mode', {quality:75,recompression:cfg('source')},{bytes:webpUnknown,provenance:{format:'webp',chroma:'444'}}],
 ['GIF quality aliases', {quality:75,recompression:cfg('gif')},{bytes:gif}],
 ['WebP lossless', {quality:75,recompression:cfg('webp',{lossless:true})},{bytes:png}],
 ['Source PNG lossless', {quality:75,recompression:cfg('source',{lossless:true})},{bytes:png}],
 ['TIFF forced lossless', {quality:75,recompression:cfg('tiff')},{provenance:{format:'tiff'}}],
 ['Historical JPEG absent selection', {},{bytes:png}],
 ['JPEG explicit fallback', {quality:75,recompression:cfg('jpeg')},{bytes:png}],
 ['Source JPEG signature fallback', {quality:0,recompression:cfg('source')},{bytes:jpeg,provenance:{format:'png'}}]
];
for(const[label,params,image]of cases)for(const paletteAxis of axes)test(`plan reuse preserves historical ${label} ${paletteAxis} at all101 levels`,async()=>{
 const before=structuredClone(params),identity=selectionIdentity(params),base=await resolveRecompressionPlan({...params,quality:params.quality||params.recompression?.quality||75},image),snapshot=structuredClone(base),resolver=createSelectedPlanResolver(image,params,{paletteAxis,resolvedPlan:base});
 for(const quality of qualities){const expected=await historicalSelectedPlan(params,image,{quality,paletteAxis}),direct=selectedPlanFromBase(params,base,{quality,paletteAxis}),actual=await resolver.resolve(quality);assert.deepEqual(direct,expected,`pure level ${quality}`);assert.deepEqual(actual,expected,`resolver level ${quality}`);if(actual){assert(Object.isFrozen(actual.stage));assert.equal(actual.sourceFormat,base.sourceFormat);assert.equal(actual.sourceMode,base.sourceMode);assert.equal(actual.selection,base.selection);}}
 assert.deepEqual(params,before);assert.deepEqual(base,snapshot);assert.equal(selectionIdentity(params),identity);assert.deepEqual(resolver.basePlan,base);
});
test('pure derivation preserves every raw plan field with an authoritative signature and no source owner',async()=>{
 const source={bytes:webpLossless,provenance:{format:'png'}},params={quality:75,recompression:cfg('source')},base=await resolveRecompressionPlan(params,source);
 for(const quality of[1,75,100]){const expected=await resolveRecompressionPlan({...params,quality},source),derived=deriveRecompressionPlan({...params,quality},base);assert.deepEqual(derived,expected);assert.equal(derived.sourceMode,'lossless');assert.equal(derived.stage.lossless,false);assert.equal(derived.selection,'source');}
});
test('legacy source sniffing repeats per level; a bound resolver owns one released header loan',async()=>{
 const old=headerImage(webpLossless),fresh=headerImage(webpLossless,{poisonLoan:true}),params={quality:75,recompression:cfg('source')},resolver=createSelectedPlanResolver(fresh.image,params);
 for(const quality of[1,70,75,80,100])assert.deepEqual(await resolver.resolve(quality),await historicalSelectedPlan(params,old.image,{quality}));
 assert.equal(old.audit.reads,5);assert.equal(old.audit.releases,5);assert.equal(fresh.audit.reads,1);assert.equal(fresh.audit.releases,1);assert.equal(resolver.basePlan.sourceFormat,'webp');assert.equal(resolver.basePlan.sourceMode,'lossless');
});
test('one initial read is shared by concurrent plan derivations and successful cached plans',async()=>{
 let continueRead;const gate=new Promise(resolve=>continueRead=resolve),source=headerImage(png,{onRead:()=>gate}),params={quality:75,recompression:cfg('source',{paletteColors:19})},resolver=createSelectedPlanResolver(source.image,params),a=resolver.resolve(70),b=resolver.resolve(80);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(source.audit.reads,1);continueRead();const plans=await Promise.all([a,b]);assert.deepEqual(plans.map(p=>p.stage.paletteColors),[6,32]);await resolver.resolve(75);assert.equal(source.audit.reads,1);assert.equal(source.audit.releases,1);
});
test('a seeded plan performs no header read, preserves selection and captures the caller recipe',async()=>{
 const params={quality:75,recompression:cfg('source',{paletteColors:19})},base=await resolveRecompressionPlan(params,{bytes:png}),source=headerImage(png,{onRead:()=>{throw Error('A seeded plan must not touch Original bytes');}}),resolver=createSelectedPlanResolver(source.image,params,{resolvedPlan:base,paletteAxis:'fixed'});
 params.quality=99;params.recompression.paletteColors=191;const actual=await resolver.resolve();assert.equal(actual.stage.paletteColors,19);assert.equal(actual.stage.requestedQuality,75);assert.equal(actual.selection,'source');assert.equal(source.audit.reads,0);assert.deepEqual(resolver.basePlan,base);
});
test('Original-source signature wins over derived-surface metadata and is retained at later levels',async()=>{
 const original=headerImage(webpLossless),image={provenance:{format:'png'},bytes:png,originalSource:original.image},resolver=createSelectedPlanResolver(image,{recompression:cfg('source')});
 for(const q of[1,50,100]){const plan=await resolver.resolve(q);assert.equal(plan.stage.codec,'webp');assert.equal(plan.sourceFormat,'webp');assert.equal(plan.sourceMode,'lossless');assert.equal(plan.selection,'source');}assert.equal(original.audit.reads,1);assert.equal(original.audit.releases,1);
});
test('blob-backed source signatures are read once per resolver rather than once per quality',async()=>{
 let slices=0,arrays=0;const image={provenance:{format:'png'},blob:{slice(start,end){slices++;assert.equal(start,0);assert.equal(end,65536);return{async arrayBuffer(){arrays++;return webpLossless.slice().buffer;}};}}},resolver=createSelectedPlanResolver(image,{recompression:cfg('source')});
 for(const q of[1,50,100])assert.equal((await resolver.resolve(q)).stage.codec,'webp');assert.equal(slices,1);assert.equal(arrays,1);
});
test('aborted resolution rejects before lookup, including the historical JPEG-null route',async()=>{
 const source=headerImage(jpeg),controller=new AbortController();controller.abort();const resolver=createSelectedPlanResolver(source.image,{recompression:cfg('source')});await assert.rejects(resolver.resolve(75,{signal:controller.signal}),{code:'CANCELLED'});assert.equal(source.audit.reads,0);
 const base=await resolveRecompressionPlan({},{bytes:jpeg});assert.throws(()=>selectedPlanFromBase({},base,{signal:controller.signal}),{code:'CANCELLED'});assert.throws(()=>deriveRecompressionPlan({},base,{signal:controller.signal}),{code:'CANCELLED'});assert.equal(selectedPlanFromBase({},base,{quality:-1,paletteAxis:'unused-before-JPEG-fallback'}),null,'JPEG retains its historical early fallback');
});
test('cancellation during a header read releases it, publishes no base and permits a clean retry',async()=>{
 const controller=new AbortController(),source=headerImage(png,{onRead:n=>{if(n===1)controller.abort();}}),resolver=createSelectedPlanResolver(source.image,{recompression:cfg('source')});await assert.rejects(resolver.resolve(70,{signal:controller.signal}),{code:'CANCELLED'});assert.equal(resolver.basePlan??null,null);assert.equal(source.audit.reads,1);assert.equal(source.audit.releases,1);assert.equal((await resolver.resolve(80)).stage.codec,'png');assert.equal(source.audit.reads,2);assert.equal(source.audit.releases,2);
});
test('header and release failures are never converted into a plan or cached as success',async()=>{
 for(const failureKind of['read','release']){const failure=new EngineError('HEADER_'+failureKind.toUpperCase()+'_FAILED','Injected '+failureKind+' failure'),source=headerImage(png,{onRead:n=>{if(failureKind==='read'&&n===1)throw failure;},onRelease:n=>{if(failureKind==='release'&&n===1)throw failure;}}),resolver=createSelectedPlanResolver(source.image,{recompression:cfg('source')});await assert.rejects(resolver.resolve(70),error=>error===failure);assert.equal(resolver.basePlan??null,null);assert.equal((await resolver.resolve(80)).stage.codec,'png');assert.equal(source.audit.reads,2);assert.equal(source.audit.releases,failureKind==='read'?1:2);}
});
test('unsupported input is not a cached JPEG fallback and separate owners never share source state',async()=>{
 const invalid=headerImage(Uint8Array.of(1,2,3)),resolver=createSelectedPlanResolver(invalid.image,{recompression:cfg('source')});await assert.rejects(resolver.resolve(75),{code:'UNSUPPORTED_FORMAT'});assert.equal(resolver.basePlan??null,null);invalid.setBytes(png);assert.equal((await resolver.resolve()).stage.codec,'png');assert.equal(invalid.audit.reads,2);
 const another=headerImage(webpLossless),other=createSelectedPlanResolver(another.image,{recompression:cfg('source')});assert.equal((await other.resolve()).stage.codec,'webp');assert.equal(another.audit.reads,1);assert.equal((await resolver.resolve(80)).stage.codec,'png');assert.equal(invalid.audit.reads,2);
});
test('a later cancelled request cannot masquerade as a cached success or invalidate a completed source plan',async()=>{
 const source=headerImage(png),resolver=createSelectedPlanResolver(source.image,{recompression:cfg('source')}),base=await resolver.resolve(75),controller=new AbortController();controller.abort();await assert.rejects(resolver.resolve(80,{signal:controller.signal}),{code:'CANCELLED'});assert.deepEqual(await resolver.resolve(75),base);assert.equal(source.audit.reads,1);assert.equal(source.audit.releases,1);
});

// These two small Node-worker checks use the real shipped PNG codec. They are
// separately selectable so benchmark owners can run pure plan tests alone.
const activeWorkers=new Set(),terminations=[];
class BrowserWorkerBridge{
 constructor(url){this.events=new Map();const code=`import{parentPort}from'node:worker_threads';import fs from'node:fs';const fetch0=globalThis.fetch;globalThis.fetch=async(url,...args)=>String(url).startsWith('file:')?new Response(fs.readFileSync(new URL(url))):fetch0(url,...args);const queued=[];globalThis.self={postMessage:(value,transfer)=>parentPort.postMessage(value,transfer)};parentPort.on('message',data=>self.onmessage?self.onmessage({data}):queued.push(data));await import(${JSON.stringify(String(url))});for(const data of queued)self.onmessage({data});`;this.worker=new NodeWorker(new URL('data:text/javascript,'+encodeURIComponent(code)),{type:'module'});activeWorkers.add(this.worker);this.worker.on('message',data=>{this.onmessage?.({data});for(const fn of this.events.get('message')??[])fn({data});});this.worker.on('error',error=>this.onerror?.({message:error.message}));}
 addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}removeEventListener(type,fn){this.events.get(type)?.delete(fn);}postMessage(data,transfer){this.worker.postMessage(data,transfer);}terminate(){activeWorkers.delete(this.worker);const stop=this.worker.terminate();terminations.push(stop);return stop;}
}
async function realWorkers(run){const previous=globalThis.Worker;globalThis.Worker=BrowserWorkerBridge;try{await run();}finally{globalThis.Worker=previous;await Promise.allSettled(terminations.splice(0));}}
test('real PNG recompressGray matches the historical double-resolution conversion and reads its source once',()=>realWorkers(async()=>{
 const budget=new Budget(256*1024**2),width=17,height=19,original=Uint8Array.from({length:width*height},(_,i)=>(i*37+(i>>>2)*19)&255),pixels={width,height,format:'gray8',data:original},source=headerImage(png,{poisonLoan:true}),params={quality:75,recompression:cfg('source',{paletteColors:19})},codec=createSelectedCodec(source.image,params,{budget,paletteAxis:'relative'});
 try{for(const quality of[70,75,80]){const actual=await codec.recompressGray(pixels,quality),plan=await historicalSelectedPlan(params,{bytes:png},{quality,paletteAxis:'relative'}),rgb=new Uint8Array(original.length*3);for(let i=0;i<original.length;i++)rgb.fill(original[i],i*3,i*3+3);const expected=await recompressPixels({width,height,format:'rgb8',data:rgb},plan,{budget});try{const grayReference=Uint8Array.from({length:original.length},(_,i)=>gray(expected.pixels.data[i*3],expected.pixels.data[i*3+1],expected.pixels.data[i*3+2]));assert.deepEqual(actual,{width,height,format:'gray8',data:grayReference});}finally{await expected.release();}}
  assert.deepEqual(pixels.data,original);assert.equal(source.audit.reads,1);assert.equal(source.audit.releases,1);assert.equal(codec.id,'selected-rgb-codec/'+selectionIdentity(params));const rgb=new Uint8Array(original.length*3);for(let i=0;i<original.length;i++)rgb.fill(original[i],i*3,i*3+3);const color=await codec.recompress({width,height,format:'rgb8',data:rgb},75);assert.equal(color.provenance.plan.selection,'source');assert.equal(color.provenance.plan.sourceFormat,'png');assert.equal(color.provenance.plan.sourceMode,'lossless');assert.equal(color.provenance.plan.stage.paletteColors,19);assert.equal(source.audit.reads,1);
 }finally{disposeRecompressionCodecs(budget);}assert.equal(budget.total(),0);
}));
test('real selected sweep reuses the resolved source across planning and codec lanes',()=>realWorkers(async()=>{
 const budget=new Budget(256*1024**2),width=17,height=19,data=Uint8Array.from({length:width*height*3},(_,i)=>(i*43+(i>>>3)*17)&255),surface=createRgbSurface({byteLength:data.length,readInto:(out,at=0)=>out.set(data.subarray(at,at+out.length))},{width,height,budget,ownsStore:false}),source=headerImage(png,{poisonLoan:true}),image={surface,originalSource:source.image},params={quality:75,recompression:cfg('source',{paletteColors:19})};
 try{const result=await segmentedRecompressionLosses(surface,[1,100],{image,budget,recompressionParams:params,backend:'cpu',maxWorkers:1});assert.deepEqual(result.metrics.probeLevels.map(p=>p.paletteColors),[2,256]);assert.equal(result.metrics.recompressionPlan.selection,'source');assert.equal(result.metrics.recompressionPlan.sourceMode,'lossless');assert.equal(source.audit.reads,1);assert.equal(source.audit.releases,1);assert(result.raw[0]>0);assert.equal(result.raw[1],0);
 }finally{await surface.dispose();disposeRecompressionCodecs(budget);}assert.equal(budget.total(),0);
}));
test.after(async()=>{await Promise.allSettled([...activeWorkers].map(worker=>worker.terminate()));});
