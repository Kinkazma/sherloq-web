import {cvPixels} from './opencv.js';
import {parameters} from './pixel-utils.js';import {imageHeader,jpegHeader} from './image-headers.js';import {EngineError,requireValue} from './errors.js';
export const metadataParams=(p={})=>parameters(p,{});
export const hexParams=(p={})=>parameters(p,{offset:0,length:256},{offset:[0,Number.MAX_SAFE_INTEGER],length:[1,65536]});
export async function metadataStructure(image,p,hooks,context){
 const h=imageHeader(context.bytes);return {data:h,semantics:'Original-byte structure and supported EXIF directories. Numeric tags and omitted raw payloads are explicit; this is not a complete ExifTool dump or a C2PA signature validation.'};
}
export async function metadataLocation(image,p,hooks,context){
 const h=imageHeader(context.bytes),gps=h.format==='jpeg'?h.exif?.gps:h.gps;
 return {data:{coordinates:gps??null,source:'EXIF GPS rational values',networkRequested:false},semantics:'Embedded coordinates only; absence returns null. No inferred place and no automatic map request.'};
}
export async function metadataThumbnail(image,p,hooks,context){
 const h=imageHeader(context.bytes),thumbnail=h.format==='jpeg'?h.exif?.thumbnail:h.thumbnail;
 if(!thumbnail)return {data:{available:false},semantics:'No supported embedded JPEG thumbnail was found.'};
 const bytes=context.bytes.slice(thumbnail.offset,thumbnail.offset+thumbnail.length);jpegHeader(bytes);const embedded=await context.codec.decode(bytes,hooks);
 const pixels=await cvPixels(embedded,6,[image.width,image.height],hooks),difference=new Uint8Array(pixels.data.length);for(let i=0;i<difference.length;i++)difference[i]=Math.abs(image.data[i]-pixels.data[i]);
 return {pixels,data:{available:true,bytes,embedded,difference:{...pixels,data:difference},sourceOffset:thumbnail.offset,sourceLength:thumbnail.length},semantics:'Exact embedded JPEG bytes; Lanczos4 resize to analysis dimensions and absolute RGB difference, as in the native thumbnail tool.'};
}
export async function hexView(image,p,hooks,context){
 if(context.source){requireValue(p.offset<=context.source.byteLength,'Byte offset exceeds the source.');const part=await context.source.read(p.offset,Math.min(p.length,context.source.byteLength-p.offset),hooks);try{return {data:{offset:p.offset,totalBytes:context.source.byteLength,bytes:part.bytes},semantics:'Read-only original-byte window. This operation does not edit the source.'};}finally{part.release();}}
 requireValue(p.offset<=context.bytes.length,'Byte offset exceeds the source.');const bytes=context.bytes.slice(p.offset,Math.min(context.bytes.length,p.offset+p.length));
 return {data:{offset:p.offset,totalBytes:context.bytes.length,bytes},semantics:'Read-only original-byte window. This operation does not edit the source.'};
}
export const METADATA_OPERATIONS={
 'metadata.structure':{validate:metadataParams,compute:metadataStructure,scratchFactor:1,extraBytes:4*1024**2,native:'metadata.py (structural subset)',exports:['json'],parity:'Bounded parser; not equivalent to complete ExifTool HTML/text output'},
 'metadata.location':{validate:metadataParams,compute:metadataLocation,scratchFactor:1,extraBytes:4*1024**2,native:'location.py (EXIF GPS subset)',exports:['json'],parity:'EXIF GPS rationals only; other ExifTool composite sources unavailable'},
 'metadata.thumbnail':{validate:metadataParams,compute:metadataThumbnail,scratchFactor:32,extraBytes:64*1024**2,admissionBytes(image,p,bytes){const h=imageHeader(bytes),t=h.format==='jpeg'?h.exif?.thumbnail:h.thumbnail;if(!t)return 0;const shape=jpegHeader(bytes.subarray(t.offset,t.offset+t.length));return shape.width*shape.height*32;},native:'thumbnail.py',exports:['json'],parity:'Original bytes retained; decoded thumbnail, Lanczos4 resize and difference checked against native synthetic fixture'},
 'file.hex':{validate:hexParams,compute:hexView,scratchFactor:1,extraBytes:256*1024,native:'metadata.py / external hex editor',exports:['json'],parity:'Byte window copied exactly; interactive editing is a separate UI feature'}
};
