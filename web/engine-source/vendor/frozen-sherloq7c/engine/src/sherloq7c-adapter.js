import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {loadNativeRgb16} from './native-rgb16-source.js';
import {contiguousSurface} from './image-sources.js';
import {createNumericSurface} from './numeric-surface.js';

export function sherloq7cParams(input={}){
 requireValue(input&&typeof input==='object'&&!Array.isArray(input),'Sherloq parameters required.');
 const p={revelation:0,micro:0,precision:'1e-2',...input};
 requireValue(Object.keys(p).every(k=>['revelation','micro','precision'].includes(k))&&[p.revelation,p.micro].every(v=>Number.isFinite(v)&&v>=0&&v<=100)&&['reference','1e-7','1e-4','1e-2'].includes(p.precision),'Invalid Sherloq controls.');return p;
}

function native16Surface(result,{budget,dispose}){
 const width=result.width,height=result.height,id=crypto.randomUUID();let closed=false,pending;
 return{descriptor:Object.freeze({id,revision:1,width,height,format:'rgb16',bitDepth:16,channelOrder:'RGB',coordinates:'full-resolution',storage:'memory',semantics:result.metrics?.presentationFinish?'Native RGB16 after optional presentation threshold/inversion; the Sherloq certificate describes the preceding scalar stage.':'Sherloq native unsigned RGB16 output; display RGB8 is separate.'}),
  async readWindow({x=0,y=0,width:w=width,height:h=height}={}, {signal}={}){
   if(closed)throw new EngineError('DISPOSED','Native16 result is closed.');checkAbort(signal);
   requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x<=width-w&&y<=height-h&&w*h*6<=4*1024**2,'Native16 windows must fit the image and the4MiB transfer bound.');
   const owner=allocateOwnedTypedArray(Uint16Array,w*h*3,{budget,owner:'sherloq16-window',label:'sherloq-native16-window'});
   try{for(let row=0;row<h;row++){if(row%32===0)await controlCheckpoint(signal);owner.data.set(result.pixels16.subarray(((y+row)*width+x)*3,((y+row)*width+x+w)*3),row*w*3);}checkAbort(signal);return{surfaceId:id,revision:1,origin:[x,y],pixels:{width:w,height:h,format:'rgb16',bitDepth:16,data:owner.data},release:owner.release};}catch(error){owner.release();throw error;}
  },dispose(){if(pending)return pending;closed=true;pending=Promise.resolve().then(dispose).catch(error=>{pending=null;throw error;});return pending;}};
}

export function sherloq7cResultRecords(result,budget){
 let refs=3;const retired=new Set();
 const retire=key=>async()=>{if(retired.has(key))return;if(refs>1){retired.add(key);refs--;return;}await result.release?.();retired.add(key);refs=0;};
 const rgbPixels={width:result.width,height:result.height,format:'rgb8',data:result.pixels},rgb=contiguousSurface(rgbPixels,budget),close=rgb.dispose.bind(rgb);let rgbPending;
 rgb.dispose=()=>rgbPending??=(async()=>{await close();rgbPixels.data=null;await retire('rgb8')();})().catch(error=>{rgbPending=null;throw error;});
 let scalarBytes=new Uint8Array(result.scalar.buffer,result.scalar.byteOffset,result.scalar.byteLength);
 const store={byteLength:scalarBytes.byteLength,storage:'memory',readInto(target,offset){target.set(scalarBytes.subarray(offset,offset+target.byteLength));}};
 const scalar=createNumericSurface(store,{width:result.width,height:result.height,format:'float64',budget,semantics:'Sherloq7C normalized scalar intensity before RGB quantization and optional presentation threshold/inversion.',dispose:async()=>{scalarBytes=null;await retire('scalar')();}});
 const scalarClose=scalar.dispose.bind(scalar);let scalarStarted=false,scalarPending;
 scalar.dispose=()=>scalarPending??=(async()=>{if(scalarStarted)await retire('scalar')();else{scalarStarted=true;await scalarClose();}})().catch(error=>{scalarPending=null;throw error;});
 const native=native16Surface(result,{budget,dispose:retire('native16')});
 return{surface:rgb,planeRecords:{intensity:{surface:scalar},rgb16:{surface:native}}};
}

