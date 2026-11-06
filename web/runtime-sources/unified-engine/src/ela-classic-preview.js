import "../../runtime-context.js?v=0.31.0";
import {DISPLAY_PREVIEW_MAX_SIDE,DISPLAY_PREVIEW_MAX_PIXELS} from './preview-limits.js';
// Optional presentation samples. The native JPEG and full-resolution ELA path
// remain authoritative; no full-resolution residual or signed plane is retained.
import {requireValue,checkAbort} from './errors.js';
import {allocateTypedArray,copyTypedArray} from './allocation.js';
import {validateParams,validatePixels,createElaCooperator} from './ela.js';
import {toneTable} from './ela-lut.js';
import {usesAlternateRecompression,resolveRecompressionPlan} from './recompression-plan.js';
import {recompressPixels} from './recompression-surface.js';
import {renderElaPreviewPair,composeElaPreviewJpeg,nativeJpegPreviewCodec} from './ela-preview-render.js';

const MAX_SIDE=DISPLAY_PREVIEW_MAX_SIDE,TONE_WORKSPACE=512*1024;
const memoryFailure=error=>['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code)||error instanceof RangeError;
const geometry=(width,height,side)=>{const ratio=Math.min(1,side/width,side/height);return {width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio))};};
const sourceCoordinate=(index,nativeSize,sampleSize)=>Math.min(nativeSize-1,Math.floor((index+.5)*nativeSize/sampleSize));
const key=id=>id+'\0ela-classic-preview/native';
const exactKey=id=>id+'\0ela-classic-preview/exact';
const recompressionIdentity=params=>JSON.stringify([params.quality,params.recompression??null]);

