import {energyFrameBudget,assertEnergyFrameBudget} from '../sherloq-browser/assets/energy-frame-budget.js';
import {energyParams} from '../../engine-source/src/energy-pipeline.js';
import {energyProfile} from '../../engine-source/src/energy-auto.js';
import {prepareEnergy} from '../../engine-source/src/energy-prepare.js';
import {segmentEnergy,energyColor} from '../../engine-source/src/energy-segment.js';
import {energyLogData} from '../../engine-source/src/energy-log-data.js';
import {referenceLogFunction} from '../../engine-source/src/energy-log-reference.js';
import {renderEnergySurface} from '../sherloq-browser/assets/energy-surface-render.js';
import {energyHistogramAnalysis} from '../sherloq-browser/assets/energy-native-fields.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EngineError,serializeEngineError,deserializeEngineError,normalizeResourceError} from '../sherloq-browser/assets/unified-engine/src/errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from '../sherloq-browser/assets/unified-engine/src/worker-message-protocol.js';
import {validateParams} from '../sherloq-browser/assets/unified-engine/src/ela.js';
import {samplePixels} from '../sherloq-browser/assets/unified-engine/src/display-sampling.js';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
import {resolveComputeProfile} from '../sherloq-browser/assets/resource-policy.js';
import {energyExportChunks} from '../sherloq-browser/assets/streaming-export.js';
import {estimateElaClassicAuto,calibrateElaClassicDisplay} from '../sherloq-browser/assets/ela-auto-estimate.js';
import {createAdaptivePreview} from '../sherloq-browser/assets/adaptive-preview.js';
import {createEnergyParameterPreview} from '../sherloq-browser/assets/energy-parameter-preview.js';
import {createEnergyHistogram} from '../sherloq-browser/assets/energy-histogram.js';
import {sourceRegionDomainShape} from '../../engine-source/src/source-region-capabilities.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../../engine-source/src/source-region-geometry.js';
import {createEngine} from '../../engine-source/src/index.js';
import {initJpegWasm,jpegCodec} from '../../engine-source/src/jpeg.js';
import {jpegHeader} from '../../engine-source/src/image-headers.js';

// An actual generated8×8 Q75 JPEG. No private image, model or site fixture.
const jpeg=Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDh9P0rp8tFFFepBKxpg8RU9ktT/9k=','base64'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sha='a'.repeat(64),preferences={quality:83,scale:50,contrast:20,linear:true,grayscale:true};
const workerURL=new URL('../sherloq-browser/assets/engine-worker.js',import.meta.url),code=(await readFile(workerURL,'utf8')).replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(workerURL.href)).replace("await import('./unified-engine/src/index.js')",'await loadEngine()');
function protocol(engine,{consumerBytes=32*1024**2}={}){
 const messages=[];let serial=0;
 const context=vm.createContext({Blob,URL,performance,AbortController,Uint8Array,Float32Array,Int32Array,EngineError,serializeEngineError,deserializeEngineError,normalizeResourceError,installWorkerMessageProtocol,workerMessageFailure,validateParams,samplePixels,renderEnergy,renderEnergySurface,energyHistogramAnalysis,energyFrameBudget,assertEnergyFrameBudget,resolveComputeProfile,energyExportChunks,estimateElaClassicAuto,calibrateElaClassicDisplay,createAdaptivePreview,createEnergyParameterPreview,createEnergyHistogram,compileOriginalSourceRegions,sourceRegionDomainShape,loadEngine:async()=>({createEngine:()=>engine}),self:{postMessage(message){messages.push(structuredClone(message));if(message.chunk)queueMicrotask(()=>context.self.onmessage({data:{id:message.id,action:'export-ack',sequence:message.sequence}}));}}});
 new vm.Script(code).runInContext(context);
 async function send(action,payload={}){const id=++serial;context.self.onmessage({data:{id,action,payload,options:{computeProfile:'maximum',uiRGBBudgetBytes:consumerBytes,uiReserveBytes:32*1024**2}}});for(let i=0;i<5000;i++){const answer=messages.find(m=>m.id===id&&(m.error||Object.hasOwn(m,'result')));if(answer)return answer;await new Promise(resolve=>setTimeout(resolve,1));}throw Error('Worker did not settle '+action);}
 return{context,messages,send,cancel:()=>context.self.onmessage({data:{action:'cancel'}})};
}
// Protocol/helper/render are real; this fixture injects declared scientific
// results to exercise ownership, sampling and failures independently of JPEG.
function fixture({width=401,height=257,layout='surface',header={format:'jpeg',...jpegHeader(jpeg)}}={}){
 const data={width,height,energy_low_score:new Float32Array(width*height).fill(.25),energy_high_score:new Float32Array(width*height),energy_scope:new Int32Array(width*height).fill(1),energy_labels:new Int32Array(width*height),regions:[],regionColors:[],metadata:{quality:75}},live=new Map(),surfaces=new Set(),audit={runs:[],headers:0,blobs:[],sourceReads:0,sampled:[],released:[],failRead:false,failRelease:false,failAdmission:false,cancelAfterRun:false,invalidShape:false};let lease=0;
 const residual={width,height,format:'rgb8',data:new Uint8Array(width*height*3).fill(12)};
 const engine={capabilities:()=>({ready:true}),loadBlob:async()=>({width,height,sha256:sha,surface:{id:'original',revision:1,width,height,format:'rgb8'}}),inspectHeaders:async({blob})=>{audit.headers++;audit.blobs.push(blob);return{header,metrics:{encodedReadMode:'marker-prefix'}};},reserveExternalMemory:async({bytes})=>{if(audit.failAdmission)throw new EngineError('MEMORY_LIMIT','Injected admission refusal');const id=++lease;live.set(id,bytes);return{id,bytes};},releaseExternalMemory:async id=>{assert.ok(live.has(id));live.delete(id);},readPixels:async({rect})=>{audit.sourceReads++;return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3).fill(100)}};},readDisplay:async({surfaceId,tile},{signal}={})=>{audit.sampled.push({surfaceId,tile});if(audit.failRead)throw new EngineError('READ_FAILED','Injected sample read failure');const sample=await samplePixels(residual,tile,{signal});try{return{pixels:sample.pixels,metrics:{nativeRead:true}};}finally{sample.release();}},run:async task=>{audit.runs.push(structuredClone(task));if(task.operation==='ela.energy')return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',data,provenance:{params:task.params,originalSha256:sha}};const surface={id:'calibration-'+task.id,revision:1,width:audit.invalidShape?width-1:width,height,format:'rgb8'};if(layout==='surface')surfaces.add(surface.id);if(audit.cancelAfterRun)h.cancel();return{id:task.id,imageId:task.imageId,operation:'ela.classic',status:'ok',provenance:{params:task.params,originalSha256:sha},metrics:{cache:{recompressed:true},workers:8},...(layout==='surface'?{layout:'surface',surface}:{pixels:residual})};},releaseSurface:async id=>{audit.released.push(id);surfaces.delete(id);if(audit.failRelease)throw new EngineError('RELEASE_FAILED','Injected cleanup failure');}};
 const h=protocol(engine),blob=new Blob([jpeg]);return{...h,blob,engine,audit,live,surfaces,data,load:()=>h.send('load',{id:'image',blob}),estimate:params=>h.send('estimate-ela-auto',{imageId:'image',sourceSha256:sha,params:params??preferences})};
}

