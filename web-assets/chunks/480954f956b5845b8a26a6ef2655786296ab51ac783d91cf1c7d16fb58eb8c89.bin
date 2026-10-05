import "../../runtime-context.js?v=0.14.5";
import {imageHeader,readTiff} from './image-headers.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
// Offsets in standalone eXIf data are TIFF-relative; the public header contract
// identifies entries and thumbnail ranges in the original encoded PNG.
function originalOffsets(tiff,base){
 for(const directory of tiff.directories){directory.offset+=base;for(const entry of directory.entries)if(entry.offset!==undefined)entry.offset+=base;}
 if(tiff.thumbnail)tiff.thumbnail.offset+=base;return tiff;
}
export async function inspectPngSource(source,{signal,account}={}){
 requireValue(typeof account==='function','PNG metadata memory admission required.');let readBytes=0,readCalls=0,maxReadBytes=0,metadataRelease,animationDetected=false;
 async function read(offset,length,consume){const part=await source.read(offset,length,{signal});try{readBytes+=length;readCalls++;maxReadBytes=Math.max(maxReadBytes,length);return consume(part.bytes);}finally{part.release();}}
 try{
  requireValue(source.byteLength>=33,'Truncated PNG header.');const header=await read(0,33,imageHeader);requireValue(header.format==='png','PNG signature required.');let offset=33,exif;
  while(offset+12<=source.byteLength){
   await controlCheckpoint(signal);const {length,kind}=await read(offset,8,bytes=>({length:new DataView(bytes.buffer,bytes.byteOffset,8).getUint32(0),kind:String.fromCharCode(...bytes.subarray(4,8))}));
   requireValue(length<=source.byteLength-offset-12,'PNG chunk exceeds original source.');
   if(kind==='acTL'||kind==='fcTL')animationDetected=true;if(kind==='iCCP')header.icc=true;if(kind==='tRNS')header.alpha=true;
   if(kind==='eXIf'){
    requireValue(!exif,'Multiple PNG EXIF chunks are ambiguous.');
    // TIFF entries/values and JS object overhead are admitted before the payload
    // read. A conservative length-based bound avoids unaccounted parser trees.
    metadataRelease=account(length*32);
    exif=await read(offset+8,length,bytes=>originalOffsets(readTiff(bytes),offset+8));header.exif=exif;header.orientation=exif.orientation;
   }
   offset+=length+12;if(kind==='IEND')break;
  }
  checkAbort(signal);if(header.orientation>=5){header.width=header.sourceHeight;header.height=header.sourceWidth;}
  return {header,metrics:{encodedReadMode:'png-chunk-ranges',animationDetected,encodedReadBytes:readBytes,encodedReadCalls:readCalls,maxEncodedReadBytes:maxReadBytes}};
 }finally{metadataRelease?.();}
}
