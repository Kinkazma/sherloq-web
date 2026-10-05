import {validateTiffHeader} from './tiff-stream.js';
import {validatePngHeader} from './png-stream.js';
import {decodeMappedTiff,mappedTiffPlan} from './tiff-mapped.js';
import {EngineError,requireValue} from './errors.js';import {imageHeader} from './image-headers.js';import {jpegCodec} from './jpeg.js';import {cvDecode,cvHeapBytes} from './opencv.js';
function inspect(bytes){
 const h=imageHeader(bytes);
 if(h.format==='tiff')validateTiffHeader(h);
 if(h.format==='png')validatePngHeader(h);
 if(h.format!=='jpeg'&&bytes.length*2+h.width*h.height*32+64*1024**2>1536*1024**2)throw new EngineError('MEMORY_LIMIT','Encoded image exceeds the verified codec working-set limit; no resizing performed.');
 return h;
}
const isTiled=h=>h.format==='tiff'&&(h.tileWidth!==undefined||h.tileHeight!==undefined);
export const imageCodec={
 workingSetBytes:(byteLength,header)=>isTiled(header)?mappedTiffPlan(byteLength,header).workingBytes:0,
 id:'controlled-jpeg-and-opencv-4.11.0-wasm',parity:'Declared JPEG/PNG/TIFF native RGB fixtures; unsupported encodings fail explicitly',inspect,
 memoryBytes:()=>jpegCodec.memoryBytes()+cvHeapBytes(),
 async decode(bytes,hooks={}){const h=inspect(bytes),pixels=h.format==='jpeg'?await jpegCodec.decode(bytes,hooks):isTiled(h)?await decodeMappedTiff(bytes,h,hooks):await cvDecode(bytes,hooks);requireValue(pixels.width===h.width&&pixels.height===h.height,'Codec output dimensions differ from verified header.');return pixels;},
 async decodeGray(bytes,hooks={}){const h=inspect(bytes),pixels=isTiled(h)?await decodeMappedTiff(bytes,h,{...hooks,grayscale:true}):await cvDecode(bytes,{...hooks,grayscale:true});requireValue(pixels.width===h.width&&pixels.height===h.height,'Grayscale dimensions differ from verified header.');return pixels;},
 recompress:(...args)=>jpegCodec.recompress(...args),recompressGray:(...args)=>jpegCodec.recompressGray(...args),
 provenance(bytes){const h=inspect(bytes);if(h.format==='jpeg')return jpegCodec.provenance(bytes);return {decoder:'opencv-4.11.0/emscripten-4.0.15',...(isTiled(h)?{tiffReader:'mapped-input adapter',codecHeapMaximumBytes:mappedTiffPlan(bytes.byteLength,h).heapMaximumBytes}:{}),format:h.format,...(h.bigTiff?{container:'BigTIFF'}:{}),sourceSize:[h.sourceWidth,h.sourceHeight],sourceDepth:h.depth,analysisDepth:8,orientation:h.orientation,orientationApplied:true,icc:h.icc?'present, not applied (native policy)':'absent',alpha:h.alpha?'present, native IMREAD_COLOR conversion; not retained':'absent',interpolation:'none',frames:'first image only'};}
};
