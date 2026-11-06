import "../../runtime-context.js?v=0.31.0";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {IMAGE_FORMATS} from './image-format-registry.js';
export const RECOMPRESSION_FORMATS=IMAGE_FORMATS;
export function recompressionFormat(id){return RECOMPRESSION_FORMATS.find(f=>f.id===id);}
export function recompressionPaletteColors(quality){
 requireValue(Number.isInteger(quality)&&quality>=1&&quality<=100,'Palette quality must be1–100.');
 return 2+Math.round((quality-1)*254/99);
}
export function validateRecompressionOptions(input){
 if(input===undefined)return undefined;
 requireValue(input&&typeof input==='object'&&!Array.isArray(input),'Recompression options must be an object.');
 requireValue(Object.keys(input).every(k=>['codec','lossless','quality','paletteColors'].includes(k)),'Unknown recompression option; every experiment starts from Original and accepts one codec.');
 requireValue(typeof input.codec==='string'&&(input.codec==='source'||!!recompressionFormat(input.codec)),'Unknown recompression codec.');
 requireValue(typeof input.lossless==='boolean','Explicit recompression lossless mode required.');
 requireValue(input.quality===undefined||Number.isInteger(input.quality)&&input.quality>=1&&input.quality<=100,'Recompression quality must be1–100.');
 requireValue(input.paletteColors===undefined||Number.isInteger(input.paletteColors)&&input.paletteColors>=2&&input.paletteColors<=256,'An explicit palette must contain2–256 colors.');
 const f=recompressionFormat(input.codec);requireValue(!f||(input.lossless?f.lossless:f.lossy||f.lossless),'This recompression mode is unavailable.');
 requireValue(input.paletteColors===undefined||!input.lossless&&(input.codec==='source'||f?.qualityKind==='palette-colors'),'An explicit palette requires a PNG/BMP palette experiment with lossless=false.');
 return {codec:input.codec,lossless:input.lossless,...(input.quality===undefined?{}:{quality:input.quality}),...(input.paletteColors===undefined?{}:{paletteColors:input.paletteColors})};
}
export const usesAlternateRecompression=params=>params?.recompression!==undefined;
const ascii=(b,a,n)=>String.fromCharCode(...b.subarray(a,a+n));
export function recompressionSourceSignature(bytes){
 if(!(bytes instanceof Uint8Array))return null;
 if(bytes[0]===255&&bytes[1]===216)return {format:'jpeg',lossless:false};
 if(bytes.length>=8&&ascii(bytes,0,8)==='\x89PNG\r\n\x1a\n')return {format:'png',lossless:true};
 if(ascii(bytes,0,2)==='BM')return {format:'bmp',lossless:true};
 if(ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP'){
  for(let at=12;at+8<=bytes.length;){const tag=ascii(bytes,at,4),size=new DataView(bytes.buffer,bytes.byteOffset+at+4,4).getUint32(0,true);if(tag==='VP8L')return {format:'webp',lossless:true};if(tag==='VP8 ')return {format:'webp',lossless:false};if(size>bytes.length-at-8)break;at+=8+size+(size&1);}
  return {format:'webp',lossless:null};
 }
 if(ascii(bytes,4,4)==='ftyp'){const brands=ascii(bytes,8,Math.min(56,Math.max(0,bytes.length-8)));if(/avif|avis/.test(brands))return {format:'avif',lossless:null};if(/heic|heix|hevc|hevx|mif1|msf1/.test(brands))return {format:'heic',lossless:null};}
 if(ascii(bytes,0,2)==='II'||ascii(bytes,0,2)==='MM')return {format:'tiff',lossless:null};
 if(ascii(bytes,4,8)==='jP  \r\n\x87\n')return {format:'jp2',lossless:null};
 if(bytes[0]===255&&bytes[1]===79&&bytes[2]===255&&bytes[3]===81)return {format:'j2k',lossless:null};
 if(ascii(bytes,0,4)==='GIF8')return {format:'gif',lossless:false};
 if(bytes[0]===255&&bytes[1]===10||ascii(bytes,4,4)==='JXL ')return {format:'jxl',lossless:null};
 if(ascii(bytes,0,4)==='qoif')return {format:'qoi',lossless:true};
 if(ascii(bytes,0,8)==='farbfeld')return {format:'farbfeld',lossless:true};
 if(/^P[36]\s/.test(ascii(bytes,0,3)))return {format:'ppm',lossless:true};
 if(/^P7\s/.test(ascii(bytes,0,3)))return {format:'pam',lossless:true};
 if(ascii(bytes,0,4)==='8BPS')return {format:'psd',lossless:true};
 if(bytes[0]===118&&bytes[1]===47&&bytes[2]===49&&bytes[3]===1)return {format:'exr',lossless:null};
 return null;
}
async function sourceEncoding(image,signal){
 const original=image.originalSource??image,p=original.provenance??image.provenance??{};
 let source=p.format?{format:String(p.format).toLowerCase(),lossless:null}:null;
 if(!source&&/libjpeg|controlled-jpeg/.test(p.decoder??''))source={format:'jpeg',lossless:false};
 let bytes=original.bytes;
 if(!bytes&&original.source?.read){const part=await original.source.read(0,Math.min(original.source.byteLength,65536),{signal});try{bytes=part.bytes.slice();}finally{await part.release();}}
 if(!bytes&&original.blob)bytes=new Uint8Array(await original.blob.slice(0,65536).arrayBuffer());
 const signature=recompressionSourceSignature(bytes);if(signature)source=signature;
 if(source?.format==='webp'&&source.lossless===null&&p.chroma)source.lossless=p.chroma==='444';
 return source;
}
function planOptions(params){
 const options=validateRecompressionOptions(params.recompression)??{codec:'jpeg',lossless:false},quality=params.quality??options.quality??75;
 requireValue(Number.isInteger(quality)&&quality>=1&&quality<=100,'Recompression quality must be1–100.');
 return{options,quality};
}
function planFromSource({options,quality},source){
 const codec=options.codec==='source'?source?.format:options.codec;
 if(!codec||!recompressionFormat(codec))throw new EngineError('UNSUPPORTED_FORMAT','The source codec has no verified recompressor. Select another codec explicitly.');
 const format=recompressionFormat(codec);
 // Source selects the codec family. Its detected previous mode is provenance,
 // while the explicitly requested mode controls this independent experiment.
 const lossless=!format.lossy||options.lossless;
 requireValue(lossless?format.lossless:format.lossy,'This source compression mode is not available in the verified registry.');
 const palette=!lossless&&format.qualityKind==='palette-colors';requireValue(options.paletteColors===undefined||palette,'The selected source family has no explicit PNG/BMP palette mode.');
 const stage=Object.freeze({codec,lossless,quality:palette||lossless||format.qualityMeaningful===false?null:quality,requestedQuality:quality,...(palette?{qualityKind:'palette-colors',paletteColors:options.paletteColors??recompressionPaletteColors(quality)}:{})});
 return Object.freeze({schema:'sherloq.recompression-plan/1',identity:JSON.stringify([1,codec,lossless,stage.quality,...(palette?[stage.paletteColors]:[])]),stage,sourceFormat:source?.format??null,sourceMode:source?.lossless===null||source?.lossless===undefined?'unknown':source.lossless?'lossless':'lossy',selection:options.codec,semantics:'One encode/decode pass of the admitted Original RGB8 context; source family does not reconstruct the original encoder or its quality.'});
}
export async function resolveRecompressionPlan(params={},image,{signal}={}){
 checkAbort(signal);const options=planOptions(params),source=await sourceEncoding(image,signal);checkAbort(signal);
 return planFromSource(options,source);
}
// A sweep owns one verified source description. Deriving another level must
// not re-read its Original or infer its mode from a format label alone.
export function deriveRecompressionPlan(params,base,{signal}={}){
 checkAbort(signal);requireValue(base?.schema==='sherloq.recompression-plan/1','A resolved recompression plan is required.');
 return planFromSource(planOptions(params),{format:base.sourceFormat,lossless:base.sourceMode==='unknown'?null:base.sourceMode==='lossless'});
}