export function createClassicPreviewCache({budget,codec,gpuService,backend='auto'}){
 requireValue(budget,'Classic preview budget required.');
 function rememberExact(imageId,image,p,answer){
  const {pixels,presentation,metrics}=answer;
  if(!presentation.nativeResolution||budget.recovering)return false;
  const bytes=pixels.data.byteLength;if(bytes>Math.min(DISPLAY_PREVIEW_MAX_PIXELS*3,Math.floor(budget.limit/8))||budget.total()+bytes>budget.limit)return false;
  let release,backing,entry;
  try{
   release=budget.reserve(bytes);const data=copyTypedArray(pixels.data,{label:'ela-classic-exact-handoff'});backing=budget.registerBacking?.('array-buffer',bytes,{owner:'ela',label:'classic-exact-handoff',identity:data.buffer});
   entry={sourceSha256:image.sha256,codec:codec?.id,paramsIdentity:JSON.stringify(p),pixels:{width:pixels.width,height:pixels.height,format:'rgb8',data},presentation:structuredClone(presentation),metrics:structuredClone(metrics),byteLength:bytes,onEvict(){if(!entry.pixels.data)return;entry.pixels.data=null;const retired=backing?.();backing=null;if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??bytes);}};
   release();release=null;return budget.put(exactKey(imageId),entry);
  }catch(error){if(entry)entry.onEvict();else backing?.();if(!memoryFailure(error))throw error;return false;}
  finally{release?.();}
 }
 function matching(imageId,image,params){const entry=budget.get(key(imageId));return entry?.pairs&&entry.sourceSha256===image.sha256&&entry.recompressionIdentity===recompressionIdentity(params)&&entry.codec===codec?.id&&entry.logicalWidth===image.surface.descriptor.width&&entry.logicalHeight===image.surface.descriptor.height?entry:null;}
 function beginCapture(imageId,image,params,{side,recompressionPlan,codecProvenance}={}){
  requireValue(side===undefined||Number.isSafeInteger(side)&&side>=1&&side<=MAX_SIDE,'Classic preview side exceeds the admitted display limit.');
  const captureBytes=Math.min(DISPLAY_PREVIEW_MAX_PIXELS*6,Math.floor(budget.limit/8));
  side=Math.min(side??MAX_SIDE,Math.max(1,Math.floor(Math.sqrt(captureBytes/6))));
  const p=validateParams(params),{width:logicalWidth,height:logicalHeight}=image.surface.descriptor;requireValue(Number.isSafeInteger(side)&&side>=1&&side<=MAX_SIDE,'Classic preview side exceeds the admitted display limit.');
  if(matching(imageId,image,p)||budget.recovering)return null;
  let data,release,backing,shape;
  const candidates=[];for(let candidate=side;;candidate=Math.max(1,Math.floor(candidate/2))){candidates.push(candidate);if(candidate<=80)break;}
  for(const candidate of candidates){
   shape=geometry(logicalWidth,logicalHeight,candidate);const bytes=shape.width*shape.height*6;
   // Optional admission must not evict a useful native cache or fail its run.
   if(bytes>captureBytes||budget.total()+bytes>budget.limit)continue;
   try{release=budget.reserve(bytes);data=allocateTypedArray(Uint16Array,shape.width*shape.height*3,{label:'ela-classic-preview-pairs'});backing=budget.registerBacking?.('array-buffer',bytes,{owner:'ela',label:'classic-preview-pairs',identity:data.buffer});break;}
   catch(error){release?.();release=null;data=null;if(!memoryFailure(error))throw error;}
  }
  if(!data)return null;
  let row=0,closed=false,finished=false;
  const dispose=()=>{if(closed)return;closed=true;data=null;const retired=backing?.();backing=null;release?.();release=null;if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??shape.width*shape.height*6);};
  return {
   captureBand(original,recompressed,{y,rows}={}){
    if(closed)return;requireValue(original instanceof Uint8Array&&recompressed instanceof Uint8Array&&original.length===recompressed.length&&Number.isSafeInteger(y)&&Number.isSafeInteger(rows)&&y>=0&&rows>0&&y+rows<=logicalHeight&&original.length===rows*logicalWidth*3,'Invalid native classic preview band.');
    while(row<shape.height){const sy=sourceCoordinate(row,logicalHeight,shape.height);if(sy>=y+rows)break;requireValue(sy>=y,'Native classic preview bands must cover ordered source rows.');for(let x=0;x<shape.width;x++){const sx=sourceCoordinate(x,logicalWidth,shape.width),at=((sy-y)*logicalWidth+sx)*3,to=(row*shape.width+x)*3;for(let c=0;c<3;c++)data[to+c]=(original[at+c]<<8)|recompressed[at+c];}row++;}
   },
   finish(){
    if(closed||finished)return false;if(row!==shape.height){dispose();return false;}
    const entry={...shape,logicalWidth,logicalHeight,sourceSha256:image.sha256,quality:p.quality,recompressionIdentity:recompressionIdentity(p),recompressionPlan,codecProvenance,codec:codec?.id,pairs:data,byteLength:data.byteLength,onEvict(){entry.pairs=null;dispose();}};
    // Transfer reservation to the optional cache synchronously, with no await.
    release();release=null;finished=true;return budget.put(key(imageId),entry);
   },
   dispose(){if(!finished)dispose();}
  };
 }
 async function renderPairs(entry,p,side,{signal,backend:selectedBackend=backend}={}){
  const cooperate=createElaCooperator(signal),shape=geometry(entry.width,entry.height,side),bytes=shape.width*shape.height*3,release=budget.reserve(TONE_WORKSPACE+bytes*3);
  try{
   const tableStarted=performance.now(),table=await toneTable(p,{signal}),tableMilliseconds=performance.now()-tableStarted;
   const original=allocateTypedArray(Uint8Array,bytes,{label:'ela-classic-preview-original'}),recompressed=allocateTypedArray(Uint8Array,bytes,{label:'ela-classic-preview-recompressed'});
   for(let y=0;y<shape.height;y++){if((y&31)===0)await cooperate();const sy=sourceCoordinate(y,entry.height,shape.height);for(let x=0;x<shape.width;x++){const sx=sourceCoordinate(x,entry.width,shape.width),from=(sy*entry.width+sx)*3,to=(y*shape.width+x)*3;for(let c=0;c<3;c++){const pair=entry.pairs[from+c];original[to+c]=pair>>8;recompressed[to+c]=pair&255;}}}
   const rendered=await renderElaPreviewPair(original,recompressed,shape.width,shape.height,p,table,{budget,signal,backend:selectedBackend,gpuService});
   checkAbort(signal);return {pixels:{...shape,format:'rgb8',data:rendered.data},metrics:{...rendered.metrics,tableMilliseconds},recompressionPlan:entry.recompressionPlan,codecProvenance:entry.codecProvenance,sampling:{method:'nearest-native-pixel-center',retainedWidth:entry.width,retainedHeight:entry.height}};
  }finally{release();}
 }
 async function originalSample(image,side,{signal}={}){
  const {width,height}=image.surface.descriptor,step=Math.max(1,Math.ceil(Math.max(width,height)/side));
  return image.surface.readSampledWindow({x:0,y:0,w:width,h:height,step},{signal});
 }
 return {
  beginCapture,
  takeExact(imageId,image,params,{backend:selectedBackend=backend}={}){
   const p=validateParams(params),entry=budget.get(exactKey(imageId)),shape=image.surface.descriptor;
   if(!entry?.pixels.data||budget.total()>budget.limit||entry.sourceSha256!==image.sha256||entry.codec!==codec?.id||entry.paramsIdentity!==JSON.stringify(p)||entry.pixels.width!==shape.width||entry.pixels.height!==shape.height||selectedBackend!=='auto'&&entry.metrics.backend!==selectedBackend)return null;
   budget.take(exactKey(imageId));const reservation=budget.reserve(entry.byteLength);let released=false;
   return{pixels:entry.pixels,presentation:entry.presentation,metrics:entry.metrics,release(){if(released)return;released=true;entry.onEvict();reservation();}};
  },
  async preview(imageId,image,params,side=MAX_SIDE,{signal,backend:selectedBackend=backend}={}){
   const p=validateParams(params);requireValue(Number.isSafeInteger(side)&&side>=1&&side<=MAX_SIDE,'Classic preview side exceeds the admitted display limit.');checkAbort(signal);
   const {width:logicalWidth,height:logicalHeight}=image.surface.descriptor,entry=matching(imageId,image,p);let frame,nativePixelSamples=!!entry;
   if(entry){
    // Keep a borrowed native sample pinned across LUT allocation/checkpoints.
    // Ordinary cache pressure must not clear its pixels halfway through a draw.
    budget.take(key(imageId));const pinned=budget.reserve(entry.byteLength);
    try{frame=await renderPairs(entry,p,side,{signal,backend:selectedBackend});}finally{pinned();budget.put(key(imageId),entry);}
   }
   else{
    // Native pairs already contain both channel values. Recompression is only
    // required for an uncaptured quality, never to initialize the engine.
    requireValue(usesAlternateRecompression(p)||typeof codec?.recompress==='function','Reduced Classic preview requires the shared JPEG recompressor.');
    let sample,release,alternate;try{
     sample=await originalSample(image,side,{signal});validatePixels(sample.pixels);release=budget.reserve(TONE_WORKSPACE+sample.pixels.data.byteLength*8);
     const selectedPlan=usesAlternateRecompression(p)?await resolveRecompressionPlan(p,image,{signal}):null;
     const tableStarted=performance.now(),table=await toneTable(p,{signal}),tableMilliseconds=performance.now()-tableStarted;
     const nativeSample=sample.pixels.width===logicalWidth&&sample.pixels.height===logicalHeight;let decoded;
     let rendered=(selectedPlan?selectedPlan.stage.codec==='jpeg':nativeJpegPreviewCodec(codec))?await composeElaPreviewJpeg(sample.pixels.data,sample.pixels.width,sample.pixels.height,p,table,{budget,signal,backend:selectedBackend,gpuService,copyRecompressed:nativeSample}):null;
     if(!rendered){const recompressed=selectedPlan?(alternate=await recompressPixels(sample.pixels,selectedPlan,{budget,signal})).pixels:await codec.recompress(sample.pixels,p.quality,{signal});validatePixels(recompressed);requireValue(recompressed.width===sample.pixels.width&&recompressed.height===sample.pixels.height,'Preview codec changed dimensions.');decoded=recompressed.data;rendered=await renderElaPreviewPair(sample.pixels.data,recompressed.data,sample.pixels.width,sample.pixels.height,p,table,{budget,signal,backend:selectedBackend,gpuService});}else decoded=rendered.recompressed;
     if(nativeSample&&decoded){const capture=beginCapture(imageId,image,p,{recompressionPlan:selectedPlan,codecProvenance:alternate?.provenance??rendered.codecProvenance});if(capture)try{capture.captureBand(sample.pixels.data,decoded,{y:0,rows:logicalHeight});capture.finish();}finally{capture.dispose();}}
     frame={pixels:{width:sample.pixels.width,height:sample.pixels.height,format:'rgb8',data:rendered.data},metrics:{...rendered.metrics,tableMilliseconds,codecMilliseconds:alternate?.metrics?.totalMs??0,codecSetupMilliseconds:alternate?.metrics?.setupMilliseconds??0,setupMilliseconds:(rendered.metrics.setupMilliseconds??0)+(alternate?.metrics?.setupMilliseconds??0),cold:rendered.metrics.cold===true||alternate?.metrics?.cold===true},recompressionPlan:selectedPlan,codecProvenance:alternate?.provenance??rendered.codecProvenance,sampling:{method:'source-integer-step-decimation',step:Math.max(1,Math.ceil(Math.max(logicalWidth,logicalHeight)/side))}};
    }finally{await alternate?.release();release?.();await sample?.release();}
   }
   checkAbort(signal);const pixels={...frame.pixels,logicalWidth,logicalHeight,preview:true},nativeResolution=pixels.width===logicalWidth&&pixels.height===logicalHeight,alternate=usesAlternateRecompression(p),presentation={view:'classic-preview',preview:true,nativeResolution,nativePixelSamples,method:nativePixelSamples?(alternate?'native-selected-codec-pixel-samples':'native-jpeg-pixel-samples'):(alternate?'preview-size-selected-codec':'preview-size-jpeg'),reason:nativeResolution?'Complete native RGB rendered with the exact ELA lookup; eligible for an identical committed result.':nativePixelSamples?'Native samples rendered with the exact ELA lookup; full-resolution rendering is committed on release.':'The selected recompression is performed on the reduced preview image; the full-resolution original is calculated on release.',sourceSha256:image.sha256,qualityRequested:p.quality,codec:alternate?(frame.recompressionPlan?.stage?.codec??p.recompression.codec):codec?.id,recompressionPlan:frame.recompressionPlan,codecProvenance:frame.codecProvenance,sampleWidth:pixels.width,sampleHeight:pixels.height,sampling:frame.sampling,params:{...p}};
   const answer={pixels,logicalWidth,logicalHeight,presentation,nativePixelSamples,metrics:{...frame.metrics,preview:true,nativePixelSamples}};rememberExact(imageId,image,p,answer);return answer;
  }
 };
}
