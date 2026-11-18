import "../../runtime-context.js?v=0.33.3";
import {requireValue} from './errors.js';

const list=value=>value==null?[]:Array.isArray(value)?value:[value];
/** ImageMagick's TIFF ReadStrip/ReadTile scratch and libtiff's compressed
 * input coexist with its pixel cache. Facts come from the already useful
 * Original TIFF directory inspection; no pixels, second Ping or read occurs. */
export function nativeTiffReadMemoryPlan(header,{encodedBytes}={}){
 if(header?.format!=='tiff')return null;
 const entries=header.directories?.[0]?.entries,value=tag=>entries?.find(entry=>entry.tag===tag)?.value;
 requireValue(Array.isArray(entries)&&Number.isSafeInteger(encodedBytes)&&encodedBytes>0,'Captured TIFF directories and encoded extent are required.');
 const width=header.sourceWidth,height=header.sourceHeight,samples=header.samples??1,
  depths=list(header.bits),depth=Math.max(header.depth??0,...depths),tiled=header.tileWidth!==undefined||header.tileHeight!==undefined;
 requireValue([width,height,samples,depth].every(n=>Number.isSafeInteger(n)&&n>0),'Invalid native TIFF sample geometry.');
 const stripRows=Math.min(height,value(278)??height),blockWidth=tiled?header.tileWidth:width,
  blockRows=tiled?header.tileHeight:stripRows;
 requireValue([blockWidth,blockRows].every(n=>Number.isSafeInteger(n)&&n>0),'Invalid native TIFF strip/tile geometry.');
 // GetQuantumExtent(image,...) uses the complete image row even for tiles.
 // This also safely covers separate planes: the coder takes max(stride,
 // complete-row quantum extent) before its per-plane loop.
 const quantumRowBytes=Math.ceil(width*samples*depth/8),blockRowBytes=Math.ceil(blockWidth*samples*depth/8),
  decodedBlockBytes=blockRows*Math.max(quantumRowBytes,blockRowBytes);
 requireValue(Number.isSafeInteger(decodedBlockBytes)&&decodedBlockBytes>0,'TIFF decoded block exceeds safe arithmetic.');
 // TIFF's pixel_info lives across the switch, separately from strip_pixels.
 // Its number_pixels is max(columns*spp*nextPow2(bits),columns*stripRows,
 // scanline_size); AcquireVirtualMemory multiplies that count by uint32.
 const nextBits=2**Math.ceil(Math.log2(depth)),auxiliaryPixelBytes=4*Math.max(width*samples*nextBits,width*stripRows,quantumRowBytes);
 const compression=header.compression??1,photometric=header.photometric??2,
  generic=photometric===6||photometric===32845||compression===3
   ||[6,7].includes(compression)&&photometric!==5&&(tiled||compression===6)
   ||!tiled&&value(278)===undefined&&depth<=8;
 const readMethod=generic?'generic':tiled?'tile':'strip',decodedReadBytes=generic?width*height*4:decodedBlockBytes;
 requireValue(Number.isSafeInteger(auxiliaryPixelBytes)&&Number.isSafeInteger(decodedReadBytes),'TIFF raster scratch exceeds safe arithmetic.');
 const counts=list(value(tiled?325:279)),countsKnown=counts.length>0&&counts.every(count=>count!=null&&typeof count!=='object');let encodedBlockBytes=0;
 if(countsKnown)for(const count of counts){requireValue(Number.isSafeInteger(count)&&count>=0&&count<=encodedBytes,'TIFF encoded block exceeds the captured Original extent.');encodedBlockBytes=Math.max(encodedBlockBytes,count);}
 // Missing byte-count information is not a new format rejection: the
 // unchanged complete encoded source is a conservative upper bound.
 if(!countsKnown)encodedBlockBytes=encodedBytes;
 const nativeReadScratchBytes=decodedReadBytes+auxiliaryPixelBytes+encodedBlockBytes;
 requireValue(Number.isSafeInteger(nativeReadScratchBytes),'TIFF read scratch exceeds safe addressing.');
 return Object.freeze({schema:'sherloq.native-tiff-read-memory/1',origin:'existing-original-tiff-directories',tiled,
  width,height,samples,depth,blockWidth,blockRows,quantumRowBytes,decodedBlockBytes,readMethod,
  decodedReadBytes,auxiliaryPixelBytes,encodedBlockBytes,nativeReadScratchBytes});
}
