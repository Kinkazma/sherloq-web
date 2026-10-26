import {exiftoolParams} from './exiftool.js';
import {c2paParams} from './c2pa-report.js';
import {cvPixels} from './opencv.js';
import {parameters} from './pixel-utils.js';import {imageHeader} from './image-headers.js';import {EngineError,requireValue} from './errors.js';
export const metadataParams=(p={})=>parameters(p,{});
export const hexParams=(p={})=>parameters(p,{offset:0,length:256},{offset:[0,Number.MAX_SAFE_INTEGER],length:[1,65536]});
export async function metadataStructure(image,p,hooks,context){
 const h=imageHeader(context.bytes);return {data:h,semantics:'Original-byte structure and supported EXIF directories. Numeric tags and omitted raw payloads are explicit; this is not a complete ExifTool dump or a C2PA signature validation.'};
}
export async function metadataLocation(image,p,hooks,context){
 const h=imageHeader(context.bytes),gps=h.exif?.gps??h.gps;
 return {data:{coordinates:gps??null,source:'EXIF GPS rational values',networkRequested:false},semantics:'Embedded coordinates only; absence returns null. No inferred place and no automatic map request.'};
}
export async function metadataThumbnail(image,p,hooks,context){
 const h=imageHeader(context.bytes),thumbnail=h.exif?.thumbnail??h.thumbnail;let bytes,extraction;
 if(thumbnail&&context.bytes[thumbnail.offset]===255&&context.bytes[thumbnail.offset+1]===216)bytes=context.bytes.slice(thumbnail.offset,thumbnail.offset+thumbnail.length);
 else if(context.extractThumbnail){extraction=await context.extractThumbnail();bytes=extraction.data.bytes;}
 if(!bytes?.length)return {data:{available:false},semantics:'No embedded ThumbnailImage was found.'};
 context.codec.inspect(bytes);const embedded=await context.codec.decode(bytes,hooks);
 const pixels=await cvPixels(embedded,6,[image.width,image.height],hooks),difference=new Uint8Array(pixels.data.length);for(let i=0;i<difference.length;i++)difference[i]=Math.abs(image.data[i]-pixels.data[i]);
 return {pixels,data:{available:true,bytes,embedded,difference:{...pixels,data:difference},...(!extraction&&thumbnail?{sourceOffset:thumbnail.offset,sourceLength:thumbnail.length}:{sourceTag:'ThumbnailImage',warnings:extraction.warnings})},...(extraction?{engineMetrics:{thumbnailExtraction:extraction.metrics}}:{}),semantics:'Exact embedded thumbnail bytes; native Lanczos4 resize to analysis dimensions and absolute RGB difference.'};
}
export async function hexView(image,p,hooks,context){
 if(context.source){requireValue(p.offset<=context.source.byteLength,'Byte offset exceeds the source.');const part=await context.source.read(p.offset,Math.min(p.length,context.source.byteLength-p.offset),hooks);try{return {data:{offset:p.offset,totalBytes:context.source.byteLength,bytes:part.bytes},semantics:'Read-only original-byte window. This operation does not edit the source.'};}finally{part.release();}}
 requireValue(p.offset<=context.bytes.length,'Byte offset exceeds the source.');const bytes=context.bytes.slice(p.offset,Math.min(context.bytes.length,p.offset+p.length));
 return {data:{offset:p.offset,totalBytes:context.bytes.length,bytes},semantics:'Read-only original-byte window. This operation does not edit the source.'};
}
export const METADATA_OPERATIONS={
 'metadata.exiftool':{validate:exiftoolParams,scratchFactor:0,extraBytes:0,native:'ExifTool 13.55 / core/metadata.py + location.py',exports:['json'],requirements:['isolated-browser-worker'],parity:'Original-byte full grouped numeric dump, native HTML header dump, and binary thumbnail extraction; see docs/EXIFTOOL.md.'},
 'metadata.c2pa':{validate:c2paParams,scratchFactor:0,extraBytes:0,native:'core/c2pa.py + c2pa-rs 0.91.0',exports:['json'],requirements:['isolated-browser-worker','embedded-manifest; external sidecars unsupported'],parity:'Offline SDK validation with native active-manifest state policy; bounded WASM heap and JSON report. See docs/C2PA.md.'},
 'metadata.structure':{validate:metadataParams,compute:metadataStructure,scratchFactor:1,extraBytes:4*1024**2,native:'metadata.py (structural subset)',exports:['json'],parity:'Bounded parser; not equivalent to complete ExifTool HTML/text output'},
 'metadata.location':{validate:metadataParams,compute:metadataLocation,scratchFactor:1,extraBytes:4*1024**2,native:'location.py (EXIF GPS subset)',exports:['json'],parity:'EXIF GPS rationals only; other ExifTool composite sources unavailable'},
 'metadata.thumbnail':{validate:metadataParams,compute:metadataThumbnail,scratchFactor:32,extraBytes:64*1024**2,admissionBytes(image,p,bytes){const h=imageHeader(bytes),t=h.exif?.thumbnail??h.thumbnail;if(!t||bytes[t.offset]!==255||bytes[t.offset+1]!==216)return 0;const shape=imageHeader(bytes.subarray(t.offset,t.offset+t.length));return shape.width*shape.height*32;},native:'thumbnail.py',exports:['json'],parity:'Native ThumbnailImage selection and Lanczos4/difference; ExifTool fallback for other encapsulations; segmented full-resolution comparison and PNG exports'},
 'file.hex':{validate:hexParams,compute:hexView,scratchFactor:1,extraBytes:256*1024,native:'metadata.py / external hex editor',exports:['json'],parity:'Byte window copied exactly; interactive editing is a separate UI feature'}
};
