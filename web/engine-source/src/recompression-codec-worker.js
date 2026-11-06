import {EngineError,requireValue,serializeEngineError,deserializeEngineError} from './errors.js';
import {recompressionFormat,recompressionPaletteColors} from './recompression-plan.js';
import {isoChroma,webpChroma} from './media-format.js';
import {readVerifiedMediaResource} from './media-resource-integrity.js';
import {serializeRecompressionCodecError} from './recompression-codec-error.js';
let magickPromise,magickModule,avifPromise,heicPromise;
const PAGE=65536;
function readLeb(bytes,state){let value=0,shift=0,byte;do{requireValue(state.at<bytes.length&&shift<35,'Invalid Wasm integer.');byte=bytes[state.at++];value+=(byte&127)*2**shift;shift+=7;}while(byte&128);return value;}
function leb(value){const out=[];do{const byte=value%128;value=Math.floor(value/128);out.push(byte|(value?128:0));}while(value);return out;}
// Bound only the module memory declaration. Code/data sections and codec
// arithmetic remain byte-identical; native growth cannot exceed its admission.
export function boundCodecWasm(bytes,maximumBytes){
 requireValue(bytes instanceof Uint8Array&&bytes.length>=8&&Number.isSafeInteger(maximumBytes)&&maximumBytes>=16*1024**2,'Invalid codec memory bound.');
 const maximumPages=Math.min(65536,Math.floor(maximumBytes/PAGE)),state={at:8};let changed=false;const parts=[bytes.subarray(0,8)];
 while(state.at<bytes.length){const start=state.at,id=bytes[state.at++],size=readLeb(bytes,state),body=state.at,end=body+size;requireValue(end<=bytes.length,'Invalid Wasm section.');
  if(id!==5){parts.push(bytes.subarray(start,end));state.at=end;continue;}
  const count=readLeb(bytes,state),flags=readLeb(bytes,state),minimum=readLeb(bytes,state);requireValue(count===1&&(flags===1||flags===3),'The codec must declare one bounded memory.');const previous=readLeb(bytes,state);requireValue(state.at===end&&maximumPages>=minimum,'The codec native admission is below its initial memory.');const replacement=Uint8Array.from([...leb(count),...leb(flags),...leb(minimum),...leb(Math.min(previous,maximumPages))]);parts.push(Uint8Array.from([id,...leb(replacement.length)]),replacement);state.at=end;changed=true;
 }
 requireValue(changed,'Codec memory declaration missing.');const result=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
async function loadWasm(id,maximumBytes){return boundCodecWasm(await readVerifiedMediaResource(id),maximumBytes);}
async function magick(maximumBytes){
 if(!magickPromise)magickPromise=(async()=>{const m=await import('../vendor/media/magick/index.js');const binary=await loadWasm('magick',maximumBytes);await m.initializeImageMagick(binary);m.ResourceLimits.disk=0n;m.ResourceLimits.listLength=16n;magickModule=m;return m;})();return magickPromise;
}
export function copyRecompressionEncodedOutput(bytes,stage,io){
 if(stage.codec!=='jxl')return bytes.slice();
 // Magick's _disposeAfterExecution keeps the native blob alive while this
 // Promise waits for the parent budget ACK. No encoded JS copy exists yet.
 return (async()=>{const admission=await io.request('encoded-output-admission',{bytes:bytes.length});requireValue(admission?.admittedBytes===bytes.length,'JXL encoded output was not admitted.');return bytes.slice();})();
}
async function avif(maximumBytes){
 if(!avifPromise)avifPromise=(async()=>{const {default:create}=await import('../vendor/media/avif/avif-st.js');return create({wasmBinary:await loadWasm('avifSt',maximumBytes)});})();return avifPromise;
}
async function encodeExactAvif(width,height,io,nativeBytes){
 const initializationStarted=performance.now(),cold=!avifPromise,m=await avif(nativeBytes),bodySetupMilliseconds=cold?performance.now()-initializationStarted:0,check=ok=>{if(!ok)throw new EngineError('ENCODE_FAILED',m.UTF8ToString(m._public_avif_error()));};let pointer=0;
 try{check(m._public_avif_open(width,height,444,1));pointer=m._malloc(width*Math.min(32,height)*3);if(!pointer)throw new EngineError('MEMORY_ALLOCATION','AVIF RGB band allocation failed.');
  for(let y=0;y<height;y+=32){const rows=Math.min(32,height-y),{bytes}=await io.request('source-band',{y,rows,width});requireValue(bytes instanceof Uint8Array&&bytes.length===width*rows*3,'Invalid AVIF RGB band.');m.HEAPU8.set(bytes,pointer);check(m._public_avif_rows(pointer,rows));io.progress?.({phase:'recompression-prepare',fraction:(y+rows)/height});}
  check(m._public_avif_encode(100,1));return {encoded:m.HEAPU8.slice(m._public_avif_output(),m._public_avif_output()+m._public_avif_size()),heapBytes:m.HEAPU8.byteLength,bodySetupMilliseconds,cold};
 }finally{if(pointer)m._free(pointer);m._public_avif_close();}
}
async function encodeHeic(width,height,stage,io,nativeBytes){
 if(!globalThis.crossOriginIsolated||typeof SharedArrayBuffer!=='function')throw new EngineError('ISOLATION_REQUIRED','HEIC recompression requires cross-origin isolation and shared memory.');
 const initializationStarted=performance.now(),cold=!heicPromise;
 if(!heicPromise)heicPromise=(async()=>{const {default:create}=await import('../vendor/media/heic/heic-enc.js');const maximum=Math.min(32768,Math.floor(nativeBytes/PAGE));requireValue(maximum>=256,'HEIC native memory is below its initial heap.');return create({wasmMemory:new WebAssembly.Memory({initial:256,maximum,shared:true})});})();
 const m=await heicPromise,bodySetupMilliseconds=cold?performance.now()-initializationStarted:0;
 const rgba=new Uint8Array(width*height*4);
 for(let y=0;y<height;y+=32){const rows=Math.min(32,height-y),{bytes}=await io.request('source-band',{y,rows,width});requireValue(bytes instanceof Uint8Array&&bytes.length===width*rows*3,'Invalid HEIC RGB band.');for(let p=0;p<width*rows;p++){const at=(y*width+p)*4,from=p*3;rgba[at]=bytes[from];rgba[at+1]=bytes[from+1];rgba[at+2]=bytes[from+2];rgba[at+3]=255;}io.progress?.({phase:'recompression-prepare',fraction:(y+rows)/height});}
 const encoded=m.encode(rgba,width,height,{quality:stage.lossless?100:stage.quality,lossless:stage.lossless,preset:'medium',tune:'ssim',tuIntraDepth:2,complexity:50,chroma:'444',sharpYUV:false,bitDepth:8});
 if(!(encoded instanceof Uint8Array))throw new EngineError('ENCODE_FAILED',typeof encoded==='string'?encoded:'HEIC encoder failed.');return {encoded,heapBytes:m.HEAPU8.byteLength,bodySetupMilliseconds,cold};
}
export async function roundTripRecompressionCodec({width,height,stage,nativeBytes},io){
 const entry=recompressionFormat(stage.codec);if(entry?.requiresIsolation&&(!globalThis.crossOriginIsolated||typeof SharedArrayBuffer!=='function'))throw new EngineError('ISOLATION_REQUIRED','This codec requires cross-origin isolation and shared memory.');requireValue(entry&&stage.codec!=='jpeg'&&Number.isSafeInteger(width*height*3)&&width>0&&height>0,'A registered complete RGB8 codec context is required.');
 requireValue(!entry.maximumDimension||width<=entry.maximumDimension&&height<=entry.maximumDimension,'Dimensions exceed this codec’s technical limit.');
 const magickBytes=stage.codec==='heic'||stage.codec==='avif'&&stage.lossless?Math.floor(nativeBytes/2/PAGE)*PAGE:nativeBytes;const magickInitializationStarted=performance.now(),magickCold=!magickPromise,m=await magick(magickBytes),magickSetupMilliseconds=magickCold?performance.now()-magickInitializationStarted:0;m.ResourceLimits.memory=BigInt(magickBytes);m.ResourceLimits.maxMemoryRequest=BigInt(magickBytes);
 const palette=!stage.lossless&&entry.qualityKind==='palette-colors',paletteColors=palette?(stage.paletteColors??recompressionPaletteColors(stage.quality)):null;
 requireValue(!palette||Number.isInteger(paletteColors)&&paletteColors>=2&&paletteColors<=256,'The requested palette must contain2–256 colors.');
 const started=performance.now();let encoded,extraHeap=0,bodySetupMilliseconds=0,cold=magickCold,codecHeapPeak=m.ImageMagick._api.HEAPU8.byteLength;
 if(stage.codec==='heic'){const result=await encodeHeic(width,height,stage,io,Math.floor(nativeBytes/2/PAGE)*PAGE);encoded=result.encoded;extraHeap=result.heapBytes;bodySetupMilliseconds+=result.bodySetupMilliseconds;cold||=result.cold;}
 else if(stage.codec==='avif'&&stage.lossless){const result=await encodeExactAvif(width,height,io,Math.floor(nativeBytes/2/PAGE)*PAGE);encoded=result.encoded;extraHeap=result.heapBytes;bodySetupMilliseconds+=result.bodySetupMilliseconds;cold||=result.cold;}
 else encoded=await m.ImageMagick.read(m.MagickColors.Black,width,height,async image=>{
  for(let y=0;y<height;y+=32){const rows=Math.min(32,height-y),{bytes}=await io.request('source-band',{y,rows,width});requireValue(bytes instanceof Uint8Array&&bytes.length===width*rows*3,'Invalid recompression RGB band.');image.getPixels(p=>p.setArea(0,y,width,rows,bytes));io.progress?.({phase:'recompression-prepare',fraction:(y+rows)/height});}
  image.depth=8;image.settings.depth=8;image.settings.colorType=m.ColorType.TrueColor;
  image.quality=stage.lossless?100:stage.quality??75;
  if(palette){const settings=new m.QuantizeSettings();settings.colors=paletteColors;settings.ditherMethod=m.DitherMethod.No;settings.colorSpace=m.ColorSpace.sRGB;image.quantize(settings);image.settings.colorType=m.ColorType.Palette;}
  if(stage.codec==='webp'){image.settings.setDefine('webp:lossless',String(stage.lossless));image.settings.setDefine('webp:near-lossless','100');image.settings.setDefine('webp:exact','true');image.settings.setDefine('webp:method','4');}
  if(stage.codec==='png'){image.settings.setDefine('png:compression-level','6');if(palette){image.settings.setDefine('png:color-type','3');image.settings.setDefine('png:bit-depth','8');}}
  if(stage.codec==='bmp'&&palette)image.settings.compression=m.CompressionMethod.RLE;
  if(stage.codec==='tiff'){image.settings.compression=m.CompressionMethod.Zip;image.settings.setDefine('tiff:predictor','2');image.settings.setDefine('tiff:rows-per-strip','32');}
  if(stage.codec==='avif'){image.settings.setDefine('heic:chroma','444');image.settings.setDefine('heic:speed','6');}
  io.progress?.({phase:'recompression-encode',fraction:0});const output=await image.write(m.MagickFormat[entry.magick],bytes=>copyRecompressionEncodedOutput(bytes,stage,io));codecHeapPeak=Math.max(codecHeapPeak,m.ImageMagick._api.HEAPU8.byteLength);return output;
 });
 requireValue(encoded instanceof Uint8Array&&encoded.length>0,'The selected codec produced no encoded output.');
 if(palette&&stage.codec==='png')requireValue(encoded.length>=33&&encoded[0]===137&&encoded[1]===80&&encoded[2]===78&&encoded[3]===71&&encoded[12]===73&&encoded[13]===72&&encoded[14]===68&&encoded[15]===82&&encoded[24]===8&&encoded[25]===3&&encoded[26]===0,'The selected PNG palette encoder did not produce8-bit indexed PNG with DEFLATE compression. No format substitution is accepted.');
 if(palette&&stage.codec==='bmp'){const header=new DataView(encoded.buffer,encoded.byteOffset,encoded.byteLength);requireValue(encoded.length>=54&&encoded[0]===66&&encoded[1]===77&&header.getUint32(14,true)===40&&header.getUint16(28,true)===8&&header.getUint32(30,true)===1,'The selected BMP palette encoder did not produce8-bit BI_RLE8. No uncompressed fallback is accepted.');}
 const settings=new m.MagickReadSettings({format:m.MagickFormat[entry.magick],frameIndex:0,frameCount:1}),info=m.MagickImageInfo.create(encoded,settings);requireValue(info.width===width&&info.height===height,'The selected codec changed the complete context geometry.');
 let compared=0,maximumLosslessError=0;
 await m.ImageMagick.read(encoded,settings,async image=>{
  requireValue(image.width===width&&image.height===height,'Decoded recompression dimensions changed.');
  for(let y=0;y<height;y+=32){const rows=Math.min(32,height-y),bytes=image.getPixels(p=>p.toByteArray(0,y,width,rows,'RGB'));requireValue(bytes instanceof Uint8Array&&bytes.length===width*rows*3,'Invalid decoded recompression band.');
   if(stage.lossless){const original=await io.request('source-band',{y,rows,width});for(let i=0;i<bytes.length;i++)maximumLosslessError=Math.max(maximumLosslessError,Math.abs(bytes[i]-original.bytes[i]));compared+=bytes.length;requireValue(maximumLosslessError===0,'A declared lossless codec changed the admitted RGB8 samples.');}
   await io.request('decoded-band',{bytes,y,rows,width},[bytes.buffer]);io.progress?.({phase:'recompression-decode',fraction:(y+rows)/height});
  }
 });
 codecHeapPeak=Math.max(codecHeapPeak,m.ImageMagick._api.HEAPU8.byteLength);requireValue(codecHeapPeak+extraHeap<=nativeBytes,'Codec memory exceeded its admitted native heap.');
 const chroma=stage.codec==='webp'?webpChroma(encoded):stage.codec==='avif'||stage.codec==='heic'?isoChroma(encoded):null;
 return {codec:stage.codec,format:stage.codec,lossless:stage.lossless,quality:stage.lossless||entry.qualityMeaningful===false?null:stage.quality,requestedQuality:stage.requestedQuality,...(palette?{qualityKind:'palette-colors',paletteColors,compression:stage.codec==='png'?'DEFLATE':'BI_RLE8',lossMechanism:'palette-quantization',quantization:{maximumColors:paletteColors,dither:'none',colorSpace:'sRGB'},encodedColorType:'indexed',encodedBitDepth:8}:{}),encoder:stage.codec==='heic'?'icodec-0.6.0/libheif-1.19.1/x265-4.0':stage.codec==='avif'&&stage.lossless?'libavif-1.4.2/libaom-3.14.1/GBR-identity':'ImageMagick-7.1.2-32/magick-wasm-0.0.44/'+entry.magick,decoder:'ImageMagick-7.1.2-32/magick-wasm-0.0.44',encodedBytes:encoded.length,depth:8,chroma,colour:palette?'Original analysis RGB8 quantized to the explicitly selected palette without dithering; no ICC, alpha, orientation, HDR or resize transformation introduced.':'Original analysis RGB8 samples; no ICC, alpha, orientation, HDR or resize transformation introduced by recompression.',losslessVerification:stage.lossless?{comparedSamples:compared,maximumAbsoluteError:maximumLosslessError}:null,codecHeapPeakBytes:codecHeapPeak+extraHeap,cold,setupMilliseconds:magickSetupMilliseconds+bodySetupMilliseconds,bodySetupMilliseconds,milliseconds:performance.now()-started};
}
let sequence=0,running=false;const pending=new Map();
if(typeof self!=='undefined'&&typeof self.postMessage==='function')self.onmessage=async({data})=>{
 if(data.reply){const item=pending.get(data.reply);pending.delete(data.reply);if(item)data.error?item.reject(deserializeEngineError(data.error)):item.resolve(data.value);return;}
 if(running){self.postMessage({id:data.id,error:serializeEngineError(new EngineError('BUSY','The codec worker already owns a complete context.'))});return;}
 running=true;const id=data.id,diagnostic={codec:data.payload?.stage?.codec,width:data.payload?.width,height:data.payload?.height,quality:data.payload?.stage?.quality,lossless:data.payload?.stage?.lossless,nativeMaximumBytes:data.payload?.nativeBytes,phase:'recompression-initialize'};
 try{const value=await roundTripRecompressionCodec(data.payload,{request(name,value,transfer=[]){const n=++sequence;return new Promise((resolve,reject)=>{pending.set(n,{resolve,reject});self.postMessage({id,request:name,sequence:n,value},transfer);});},progress:event=>{diagnostic.phase=event.phase;self.postMessage({id,progress:event});}});self.postMessage({id,done:true,value});}
 catch(error){diagnostic.codecHeapBytes=magickModule?.ImageMagick._api.HEAPU8.byteLength;self.postMessage({id,error:serializeRecompressionCodecError(error,diagnostic)});}finally{running=false;}
};