// Restore the unchanged scientific recipe after a real parameter draft. The
// protocol must make the native frame readable/exportable again, for both Energy
// colors and the Biomes label presentation, without invoking the analysis twice.
for(const view of ['scores','labels'])test('native '+view+' restoration ends a cancelled parameter draft transaction',async()=>{
 const h=fixture({width:80,height:80}),params={quality:75,block:16,minimum:1,profile:'manual'};
 h.context.createEnergyParameterPreview=()=>({async render(){return{pixels:{width:8,height:8,format:'rgb8',data:new Uint8Array(8*8*3),preview:true,logicalWidth:80,logicalHeight:80},presentation:{view,preview:true},draft:{params:{...params,minimum:2}}};},async dispose(){}});
 // Raster export is represented by a tiny deterministic payload here: this is a
 // worker-state/ownership test, not a PNG codec test.
 let exports=0,releases=0;h.engine.exportPixelBuffer=async({pixels})=>{exports++;assert.notEqual(pixels.preview,true);return{id:'png',revision:1,byteLength:3};};h.engine.readExport=async()=>({bytes:Uint8Array.of(1,2,3)});h.engine.releaseExport=async()=>{releases++;};
 await h.load();const first=await h.send('run',{id:'energy',imageId:'image',operation:'ela.energy',params,presentation:{view,field:'unified'}});assert.equal(first.error,undefined);const original=vm.runInContext('lastEnergy',h.context),recipe=structuredClone(original.provenance.params),runs=h.audit.runs.length;
 const preview=await h.send('preview-energy-parameters',{resultId:'energy',params:{...params,minimum:2},presentation:{view},preview:{maxWidth:8,maxHeight:8}});assert.equal(preview.error,undefined);assert.equal(vm.runInContext('parameterDraft',h.context),true);assert.equal((await h.send('export-raster',{display:preview.result.display})).error.code,'PREVIEW_NOT_EXPORTABLE');
 const restored=await h.send('view-energy',{resultId:'energy',presentation:{view,field:'unified'}});assert.equal(restored.error,undefined);assert.equal(restored.result.display.preview,undefined);assert.equal(vm.runInContext('parameterDraft',h.context),false);assert.equal(vm.runInContext('parameterDraftKind',h.context),null);
 const read=await h.send('read-window',{display:restored.result.display,rect:{x:0,y:0,width:80,height:80}});assert.equal(read.error,undefined);const exported=await h.send('export-raster',{display:restored.result.display});assert.equal(exported.error,undefined);assert.equal(exports,1);assert.equal(releases,1);assert.equal(h.audit.runs.length,runs);assert.equal(vm.runInContext('lastEnergy',h.context),original);assert.deepEqual(original.provenance.params,recipe);assert.equal(h.live.size,0);
});