export function createSherloq7cAdapter({budget,version,publishResult}={}){
 const entries=new Map();let closed=false,active=false,core,currentImageId=null;
 const unregister=budget.registerAsyncReclaimer?.(async({signal}={})=>{if(active||closed)return 0;let bytes=0;for(const entry of entries.values()){checkAbort(signal);const source=entry.source;if(!source)continue;const size=source.data?.byteLength??0;await source.dispose();entry.source=null;bytes+=size;}return bytes;},{owner:'sherloq7c-native-source',label:'idle-native-rgb16-cache',allocationKind:'array-buffer'});
 async function runtime(){if(!core){const{createSherloq7C}=await import('./sherloq7c.js');core=createSherloq7C({budget});}return core;}
 async function clearImage(id){const entry=entries.get(id);if(!entry)return;if(currentImageId===id){await core?.clearCache();currentImageId=null;}await entry.source?.dispose();entries.delete(id);}
 return{
  runtime,
  async run(task,image,{signal,onProgress}={}){
   if(active)throw new EngineError('BUSY','Sherloq adapter is already running.');active=true;
   try{
   if(closed)throw new EngineError('DISPOSED','Sherloq adapter is closed.');const p=sherloq7cParams(task.params),started=performance.now();
   if(task.regions&&(!Array.isArray(task.regions)||task.regions.length)||task.scientificScope||task.exclusions?.length)throw new EngineError('UNSUPPORTED_REGION','Sherloq7C currently requires the complete original image; this scope needs a separate native16 qualification.');
   let entry=entries.get(task.imageId);if(entry&&entry.sha256!==image.sha256)throw new EngineError('SOURCE_CHANGED','Sherloq original identity changed.');
   if(!entry){entry={sha256:image.sha256,source:null};entries.set(task.imageId,entry);}
   const sourceCached=!!entry.source;entry.source??=await loadNativeRgb16(image,{budget,signal,onProgress});checkAbort(signal);
   await runtime();
   let result,record,published=false;
   try{
    const input={width:entry.source.width,height:entry.source.height,data:entry.source.data,format:'rgb16',bitDepth:16,sourceSha256:image.sha256,sourceId:task.imageId,immutable:true,sourceBitDepth:entry.source.sourceBitDepth};
    result=await core.run(input,{revelation:p.revelation/100,micro:p.micro/100,precision:p.precision},{signal,onProgress,backend:task.backend??'auto'});currentImageId=task.imageId;checkAbort(signal);
    requireValue(result.pixels instanceof Uint8Array&&result.pixels16 instanceof Uint16Array&&result.scalar instanceof Float64Array&&typeof result.release==='function','Owned Sherloq outputs required.');
    record=sherloq7cResultRecords(result,budget);const bundle=publishResult(task.imageId,record);published=true;
    return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,
     layers:[{id:'sherloq7c',kind:'rgb',surfaceId:bundle.surface.id,origin:[0,0],range:[0,255]}],
     data:{version:'7C',sourceBitDepth:entry.source.sourceBitDepth,workingBitDepth:16,resultBitDepth:16,scalarPrecision:'float64',native16:bundle.planeSurfaces.rgb16,scalar:bundle.planeSurfaces.intensity},
     semantics:'Global Sherloq7C graph optimization on native RGB16; scalar and RGB16 outputs are retained independently of display RGB8.',
     provenance:{engine:version,operation:task.operation,params:p,backend:result.metrics?.actualBackend??result.metrics?.backend??'cpu',originalSha256:image.sha256,sourceUnchanged:true,decode:entry.source.provenance,native:'Sherloq7C graph objective and anchored projection',kernelParity:result.metrics?.precision??p.precision,layout:'owned-native16'},
     metrics:{...result.metrics,totalMs:performance.now()-started,source16CacheHit:sourceCached,source16:entry.source.metrics,sourceBitDepth:entry.source.sourceBitDepth,workingBitDepth:16,memory:budget.snapshot()}};
   }catch(error){if(record&&!published)await Promise.allSettled([record.surface.dispose(),...Object.values(record.planeRecords).map(x=>x.surface.dispose())]);else if(result&&!published)await result.release?.();throw error;}
   }finally{active=false;}
  },clearImage,
  snapshot(){return{sources:entries.size,source16Bytes:[...entries.values()].reduce((n,e)=>n+(e.source?.data?.byteLength??0),0),workingBitDepth:16};},
  async dispose(){closed=true;unregister?.();await core?.dispose();core=null;currentImageId=null;let first;for(const id of [...entries.keys()])try{await clearImage(id);}catch(error){first??=error;}if(first)throw first;},
 };
}
