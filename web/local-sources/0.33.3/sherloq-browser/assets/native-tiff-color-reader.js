import {createBlobSource} from './unified-engine/src/blob-source.js';
import {inspectTiffSource} from './unified-engine/src/tiff-header-source.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './unified-engine/src/errors.js';

const WINDOW_SIDE=1024,METADATA_CHUNK=64*1024,NATIVE_LITTLE_ENDIAN=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
const unsupported=message=>{throw new EngineError('NATIVE_COLOR_UNSUPPORTED',message);};
const array=value=>Array.isArray(value)?value:[value];
function sourcePoint(x,y,w,h,o){switch(o){case 2:return[w-1-x,y];case 3:return[w-1-x,h-1-y];case 4:return[x,h-1-y];case 5:return[y,x];case 6:return[y,h-1-x];case 7:return[w-1-y,h-1-x];case 8:return[w-1-y,x];default:return[x,y];}}

// This optional reader preserves stored channel samples. It deliberately does
// not use the historical RGB decoder, apply ICC, or create another full image.
// Compressed/tiled TIFF needs a separately qualified native-sample adapter.
export async function createNativeTiffColorReader({blob,source:providedSource,sourceSha256,width:expectedWidth,height:expectedHeight,budget,signal}={}){
 requireValue(budget&&typeof budget.reserve==='function','A shared native-colour memory budget is required.');
 requireValue(typeof sourceSha256==='string'&&/^[a-f0-9]{64}$/i.test(sourceSha256),'An original SHA256 identity is required.');
 requireValue(providedSource||blob instanceof Blob,'An original Blob or certified byte source is required.');
 const owned=!providedSource,source=providedSource??createBlobSource(blob,{budget}),held=new Set(),pending=new Set(),abort=new AbortController();let closed=false,metadataRelease,disposal;
 const alive=extra=>{checkAbort(signal);checkAbort(extra);checkAbort(abort.signal);if(closed)throw new EngineError('DISPOSED','Native TIFF colour reader is closed.');};
 const readSignal=extra=>AbortSignal.any([abort.signal,...[signal,extra].filter(Boolean)]);
 try{
  alive();const actual=typeof source.sha256==='function'?await source.sha256({signal:readSignal()}):source.sha256;
  if(typeof actual!=='string')throw new EngineError('SOURCE_UNVERIFIED','The TIFF byte source does not expose its certified identity.');
  if(actual.toLowerCase()!==sourceSha256.toLowerCase())throw new EngineError('SOURCE_CHANGED','The TIFF source differs from the loaded Original.');
  const {header}=await inspectTiffSource(source,{signal:readSignal(),account:n=>budget.reserve(n)});alive();
  const entries=header.directories?.[0]?.entries??[],entry=tag=>entries.find(value=>value.tag===tag),value=(tag,fallback)=>entry(tag)?.value??fallback;
  const critical=new Set([256,257,258,259,262,266,273,274,277,278,279,284,317,322,323,324,325,332,334,338,339]),seen=new Set();
  for(const item of entries)if(critical.has(item.tag)){if(seen.has(item.tag))unsupported('Duplicate native TIFF sample-layout fields are ambiguous.');seen.add(item.tag);}
  if((header.compression??1)!==1)unsupported('Native TIFF colour windows currently require uncompressed strips.');
  if([322,323,324,325].some(tag=>entry(tag)))unsupported('Native TIFF tiled colour windows are not qualified.');
  if(value(266,1)!==1||value(317,1)!==1)unsupported('Native TIFF fill order or predictor is not qualified.');
  if(entry(338))unsupported('Native TIFF extra/alpha samples are not qualified.');
  const rawWidth=header.sourceWidth,rawHeight=header.sourceHeight,orientation=header.orientation??1,samples=header.samples??1,planar=header.planarConfig??1,bits=array(header.bits??1),depth=bits[0],photo=header.photometric;
  if(![8,16].includes(depth)||bits.length!==samples||bits.some(v=>v!==depth)||array(value(339,1)).some(v=>v!==1)||![1,2].includes(planar))unsupported('Native TIFF requires uniform unsigned 8-bit or 16-bit samples and a known planar layout.');
  let space,channels;if(photo===5&&samples===4){if(value(332,1)!==1||value(334,4)!==4)unsupported('Native separated TIFF must explicitly use the standard four CMYK inks.');space='CMYK';channels=['C','M','Y','K'];}
  else if(photo===2&&samples===3){space='RGB';channels=['R','G','B'];}
  else if([0,1].includes(photo)&&samples===1){space='GRAY';channels=['Gray'];}
  else unsupported('This native TIFF photometric/sample combination is not qualified.');
  const width=orientation>=5?rawHeight:rawWidth,height=orientation>=5?rawWidth:rawHeight;
  if(expectedWidth!==undefined&&expectedWidth!==width||expectedHeight!==undefined&&expectedHeight!==height)throw new EngineError('SOURCE_CHANGED','The TIFF native grid differs from the loaded Original.');
  const rowsPerStrip=value(278,rawHeight),bytesPerSample=depth/8;
  requireValue(Number.isSafeInteger(rowsPerStrip)&&rowsPerStrip>0,'Invalid native TIFF rows per strip.');
  const stripsPerPlane=Math.ceil(rawHeight/rowsPerStrip),stripCount=stripsPerPlane*(planar===2?samples:1),rowBytes=rawWidth*(planar===2?1:samples)*bytesPerSample;
  requireValue(Number.isSafeInteger(stripCount)&&Number.isSafeInteger(rowBytes)&&Number.isSafeInteger(rawWidth*rawHeight*samples*bytesPerSample),'Native TIFF sample layout exceeds the safe integer range.');
  metadataRelease=budget.reserve(4096+entries.length*512+stripCount*32);
  async function offsets(item){
   if(!item||item.count!==stripCount||![3,4,16].includes(item.type))unsupported('Native TIFF strip offsets/counts are incomplete or unsupported.');
   const result=new Float64Array(stripCount),scalarBytes={3:2,4:4,16:8}[item.type],little=header.byteOrder==='II';
   if(item.value!==undefined){const values=array(item.value);requireValue(values.length===stripCount,'Native TIFF strip metadata length differs.');for(let i=0;i<stripCount;i++){requireValue(Number.isSafeInteger(values[i])&&values[i]>=0,'Invalid native TIFF strip offset/count.');result[i]=values[i];}return result;}
   // The common metadata parser intentionally omits very long arrays. Read
   // just these known integer tables, in finite admitted metadata chunks.
   const perChunk=Math.max(1,Math.floor(METADATA_CHUNK/scalarBytes));
   for(let i=0;i<stripCount;i+=perChunk){alive();const count=Math.min(perChunk,stripCount-i),part=await source.read(item.offset+i*scalarBytes,count*scalarBytes,{signal:readSignal()});
    try{const view=new DataView(part.bytes.buffer,part.bytes.byteOffset,part.bytes.byteLength);for(let j=0;j<count;j++){const offset=j*scalarBytes,v=scalarBytes===2?view.getUint16(offset,little):scalarBytes===4?view.getUint32(offset,little):view.getBigUint64(offset,little);if(typeof v==='bigint'&&v>BigInt(Number.MAX_SAFE_INTEGER))throw new EngineError('INVALID_INPUT','Native TIFF strip metadata exceeds the safe integer range.');result[i+j]=Number(v);}}finally{part.release();}
   }return result;
  }
  const stripOffsets=await offsets(entry(273)),stripCounts=await offsets(entry(279));
  for(let i=0;i<stripCount;i++){const rows=Math.min(rowsPerStrip,rawHeight-(i%stripsPerPlane)*rowsPerStrip),required=rows*rowBytes;requireValue(Number.isSafeInteger(required)&&stripCounts[i]>=required&&stripOffsets[i]<=source.byteLength-stripCounts[i],'Native TIFF strip samples exceed the original byte source.');}
  const capability=Object.freeze({sourceFormat:'tiff',space,channels:Object.freeze(channels),depth,range:Object.freeze([0,2**depth-1]),width,height,sourceWidth:rawWidth,sourceHeight:rawHeight,orientation,photometric:photo,planarConfig:planar,iccApplied:false,iccPresent:header.icc===true,sourceSha256:sourceSha256.toLowerCase(),decoder:'original-uncompressed-tiff-sample-windows/1',semantics:photo===0?'Stored unsigned grayscale samples; zero means white.':'Stored unsigned native channel samples before colour conversion.'});
  function releaseAll(){for(const item of [...held])item.release();}
  async function perform(rect,{signal:extra}={}){
   alive(extra);requireValue(rect&&['x','y','width','height'].every(k=>Number.isSafeInteger(rect[k]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.width<=WINDOW_SIDE&&rect.height<=WINDOW_SIDE&&rect.x+rect.width<=width&&rect.y+rect.height<=height,'Native TIFF colour windows must remain inside their image and fit 1024 by 1024.');
   const count=rect.width*rect.height*samples,free=budget.reserve(count*bytesPerSample);let committed=false;
   try{const data=depth===16?new Uint16Array(count):new Uint8Array(count),corners=[[rect.x,rect.y],[rect.x+rect.width-1,rect.y],[rect.x,rect.y+rect.height-1],[rect.x+rect.width-1,rect.y+rect.height-1]].map(([x,y])=>sourcePoint(x,y,rawWidth,rawHeight,orientation)),left=Math.min(...corners.map(p=>p[0])),right=Math.max(...corners.map(p=>p[0])),top=Math.min(...corners.map(p=>p[1])),bottom=Math.max(...corners.map(p=>p[1])),span=right-left+1,little=header.byteOrder==='II';
    for(let plane=0;plane<(planar===2?samples:1);plane++)for(let y=top;y<=bottom;y++){
     if(((y-top)&31)===0)await controlCheckpoint(readSignal(extra));alive(extra);
     const strip=plane*stripsPerPlane+Math.floor(y/rowsPerStrip),channelsInRow=planar===2?1:samples,at=stripOffsets[strip]+(y%rowsPerStrip)*rowBytes+left*channelsInRow*bytesPerSample,length=span*channelsInRow*bytesPerSample,part=await source.read(at,length,{signal:readSignal(extra)});
     try{alive(extra);requireValue(part.bytes.length===length,'Incomplete native TIFF sample row.');const view=depth===16?new DataView(part.bytes.buffer,part.bytes.byteOffset,part.bytes.byteLength):null;
      if(planar===1&&(orientation===1||orientation===4)){const dy=orientation===4?rawHeight-1-y:y,to=(dy-rect.y)*rect.width*samples;
       if(depth===8)data.set(part.bytes,to);else if(little===NATIVE_LITTLE_ENDIAN&&part.bytes.byteOffset%2===0)data.set(new Uint16Array(part.bytes.buffer,part.bytes.byteOffset,part.bytes.byteLength/2),to);else for(let i=0;i<span*samples;i++)data[to+i]=view.getUint16(i*2,little);continue;
      }
      for(let x=left;x<=right;x++){let dx=x,dy=y;switch(orientation){case 2:dx=rawWidth-1-x;break;case 3:dx=rawWidth-1-x;dy=rawHeight-1-y;break;case 4:dy=rawHeight-1-y;break;case 5:dx=y;dy=x;break;case 6:dx=rawHeight-1-y;dy=x;break;case 7:dx=rawHeight-1-y;dy=rawWidth-1-x;break;case 8:dx=y;dy=rawWidth-1-x;break;}const to=((dy-rect.y)*rect.width+dx-rect.x)*samples,from=(x-left)*channelsInRow;
       for(let c=0;c<channelsInRow;c++)data[to+(planar===2?plane:c)]=depth===16?view.getUint16((from+c)*2,little):part.bytes[from+c];}
     }finally{part.release();}
    }
    alive(extra);let released=false;const pixels={width:rect.width,height:rect.height,format:space.toLowerCase()+depth,space,channels:samples,depth,data},lease={pixels,origin:[rect.x,rect.y],capability,release(){if(released)return;free();released=true;held.delete(lease);pixels.data=null;}};held.add(lease);committed=true;return lease;
   }finally{if(!committed)free();}
  }
  return{capability,readWindow(rect,hooks){const task=perform(rect,hooks);pending.add(task);task.finally(()=>pending.delete(task)).catch(()=>{});return task;},dispose(){if(disposal)return disposal;closed=true;abort.abort();return disposal=Promise.allSettled([...pending]).then(()=>{releaseAll();if(owned)source.dispose();metadataRelease?.();metadataRelease=null;});}};
 }catch(error){closed=true;abort.abort();for(const item of [...held])item.release();if(owned)source.dispose();metadataRelease?.();throw error;}
}
