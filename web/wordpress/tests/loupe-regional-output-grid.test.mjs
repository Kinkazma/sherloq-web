// Geometry/transport/ownership only. No 7C model is executed by these tests.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile,open} from 'node:fs/promises';import vm from 'node:vm';import {createHash} from 'node:crypto';
import {installNativeTileWorker} from '../sherloq-browser/assets/pdf-native-tile-worker.js';
import {createRegionalLoupeImage} from '../sherloq-browser/assets/pdf-native-regional-image.js';
import {createLoupeImageCache} from '../sherloq-browser/assets/pdf-native-effects.js';
import {regionalEffectsOutputGeometry} from '../sherloq-browser/assets/equalization-regional-effects.js';
import {effectDefaults,validateLoupeEffects,adjustmentParameters,sweepPixels} from '../sherloq-browser/assets/loupe-effects-settings.js';
import {equalizationState,equalizationMethods,equalizationPlan} from '../../engine-source/src/equalization-settings.js';
import {proxyGeometry} from '../../engine-source/src/sherloq7c-proxy-geometry.js';
import {sherloq7cWindowRecords} from '../../engine-source/src/sherloq7c-window-records.js';
import {retireCompositeOwners} from '../../engine-source/src/composite-owner-release.js';
import {checkAbort,requireValue} from '../../engine-source/src/errors.js';
import {Budget} from '../../engine-source/src/cache.js';import {createSegmentedBytes} from '../../engine-source/src/segmented-bytes.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));async function until(predicate){for(;;){const value=predicate();if(value)return value;await tick();}}
const equalization=(method,maxSide=256)=>equalizationState({method,values:equalizationMethods.map(m=>m.default),sherloq7c:{maxSide}});
const reducedEffects=()=>validateLoupeEffects({adjust:{...effectDefaults.adjust,enabled:true},enhance:{...effectDefaults.enhance,enabled:true,mode:'equalize',equalization:equalization('sherloq7c')},sweep:{...effectDefaults.sweep,enabled:true}});
const manifestPath=process.env.SHERLOQ_REAL_CROP_MANIFEST;let fixture;
if(manifestPath){const manifest=JSON.parse(await readFile(manifestPath,'utf8')),d=manifest.domains.find(v=>v.domain==='sdr8');assert.deepEqual([d.offset,d.byteLength,d.width,d.height],[0,786432,512,512]);const bytes=new Uint8Array(d.byteLength),file=await open(manifest.data.path,'r');try{const read=await file.read(bytes,0,bytes.length,d.offset);assert.equal(read.bytesRead,bytes.length);}finally{await file.close();}assert.equal(createHash('sha256').update(bytes).digest('hex'),d.sha256);fixture={bytes};}
function real(rect,offset=0){assert(fixture);assert([rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger));assert(rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width+offset<=512&&rect.y+rect.height+offset<=512);const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++){const at=((rect.y+y+offset)*512+rect.x+offset)*3;data.set(fixture.bytes.subarray(at,at+rect.width*3),y*rect.width*3);}return{format:'rgb8',width:rect.width,height:rect.height,data};}
class Canvas{constructor(width,height){this.width=width;this.height=height;}getContext(){return{createImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData(){},getImageData:(_x,_y,width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),isContextLost:()=>false};}addEventListener(){}removeEventListener(){}}
function uiHarness({reduced=true,invalid=false}={}){
 const workers=[],reads=[],oldWorker=globalThis.Worker,oldCanvas=globalThis.OffscreenCanvas;
 class Worker{
  constructor(){this.messages=[];this.budgets=[];this.closed=false;this.created=0;this.disposedSurfaces=0;this.keepAlive=setInterval(()=>{},1000);workers.push(this);const self=this;
   this.scope={postMessage(message){queueMicrotask(()=>self.onmessage?.({data:message}));},close(){self.closed=true;clearInterval(self.keepAlive);},reportError(error){self.failure=error;}};
   this.runtime=installNativeTileWorker(this.scope,{async loadModule(url){const name=new URL(url).pathname.split('/').at(-1);
    if(name==='pdf-native-regional-image.js')return{createRegionalLoupeImage(source,p,options){self.created++;if(!reduced&&!invalid)return createRegionalLoupeImage(source,p,options);
     // Controlled computed-output boundary carrying only real photographic
     // bytes. It qualifies transport, not the frozen7C numerical algorithm.
     const g=regionalEffectsOutputGeometry(source.descriptor,validateLoupeEffects(p));return{descriptor:{width:invalid?513:g.width,height:g.height,format:'rgb8',coordinates:'selected-output-resolution'},metrics:{controlledOutputBoundary:true},async readWindow(rect,hooks){assert(rect.x+rect.width<=g.width&&rect.y+rect.height<=g.height);return source.readWindow({...rect,x:rect.x+256,y:rect.y+256},hooks);},async dispose(){self.disposedSurfaces++;}};
    }};
    if(name==='cache.js')return{Budget:class extends Budget{constructor(limit){super(limit);self.budgets.push(this);}}};
    if(name==='segmented-bytes.js')return{createSegmentedBytes};
    if(name==='temporary-storage.js')return{createTemporarySession:async()=>{throw Error('The funded real-crop output fits memory; no temporary backend needed.');}};
    throw Error('Unexpected worker module '+url);
   }});
  }
  postMessage(message){this.messages.push(message);queueMicrotask(()=>this.scope.onmessage({data:message}));}
  terminate(){this.scope.onmessage({data:{action:'dispose'}});}
 }
 globalThis.Worker=Worker;globalThis.OffscreenCanvas=Canvas;
 const cache=createLoupeImageCache({memoryBudgetBytes:32*1024**2,presentationCacheBytes:1024**2}),input={width:512,height:512,readPixels(rect){reads.push({...rect});return Promise.resolve(real(rect));}};
 return{cache,input,workers,reads,async close(surface){try{await surface?.close();await cache.dispose();for(const worker of workers){await until(()=>worker.closed);if(worker.failure)throw worker.failure;for(const budget of worker.budgets)assert.equal(budget.total(),0);}}finally{globalThis.Worker=oldWorker;globalThis.OffscreenCanvas=oldCanvas;}}};
}

