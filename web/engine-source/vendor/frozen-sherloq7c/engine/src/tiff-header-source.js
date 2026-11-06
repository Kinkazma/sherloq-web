import {readTiffAccessor,tiffImageHeader} from './image-headers.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
// Preload only directory tables and values that the shared structural parser
// actually exposes. Encoded strips, tiles, ICC/undefined bytes and thumbnails
// remain unmaterialized; their original offsets/lengths are preserved.
export async function inspectTiffSource(source,{signal,account}={}){
 requireValue(typeof account==='function'&&Number.isSafeInteger(source.byteLength),'TIFF metadata memory admission required.');
 const chunks=[],releases=[];let readBytes=0,maxReadBytes=0,last;
 const range=(offset,length)=>requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=source.byteLength-length,'Metadata offset outside source bytes.');
 function locate(offset,length){
  if(!length)return new Uint8Array();if(last&&offset>=last.offset&&offset+length<=last.offset+last.bytes.length)return last.bytes.subarray(offset-last.offset,offset-last.offset+length);
  let low=0,high=chunks.length;while(low<high){const middle=(low+high)>>1;if(chunks[middle].offset<=offset)low=middle+1;else high=middle;}
  for(let i=low-1;i>=0;i--){const item=chunks[i];if(offset+length<=item.offset+item.bytes.length){last=item;return item.bytes.subarray(offset-item.offset,offset-item.offset+length);}}
  return null;
 }
 async function load(offset,length){
  range(offset,length);const found=locate(offset,length);if(found)return found;
  const release=account(length*33);releases.push(release);const part=await source.read(offset,length,{signal});
  try{const item={offset,bytes:part.bytes};let index=0;while(index<chunks.length&&chunks[index].offset<=offset)index++;chunks.splice(index,0,item);last=item;readBytes+=length;maxReadBytes=Math.max(maxReadBytes,length);return item.bytes;}finally{part.release();}
 }
 const view={};for(const [name,size]of Object.entries({getUint16:2,getUint32:4,getInt32:4,getFloat32:4,getFloat64:8,getBigInt64:8,getBigUint64:8}))view[name]=(offset,le)=>{const bytes=locate(offset,size);requireValue(bytes,'Missing admitted TIFF metadata range.');return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)[name](0,le);};
 const reader={byteLength:source.byteLength,view,byte:offset=>{const b=locate(offset,1);requireValue(b,'Missing TIFF byte.');return b[0];},text:(start,end)=>{const b=locate(start,end-start);requireValue(b,'Missing TIFF string.');return new TextDecoder('latin1').decode(b);}};
 try{
  await load(0,8);const order=reader.text(0,2),le=order==='II';requireValue(le||order==='MM','Invalid TIFF byte order.');const version=view.getUint16(2,le),big=version===43;
  if(version!==42&&!big)throw new EngineError('UNSUPPORTED_FORMAT','Unsupported TIFF version.');
  const wide=(offset,signed=false,scalar=false)=>{const n=view[signed?'getBigInt64':'getBigUint64'](offset,le);if(n>=BigInt(-Number.MAX_SAFE_INTEGER)&&n<=BigInt(Number.MAX_SAFE_INTEGER))return Number(n);if(scalar)return null;throw new EngineError('INVALID_INPUT','BigTIFF offset or count exceeds the safe integer range.');};
  if(big){await load(8,8);requireValue(view.getUint16(4,le)===8&&view.getUint16(6,le)===0,'Unsupported BigTIFF offset size or reserved field.');}
  const countSize=big?8:2,entrySize=big?20:12,offsetSize=big?8:4,valueStart=big?12:8,u16=p=>view.getUint16(p,le),u32=p=>view.getUint32(p,le),number=big?wide:u32;
  const sizes={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8,11:4,12:8,13:4,...(big?{16:8,17:8,18:8}:{})},visited=new Set();let total=0;
  async function directory(offset){
   if(!offset)return;requireValue(!visited.has(offset)&&visited.size<32,'Cyclic or oversized TIFF directory tree.');visited.add(offset);await controlCheckpoint(signal);await load(offset,countSize);
   const count=big?wide(offset):u16(offset);requireValue(count<=4096,'Too many TIFF entries.');await load(offset+countSize,count*entrySize+offsetSize);const children=[],seenPointers=new Set();
   for(let j=0;j<count;j++){
    if(j%32===0)await controlCheckpoint(signal);const p=offset+countSize+j*entrySize,tag=u16(p),type=u16(p+2),length=number(p+4),size=sizes[type],isPointer=[34665,34853,40965].includes(tag),firstPointer=isPointer&&!seenPointers.has(tag);if(isPointer)seenPointers.add(tag);if(!size)continue;
    const byteLength=length*size,dataOffset=byteLength<=offsetSize?p+valueStart:number(p+valueStart);range(dataOffset,byteLength);if(type===7||length>4096)continue;
    total+=length;requireValue(total<=65536,'Too many metadata values.');await load(dataOffset,byteLength);
    if(firstPointer&&length===1){let pointer;
     if(type===1)pointer=reader.byte(dataOffset);else if(type===3)pointer=u16(dataOffset);else if(type===4||type===13)pointer=u32(dataOffset);else if(type===9)pointer=view.getInt32(dataOffset,le);else if(type===11)pointer=view.getFloat32(dataOffset,le);else if(type===12)pointer=view.getFloat64(dataOffset,le);else if([16,17,18].includes(type))pointer=wide(dataOffset,type===17,true);
     if(Number.isInteger(pointer))children.push({tag,pointer});
    }
   }
   // Follow only the first matching tag, in the same order as readTiffAccessor.
   for(const tag of [34665,34853,40965]){const child=children.find(c=>c.tag===tag);if(child)await directory(child.pointer);}
   const next=number(offset+countSize+count*entrySize);if(next)await directory(next);
  }
  await directory(big?wide(8):u32(4));checkAbort(signal);const header=tiffImageHeader(readTiffAccessor(reader,0,source.byteLength,{allowBigTiff:true}));
  return {header,metrics:{encodedReadMode:'tiff-metadata-ranges',encodedReadBytes:readBytes,encodedReadCalls:chunks.length,maxEncodedReadBytes:maxReadBytes}};
 }finally{chunks.length=0;last=null;for(const release of releases)release();}
}
