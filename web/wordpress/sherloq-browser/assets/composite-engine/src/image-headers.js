import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
const text=(bytes,start,end)=>new TextDecoder('latin1').decode(bytes.subarray(start,end));
function checkRange(start,count,end){requireValue(Number.isSafeInteger(start)&&Number.isSafeInteger(count)&&start>=0&&count>=0&&start+count<=end,'Metadata offset outside source bytes.');}
export function readTiff(bytes,base=0,end=bytes.length,options={}){
 requireValue(bytes instanceof Uint8Array,'TIFF bytes required.');
 return readTiffAccessor({byteLength:bytes.length,view:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),byte:p=>bytes[p],text:(start,end)=>text(bytes,start,end)},base,end,options);
}
// One parser serves contiguous encoded bytes and admitted sparse metadata ranges.
export function readTiffAccessor(reader,base=0,end=reader.byteLength,{allowBigTiff=false}={}){
 requireValue(Number.isSafeInteger(end)&&end>=0&&end<=reader.byteLength,'Invalid TIFF byte range.');
 checkRange(base,8,end);const order=reader.text(base,base+2),le=order==='II';requireValue(le||order==='MM','Invalid TIFF byte order.');
 const view=reader.view,u16=p=>(checkRange(p,2,end),view.getUint16(p,le)),u32=p=>(checkRange(p,4,end),view.getUint32(p,le));
 const version=u16(base+2),big=version===43&&allowBigTiff;
 if(version!==42&&!big)throw new EngineError('UNSUPPORTED_FORMAT','Unsupported TIFF version for this metadata container.');
 const wide=(p,signed=false,scalar=false)=>{checkRange(p,8,end);const value=signed?view.getBigInt64(p,le):view.getBigUint64(p,le);if(value>=BigInt(-Number.MAX_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER))return Number(value);if(scalar)return {integer64:value.toString()};throw new EngineError('INVALID_INPUT','BigTIFF offset or count exceeds the safe integer range.');};
 if(big){checkRange(base,16,end);requireValue(u16(base+4)===8&&u16(base+6)===0,'Unsupported BigTIFF offset size or reserved field.');}
 const countSize=big?8:2,entrySize=big?20:12,offsetSize=big?8:4,valueStart=big?12:8,offsetAt=big?wide:u32;
 const sizes={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8,11:4,12:8,13:4,...(big?{16:8,17:8,18:8}:{})},directories=[],visited=new Set();let total=0;
 function directory(relative,kind){
  if(!relative)return null;requireValue(!visited.has(relative)&&visited.size<32,'Cyclic or oversized TIFF directory tree.');visited.add(relative);
  const offset=base+relative;checkRange(offset,countSize,end);const count=big?wide(offset):u16(offset);requireValue(count<=4096,'Too many TIFF entries.');checkRange(offset+countSize,count*entrySize+offsetSize,end);
  const entries=[];const record={kind,offset,entries};directories.push(record);
  for(let j=0;j<count;j++){
   const p=offset+countSize+j*entrySize,tag=u16(p),type=u16(p+2),length=offsetAt(p+4),size=sizes[type];if(!size){entries.push({tag,type,count:length,unsupported:true});continue;}
   const byteLength=length*size,dataOffset=byteLength<=offsetSize?p+valueStart:base+offsetAt(p+valueStart);checkRange(dataOffset,byteLength,end);
   const item={tag,type,count:length,offset:dataOffset,byteLength};entries.push(item);
   if(type===7||length>4096){item.valueOmitted=true;continue;}total+=length;requireValue(total<=65536,'Too many metadata values.');
   if(type===2){item.value=reader.text(dataOffset,dataOffset+length).replace(/\0+$/,'');continue;}
   const values=[];
   for(let k=0;k<length;k++){
    const q=dataOffset+k*size;
    if(type===1)values.push(reader.byte(q));else if(type===3)values.push(u16(q));else if(type===4||type===13)values.push(u32(q));else if(type===9)values.push(view.getInt32(q,le));
    else if(type===16||type===17||type===18)values.push(wide(q,type===17,true));
    else if(type===11)values.push(view.getFloat32(q,le));else if(type===12)values.push(view.getFloat64(q,le));
    else {const numerator=type===5?u32(q):view.getInt32(q,le),denominator=type===5?u32(q+4):view.getInt32(q+4,le);values.push({numerator,denominator,value:denominator?numerator/denominator:null});}
   }
   item.value=values.length===1?values[0]:values;
  }
  for(const [tag,name] of [[34665,'exif'],[34853,'gps'],[40965,'interop']]){const pointer=entries.find(e=>e.tag===tag)?.value;if(Number.isInteger(pointer))directory(pointer,name);}
  const next=offsetAt(offset+countSize+count*entrySize);if(next)directory(next,kind==='image'?'thumbnail':'next');return record;
 }
 const first=directory(big?wide(base+8):u32(base+4),'image');requireValue(first,'Missing TIFF image directory.');
 const get=(tag,kind='image')=>directories.find(d=>d.kind===kind)?.entries.find(e=>e.tag===tag)?.value;
 const rawOrientation=get(274),orientation=rawOrientation??1;requireValue(Number.isInteger(orientation)&&orientation>=1&&orientation<=8,'Invalid EXIF orientation.');
 const result={...(big?{bigTiff:true}:{}),byteOrder:order,orientation,width:get(256),height:get(257),bits:get(258),samples:get(277),photometric:get(262),compression:get(259),planarConfig:get(284)??1,tileWidth:get(322),tileHeight:get(323),alpha:!!get(338),directories};
 const thumbnailOffset=get(513,'thumbnail'),thumbnailLength=get(514,'thumbnail');
 if(Number.isInteger(thumbnailOffset)&&Number.isInteger(thumbnailLength)){checkRange(base+thumbnailOffset,thumbnailLength,end);result.thumbnail={offset:base+thumbnailOffset,length:thumbnailLength};}
 const rational=x=>typeof x==='number'?x:x?.value,dms=v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(rational(x)))?rational(v[0])+rational(v[1])/60+rational(v[2])/3600:null;
 const lat=dms(get(2,'gps')),lon=dms(get(4,'gps')),latRef=get(1,'gps'),lonRef=get(3,'gps');
 if(lat!==null&&lon!==null&&['N','S'].includes(latRef)&&['E','W'].includes(lonRef)&&lat<=90&&lon<=180)result.gps={latitude:lat*(latRef==='S'?-1:1),longitude:lon*(lonRef==='W'?-1:1)};
 return result;
}
const zigzag=[0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63];
export function jpegHeader(bytes){
 requireValue(bytes instanceof Uint8Array&&bytes.length>=4,'JPEG bytes required.');if(bytes[0]!==255||bytes[1]!==216)throw new EngineError('UNSUPPORTED_FORMAT','JPEG signature required.');
 let offset=2,frame,exif;const markers=[],quantization={},components=[];let icc=false,xmp=false;
 while(offset<bytes.length){
  const start=offset;requireValue(bytes[offset++]===255,'Malformed JPEG marker.');while(bytes[offset]===255)offset++;const marker=bytes[offset++];
  if(marker===0xda||marker===0xd9){markers.push({marker,offset:start});break;}if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
  checkRange(offset,2,bytes.length);const length=bytes[offset]*256+bytes[offset+1];requireValue(length>=2,'Invalid JPEG segment length.');checkRange(offset,length,bytes.length);const data=offset+2,end=offset+length;markers.push({marker,offset:start,length:end-start});
  if(marker===0xe1&&text(bytes,data,Math.min(end,data+6))==='Exif\0\0'){requireValue(!exif,'Multiple EXIF segments are ambiguous.');exif=readTiff(bytes,data+6,end);}
  if(marker===0xe1&&text(bytes,data,Math.min(end,data+29))==='http://ns.adobe.com/xap/1.0/\0')xmp=true;
  if(marker===0xe2&&text(bytes,data,Math.min(end,data+12))==='ICC_PROFILE\0')icc=true;
  if(marker===0xdb){let q=data;while(q<end){const descriptor=bytes[q++],precision=descriptor>>4,id=descriptor&15;requireValue(precision<=1,'Invalid quantization precision.');checkRange(q,64*(precision+1),end);const table=new Array(64);for(let j=0;j<64;j++){table[zigzag[j]]=precision?bytes[q++]*256+bytes[q++]:bytes[q++];}quantization[id]=table;}}
  if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker)){
   requireValue(!frame&&length>=8,'Invalid JPEG frame.');const channels=bytes[offset+7];requireValue(length>=8+channels*3,'Truncated JPEG components.');
   if(![0xc0,0xc2].includes(marker)||bytes[offset+2]!==8||![1,3].includes(channels))throw new EngineError('UNSUPPORTED_FORMAT','Only 8-bit grayscale or YCbCr baseline/progressive JPEG is verified.');
   frame={height:bytes[offset+3]*256+bytes[offset+4],width:bytes[offset+5]*256+bytes[offset+6],channels,progressive:marker===0xc2};
   for(let j=0;j<channels;j++)components.push(bytes[offset+10+j*3]);
  }
  offset=end;
 }
 requireValue(frame&&frame.width>0&&frame.height>0,'Missing JPEG dimensions.');
 const orientation=exif?.orientation??1,sourceWidth=frame.width,sourceHeight=frame.height;
 if(orientation>=5)[frame.width,frame.height]=[frame.height,frame.width];
 return {...frame,sourceWidth,sourceHeight,orientation,icc,xmp,exif,markers,quantization,components};
}
export async function orientRgb(pixels,orientation,{signal}={}){
 if(orientation===1)return pixels;const {checkpoint}=await import('./errors.js');
 const sw=pixels.width,sh=pixels.height,w=orientation>=5?sh:sw,h=orientation>=5?sw:sh,out=new Uint8Array(pixels.data.length);
 for(let y=0;y<sh;y++){if(y%32===0)await checkpoint(signal);for(let x=0;x<sw;x++){
  let dx=x,dy=y;switch(orientation){case 2:dx=sw-1-x;break;case 3:dx=sw-1-x;dy=sh-1-y;break;case 4:dy=sh-1-y;break;case 5:dx=y;dy=x;break;case 6:dx=sh-1-y;dy=x;break;case 7:dx=sh-1-y;dy=sw-1-x;break;case 8:dx=y;dy=sw-1-x;break;}
  const i=(y*sw+x)*3,j=(dy*w+dx)*3;out[j]=pixels.data[i];out[j+1]=pixels.data[i+1];out[j+2]=pixels.data[i+2];
 }}return {width:w,height:h,format:'rgb8',data:out};
}
export function tiffImageHeader(tiff){
 requireValue(Number.isSafeInteger(tiff.width)&&Number.isSafeInteger(tiff.height)&&tiff.width>0&&tiff.height>0,'Invalid TIFF dimensions.');
 const sourceWidth=tiff.width,sourceHeight=tiff.height,width=tiff.orientation>=5?sourceHeight:sourceWidth,height=tiff.orientation>=5?sourceWidth:sourceHeight;
 return {format:'tiff',...tiff,width,height,sourceWidth,sourceHeight,icc:tiff.directories[0].entries.some(e=>e.tag===34675),depth:Array.isArray(tiff.bits)?Math.max(...tiff.bits):tiff.bits??1};
}
export function imageHeader(bytes){
 requireValue(bytes instanceof Uint8Array&&bytes.length>=8,'Encoded image bytes required.');
 if(bytes[0]===255&&bytes[1]===216)return {format:'jpeg',...jpegHeader(bytes)};
 if((bytes[0]===73&&bytes[1]===73)||(bytes[0]===77&&bytes[1]===77)){
  return tiffImageHeader(readTiff(bytes,0,bytes.length,{allowBigTiff:true}));
 }
 if(bytes[0]===137&&text(bytes,1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10){
  checkRange(8,25,bytes.length);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);requireValue(text(bytes,12,16)==='IHDR'&&view.getUint32(8)===13,'Invalid PNG header.');
  const sourceWidth=view.getUint32(16),sourceHeight=view.getUint32(20),depth=bytes[24],colorType=bytes[25];requireValue(sourceWidth>0&&sourceHeight>0,'Invalid PNG dimensions.');
  let alpha=[4,6].includes(colorType),icc=false,orientation=1,offset=8,exif;
  while(offset+12<=bytes.length){const length=view.getUint32(offset),kind=text(bytes,offset+4,offset+8);checkRange(offset+8,length+4,bytes.length);if(kind==='iCCP')icc=true;if(kind==='tRNS')alpha=true;if(kind==='eXIf'){requireValue(!exif,'Multiple PNG EXIF chunks are ambiguous.');exif=readTiff(bytes,offset+8,offset+8+length);orientation=exif.orientation;}offset+=length+12;if(kind==='IEND')break;}
  return {format:'png',width:orientation>=5?sourceHeight:sourceWidth,height:orientation>=5?sourceWidth:sourceHeight,sourceWidth,sourceHeight,depth,colorType,alpha,icc,orientation,...(exif?{exif}:{}),compressionMethod:bytes[26],filterMethod:bytes[27],interlace:bytes[28]};
 }
 throw new EngineError('UNSUPPORTED_FORMAT','Only verified JPEG, PNG and classic TIFF decoding is available.');
}