test('failed or provisional restoration cannot unlock native exports',async()=>{
 const h=fixture({width:80,height:80});await h.load();await h.send('run',{id:'energy',imageId:'image',operation:'ela.energy',params:{quality:75},presentation:{view:'scores',field:'unified'}});vm.runInContext("parameterDraft=true;parameterDraftKind='energy'",h.context);
 const provisional=await h.send('view-energy',{resultId:'energy',presentation:{view:'scores',field:'unified'},preview:{maxWidth:16,maxHeight:16}});assert.equal(provisional.error,undefined);assert.equal(provisional.result.display.preview,true);assert.equal(vm.runInContext('parameterDraft',h.context),true);assert.equal((await h.send('export-raster',{display:provisional.result.display})).error.code,'PREVIEW_NOT_EXPORTABLE');
 const failed=await h.send('view-energy',{resultId:'energy',presentation:{view:'scores',field:'unified',threshold:-1}});assert.ok(failed.error,'A valid result whose renderer refuses the presentation must remain dirty');assert.equal(vm.runInContext('parameterDraft',h.context),true);assert.equal(h.live.size,0);
});

test('replacing a native result releases its seven unique plane handles and owned crop alias before the next analysis',async()=>{
 for(const cropped of[false,true]){const h=fixture({width:80,height:80}),run=h.engine.run,live=new Set(),released=[];let serial=0;h.engine.run=async task=>{assert(live.size<=(cropped?1:0)&&[...live].every(id=>id.endsWith('-crop')),'Only the still-visible comparison source may precede the new native run');const out=await run(task),prefix='run'+(++serial),primary={id:prefix+'-low',width:80,height:80,revision:1};const planeSurfaces=Object.fromEntries(['energy_low_score','energy_high_score','energy_scope','energy_labels','energy_plane_0','energy_plane_1','energy_plane_2'].map((key,i)=>[key,i===0?primary:{...primary,id:prefix+'-'+key}]));for(const handle of Object.values(planeSurfaces))live.add(handle.id);if(cropped)live.add(prefix+'-crop');return{...out,surface:primary,planeSurfaces,...(cropped?{sourceRegionSourceSurface:{...primary,id:prefix+'-crop'}}:{sourceRegionSourceSurface:{...primary,id:'original'}})};};h.engine.releaseSurface=async id=>{assert.notEqual(id,'original','The original source is borrowed');assert(live.delete(id),'A handle must be released once only: '+id);released.push(id);};
 await h.load();for(let i=0;i<3;i++){const out=await h.send('run',{id:'r'+i,imageId:'image',operation:'ela.energy',params:{quality:75,minimum:i+1},presentation:{view:'scores',field:'unified'}});assert.equal(out.error,undefined,out.error?.message);assert.equal(live.size,cropped?(i===0?8:9):7);}assert.equal(released.length,cropped?15:14);h.engine.run=async()=>{throw new EngineError('NATIVE_REFUSED','Injected next-run refusal');};const refused=await h.send('run',{id:'refused',imageId:'image',operation:'ela.energy',params:{quality:75},presentation:{view:'scores',field:'unified'}});assert.equal(refused.error.code,'NATIVE_REFUSED');assert.deepEqual([...live],cropped?['run3-crop']:[],'A failed replacement keeps only the still-visible comparison alias');if(cropped){const oldSource=await h.send('read-window',{display:{id:'run3-crop',width:80,height:80,revision:1},rect:{x:0,y:0,width:80,height:80}});assert.equal(oldSource.error,undefined);}const loaded=await h.send('load',{id:'replacement',blob:h.blob});assert.equal(loaded.error,undefined);assert.equal(live.size,0);assert.equal(released.length,(cropped?8:7)*3);assert.equal(h.live.size,0);}
});
test('a native Energy bundle whose initial presentation fails is retired instead of pinned invisibly',async()=>{const h=fixture({width:80,height:80}),run=h.engine.run,released=[];h.engine.run=async task=>({...await run(task),surface:{id:'failed-low',width:80,height:80,revision:1},planeSurfaces:{energy_low_score:{id:'failed-low',width:80,height:80,revision:1},energy_high_score:{id:'failed-high',width:80,height:80,revision:1}}});h.engine.releaseSurface=async id=>released.push(id);await h.load();const out=await h.send('run',{id:'failed',imageId:'image',operation:'ela.energy',params:{quality:75},presentation:{view:'scores',field:'unified',threshold:-1}});assert.ok(out.error);assert.deepEqual(released.sort(),['failed-high','failed-low']);assert.equal(vm.runInContext('lastEnergy',h.context),null);assert.equal(h.live.size,0);});
