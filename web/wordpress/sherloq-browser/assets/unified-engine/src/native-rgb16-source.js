import "../../runtime-context.js?v=0.31.0";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {allocateOwnedTypedArray,allocateWasmMemory,wasmAllocationFailure} from './allocation.js';
import {createOwnedByteSource} from './owned-byte-source.js';
import {createBlobSource} from './blob-source.js';
import {inspectTiffSource} from './tiff-header-source.js';
import {inspectPngSource} from './png-header-source.js';

const MiB=1024**2;
function coordinate(x,y,w,h,o){switch(o){case 2:return[w-1-x,y];case 3:return[w-1-x,h-1-y];case 4:return[x,h-1-y];case 5:return[y,x];case 6:return[h-1-y,x];case 7:return[h-1-y,w-1-x];case 8:return[y,w-1-x];default:return[x,y];}}
function nativeOwnerResult(value,owner){value.dispose=()=>{owner.release();value.data=null;};return value;}

// Additional native scientific channel. The historical RGB8 surface is kept
// for existing tools and display; RGB16 never comes from that reduced surface.
export async function loadNativeRgb16(image,{budget,signal,onProgress}={}){
 requireValue(image&&budget,'Source image and central budget required.');
 let ownedSource,output,working,backing,m,cache;const started=performance.now();
 const source=image.source??(image.bytes instanceof Uint8Array?(ownedSource=createOwnedByteSource(image.bytes,{budget})):(ownedSource=createBlobSource(image.blob,{budget})));
 let close;
 try{
  const signature=await source.read(0,Math.min(8,source.byteLength),{signal});let tiff,png;
  try{const b=signature.bytes;tiff=(b[0]===73&&b[1]===73)||(b[0]===77&&b[1]===77);png=b.length===8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);}finally{signature.release();}
  let header;if(tiff||png)({header}=await(tiff?inspectTiffSource:inspectPngSource)(source,{signal,account:n=>budget.reserve(n)}));
  if(header?.depth>8&&header.depth!==16||!header&&Number(image.provenance?.depth)>8)throw new EngineError('UNSUPPORTED_FORMAT','The original depth needs a qualified native decoder; reduced RGB8 is not a Sherloq analysis source.');
  if(!header||header.depth!==16){
   const surface=image.surface,w=surface?.descriptor?.width??image.pixels?.width,h=surface?.descriptor?.height??image.pixels?.height;
   requireValue(w&&h,'Native source dimensions required.');output=allocateOwnedTypedArray(Uint16Array,w*h*3,{budget,owner:'sherloq-source16',label:'sherloq-promoted-rgb16'});
   for(let y=0;y<h;y+=32){await controlCheckpoint(signal);const rows=Math.min(32,h-y),part=surface?await surface.readWindow({x:0,y,width:w,height:rows},{signal}):{pixels:{data:image.pixels.data.subarray(y*w*3,(y+rows)*w*3)},release(){}};
    try{for(let i=0;i<part.pixels.data.length;i++)output.data[y*w*3+i]=part.pixels.data[i]*257;}finally{part.release();}
   }
   const owner=output;output=null;return nativeOwnerResult({width:w,height:h,format:'rgb16',bitDepth:16,data:owner.data,sourceBitDepth:header?.depth??8,provenance:{decoder:'existing-qualified-rgb8-promoted-exactly',sourceBitDepth:header?.depth??8,workingBitDepth:16,promotion:'u8*257; normalized samples unchanged',sourceSha256:image.sha256},metrics:{decode16Ms:performance.now()-started}},owner);
  }
  const sw=header.sourceWidth,sh=header.sourceHeight,o=header.orientation??1,w=o>=5?sh:sw,h=o>=5?sw:sh;
  requireValue(Number.isSafeInteger(w*h*3),'RGB16 dimensions exceed the safe range.');
  if(tiff&&![0,1,2].includes(header.photometric))throw new EngineError('UNSUPPORTED_FORMAT','Native RGB16 TIFF requires unsigned RGB or grayscale samples.');
  const tiled=tiff&&(header.tileWidth!==undefined||header.tileHeight!==undefined),bw=tiff?(tiled?header.tileWidth:sw):sw,bh=tiff?(tiled?header.tileHeight:Math.min(sh,header.directories[0].entries.find(e=>e.tag===278)?.value??sh)):1;
  // TIFF owns raw/native RGB and the codec's encoded block; PNG owns bounded
  // rows and ancillary chunks, never a full decoded frame in its WASM heap.
  const heapMaximum=Math.max(16*MiB,Math.ceil((8*MiB+(tiff?24*bw*bh:64*sw))/(16*MiB))*16*MiB);
  if(heapMaximum>(tiff?256*MiB:64*MiB))throw new EngineError('MEMORY_LIMIT','Native16 codec block exceeds its qualified heap extent.');
  output=allocateOwnedTypedArray(Uint16Array,w*h*3,{budget,owner:'sherloq-source16',label:'sherloq-native-rgb16'});
  working=budget.reserve(heapMaximum+256*1024+sw*6);
  let cacheOffset=0,encodedReads=0;
  async function readEncoded(target,length,offset){
   checkAbort(signal);let done=0;
   while(done<length){const at=offset+done;if(!cache||at<cacheOffset||at>=cacheOffset+cache.bytes.length){cache?.release();cache=null;await controlCheckpoint(signal);cacheOffset=at;cache=await source.read(at,Math.min(256*1024,source.byteLength-at),{signal});encodedReads++;}
    const pos=at-cacheOffset,n=Math.min(length-done,cache.bytes.length-pos);requireValue(n>0,'Native16 encoded read exceeds source.');m.HEAPU8.set(cache.bytes.subarray(pos,pos+n),target+done);done+=n;
   }
  }
  const memory=allocateWasmMemory({initial:256,maximum:heapMaximum/65536},{label:'native16-codec'});
  backing=budget.registerBacking?.('wasm',heapMaximum,{owner:'native16-codec',label:tiff?'libtiff-rgb16':'libpng-rgb16',state:'reserved'});
  const call=async(name,types=[],args=[])=>{const n=await m.ccall(name,'number',types,args,{async:true});if(m.readFailure)throw m.readFailure;if(!n)throw(m[tiff?'_tiff16_error':'_png_stream_error']()===2?wasmAllocationFailure(m,'Native16 decoder allocation failed.'):new EngineError('INVALID_INPUT','Native16 decoder rejected the source.'));checkAbort(signal);return n;};
  function setPixel(x,y,r,g,b){let dx=x,dy=y;switch(o){case 2:dx=sw-1-x;break;case 3:dx=sw-1-x;dy=sh-1-y;break;case 4:dy=sh-1-y;break;case 5:dx=y;dy=x;break;case 6:dx=sh-1-y;dy=x;break;case 7:dx=sh-1-y;dy=sw-1-x;break;case 8:dx=y;dy=sw-1-x;break;}const i=(dy*w+dx)*3;output.data[i]=r;output.data[i+1]=g;output.data[i+2]=b;}
  let peak=16*MiB;
  if(tiff){
   const{default:create}=await import('../vendor/tiff16-stream/tiff16-stream.js');m=await create({wasmMemory:memory,readEncoded});close=()=>m._tiff16_close();
   await call('tiff16_open',['number','number'],[source.byteLength,heapMaximum/2]);requireValue(m._tiff16_width()===sw&&m._tiff16_height()===sh&&m._tiff16_orientation()===o,'Native16 TIFF dimensions/orientation disagree with metadata.');
   for(let y=0;y<sh;y+=bh)for(let x=0;x<sw;x+=bw){await controlCheckpoint(signal);await call('tiff16_block',['number','number'],[x,y]);const ww=m._tiff16_out_width(),hh=m._tiff16_out_height(),at=m._tiff16_data()/2;
    for(let yy=0;yy<hh;yy++){if((yy&31)===0)await controlCheckpoint(signal);if(o===1)output.data.set(m.HEAPU16.subarray(at+yy*ww*3,at+(yy+1)*ww*3),((y+yy)*w+x)*3);else for(let xx=0;xx<ww;xx++){const i=at+(yy*ww+xx)*3;setPixel(x+xx,y+yy,m.HEAPU16[i],m.HEAPU16[i+1],m.HEAPU16[i+2]);}}
    peak=Math.max(peak,m.HEAPU8.buffer.byteLength);onProgress?.({phase:'decode-native16',fraction:(y+hh*Math.min(sw,x+ww)/sw)/sh});
   }
  }else{
   let encodedOffset=0;const{default:create}=await import('../vendor/png16-stream/png16-stream.js');m=await create({wasmMemory:memory,readEncoded:async(target,n)=>{await readEncoded(target,n,encodedOffset);encodedOffset+=n;}});close=()=>m._png_stream_close();
   await call('png_stream_open',['number'],[0]);requireValue(m._png_stream_width()===sw&&m._png_stream_height()===sh,'Native16 PNG dimensions disagree with metadata.');
   const pointer=m._malloc(sw*6);if(!pointer)throw wasmAllocationFailure(m,'Native16 PNG row allocation failed.',sw*6);
   try{const passes=m._png_stream_passes();for(let pass=0;pass<passes;pass++)for(let y=0;y<sh;y++){
    if(y%32===0)await controlCheckpoint(signal);
    if(pass){if(o===1)m.HEAPU16.set(output.data.subarray(y*sw*3,(y+1)*sw*3),pointer/2);else for(let x=0;x<sw;x++){const[dx,dy]=coordinate(x,y,sw,sh,o),i=(dy*w+dx)*3,j=pointer/2+x*3;m.HEAPU16[j]=output.data[i];m.HEAPU16[j+1]=output.data[i+1];m.HEAPU16[j+2]=output.data[i+2];}}
    else m.HEAPU8.fill(0,pointer,pointer+sw*6);
    await call('png_stream_rows',['number','number'],[pointer,1]);if(o===1)output.data.set(m.HEAPU16.subarray(pointer/2,pointer/2+sw*3),y*sw*3);else for(let x=0;x<sw;x++){const j=pointer/2+x*3;setPixel(x,y,m.HEAPU16[j],m.HEAPU16[j+1],m.HEAPU16[j+2]);}
    peak=Math.max(peak,m.HEAPU8.buffer.byteLength);onProgress?.({phase:'decode-native16',fraction:(pass*sh+y+1)/(passes*sh)});
   }await call('png_stream_end');}finally{m._free(pointer);}
  }
  backing?.materialize(peak);checkAbort(signal);const owner=output;output=null;
  return nativeOwnerResult({width:w,height:h,format:'rgb16',bitDepth:16,data:owner.data,sourceBitDepth:16,provenance:{decoder:tiff?'libtiff-4.6.0-native-rgb16':'libpng-1.6.43-native-rgb16',sourceBitDepth:16,workingBitDepth:16,orientation:o,iccApplied:false,sourceSha256:image.sha256,conversion:'No 16-to-8 conversion; unsigned samples preserved'},metrics:{decode16Ms:performance.now()-started,codecHeapCapacityBytes:peak,encodedReads}},owner);
 }catch(error){output?.release();throw error;}
 finally{try{close?.();}finally{cache?.release();m=null;backing?.();working?.();ownedSource?.dispose();}}
}
