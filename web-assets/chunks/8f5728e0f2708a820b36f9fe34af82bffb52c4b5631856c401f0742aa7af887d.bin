import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';import {imageHeader} from './image-headers.js';import {jpegCodec} from './jpeg.js';import {cvDecode,cvHeapBytes} from './opencv.js';
function inspect(bytes){
 const h=imageHeader(bytes);
 if(h.format==='tiff'){
  if(h.orientation>=5)throw new EngineError('UNSUPPORTED_FORMAT','Transposed TIFF orientations remain unavailable pending native file-loader parity.');
  if(![8,16].includes(h.depth)||![1,2].includes(h.photometric)||![1,5,8,32946,32773].includes(h.compression??1))throw new EngineError('UNSUPPORTED_FORMAT','This TIFF depth, photometric mode or compression has not been verified.');
 }
 if(h.format==='png'&&(![8,16].includes(h.depth)||![0,2,4,6].includes(h.colorType)))throw new EngineError('UNSUPPORTED_FORMAT','Palette and low-bit-depth PNG are not yet verified.');
 if(h.format!=='jpeg'&&bytes.length*2+h.width*h.height*32+64*1024**2>1536*1024**2)throw new EngineError('MEMORY_LIMIT','Encoded image exceeds the verified codec working-set limit; no resizing performed.');
 return h;
}
export const imageCodec={
 id:'controlled-jpeg-and-opencv-4.11.0-wasm',parity:'Declared JPEG/PNG/TIFF native RGB fixtures; unsupported encodings fail explicitly',inspect,
 memoryBytes:()=>jpegCodec.memoryBytes()+cvHeapBytes(),
 async decode(bytes,hooks={}){const h=inspect(bytes),pixels=h.format==='jpeg'?await jpegCodec.decode(bytes,hooks):await cvDecode(bytes,hooks);requireValue(pixels.width===h.width&&pixels.height===h.height,'Codec output dimensions differ from verified header.');return pixels;},
 async decodeGray(bytes,hooks={}){const h=inspect(bytes),pixels=await cvDecode(bytes,{...hooks,grayscale:true});requireValue(pixels.width===h.width&&pixels.height===h.height,'Grayscale dimensions differ from verified header.');return pixels;},
 recompress:(...args)=>jpegCodec.recompress(...args),recompressGray:(...args)=>jpegCodec.recompressGray(...args),
 provenance(bytes){const h=inspect(bytes);if(h.format==='jpeg')return jpegCodec.provenance(bytes);return {decoder:'opencv-4.11.0/emscripten-4.0.15',format:h.format,sourceSize:[h.sourceWidth,h.sourceHeight],sourceDepth:h.depth,analysisDepth:8,orientation:h.orientation,orientationApplied:true,icc:h.icc?'present, not applied (native policy)':'absent',alpha:h.alpha?'present, native IMREAD_COLOR conversion; not retained':'absent',interpolation:'none',frames:'first image only'};}
};
