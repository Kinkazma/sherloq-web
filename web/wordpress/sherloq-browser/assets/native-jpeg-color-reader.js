import {dependencyBytes} from './runtime-dependency.js?v=0.33.1';
import {NATIVE_JPEG_COLOR_RESOURCE} from './native-jpeg-color-resource.js?v=0.33.1';
import createNativeColorModule from './vendor/local-jpeg-color/jpeg-color.js';
import {createBlobSource} from './unified-engine/src/blob-source.js';
import {inspectJpegBlob} from './unified-engine/src/jpeg.js';
import {createSegmentedBytes} from './unified-engine/src/segmented-bytes.js';
import {createTemporarySession} from './unified-engine/src/temporary-storage.js';
import {allocateWasmMemory,allocateOwnedTypedArray} from './unified-engine/src/allocation.js';
import {wasmRange,closeMemoryRanges} from './unified-engine/src/memory-range.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './unified-engine/src/errors.js';

const MiB=1024**2,HEAP_BYTES=64*MiB,MAX_PIXELS=1024**2;
const channels={1:['Gray'],3:['R','G','B'],4:['C','M','Y','K']},spaces={1:'GRAY',3:'RGB',4:'CMYK'};
const inverse=(x,y,w,h,o)=>o===2?[w-1-x,y]:o===3?[w-1-x,h-1-y]:o===4?[x,h-1-y]:o===5?[y,x]:o===6?[y,h-1-x]:o===7?[w-1-y,h-1-x]:o===8?[w-1-y,x]:[x,y];
async function verifiedBinary(binary){
 const pin=NATIVE_JPEG_COLOR_RESOURCE;
 if(binary===undefined)return dependencyBytes(new URL(pin.url,import.meta.url),{sha256:pin.sha256,size:pin.bytes},{attempts:1,wait:null});
 const bytes=binary instanceof Uint8Array?binary:new Uint8Array(binary);
 requireValue(bytes.byteLength===pin.bytes,'Native JPEG color resource length differs.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==pin.sha256)throw new EngineError('DEPENDENCY_INTEGRITY','Native JPEG color resource identity differs.');return bytes;
}

// Optional native inspection channel. The caller must fund this budget from
// Original's real memory owner before opening; no independent grant is made.
// Only the additional channel bank is retained, in RAM when admitted or in the
// existing temporary store. Libjpeg never owns a second full decoded frame.
export async function createNativeJpegColorReader({blob,source:borrowed,sourceSha256,width,height,budget,signal,getTemporarySession,onTemporarySession,wasmBinary,onProgress,cacheBytes=8*MiB}={}){
 requireValue(budget&&typeof budget.reserve==='function'&&typeof budget.retain==='function','A financed shared native-color budget is required.');
 requireValue(typeof sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(sourceSha256),'Native JPEG needs the Original source identity.');
 requireValue(Number.isSafeInteger(cacheBytes)&&cacheBytes>=65536&&cacheBytes<=8*MiB,'Invalid native JPEG coefficient cache size.');
 requireValue(borrowed&&typeof borrowed.read==='function'||blob instanceof Blob,'An Original encoded byte source or Blob is required.');
 const source=borrowed??createBlobSource(blob,{budget}),ownsSource=!borrowed,controller=new AbortController(),leases=new Set(),pending=new Set();
 const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 let session,sessionOpening,store,releaseDecode,backing,m,memory,created=0,readOffset=0,written=0,encodedReads=0,backingReads=0,backingWrites=0,coefficientPeak=0,coefficientLive=0,peakHeap=0,closing=false,closed=false,closingPromise;
 const coefficientStores=new Map();let storeSerial=0;
 async function temporary(){
  checkAbort(combined);if(session)return session;if(sessionOpening)return sessionOpening;
  return sessionOpening=(async()=>{const value=getTemporarySession?await getTemporarySession({signal:combined}):await createTemporarySession({budget,signal:combined});session=value;onTemporarySession?.({id:value.id,backend:value.backend,owned:!getTemporarySession});checkAbort(combined);return value;})();
 }
 const closeCoefficient=async id=>{const item=coefficientStores.get(id);if(!item)return;await item.dispose();coefficientStores.delete(id);coefficientLive-=item.byteLength;};
 async function retireDecode(){
  if(m){await m.ccall('native_color_close',null,[],[],{async:true});peakHeap=Math.max(peakHeap,m.HEAPU8.buffer.byteLength);closeMemoryRanges(m);m=null;memory=null;}
  for(const id of [...coefficientStores.keys()])await closeCoefficient(id);
  if(backing){const retired=backing();backing=null;if(retired!==0)budget.notifyBackingRelease?.('wasm',retired??peakHeap);}releaseDecode?.();releaseDecode=null;
 }
 async function cleanup(){
  await retireDecode();for(const lease of [...leases])lease.release();if(store){await store.dispose();store=null;}
  if(session&&!getTemporarySession){await session.dispose();session=null;}if(ownsSource)source.dispose();closed=true;
 }
 async function dispose(){if(closed)return;if(closingPromise)return closingPromise;closing=true;controller.abort();return closingPromise=(async()=>{await Promise.allSettled([...pending]);await cleanup();})().finally(()=>{closingPromise=null;});}
 try{
  checkAbort(combined);const hash=typeof source.sha256==='function'?await source.sha256({signal:combined,onProgress:fraction=>onProgress?.({phase:'native-color-source-identity',fraction})}):source.sha256;
  if(hash!==sourceSha256)throw new EngineError('SOURCE_CHANGED','Native color bytes differ from the Original source.');
  const header=await inspectJpegBlob(source,{signal:combined,allowCmyk:true}),sw=header.sourceWidth,sh=header.sourceHeight,o=header.orientation??1,w=header.width,h=header.height,n=header.channels;
  if(n===4&&header.adobeColorTransform===null)throw new EngineError('NATIVE_COLOR_UNSUPPORTED','Unmarked four-component JPEG does not establish a qualified CMYK ink inversion convention.');
  requireValue((width===undefined||width===w)&&(height===undefined||height===h),'Native JPEG belongs to another oriented grid.');
  requireValue([1,3,4].includes(n)&&Number.isSafeInteger(sw*sh*n),'Unsupported native JPEG channel grid.');
  // Include bounded binary verification, encoded input and a decoded band.
  releaseDecode=budget.reserve(HEAP_BYTES+2*MiB);
  store=await createSegmentedBytes(sw*sh*n,{budget,storage:'auto',getTemporarySession:temporary,signal:combined,owner:'local-native-color',label:'native-jpeg-channel-bank'});
  const binary=await verifiedBinary(wasmBinary);checkAbort(combined);
  memory=allocateWasmMemory({initial:256,maximum:1024},{label:'native-jpeg-color-codec'});backing=budget.registerBacking?.('wasm',HEAP_BYTES,{owner:'local-native-color',label:'native-jpeg-color-codec',state:'reserved'});
  m=await createNativeColorModule({wasmBinary:binary,wasmMemory:memory,
   readEncoded:async(pointer,length)=>{await controlCheckpoint(combined);const count=Math.min(length,source.byteLength-readOffset);if(!count)return 0;const part=await source.read(readOffset,count,{signal:combined});try{m.HEAPU8.set(part.bytes,pointer);readOffset+=count;encodedReads++;return count;}finally{part.release();}},
   openBacking:async length=>{checkAbort(combined);const target=await(await temporary()).create(length,{signal:combined}),id=++storeSerial;coefficientStores.set(id,target);created++;coefficientLive+=length;coefficientPeak=Math.max(coefficientPeak,coefficientLive);return id;},
   backingIO:async(id,pointer,offset,length,writing)=>{await controlCheckpoint(combined);const target=coefficientStores.get(id);requireValue(target,'Missing native JPEG coefficient backing.');const view=wasmRange(m,pointer,length);if(writing){await target.write(view,offset,{signal:combined});backingWrites+=length;}else{await target.readInto(view,offset,{signal:combined});backingReads+=length;}},closeBacking:closeCoefficient,
   writeDecoded:async(pointer,offset,length)=>{await controlCheckpoint(combined);requireValue(offset===written&&length<=MiB&&offset+length<=store.byteLength,'Native JPEG output differs from its bounded sequential grid.');await store.write(wasmRange(m,pointer,length),offset,{signal:combined});written+=length;peakHeap=Math.max(peakHeap,m.HEAPU8.buffer.byteLength);backing?.materialize(peakHeap);onProgress?.({phase:'decode-native-color',fraction:written/store.byteLength});}
  });
  const ok=await m.ccall('native_color_decode','number',['number','number','number'],[sw,sh,cacheBytes],{async:true});
  if(m.ioFailure)throw m.ioFailure;if(!ok)throw new EngineError(m._native_color_error()===2?'MEMORY_ALLOCATION':'INVALID_INPUT','Native-channel JPEG decoding failed.');
  requireValue(written===store.byteLength&&m._native_color_channels()===n,'Incomplete native JPEG channel bank.');await store.flush();checkAbort(combined);
  const capability=Object.freeze({sourceFormat:'jpeg',sourceSha256:hash,width:w,height:h,space:spaces[n],channels:Object.freeze(channels[n]),depth:8,range:Object.freeze([0,255]),iccApplied:false,iccPresent:header.icc===true,sourceColorSpace:header.sourceColorSpace??(n===1?'GRAY':'YCbCr/RGB'),adobeInversionNormalized:m._native_color_adobe_inverted()===1,orientation:o,sourceWidth:sw,sourceHeight:sh,decoder:'libjpeg-turbo-3.0.3/ISLOW/native-channel-stream',semantics:n===4?'Original decoded CMYK ink channels; Adobe inversion normalized; no ICC or RGB round-trip.':'Original decoded channels without ICC transformation.'});
  await retireDecode();
  const metrics=Object.freeze({encodedReadBytes:readOffset,maxEncodedReadBytes:65536,encodedReadCalls:encodedReads,heapCapacityBytes:peakHeap,heapMaximumBytes:HEAP_BYTES,coefficientCacheBytes:cacheBytes,coefficientStores:created,coefficientPeakBytes:coefficientPeak,coefficientReadBytes:backingReads,coefficientWriteBytes:backingWrites,channelBankBytes:written,storage:store.storage,maxDecodedBandBytes:MiB});
  return{width:w,height:h,sha256:hash,capability,metrics,
   async readWindow(rect,{signal:extra}={}){
    checkAbort(combined);checkAbort(extra);if(closing)throw new EngineError('DISPOSED','Native JPEG color reader is closed.');
    requireValue(rect&&['x','y','width','height'].every(k=>Number.isSafeInteger(rect[k]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.width<=1024&&rect.height<=1024&&rect.x+rect.width<=w&&rect.y+rect.height<=h&&rect.width*rect.height<=MAX_PIXELS,'Native color window must remain within Original and at most 1024² pixels.');
    let settle;const done=new Promise(resolve=>settle=resolve);pending.add(done);let output,raw;
    try{
     const points=[[rect.x,rect.y],[rect.x+rect.width-1,rect.y],[rect.x,rect.y+rect.height-1],[rect.x+rect.width-1,rect.y+rect.height-1]].map(([x,y])=>inverse(x,y,sw,sh,o)),x0=Math.min(...points.map(p=>p[0])),y0=Math.min(...points.map(p=>p[1])),rw=Math.max(...points.map(p=>p[0]))-x0+1,rh=Math.max(...points.map(p=>p[1]))-y0+1;
     output=allocateOwnedTypedArray(Uint8Array,rect.width*rect.height*n,{budget,owner:'local-native-color',label:'native-jpeg-window'});
     if(o===1){for(let row=0;row<rect.height;row++){if((row&31)===0)await controlCheckpoint(combined);checkAbort(extra);await store.readInto(output.data.subarray(row*rect.width*n,(row+1)*rect.width*n),((rect.y+row)*sw+rect.x)*n,{signal:combined});}}
     else{raw=allocateOwnedTypedArray(Uint8Array,rw*rh*n,{budget,owner:'local-native-color',label:'native-jpeg-oriented-window'});for(let row=0;row<rh;row++){if((row&31)===0)await controlCheckpoint(combined);checkAbort(extra);await store.readInto(raw.data.subarray(row*rw*n,(row+1)*rw*n),((y0+row)*sw+x0)*n,{signal:combined});}for(let y=0;y<rect.height;y++){if((y&31)===0)await controlCheckpoint(combined);checkAbort(extra);for(let x=0;x<rect.width;x++){const[sx,sy]=inverse(rect.x+x,rect.y+y,sw,sh,o),at=((sy-y0)*rw+sx-x0)*n,to=(y*rect.width+x)*n;for(let c=0;c<n;c++)output.data[to+c]=raw.data[at+c];}}}
     checkAbort(combined);checkAbort(extra);if(closing)throw new EngineError('DISPOSED','Native JPEG color reader closed during its read.');raw?.release();raw=null;
     const owner=output;output=null;let released=false;const answer={pixels:{width:rect.width,height:rect.height,format:spaces[n].toLowerCase()+'8',space:spaces[n],channels:n,depth:8,data:owner.data},capability,origin:[rect.x,rect.y],release(){if(released)return;released=true;owner.release();answer.pixels.data=null;leases.delete(answer);}};leases.add(answer);return answer;
    }finally{raw?.release();output?.release();pending.delete(done);settle();}
   },dispose};
 }catch(error){closing=true;controller.abort();try{await cleanup();}catch(cleanupError){if(Object.isExtensible(error)){error.cleanupError=cleanupError;error.cleanupOwner={dispose};}}throw error;}
}
