import "../../runtime-context.js?v=0.14.5";
import {heicCell,heicGrid} from './heic-grid.js';
import {serializeEngineError,deserializeEngineError,EngineError,requireValue} from './errors.js';
import {extendedImageFormat,isoChroma,webpChroma} from './media-format.js';
let sequence=0;const pending=new Map();
function request(name,value,transfer=[]){const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});self.postMessage({request:name,sequence:id,value},transfer);});}
const progress=(phase,fraction)=>self.postMessage({progress:{phase,fraction}});
async function output(bytes,metadata){return outputParts([bytes],metadata);}
async function outputParts(parts,metadata){
 await request('output-start',{byteLength:parts.reduce((n,b)=>n+b.length,0),...metadata});let written=0;
 for(const bytes of parts)for(let offset=0;offset<bytes.byteLength;offset+=1024**2){const part=bytes.slice(offset,Math.min(bytes.byteLength,offset+1024**2));const length=part.length;await request('output-chunk',{bytes:part,offset:written},[part.buffer]);written+=length;}
 return metadata;
}
async function magick(){
 const m=await import('../vendor/media/magick/index.js');await m.initializeImageMagick(new URL('../vendor/media/magick/x86/magick.wasm',import.meta.url));
 // The decoder creates internal images (orientation, profiles and pixel caches).
 // frameCount below selects one frame without preventing those temporary images.
 m.ResourceLimits.disk=0n;m.ResourceLimits.listLength=16n;m.ResourceLimits.width=65500n;m.ResourceLimits.height=65500n;return m;
}
async function decode({blob,name,inspectOnly=false}){
 const bytes=new Uint8Array(await blob.arrayBuffer()),format=extendedImageFormat(bytes,name);
 requireValue(format,'This image encoding is not supported by the extended image reader.');
 const m=await magick(),settings=new m.MagickReadSettings({format:m.MagickFormat[format]??format,frameIndex:0,frameCount:1});
 const info=m.MagickImageInfo.create(bytes,settings),swapped=info.orientation>=5&&info.orientation<=8;
 const header={format:format.toLowerCase(),sourceWidth:info.width,sourceHeight:info.height,width:swapped?info.height:info.width,height:swapped?info.width:info.height,orientation:info.orientation||1,chroma:format==='WEBP'?webpChroma(bytes):isoChroma(bytes)};
 requireValue(Number.isSafeInteger(header.width*header.height)&&header.width>0&&header.height>0,'Invalid image dimensions.');
 if(inspectOnly)return header;
 const admission=await request('decode-header',header);m.ResourceLimits.memory=BigInt(admission.nativeBytes);m.ResourceLimits.maxMemoryRequest=BigInt(admission.nativeBytes);
 let provenance;
 await m.ImageMagick.read(bytes,settings,async image=>{
  image.autoOrient();requireValue(image.width===header.width&&image.height===header.height,'Unexpected oriented image size.');
  const profile=image.getColorProfile(),cicp=image.getAttribute('heic:cicp');
  if(profile){const response=await fetch(new URL('../vendor/media/srgb.icc',import.meta.url));if(!response.ok)throw Error('Missing sRGB profile');image.transformColorSpace(new m.ColorProfile(new Uint8Array(await response.arrayBuffer())));}
  provenance={decoder:'ImageMagick-7.1.2-32/magick-wasm-0.0.44',format:header.format,chroma:header.chroma,sourceSize:[info.width,info.height],orientation:header.orientation,orientationApplied:true,analysisDepth:8,icc:profile?'converted to sRGB':'absent; native RGB conversion',frames:'first image only',alpha:image.hasAlpha?'present, RGB channels retained without alpha':'absent',cicp:profile?null:cicp};
  for(let y=0;y<image.height;y+=32){const rows=Math.min(32,image.height-y);const rgb=image.getPixels(pixels=>pixels.toByteArray(0,y,image.width,rows,'RGB'));requireValue(rgb instanceof Uint8Array&&rgb.length===image.width*rows*3,'Invalid decoded RGB band.');
   if(!profile&&cicp?.split(/[\/,]/)[1]==='16')pqToSdr(rgb,cicp);
   await request('decoded-band',{bytes:rgb,y,rows},[rgb.buffer]);progress('decode',(y+rows)/image.height);
  }
 });return {header,provenance};
}
function pqToSdr(rgb,cicp){
 const bt2020=cicp.split(/[\/,]/)[0]==='9',m1=2610/16384,m2=2523/32,c1=3424/4096,c2=2413/128,c3=2392/128;
 const lut=Float64Array.from({length:256},(_,i)=>{const p=(i/255)**(1/m2);return 10000/203*(Math.max(0,p-c1)/(c2-c3*p))**(1/m1);});
 const out=v=>Math.round(255*Math.max(0,Math.min(1,v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055)));
 for(let i=0;i<rgb.length;i+=3){const r=lut[rgb[i]],g=lut[rgb[i+1]],b=lut[rgb[i+2]];rgb[i]=out(bt2020?1.660491*r-.587641*g-.072850*b:r);rgb[i+1]=out(bt2020?-.124550*r+1.132900*g-.008350*b:g);rgb[i+2]=out(bt2020?-.018151*r-.100579*g+1.118730*b:b);}
}
async function encode({width,height,format,quality,chroma,lossless=false,threads=1,compression=6,nativeBytes}){
 if(format==='avif'){
  const mt=globalThis.crossOriginIsolated&&typeof SharedArrayBuffer==='function'&&threads>1;
  const {default:create}=await import(mt?'../vendor/media/avif/avif-mt.js':'../vendor/media/avif/avif-st.js');
  const m=await create({workerCount:Math.min(threads,64)}),check=ok=>{if(!ok)throw new EngineError('ENCODE_FAILED',m.UTF8ToString(m._public_avif_error()));};let pointer=0;
  try{check(m._public_avif_open(width,height,Number(chroma),Number(lossless)));pointer=m._malloc(width*32*3);if(!pointer)throw new EngineError('MEMORY_ALLOCATION','AVIF row allocation failed.');
   for(let y=0;y<height;y+=32){const rows=Math.min(32,height-y),{bytes}=await request('source-band',{y,rows,width});m.HEAPU8.set(bytes,pointer);check(m._public_avif_rows(pointer,rows));progress('prepare-avif',(y+rows)/height);}
   progress('encode-avif',0);check(m._public_avif_encode(quality,mt?Math.min(threads,64):1));progress('encode-avif',1);
   const bytes=m.HEAPU8.subarray(m._public_avif_output(),m._public_avif_output()+m._public_avif_size());
   return await output(bytes,{format,mime:'image/avif',width,height,chroma:lossless?'444':chroma,quality:lossless?100:quality,lossless,...(lossless?{depth:8,transfer:'sRGB',primaries:'BT.709',matrix:'identity'}:{depth:10,transfer:'PQ',primaries:'BT.2020',sdrWhiteNits:203}),gainMap:false,grid:width>2048||height>2048?{columns:Math.ceil(width/2048),rows:Math.ceil(height/2048)}:null,encoder:'libavif-1.4.2/libaom-3.14.1',threads:mt?Math.min(threads,64):1,heapBytes:m.HEAPU8.byteLength});
  }finally{if(pointer)m._free(pointer);m._public_avif_close();}
 }
 if(format==='heic'){
  if(lossless)chroma='444';
  if(!globalThis.crossOriginIsolated||typeof SharedArrayBuffer!=='function')throw new EngineError('ISOLATION_REQUIRED','HEIC encoding requires cross-origin isolation. Open the dedicated SHERLOQ application page.');
  const {default:create}=await import('../vendor/media/heic/heic-enc.js'),m=await create();
  const columns=Math.ceil(width/2048),rows=Math.ceil(height/2048),grid=columns*rows>1;
  const cellWidth=grid?Math.min(2048,Math.max(64,Math.ceil(width/64)*64)):width,cellHeight=grid?Math.min(2048,Math.max(64,Math.ceil(height/64)*64)):height;
  const data=new Uint8Array(cellWidth*cellHeight*4),cells=[];
  for(let cy=0;cy<rows;cy++)for(let cx=0;cx<columns;cx++){
   const x=cx*cellWidth,y=cy*cellHeight,actualWidth=Math.min(cellWidth,width-x),actualHeight=Math.min(cellHeight,height-y);
   for(let row=0;row<actualHeight;row+=32){const count=Math.min(32,actualHeight-row),{bytes}=await request('source-band',{x,y:y+row,rows:count,width:actualWidth});
    for(let r=0;r<count;r++){const target=(row+r)*cellWidth*4;for(let c=0;c<cellWidth;c++){const a=(r*actualWidth+Math.min(c,actualWidth-1))*3,b=target+c*4;data[b]=bytes[a];data[b+1]=bytes[a+1];data[b+2]=bytes[a+2];data[b+3]=255;}}
   }
   const last=data.subarray((actualHeight-1)*cellWidth*4,actualHeight*cellWidth*4);for(let row=actualHeight;row<cellHeight;row++)data.set(last,row*cellWidth*4);
   progress('encode-heic',(cy*columns+cx)/(columns*rows));
   const bytes=m.encode(data,cellWidth,cellHeight,{quality:lossless?100:quality,lossless,preset:'medium',tune:'ssim',tuIntraDepth:2,complexity:50,chroma,sharpYUV:false,bitDepth:8});
   if(!(bytes instanceof Uint8Array))throw new EngineError('ENCODE_FAILED',typeof bytes==='string'?bytes:'HEIC encoder failed.');
   if(!grid)return output(bytes,{format,mime:'image/heic',width,height,chroma,quality:lossless?100:quality,lossless,depth:8,encoder:'icodec-0.6.0/libheif-1.19.1/x265-4.0'});
   cells.push(heicCell(bytes));progress('encode-heic',cells.length/(columns*rows));
  }
  const packed=heicGrid(cells,{width,height,columns,rows});return outputParts(packed.parts,{format,mime:'image/heic',width,height,chroma,quality:lossless?100:quality,lossless,depth:8,grid:{columns,rows,cellWidth,cellHeight},encoder:'icodec-0.6.0/libheif-1.19.1/x265-4.0'});
 }
 requireValue(format==='webp'||format==='tiff','Unsupported media export format.');
 const m=await magick();m.ResourceLimits.memory=BigInt(nativeBytes);m.ResourceLimits.maxMemoryRequest=BigInt(nativeBytes);
 const profileResponse=await fetch(new URL('../vendor/media/srgb.icc',import.meta.url));requireValue(profileResponse.ok,'Missing sRGB export profile.');const profile=new Uint8Array(await profileResponse.arrayBuffer());
 return m.ImageMagick.read(m.MagickColors.Black,width,height,async image=>{
  for(let y=0;y<height;y+=32){const rows=Math.min(32,height-y),{bytes}=await request('source-band',{y,rows,width});image.getPixels(pixels=>pixels.setArea(0,y,width,rows,bytes));progress('prepare-'+format,(y+rows)/height);}
  image.depth=8;image.setProfile('icc',profile);
  if(format==='tiff'){
   image.settings.compression=compression===0?m.CompressionMethod.NoCompression:m.CompressionMethod.Zip;image.settings.depth=8;image.settings.colorType=m.ColorType.TrueColor;image.quality=compression*10;image.settings.setDefine('tiff:rows-per-strip','32');image.settings.setDefine('tiff:predictor','2');progress('encode-tiff',0);
   return image.write(m.MagickFormat.Tiff,bytes=>output(bytes,{format,mime:'image/tiff',width,height,chroma:'444',lossless:true,depth:8,transfer:'sRGB',compression:compression===0?'None':'Deflate',compressionLevel:compression,encoder:'magick-wasm-0.0.44/libtiff'}));
  }
  image.quality=lossless?100:quality;image.settings.setDefine('webp:lossless',String(lossless));image.settings.setDefine('webp:method','4');
  // ImageMagick maps quality to near-lossless too; explicit lossless must
  // preserve every RGB sample, irrespective of the last lossy quality setting.
  progress('encode-webp',0);
  return image.write(m.MagickFormat.WebP,bytes=>output(bytes,{format,mime:'image/webp',width,height,chroma:lossless?'444':'420',quality:lossless?100:quality,lossless,depth:8,encoder:'magick-wasm-0.0.44/libwebp-1.6.0'}));
 });
}
self.onmessage=async({data})=>{
 if(data.reply){const item=pending.get(data.reply);pending.delete(data.reply);if(item)data.error?item.reject(deserializeEngineError(data.error)):item.resolve(data.value);return;}
 try{const value=await(data.action==='decode'?decode(data.payload):data.action==='encode'?encode(data.payload):Promise.reject(new EngineError('INVALID_INPUT','Unknown media operation.')));self.postMessage({done:true,value});}
 catch(error){self.postMessage({error:serializeEngineError(error,'MEDIA_CODEC_FAILED')});}
};
