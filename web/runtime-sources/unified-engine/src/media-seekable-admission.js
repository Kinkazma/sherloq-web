import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue} from './errors.js';
import {extendedImageFormat,isCameraRaw} from './media-format.js';
import {MEDIA_RESOURCE_PINS} from './media-resource-integrity.js';
import {nativeRasterHeaderFromInfo} from './native-color-import.js';
import {inspectTiffSource} from './tiff-header-source.js';

const MiB=1024**2;
const page=65536;
const minimumHeap=16*MiB;
const fixedBytes=2*MEDIA_RESOURCE_PINS.magick.bytes+2*MiB;
export const seekableSignatureBytes=4096;
export const seekableBandBytes=4*MiB;

function isGenericTiff(tiff){
 return tiff?.format==='TIFF'&&[tiff.width,tiff.height,tiff.samples,tiff.depth].every(n=>Number.isSafeInteger(n)&&n>0)
  &&(tiff.photometric===null||Number.isSafeInteger(tiff.photometric)&&tiff.photometric>=0)
  &&Array.isArray(tiff.bits)&&tiff.bits.length>0&&tiff.bits.every(n=>Number.isSafeInteger(n)&&n>0)
  &&Array.isArray(tiff.sampleFormats)&&tiff.sampleFormats.every(n=>n===1||n===2||n===3)
  &&tiff.sampleFormats.some(n=>n===2||n===3);
}

export function genericTiffEvidence(coder){
 const h=coder?.header,entries=h?.directories?.[0]?.entries;
 if(coder?.format!=='TIFF'||h?.format!=='tiff'||!Array.isArray(entries))return null;
 const values=value=>Array.isArray(value)?value:[value];
 const evidence={format:'TIFF',width:h.sourceWidth,height:h.sourceHeight,depth:h.depth,samples:h.samples??1,
  photometric:h.photometric??null,bits:values(h.bits),sampleFormats:values(entries.find(entry=>entry.tag===339)?.value)};
 if(!isGenericTiff(evidence)||nativeRasterHeaderFromInfo(h,'TIFF'))return null;
 return {...evidence,bits:evidence.bits.slice(),sampleFormats:evidence.sampleFormats.slice()};
}

export async function confirmSeekableTiff(source,evidence,hooks){
 const {header}=await inspectTiffSource(source,hooks);
 const confirmed=genericTiffEvidence({format:'TIFF',header});
 if(JSON.stringify(confirmed)!==JSON.stringify(evidence))throw new EngineError('SOURCE_CHANGED','The verified TIFF type differs from its inspected header.');
}

export function seekableGenericFormat(bytes,name,genericTiff){
 if(isCameraRaw(name))return null;
 const format=extendedImageFormat(bytes,name);
 if(format==='TIFF')return isGenericTiff(genericTiff)?format:null;
 return format&&!['JPEG','PNG','AVIF'].includes(format)?format:null;
}

export function planSeekableMedia({available,byteLength,manifest,format}){
 // Preserve a transfer band and one destination storage page alongside Q8.
 const headroom=2*seekableBandBytes;
 const fixed=fixedBytes+manifest.states.byteLength;
 const cacheLimit=Math.min(seekableBandBytes,Math.floor((available-fixed-headroom-minimumHeap)/2));
 const cacheBytes=byteLength<=cacheLimit?byteLength:Math.floor(cacheLimit/manifest.chunkBytes)*manifest.chunkBytes;
 if(cacheBytes<=0)throw new EngineError('MEMORY_LIMIT','The seekable media input does not fit the admitted budget.');
 const heapBytes=Math.min(2**32,Math.floor((available-fixed-headroom-2*cacheBytes)/page)*page);
 const phaseBytes=fixed+2*cacheBytes+heapBytes;
 return {mode:'seekable',format,cacheBytes,heapBytes,phaseBytes};
}

export function validateSeekableMedia(plan,manifest,byteLength){
 requireValue(plan.format==='TIFF'?isGenericTiff(plan.genericTiff):plan.genericTiff===undefined,
  'The seekable TIFF job requires inspected generic sample types.');
 requireValue(manifest?.byteLength===byteLength&&Number.isSafeInteger(manifest.chunkBytes)&&manifest.chunkBytes>0
  &&manifest.states instanceof Uint8Array,'The seekable input needs its captured prefix identity.');
 requireValue(Number.isSafeInteger(plan.cacheBytes)&&plan.cacheBytes>0&&plan.cacheBytes<=byteLength
  &&(plan.cacheBytes===byteLength||plan.cacheBytes%manifest.chunkBytes===0)
  &&Number.isSafeInteger(plan.heapBytes)&&plan.heapBytes>=minimumHeap&&plan.heapBytes<=2**32&&plan.heapBytes%page===0
  &&plan.phaseBytes===fixedBytes+manifest.states.byteLength+2*plan.cacheBytes+plan.heapBytes,
  'The seekable media input does not have a complete budget.');
}