test('declared regional output geometry composes enabled stages without replacing their algorithms',()=>{
 const p=reducedEffects();assert.deepEqual(regionalEffectsOutputGeometry({width:512,height:512},p),{width:256,height:256,sourceWidth:512,sourceHeight:512,coordinateDomain:'selected-output-resolution'});
 p.adjust.equalize=1;p.adjust.equalization=equalization('sherloq7c',256);p.enhance.equalization=equalization('sherloq7c',512);assert.equal(regionalEffectsOutputGeometry({width:512,height:384},p).width,256);assert.equal(regionalEffectsOutputGeometry({width:512,height:384},p).height,192);
 for(const method of ['none','histogram','clahe','ahe','bbhe']){const plain=validateLoupeEffects({enhance:{...effectDefaults.enhance,enabled:true,equalization:equalization(method)}});assert.deepEqual(regionalEffectsOutputGeometry({width:512,height:512},plain),{width:512,height:512,sourceWidth:512,sourceHeight:512,coordinateDomain:'native'});}
});

test('actual tile protocol keeps Original reads512 and selected output256 with complete prefetch and exact corner',{skip:!fixture},async()=>{
 const h=uiHarness();let surface;try{surface=await h.cache.acquire(h.input,reducedEffects());assert.deepEqual([surface.width,surface.height],[256,256]);assert.equal(surface.coordinateDomain,'selected-output-resolution');assert.deepEqual(surface.presentationCoordinateTransform,{sourceWidth:512,sourceHeight:512,outputWidth:256,outputHeight:256,toSource:[2,2],toOutput:[.5,.5]});
  surface.prepare({left:1,top:1,right:20,bottom:20},1);await until(()=>surface.metrics.computedTiles===4&&surface.metrics.background===false);assert.equal(surface.metrics.totalTiles,4);assert.equal(surface.metrics.outputStoreWrites,4);assert.equal(surface.metrics.outputStoreBytes,256*256*3);assert(h.reads.some(r=>r.x>=256),'Source channel must still admit Original windows beyond output coordinates');assert(h.reads.every(r=>r.x+r.width<=512&&r.y+r.height<=512));
  const before=h.reads.length,rect={x:128,y:128,width:128,height:128},pixels=await surface.readPixels(rect);assert.deepEqual(pixels.data,real(rect,256).data);assert.equal(h.reads.length,before);await assert.rejects(surface.readPixels({x:255,y:255,width:2,height:2}),{code:'INVALID_INPUT'});const fork=surface.fork();assert.equal(fork.width,256);assert.equal(fork.height,256);await fork.close();
 }finally{await h.close(surface);}
});

