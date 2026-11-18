import {createOpeningPresentationOwner} from './opening-preview-presentation.js?v=0.33.3';
import {openingPreviewShape,decodeBrowserOpeningPreview} from './opening-image-decode.js?v=0.33.3';
// Opening presentation only. Never supplies scientific RGB, hashes or exports.
const HEADER_BYTES=128*1024,MAX_PIXELS=Number.MAX_SAFE_INTEGER,LEGACY_DECODED_BYTES=64_000_000;
const ascii=(b,p,n)=>String.fromCharCode(...b.subarray(p,p+n));
const u16=(b,p,le=false)=>le?b[p]+256*b[p+1]:256*b[p]+b[p+1];
const u32=(b,p,le=false)=>le?(b[p]+b[p+1]*256+b[p+2]*65536+b[p+3]*16777216):(b[p]*16777216+b[p+1]*65536+b[p+2]*256+b[p+3]);
const u24=(b,p)=>b[p]+256*b[p+1]+65536*b[p+2];
function webpFrame(b,p,kind,length){
 if(kind==='VP8 '&&length>=10&&p+10<=b.length&&!(b[p]&1)&&ascii(b,p+3,3)==='\x9d\x01\x2a')return{width:u16(b,p+6,true)&16383,height:u16(b,p+8,true)&16383};
 if(kind==='VP8L'&&length>=5&&p+5<=b.length&&b[p]===47){const bits=u32(b,p+1,true);if(!(bits>>>29))return{width:(bits&16383)+1,height:((bits>>>14)&16383)+1};}
 return null;
}
function orientation(b,start,end){
 if(end-start<8)return 1;const le=ascii(b,start,2)==='II';if(!le&&ascii(b,start,2)!=='MM'||u16(b,start+2,le)!==42)return 1;
 const at=start+u32(b,start+4,le);if(at<start+8||at+2>end)return 1;const count=u16(b,at,le);if(count>256||at+2+12*count>end)return 1;
 for(let i=0;i<count;i++){const p=at+2+12*i;if(u16(b,p,le)===0x112&&u16(b,p+2,le)===3&&u32(b,p+4,le)===1){const value=u16(b,p+8,le);return value>=1&&value<=8?value:1;}}
 return 1;
}
export function openingImageDimensions(bytes,totalBytes=bytes?.byteLength){
 if(!(bytes instanceof Uint8Array)||bytes.length>HEADER_BYTES||!Number.isSafeInteger(totalBytes)||totalBytes<bytes.length)return null;
 const b=bytes;

 if(b.length>=13&&/^GIF8[79]a$/.test(ascii(b,0,6)))return{format:'gif',width:u16(b,6,true),height:u16(b,8,true),orientation:1,bytesPerPixel:4};
 if(b.length>=22&&u16(b,0,true)===0&&u16(b,2,true)===1){
  const frames=u16(b,4,true);if(!frames||6+frames*16>b.length)return null;
  const length=u32(b,14,true),offset=u32(b,18,true);if(!length||offset<6+frames*16||offset+length>totalBytes)return null;
  return{format:'ico',width:b[6]||256,height:b[7]||256,orientation:1,bytesPerPixel:4,...(frames>1?{frames}:{})};
 }
 if(b.length>=26&&ascii(b,0,2)==='BM'){
  const dib=u32(b,14,true);if(dib===12)return{format:'bmp',width:u16(b,18,true),height:u16(b,20,true),orientation:1,bytesPerPixel:4};
  if(dib>=40&&b.length>=54){const view=new DataView(b.buffer,b.byteOffset,b.byteLength),width=view.getInt32(18,true),height=Math.abs(view.getInt32(22,true));return{format:'bmp',width,height,orientation:1,bytesPerPixel:4};}
 }
 if(b.length>=33&&ascii(b,0,8)==='\x89PNG\r\n\x1a\n'){
  if(u32(b,8)!==13||ascii(b,12,4)!=='IHDR')return null;const width=u32(b,16),height=u32(b,20),depth=b[24];let rotate=1;
  if(![1,2,4,8,16].includes(depth))return null;
  for(let p=8;p+8<=b.length;){const n=u32(b,p),kind=ascii(b,p+4,4),end=p+n+12;if(end>totalBytes)return null;if(kind==='acTL')return null;if(kind==='IDAT')return{format:'png',width,height,orientation:rotate,bytesPerPixel:depth===16?8:4};if(end>b.length)return null;if(kind==='eXIf')rotate=orientation(b,p+8,p+8+n);if(kind==='IEND')return null;p=end;}
  return null;
 }
 if(b.length>=4&&b[0]===255&&b[1]===216){
  let size=null,rotate=1;
  for(let p=2;p+1<b.length;){if(b[p++]!==255)return null;while(p<b.length&&b[p]===255)p++;if(p>=b.length)return null;const marker=b[p++];if(marker===0||marker===216||marker===217)return null;if(marker===218)return size?{format:'jpeg',...size,orientation:rotate,bytesPerPixel:4}:null;if(marker===1||marker>=208&&marker<=215)continue;if(p+2>b.length)return null;const n=u16(b,p),end=p+n;if(n<2||end>totalBytes||end>b.length)return null;
   if(marker===225&&n>=8&&ascii(b,p+2,6)==='Exif\0\0')rotate=orientation(b,p+8,end);
   if([192,193,194].includes(marker)){if(n<8||b[p+2]!==8)return null;size={height:u16(b,p+3),width:u16(b,p+5)};}
   else if([195,197,198,199,201,202,203,205,206,207].includes(marker))return null;
   p=end;
  }return null;
 }
 if(b.length>=25&&ascii(b,0,4)==='RIFF'&&ascii(b,8,4)==='WEBP'&&u32(b,4,true)+8===totalBytes){
  const kind=ascii(b,12,4),length=u32(b,16,true);if(length+20>totalBytes)return null;
  if(kind==='VP8 '||kind==='VP8L'){const frame=webpFrame(b,20,kind,length);return frame?{format:'webp',...frame,orientation:1,bytesPerPixel:4}:null;}
  // Static VP8X files with ICC/alpha are common. Verify both the canvas and
  // bitstream dimensions before admitting the same bounded opening overlay.
  // Animation and EXIF stay with the native first-frame/orientation decoder.
  if(kind!=='VP8X'||length!==10||b.length<30||b[20]&0xcb||b[21]||b[22]||b[23])return null;
  const width=u24(b,24)+1,height=u24(b,27)+1;
  for(let p=30;p+8<=b.length;){const tag=ascii(b,p,4),n=u32(b,p+4,true),end=p+8+n+(n&1);if(end>totalBytes)return null;
   if(['ANIM','ANMF','EXIF','VP8X'].includes(tag))return null;
   if(tag==='VP8 '||tag==='VP8L'){const frame=webpFrame(b,p+8,tag,n);return frame?.width===width&&frame.height===height?{format:'webp',width,height,orientation:1,bytesPerPixel:4}:null;}
   if(end>b.length)return null;p=end;
  }
 }
 return null;
}
// AVIF/HEIF, RAW and other extended formats use the shared managed renderer.
// In particular, an HDR primary is never mistaken for its SDR presentation.
export function canReadNativeOpeningPreview(bytes,dimensions){
 if(!(bytes instanceof Uint8Array)||!dimensions||!['jpeg','png','webp','gif','bmp','ico'].includes(dimensions.format))return false;
 if(dimensions.format==='ico'&&dimensions.frames>1)return false;
 if(dimensions.format==='png'){
  if(bytes[24]===16)return false;
  for(let p=8;p+12<=bytes.length;){const n=u32(bytes,p),tag=ascii(bytes,p+4,4),end=p+n+12;if(tag==='IDAT')break;if(end>bytes.length)return false;if(tag==='cICP'&&n>=4&&[16,18].includes(bytes[p+9]))return false;p=end;}
 }
 if(dimensions.format==='jpeg'){
  for(let p=2;p+1<bytes.length;){if(bytes[p++]!==255)return false;while(bytes[p]===255)p++;const marker=bytes[p++];if(marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;if(p+2>bytes.length)return false;const n=u16(bytes,p),end=p+n;if(n<2||end>bytes.length)return false;
   if([192,193,194].includes(marker)&&bytes[p+7]===4)return false;
   // Standard gain-map JPEGs carry MPF and/or HDR gain-map XMP in APP headers.
   if(marker>=224&&marker<=239){const text=new TextDecoder('latin1').decode(bytes.subarray(p+2,end));if(/hdrgm|HDRGainMap|HDRGain|MPF\0/i.test(text))return false;}
   p=end;
  }
 }
 return true;
}
export function createOpeningImagePreview({file,document=globalThis.document,isCurrent=()=>true,maxPixels=MAX_PIXELS,signal,urlAPI=globalThis.URL,decodePreview,maximumPreviewPixels=4*1024**2,maximumPreviewWidth=4096,maximumPreviewHeight=4096,maximumNativeDecodedBytes=512*1024**2,imageDecoderClass=globalThis.ImageDecoder,imageBitmapFactory=typeof globalThis.createImageBitmap==='function'?globalThis.createImageBitmap.bind(globalThis):undefined,onError=()=>{}}={}){
 const controller=new AbortController(),attachments=new Set(),started=performance.now(),legacyMode=typeof decodePreview!=='function'&&typeof imageDecoderClass!=='function'&&typeof imageBitmapFactory!=='function';
 let disposed=false,url=null,probe=null,frame=null,settled=false,resolveReady,task=null,disposal=null,legacyResolve=null,cleanupError=null;
 const metrics={previewOnly:true,phase:'header',sourceEncodedBytes:file?.size??null,sourceFormat:null,sourceWidth:null,sourceHeight:null,width:null,height:null,ownedRasterBytes:0,decoder:null};
 function releaseRaster(){if(frame){frame.width=frame.height=0;frame=null;}metrics.ownedRasterBytes=metrics.frameRasterBytes=metrics.attachmentRasterBytes=0;}
 const presentations=createOpeningPresentationOwner({getFrame:()=>frame,getDimensions:()=>({width:metrics.sourceWidth,height:metrics.sourceHeight}),isCurrent:()=>current(),onReleased:releaseRaster});
 const ready=new Promise(resolve=>resolveReady=resolve),settle=value=>{if(!settled){settled=true;metrics.elapsedMs=performance.now()-started;resolveReady(value);}};
 const current=()=>{try{return !disposed&&!signal?.aborted&&isCurrent()===true;}catch{return false;}};
 function report(error){metrics.error=error?.code??'OPENING_PREVIEW_UNAVAILABLE';try{onError(error);}catch{}}
 function remove(value){value.onload=value.onerror=null;try{value.removeAttribute?.('src');}catch{}try{if(value.tagName==='CANVAS')value.width=value.height=0;value.remove?.();}catch{}}
 function dispose(){
  if(!disposed){disposed=true;metrics.phase='closed';controller.abort();signal?.removeEventListener('abort',dispose);legacyResolve?.(false);for(const row of attachments){if(row.element===frame&&presentations.references){row.element.remove?.();}else remove(row.element);row.disposed=true;}attachments.clear();if(probe)remove(probe);probe=null;metrics.attachmentRasterBytes=0;metrics.ownedRasterBytes=frame?frame.width*frame.height*4:0;try{if(url!==null)urlAPI.revokeObjectURL(url);}finally{url=null;settle(false);}}
  if(!disposal){disposal=Promise.all([Promise.resolve(task),presentations.retire()]).then(()=>{releaseRaster();if(cleanupError)throw cleanupError;});void disposal.catch(()=>{});}return disposal;
 }
 function element(kind){const value=document.createElement(kind);value.alt='';value.decoding='async';value.draggable=false;value.dataset.openingPreview='true';Object.assign(value.style,{width:'100%',height:'100%',objectFit:'contain',display:'block',pointerEvents:'none',imageOrientation:'from-image'});return value;}
 function rasterMetrics(){const bytes=frame?frame.width*frame.height*4:0;metrics.frameRasterBytes=bytes;metrics.attachmentRasterBytes=legacyMode?0:bytes*[...attachments].filter(row=>row.element!==frame).length;metrics.ownedRasterBytes=bytes+metrics.attachmentRasterBytes;}
 function drawAttachment(row){if(row.disposed||!frame||row.element===frame){rasterMetrics();return;}const value=row.element;value.width=frame.width;value.height=frame.height;const context=value.getContext('2d');if(!context)throw Error('An opening preview canvas is unavailable.');context.drawImage(frame,0,0);rasterMetrics();}
 function publish(result,shape){
  const pixels=result?.pixels,image=result?.image,width=pixels?.width??shape?.width,height=pixels?.height??shape?.height;
  if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0)||width>maximumPreviewWidth||height>maximumPreviewHeight||width*height>maximumPreviewPixels)throw Object.assign(Error('The managed opening preview exceeds its requested output window.'),{code:'INVALID_INPUT'});
  frame=[...attachments].find(row=>!row.disposed&&row.element.tagName==='CANVAS')?.element??document.createElement('canvas');frame.width=width;frame.height=height;const context=frame.getContext('2d',{colorSpace:'srgb'});if(!context)throw Error('An opening preview canvas is unavailable.');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  if(pixels){const channels=pixels.format==='rgb8'?3:pixels.format==='rgba8'?4:0;if(!channels||!(pixels.data instanceof Uint8Array||pixels.data instanceof Uint8ClampedArray)||pixels.data.length!==width*height*channels)throw Object.assign(Error('A managed opening preview must provide bounded SDR RGB8 or RGBA8.'),{code:'INVALID_INPUT'});const rgba=context.createImageData(width,height);if(channels===4)rgba.data.set(pixels.data);else for(let s=0,t=0;s<pixels.data.length;s+=3,t+=4){rgba.data[t]=pixels.data[s];rgba.data[t+1]=pixels.data[s+1];rgba.data[t+2]=pixels.data[s+2];rgba.data[t+3]=255;}context.putImageData(rgba,0,0);}
  else if(image)context.drawImage(image,0,0,width,height);else throw Object.assign(Error('The opening renderer returned no presentation.'),{code:'INVALID_INPUT'});
  for(const row of attachments)drawAttachment(row);metrics.width=width;metrics.height=height;rasterMetrics();metrics.decoder=result.decoder??'managed-source-renderer';metrics.decodedWidth=result.decodedWidth??width;metrics.decodedHeight=result.decodedHeight??height;metrics.sourceWidth=result.sourceWidth??shape?.sourceWidth??metrics.sourceWidth;metrics.sourceHeight=result.sourceHeight??shape?.sourceHeight??metrics.sourceHeight;metrics.phase='ready';settle(true);
 }
 function legacyLoaded(value){if(!current()){void dispose();return;}const pixels=value.naturalWidth*value.naturalHeight;if(!Number.isSafeInteger(pixels)||pixels<1||pixels>maxPixels||pixels*4>LEGACY_DECODED_BYTES){void dispose();return;}metrics.width=value.naturalWidth;metrics.height=value.naturalHeight;metrics.sourceWidth=value.naturalWidth;metrics.sourceHeight=value.naturalHeight;metrics.ownedRasterBytes=pixels*4;metrics.decoder='browser-image-element';metrics.phase='ready';settle(true);legacyResolve?.(true);}
 function setLegacyEvents(value){value.onload=()=>legacyLoaded(value);value.onerror=()=>{void dispose();};}
 const owner={ready,presentation:()=>presentations.borrow(),attach(parent){if(!current()||typeof parent?.append!=='function')return{dispose(){}};let value;try{value=!legacyMode&&frame&&!attachments.size?frame:element(legacyMode?'img':'canvas');if(legacyMode)setLegacyEvents(value);const row={element:value,disposed:false};attachments.add(row);parent.append(value);if(legacyMode&&url)value.src=url;else if(frame)drawAttachment(row);return{dispose(){if(row.disposed)return;row.disposed=true;attachments.delete(row);if(value===frame){const replacement=[...attachments].find(item=>!item.disposed)?.element;if(replacement){frame=replacement;remove(value);}else value.remove?.();}else remove(value);rasterMetrics();}};}catch(error){if(value)remove(value);report(error);void dispose();return{dispose(){}};}},dispose,snapshot(){return{...metrics,attachments:attachments.size,presentationLoans:presentations.references,disposed};}};
 if(signal?.aborted){void dispose();return owner;}signal?.addEventListener('abort',dispose,{once:true});
 task=(async()=>{
  let decoded=null;
  try{
   if(!current()||!file||typeof file.slice!=='function'||!Number.isSafeInteger(file.size)||file.size<1||!Number.isSafeInteger(maxPixels)||maxPixels<1||![maximumPreviewPixels,maximumPreviewWidth,maximumPreviewHeight,maximumNativeDecodedBytes].every(n=>Number.isSafeInteger(n)&&n>0)){void dispose();return;}
   const bytes=new Uint8Array(await file.slice(0,Math.min(file.size,HEADER_BYTES)).arrayBuffer());if(!current()){void dispose();return;}
   const dimensions=openingImageDimensions(bytes,file.size),sourcePixels=dimensions?.width*dimensions?.height;
   if(dimensions&&(!Number.isSafeInteger(sourcePixels)||sourcePixels<1||dimensions.width<1||dimensions.height<1||sourcePixels>maxPixels)){void dispose();return;}
   metrics.sourceFormat=dimensions?.format??null;metrics.sourceWidth=dimensions?.width??null;metrics.sourceHeight=dimensions?.height??null;
   const shape=openingPreviewShape(dimensions,{maximumWidth:maximumPreviewWidth,maximumHeight:maximumPreviewHeight,maximumPixels:maximumPreviewPixels}),native=canReadNativeOpeningPreview(bytes,dimensions),nativeAdmitted=native&&sourcePixels*4<=maximumNativeDecodedBytes;metrics.phase='decode';metrics.nativeDecodedBytesEstimate=native?sourcePixels*4:null;metrics.nativeAdmitted=nativeAdmitted;
   if(!legacyMode&&nativeAdmitted){try{decoded=await decodeBrowserOpeningPreview(file,{dimensions,shape,signal:controller.signal,imageDecoderClass,imageBitmapFactory});}catch(error){if(controller.signal.aborted)throw error;metrics.nativeError=error?.name??'Error';}}
   if(!decoded&&typeof decodePreview==='function'){decoded=await decodePreview(file,{signal:controller.signal,maxWidth:maximumPreviewWidth,maxHeight:maximumPreviewHeight,maxPixels:maximumPreviewPixels,sourceDimensions:dimensions,reason:!native?'managed-format':nativeAdmitted?'native-unavailable':'native-memory-admission'});}
   if(!current()){void dispose();return;}
   if(decoded){publish(decoded,decoded.pixels?null:shape);return;}
   if(legacyMode&&native&&shape&&sourcePixels*dimensions.bytesPerPixel<=LEGACY_DECODED_BYTES){
    // Compatibility for browsers without a resized decode API. Larger sources
    // use the shared managed renderer rather than an unbounded <img> decode.
    url=urlAPI.createObjectURL(file);if(!current()){void dispose();return;}const loaded=new Promise(resolve=>legacyResolve=resolve);probe=element('img');setLegacyEvents(probe);probe.src=url;for(const row of attachments)if(!row.disposed)row.element.src=url;await loaded;return;
   }
   void dispose();
  }catch(error){if(!controller.signal.aborted)report(error);void dispose();}
  finally{try{await decoded?.dispose?.();}catch(error){cleanupError=error;report(error);}}
 })();
 void task.catch(error=>report(error));return owner;
}
