import "../../runtime-context.js?v=0.30.0";
// Optional presentation samples. The native JPEG and full-resolution ELA path
// remain authoritative; no full-resolution residual or signed plane is retained.
import {requireValue,checkAbort,checkpoint} from './errors.js';
import {allocateTypedArray} from './allocation.js';
import {validateParams,validatePixels} from './ela.js';
import {toneTable} from './ela-lut.js';

const MAX_SIDE=2048,TONE_WORKSPACE=512*1024;
const memoryFailure=error=>['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code)||error instanceof RangeError;
const geometry=(width,height,side)=>{const ratio=Math.min(1,side/width,side/height);return {width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio))};};
const sourceCoordinate=(index,nativeSize,sampleSize)=>Math.min(nativeSize-1,Math.floor((index+.5)*nativeSize/sampleSize));
const key=id=>id+'\0ela-classic-preview/native';

export function createClassicPreviewCache({budget,codec}){
 requireValue(budget,'Classic preview budget required.');
 function matching(imageId,image,quality){const entry=budget.get(key(imageId));return entry?.pairs&&entry.sourceSha256===image.sha256&&entry.quality===quality&&entry.codec===codec?.id&&entry.logicalWidth===image.surface.descriptor.width&&entry.logicalHeight===image.surface.descriptor.height?entry:null;}
 function beginCapture(imageId,image,params,{side}={}){
  requireValue(side===undefined||Number.isSafeInteger(side)&&side>=1&&side<=MAX_SIDE,'Classic preview side must be1–2048.');
  const captureBytes=Math.min(24*1024**2,Math.floor(budget.limit/32));
  side=Math.min(side??MAX_SIDE,Math.max(1,Math.floor(Math.sqrt(captureBytes/6))));
  const p=validateParams(params),{width:logicalWidth,height:logicalHeight}=image.surface.descriptor;requireValue(Number.isSafeInteger(side)&&side>=1&&side<=MAX_SIDE,'Classic preview side must be1–2048.');
  if(matching(imageId,image,p.quality)||budget.recovering)return null;
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
    const entry={...shape,logicalWidth,logicalHeight,sourceSha256:image.sha256,quality:p.quality,codec:codec?.id,pairs:data,byteLength:data.byteLength,onEvict(){entry.pairs=null;dispose();}};
    // Transfer reservation to the optional cache synchronously, with no await.
    release();release=null;finished=true;return budget.put(key(imageId),entry);
   },
   dispose(){if(!finished)dispose();}
  };
 }
 async function renderPairs(entry,p,side,{signal}={}){
  const shape=geometry(entry.width,entry.height,side),bytes=shape.width*shape.height*3,release=budget.reserve(TONE_WORKSPACE+bytes);
  try{
   const table=await toneTable(p,{signal}),out=allocateTypedArray(Uint8Array,bytes,{label:'ela-classic-preview-rgb'});
   for(let y=0;y<shape.height;y++){if((y&31)===0)await checkpoint(signal);const sy=sourceCoordinate(y,entry.height,shape.height);for(let x=0;x<shape.width;x++){const sx=sourceCoordinate(x,entry.width,shape.width),from=(sy*entry.width+sx)*3,to=(y*shape.width+x)*3;for(let c=0;c<3;c++)out[to+c]=table[entry.pairs[from+c]];if(p.grayscale){const gray=(out[to]*9798+out[to+1]*19235+out[to+2]*3735+16384)>>15;out[to]=out[to+1]=out[to+2]=gray;}}}
   checkAbort(signal);return {pixels:{...shape,format:'rgb8',data:out},sampling:{method:'nearest-native-pixel-center',retainedWidth:entry.width,retainedHeight:entry.height}};
  }finally{release();}
 }
 async function originalSample(image,side,{signal}={}){
  const {width,height}=image.surface.descriptor,step=Math.max(1,Math.ceil(Math.max(width,height)/side));
  return image.surface.readSampledWindow({x:0,y:0,w:width,h:height,step},{signal});
 }
 return {
  beginCapture,
  async preview(imageId,image,params,side=MAX_SIDE,{signal}={}){
   const p=validateParams(params);requireValue(Number.isSafeInteger(side)&&side>=1&&side<=MAX_SIDE,'Classic preview side must be1–2048.');checkAbort(signal);
   const {width:logicalWidth,height:logicalHeight}=image.surface.descriptor,entry=matching(imageId,image,p.quality);let frame,nativePixelSamples=!!entry;
   if(entry){
    // Keep a borrowed native sample pinned across LUT allocation/checkpoints.
    // Ordinary cache pressure must not clear its pixels halfway through a draw.
    budget.take(key(imageId));const pinned=budget.reserve(entry.byteLength);
    try{frame=await renderPairs(entry,p,side,{signal});}finally{pinned();budget.put(key(imageId),entry);}
   }
   else{
    // Native pairs already contain both channel values. Recompression is only
    // required for an uncaptured quality, never to initialize the engine.
    requireValue(typeof codec?.recompress==='function','Reduced Classic preview requires the shared JPEG recompressor.');
    let sample,release;try{
     sample=await originalSample(image,side,{signal});validatePixels(sample.pixels);release=budget.reserve(TONE_WORKSPACE+sample.pixels.data.byteLength*8);
     const recompressed=await codec.recompress(sample.pixels,p.quality,{signal});validatePixels(recompressed);requireValue(recompressed.width===sample.pixels.width&&recompressed.height===sample.pixels.height,'Preview codec changed dimensions.');
     const table=await toneTable(p,{signal}),out=allocateTypedArray(Uint8Array,sample.pixels.data.length,{label:'ela-classic-preview-rgb'});
     for(let start=0;start<out.length;start+=196608){await checkpoint(signal);const end=Math.min(out.length,start+196608);for(let i=start;i<end;i++)out[i]=table[(sample.pixels.data[i]<<8)|recompressed.data[i]];if(p.grayscale)for(let i=start;i<end;i+=3){const gray=(out[i]*9798+out[i+1]*19235+out[i+2]*3735+16384)>>15;out[i]=out[i+1]=out[i+2]=gray;}}
     frame={pixels:{width:sample.pixels.width,height:sample.pixels.height,format:'rgb8',data:out},sampling:{method:'source-integer-step-decimation',step:Math.max(1,Math.ceil(Math.max(logicalWidth,logicalHeight)/side))}};
    }finally{release?.();sample?.release();}
   }
   checkAbort(signal);const pixels={...frame.pixels,logicalWidth,logicalHeight,preview:true},presentation={view:'classic-preview',preview:true,nativeResolution:false,nativePixelSamples,method:nativePixelSamples?'native-jpeg-pixel-samples':'preview-size-jpeg',reason:nativePixelSamples?'Native JPEG samples rendered with the exact ELA lookup; full-resolution rendering is committed on release.':'JPEG recompression is performed on the reduced preview image; the full-resolution native JPEG is calculated on release.',sourceSha256:image.sha256,qualityRequested:p.quality,codec:codec?.id,sampleWidth:pixels.width,sampleHeight:pixels.height,sampling:frame.sampling,params:{...p}};
   return {pixels,logicalWidth,logicalHeight,presentation,nativePixelSamples};
  }
 };
}