test('unchanged production identity route remains lazy and keeps Original512 output and bytes',{skip:!fixture},async()=>{
 const h=uiHarness({reduced:false});let surface;try{surface=await h.cache.acquire(h.input,structuredClone(effectDefaults));assert.equal(h.reads.length,0);assert.equal(surface.width,512);assert.equal(surface.presentationCoordinateTransform,undefined);surface.prepare({left:1,top:1,right:20,bottom:20},1);await until(()=>surface.metrics.computedTiles===16&&surface.metrics.background===false);assert.equal(surface.metrics.outputStoreWrites,16);assert.equal(surface.metrics.outputStoreBytes,512*512*3);const before=h.reads.length,rect={x:384,y:384,width:128,height:128};assert.deepEqual((await surface.readPixels(rect)).data,real(rect).data);assert.equal(h.reads.length,before);}finally{await h.close(surface);}
});

test('invalid enlarged output and partial Original tile restrictions retire before any source read',{skip:!fixture},async()=>{
 for(const invalid of [true,false]){const h=uiHarness({invalid});try{if(!invalid)h.input.allowedTiles=['0:0'];await assert.rejects(h.cache.acquire(h.input,reducedEffects()),error=>error.code===(invalid?'WORKER_MESSAGE_FAILED':'SOURCE_SCOPE_UNSUPPORTED'));assert.equal(h.reads.length,0);assert.equal(h.workers[0].disposedSurfaces,1);}finally{await h.close();}}
});

const regionalText=await readFile(new URL('../sherloq-browser/assets/equalization-regional-effects.js',import.meta.url),'utf8');
function ownedPipeline({mismatch=false}={}){
 const calls={adjust:0,enhance:0,adjustDisposed:0,scalarDisposed:0,nativeDisposed:0,resultReleased:0},budget=new Budget(32*1024**2),original={descriptor:{width:512,height:512,format:'rgb8'},async readWindow(rect){return{pixels:real(rect),release(){}};}};
 const context=vm.createContext({AbortController,AbortSignal,Set,Object,Array,Promise,checkAbort,requireValue,equalizationPlan,proxyGeometry,retireCompositeOwners,adjustmentParameters,sweepPixels,
  segmentedAdjust:async image=>{calls.adjust++;const upstream=image.surface;return{surface:{descriptor:upstream.descriptor,readWindow:(...args)=>upstream.readWindow(...args),async dispose(){calls.adjustDisposed++;}},metrics:{controlledStageBoundary:true}};},
  segmentedMagnifierLarge:async()=>{calls.enhance++;const width=mismatch?128:256,result={width,height:256,metrics:{},async readWindow(rect){return{data:real(rect,256).data,release(){}};},async release(){calls.resultReleased++;}};const records=sherloq7cWindowRecords(result,budget);for(const [key,counter]of [['intensity','scalarDisposed'],['rgb16','nativeDisposed']]){const plane=records.planeRecords[key].surface,dispose=plane.dispose;plane.dispose=async()=>{await dispose();calls[counter]++;};}records.planeRecords.alias=records.planeRecords.intensity;return{...records,metrics:{controlledStageBoundary:true}};}
 });
 new vm.Script(regionalText.replace(/^import[^\n]*\n/gm,'').replaceAll('export function ','function ')+'\nglobalThis.__create=createEqualizationRegionalEffects;',{filename:'equalization-regional-effects.js#actual-owner-protocol'}).runInContext(context);
 return{pipeline:context.__create(original,reducedEffects(),{budget}),calls,budget};
}

test('actual regional wrapper retires unused shared scalar/RGB16 claims while keeping RGB8 alive',{skip:!fixture},async()=>{
 const h=ownedPipeline();try{assert.equal(h.pipeline.descriptor.width,256);const rect={x:128,y:128,width:32,height:32},part=await h.pipeline.readWindow(rect);assert.deepEqual(part.pixels.data,sweepPixels(real(rect,256),reducedEffects().sweep).data);await part.release();assert.equal(h.calls.adjust,1);assert.equal(h.calls.enhance,1);assert.equal(h.calls.scalarDisposed,1);assert.equal(h.calls.nativeDisposed,1);assert.equal(h.calls.resultReleased,0,'RGB8 still owns the shared frozen-result claim');}finally{await h.pipeline.dispose();assert.equal(h.calls.resultReleased,1);assert.equal(h.calls.adjustDisposed,1);assert.equal(h.budget.total(),0);}
});

test('declared/final grid mismatch closes every adopted view rather than serving wrong coordinates',{skip:!fixture},async()=>{
 const h=ownedPipeline({mismatch:true});try{await assert.rejects(h.pipeline.readWindow({x:0,y:0,width:1,height:1}),{code:'INVALID_INPUT'});assert.equal(h.calls.resultReleased,1);}finally{await h.pipeline.dispose();assert.equal(h.calls.resultReleased,1);assert.equal(h.budget.total(),0);}
});
