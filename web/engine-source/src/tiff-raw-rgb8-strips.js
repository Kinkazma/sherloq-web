import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
const WINDOW_BYTES=4*1024**2;
const value=(header,tag)=>header.directories?.[0]?.entries.find(entry=>entry.tag===tag)?.value;
const list=value=>Array.isArray(value)?value:[value];

// A large uncompressed RGB8 strip already contains the exact analysis samples.
// Read original byte ranges; never rewrite strip tags or manufacture a TIFF.
// Other depth/color/compression/tile contracts stay on the verified libtiff path.
export function rawRgb8StripPlan(header){
 const {sourceWidth:width,sourceHeight:height}=header;
 const critical=new Set([256,257,258,259,262,266,273,274,277,278,279,284,317,338,339]),seen=new Set();
 for(const entry of header.directories?.[0]?.entries??[])if(critical.has(entry.tag)){if(seen.has(entry.tag))return null;seen.add(entry.tag);}
 const bits=list(header.bits),rows=value(header,278)??height,offsets=list(value(header,273)),counts=list(value(header,279)),samples=header.samples??1;
 if(header.tileWidth!==undefined||header.tileHeight!==undefined||(header.compression??1)!==1||header.photometric!==2||samples!==3||header.depth!==8||bits.length!==3||bits.some(n=>n!==8)||(header.planarConfig??1)!==1||header.alpha||value(header,338)!==undefined||(value(header,266)??1)!==1||(value(header,317)??1)!==1||list(value(header,339)??1).some(n=>n!==1)||![1,2,3,4].includes(header.orientation??1))return null;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(rows)||rows<1||!Number.isSafeInteger(width*height*3))return null;
 const stripCount=Math.ceil(height/rows),rowBytes=width*3;
 if(offsets.length!==stripCount||counts.length!==stripCount)return null;
 const strips=[];
 for(let i=0;i<stripCount;i++){
  const startRow=i*rows,stripRows=Math.min(rows,height-startRow),requiredBytes=stripRows*rowBytes,offset=offsets[i],byteLength=counts[i];
  if(![offset,byteLength,requiredBytes].every(Number.isSafeInteger)||offset<0||byteLength<requiredBytes||!Number.isSafeInteger(offset+byteLength))return null;
  strips.push({offset,byteLength,startRow,rows:stripRows,requiredBytes});
 }
 const bandRows=Math.max(1,Math.min(height,Math.floor(WINDOW_BYTES/rowBytes))),bandBytes=bandRows*rowBytes;
 if(bandBytes>WINDOW_BYTES)return null;
 const mirrored=[2,3].includes(header.orientation??1),scratchBytes=mirrored?bandBytes:0;
 return{strategy:'uncompressed-rgb8-strip-windows',blockWidth:width,blockHeight:bandRows,sourceBlockWidth:width,sourceBlockHeight:Math.min(height,rows),bandBytes,heapMaximumBytes:0,workingBytes:bandBytes+scratchBytes+4*1024**2,scratchBytes,maxEncodedReadBytes:bandBytes,strips,orientation:header.orientation??1};
}

export async function decodeRawRgb8Strips(source,header,store,{budget,signal,onProgress,plan=rawRgb8StripPlan(header)}={}){
 requireValue(plan&&source?.read&&budget?.reserve&&store?.write&&store.byteLength===header.sourceWidth*header.sourceHeight*3,'Qualified raw RGB8 strip plan and existing byte reader/output store required.');
 const width=header.sourceWidth,height=header.sourceHeight,rowBytes=width*3;
 for(const strip of plan.strips)requireValue(strip.offset<=source.byteLength-strip.byteLength,'TIFF strip byte range exceeds the original source.');
 let scratch,release,reads=0,readBytes=0,maxRead=0,blocks=0;
 try{
  if(plan.scratchBytes){release=budget.reserve(plan.scratchBytes);scratch=new Uint8Array(plan.scratchBytes);}
  for(const strip of plan.strips)for(let row=0;row<strip.rows;row+=plan.blockHeight){
   await controlCheckpoint(signal);const rows=Math.min(plan.blockHeight,strip.rows-row),length=rows*rowBytes,y=strip.startRow+row;
   const part=await source.read(strip.offset+row*rowBytes,length,{signal});
   try{
    checkAbort(signal);requireValue(part.bytes instanceof Uint8Array&&part.bytes.byteLength===length,'TIFF source returned an incomplete RGB8 row window.');reads++;readBytes+=length;maxRead=Math.max(maxRead,length);
    let bytes=part.bytes;
    if(scratch){for(let yy=0;yy<rows;yy++){if((yy&31)===0)await controlCheckpoint(signal);for(let x=0;x<width;x++){const from=(yy*width+x)*3,to=(yy*width+width-1-x)*3;scratch[to]=bytes[from];scratch[to+1]=bytes[from+1];scratch[to+2]=bytes[from+2];}}bytes=scratch.subarray(0,length);}
    if(plan.orientation<=2)await store.write(bytes,y*rowBytes,{signal});
    else for(let yy=0;yy<rows;yy++){checkAbort(signal);await store.write(bytes.subarray(yy*rowBytes,(yy+1)*rowBytes),(height-1-y-yy)*rowBytes,{signal});}
    blocks++;onProgress?.((y+rows)/height);checkAbort(signal);
   }finally{part.release();}
  }
  await store.flush?.();checkAbort(signal);
  return{decoder:'verified-uncompressed-rgb8-strip-byte-windows',decodeStrategy:plan.strategy,blocks,blockWidth:plan.blockWidth,blockHeight:plan.blockHeight,sourceBlockWidth:plan.sourceBlockWidth,sourceBlockHeight:plan.sourceBlockHeight,encodedReadCalls:reads,encodedReadBytes:readBytes,maxEncodedReadBytes:maxRead,codecHeapCapacityBytes:0,codecHeapMaximumBytes:0,workingReservationBytes:plan.scratchBytes,workingAdmissionBytes:plan.workingBytes,tiffOrientation:'bounded original RGB8 sample windows and exact orientation1–4 coordinate mapping'};
 }finally{scratch=null;release?.();}
}
