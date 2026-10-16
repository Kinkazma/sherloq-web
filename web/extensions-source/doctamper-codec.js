/** Reuse the project's pinned libjpeg-turbo WASM codecs, no JPEG reimplementation.
 * Q90: existing bounded RGB stream encoder fed identical R/G/B gray values.
 * DCT/QT: existing CAT-Net stored-coefficient extractor, without inference.
 */
import createCoefficients from './runtime/doctamper-catnet-jpeg.mjs';
import createStream from './runtime/doctamper-jpeg-rgb-stream.mjs';
import {createSegmentedBytes} from '../engine-source/src/segmented-bytes.js';
import {allocateOwnedTypedArray,allocateWasmMemory,allocateTypedArray,copyTypedArray,wasmAllocationFailure,nativeModuleFailure} from '../engine-source/src/allocation.js';
import {resourceAllocationKind} from '../engine-source/src/errors.js';
import {runWithResourceRecovery} from '../engine-source/src/resource-recovery.js';
const ASSETS = Object.freeze({
  coefficients:{url:new URL('./runtime/doctamper-catnet-jpeg.wasm',import.meta.url),bytes:527706,
    sha256:'85028c1790b1ef3faa4122ddb54c1841791a90af11b10d1a134585cc84fb8cf1'},
  stream:{url:new URL('./runtime/doctamper-jpeg-rgb-stream.wasm',import.meta.url),bytes:686974,
    sha256:'20bd112e6a107ad82b22cc9dad5b2ff8d57505531b22247c7298743a7ab15233'},
});
const abort=signal=>{if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');};
const requireValue=(v,m)=>{if(!v)throw new Error(m);};
const hex=bytes=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
async function defaultLoad(asset){const response=await fetch(asset.url);if(!response.ok)throw new Error('JPEG WASM HTTP '+response.status);return new Uint8Array(await response.arrayBuffer());}
async function verifiedBytes(asset,load){
  let bytes=await load(asset);if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  requireValue(bytes.byteLength===asset.bytes,'JPEG WASM length mismatch.');
  requireValue(hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))===asset.sha256,'JPEG WASM SHA-256 mismatch.');
  return bytes;
}
function jpegSize(bytes){
  requireValue(bytes[0]===255&&bytes[1]===216,'JPEG bytes required.');let at=2;
  while(at+3<bytes.length){
    while(bytes[at]===255)at++;const marker=bytes[at++];
    if(marker===0xD9||marker===0xDA)break;
    if(marker===1||(marker>=0xD0&&marker<=0xD7))continue;
    const size=(bytes[at]<<8)|bytes[at+1];requireValue(size>=2&&at+size<=bytes.length,'Invalid JPEG marker.');
    if([0xC0,0xC1,0xC2].includes(marker))return{height:(bytes[at+3]<<8)|bytes[at+4],width:(bytes[at+5]<<8)|bytes[at+6]};
    at+=size;
  }
  throw new Error('Supported 8-bit JPEG SOF marker not found.');
}

/** One codec instance per shared image runtime/worker; no duplicated thread pool.
 * loadBytes may be the engine's verified asset/cache loader. Call dispose on trim.
 */
export function createDoctamperCodec({loadBytes=defaultLoad,maxPixels=16000000}={}){
  let coefficientModule,streamModule,coefficientPromise,streamPromise,tail=Promise.resolve(),disposed=false;
  const serial=fn=>{const call=tail.then(()=>{requireValue(!disposed,'DTD codec disposed.');return fn();});tail=call.catch(()=>{});return call;};
  const getCoefficients=async()=>{
    if(!coefficientPromise)coefficientPromise=verifiedBytes(ASSETS.coefficients,loadBytes).then(async wasmBinary=>{try{return await createCoefficients({wasmBinary});}catch(error){throw nativeModuleFailure(error,'DTD coefficient module could not be created.');}}).then(m=>(coefficientModule=m)).catch(error=>{coefficientPromise=undefined;throw error;});
    return coefficientPromise;
  };
  const getStream=async()=>{
    if(!streamPromise)streamPromise=verifiedBytes(ASSETS.stream,loadBytes).then(wasmBinary=>createStream({wasmBinary,
      wasmMemory:allocateWasmMemory({initial:256,maximum:1024},{label:'doctamper-stream-encoder'})})).then(m=>(streamModule=m)).catch(error=>{streamPromise=undefined;throw error;});
    return streamPromise;
  };
  async function nativeDCTDirect(bytes,{signal}={}){
    abort(signal);const {width,height}=jpegSize(bytes),stride=Math.ceil(width/8)*8,rows=Math.ceil(height/8)*8,n=stride*rows;
    requireValue(width*height<=maxPixels,'DTD JPEG coefficient workspace exceeds configured pixel limit.');
    const m=await getCoefficients();abort(signal);
    let ip=0,cp=0,tp=0,failed=false;
    try{
      try{ip=m._malloc(bytes.length);cp=m._malloc(n*2);tp=m._malloc(64*4);}catch(error){throw nativeModuleFailure(error,'DTD coefficient native allocation failed.');}
      if(!ip||!cp||!tp)throw wasmAllocationFailure(m,'DTD coefficient allocation failed.',!ip?bytes.length:!cp?n*2:256);m.HEAPU8.set(bytes,ip);
      let valid;try{valid=m._catnet_coeff(ip,bytes.length,cp,tp,width,height);}catch(error){throw nativeModuleFailure(error,'Native stored JPEG coefficient extraction failed.');}requireValue(valid,'Native stored JPEG coefficient extraction failed.');
      const coefficients=copyTypedArray(m.HEAP16.subarray(cp/2,cp/2+n),{label:'DTD-coefficients'}),quantizationTable=Int32Array.from(m.HEAPF32.subarray(tp/4,tp/4+64));
      abort(signal);return{width,height,stride,coefficients,quantizationTable,
        provenance:{codec:'existing CAT-Net libjpeg-turbo3.0.3',coefficientWasmSha256:ASSETS.coefficients.sha256,spatialDCTApproximation:false}};
    }catch(error){if(resourceAllocationKind(error)==='wasm'){failed=true;coefficientModule=null;coefficientPromise=undefined;}throw error;}finally{if(!failed)for(const ptr of[ip,cp,tp])if(ptr)m._free(ptr);}
  }
  async function encodeDirect(gray,{quality=90,signal,onProgress}={}){
    const {width,height,data}=gray;requireValue(data?.length===width*height,'Expected gray8 pixels.');
    requireValue(Number.isInteger(quality)&&quality>=1&&quality<=100,'JPEG quality must be1..100.');
    requireValue(width*height<=maxPixels,'DTD JPEG encoding exceeds configured pixel limit.');
    const m=await getStream();abort(signal);const chunks=[];let total=0,pointer=0,failed=false;
    m.ioFailure=null;
    m.writeEncoded=(ptr,length)=>{abort(signal);const part=copyTypedArray(m.HEAPU8.subarray(ptr,ptr+length),{label:'DTD-JPEG-chunk'});chunks.push(part);total+=length;};
    const call=async(name,types,args)=>{let ok;try{ok=await m.ccall(name,'number',types,args,{async:true});}catch(error){abort(signal);throw nativeModuleFailure(error,'DTD native JPEG encoder failed: '+name);}if(m.ioFailure)throw m.ioFailure;requireValue(ok,'DTD JPEG encoder failed: '+name);abort(signal);};
    try{
      await call('rgb_stream_open',['number','number','number'],[width,height,quality]);
      const rowCount=32,rowBytes=width*3,buffer=allocateTypedArray(Uint8Array,rowCount*rowBytes,{label:'DTD-JPEG-RGB-rows'});
      try{pointer=m._malloc(buffer.length);}catch(error){throw nativeModuleFailure(error,'DTD JPEG encoder native allocation failed.');}if(!pointer)throw wasmAllocationFailure(m,'DTD JPEG row allocation failed.',buffer.length);
      for(let y=0;y<height;y+=rowCount){
        abort(signal);const count=Math.min(rowCount,height-y);
        for(let r=0;r<count;r++)for(let x=0;x<width;x++){const v=data[(y+r)*width+x],i=r*rowBytes+x*3;buffer[i]=v;buffer[i+1]=v;buffer[i+2]=v;}
        m.HEAPU8.set(buffer.subarray(0,count*rowBytes),pointer);
        await call('rgb_stream_write',['number','number'],[pointer,count]);
        onProgress?.({phase:'doctamper-jpeg-q90',completed:y+count,total:height});
      }
      await call('rgb_stream_end_write',[],[]);
      const bytes=allocateTypedArray(Uint8Array,total,{label:'DTD-working-JPEG'});let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return bytes;
    }catch(error){if(resourceAllocationKind(error)==='wasm'){failed=true;streamModule=null;streamPromise=undefined;}throw error;}finally{try{if(!failed){m._rgb_stream_close();if(pointer)m._free(pointer);}}finally{m.writeEncoded=undefined;}}
  }
  /** Extract native JPEG categories once. The temporary decoder owns only its
   * bounded heap; the persistent bank uses one byte/pixel or temporary storage.
   * No complete coefficient plane is copied from WASM into another JS plane. */
  async function nativeCategorySourceDirect(encoded,{width,height,budget,scheduler,resourceOperation,getTemporarySession,storage='auto',signal,onProgress}={}){
    abort(signal);requireValue(budget,'Native DTD categories require the shared budget.');
    const bytes=encoded instanceof Uint8Array?encoded:null,byteLength=bytes?.byteLength??encoded?.byteLength;
    requireValue(Number.isSafeInteger(byteLength)&&byteLength>0&&(bytes||typeof encoded?.visit==='function'),'Original JPEG bytes or byte source required.');
    if(bytes){const size=jpegSize(bytes);width??=size.width;height??=size.height;requireValue(width===size.width&&height===size.height,'Native JPEG source geometry differs.');}
    requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0,'JPEG source dimensions required.');
    const stride=Math.ceil(width/8)*8,rows=Math.ceil(height/8)*8,n=stride*rows,MiB=1024**2;
    const capacity=Math.ceil((byteLength+n*6+64*MiB)*1.3/(16*MiB))*16*MiB;
    requireValue(capacity<=2*1024**3,'Native JPEG coefficient reader exceeds its 2 GiB heap bound.');
    requireValue(!scheduler||scheduler.budget===budget,'DTD categories require the shared scheduler and budget.');let m,ip=0,tp=0,op=0,handle=0,bank,heapBacking,failed=false,retained=false,lease;
    try{
      lease=await scheduler?.acquire({cpu:1,domains:{wasm:capacity,'array-buffer':n},signal,operation:resourceOperation,resourceOwner:'doctamper-preparation',label:'DTD-native-JPEG-categories'});budget.retain(capacity);retained=true;
      const wasmBinary=await verifiedBytes(ASSETS.coefficients,loadBytes);
      try{m=await createCoefficients({wasmBinary,wasmMemory:allocateWasmMemory({initial:256,maximum:capacity/65536},{label:'doctamper-native-coefficients'})});}catch(error){throw nativeModuleFailure(error,'Native DTD coefficient module could not be created.');}abort(signal);
      heapBacking=budget.registerBacking?.('wasm',capacity,{owner:'doctamper-codec',label:'native-coefficient-reader',state:'reserved'});heapBacking?.materialize(m.HEAPU8.byteLength);
      const nativeCall=(call,label)=>{try{return call();}catch(error){throw nativeModuleFailure(error,label);}};
      const alloc=size=>{const pointer=nativeCall(()=>m._malloc(size),'Native JPEG coefficient allocation failed.');heapBacking?.materialize(m.HEAPU8.byteLength);if(!pointer)throw wasmAllocationFailure(m,'Native JPEG coefficient allocation failed.',size);return pointer;};
      ip=alloc(byteLength);tp=alloc(256);const step=128;op=alloc(stride*step);
      if(bytes)m.HEAPU8.set(bytes,ip);else await encoded.visit((part,offset)=>{abort(signal);m.HEAPU8.set(part,ip+offset);},{signal});
      handle=nativeCall(()=>m._catnet_coeff_open(ip,byteLength,tp,width,height),'Native JPEG coefficient stream failed.');requireValue(handle,'Native JPEG coefficient stream could not be opened.');
      heapBacking?.materialize(m.HEAPU8.byteLength);
      const quantizationTable=Int32Array.from(m.HEAPF32.subarray(tp/4,tp/4+64));
      requireValue(Array.from(quantizationTable).every(v=>v>=0&&v<=63),'Native luminance QT outside DTD embedding range0..63.');
      bank=await createSegmentedBytes(n,{budget,getTemporarySession,signal,storage,owner:'doctamper-preparation',label:'native-dct-categories'});
      for(let top=0;top<rows;top+=step){
        abort(signal);const count=Math.min(step,rows-top);requireValue(m._catnet_coeff_rows(handle,top,count,op),'Native JPEG category extraction failed.');
        await bank.write(m.HEAPU8.subarray(op,op+stride*count),top*stride,{signal});
        onProgress?.({method:'doctamper',phase:'native-dct-categories',completed:top+count,total:rows});
        if(top%512===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
      const closed=m._catnet_coeff_close(handle);handle=0;requireValue(closed,'Native JPEG coefficient stream did not finish cleanly.');await bank.flush();
      const sourceBank=bank;if(getTemporarySession)sourceBank.markCold();bank=null;
      return {width,height,stride,rows,quantizationTable,get storage(){return sourceBank.storage;},
        provenance:{codec:'existing CAT-Net libjpeg-turbo3.0.3',coefficientWasmSha256:ASSETS.coefficients.sha256,source:'native original JPEG',categories:'abs(storedDCT) clamped20, uint8',spatialDCTApproximation:false,temporaryHeapMaximumBytes:capacity},
        async readWindow({x,y,width:w,height:h},{signal}={}){
          abort(signal);requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x+w<=stride&&y+h<=rows,'Invalid category window.');
          const owner=allocateOwnedTypedArray(Uint8Array,w*h,{budget,owner:'doctamper-preparation',label:'native-category-window'});
          try{for(let row=0;row<h;row++){abort(signal);await sourceBank.readInto(owner.data.subarray(row*w,(row+1)*w),(y+row)*stride+x,{signal});}return {data:owner.data,width:w,height:h,release:owner.release};}catch(error){owner.release();throw error;}
        },dispose:()=>sourceBank.dispose()};
    }catch(error){failed=true;await bank?.dispose();throw error;}
    finally{
      // An aborted Emscripten heap cannot safely service _free/_close calls.
      // This decoder is temporary, so retiring its complete module is enough.
      try{if(!failed){if(handle)m?._catnet_coeff_close(handle);for(const pointer of [ip,tp,op])if(pointer)m?._free(pointer);}}
      finally{heapBacking?.materialize(m?.HEAPU8.byteLength??0);const retired=heapBacking?.();if(retired)budget.notifyBackingRelease?.('wasm',retired);m=null;if(retained)budget.retained-=capacity;lease?.release();}
    }
  }
  return{
    assets:ASSETS,
    encodeJPEG:(gray,options={})=>serial(()=>encodeDirect(gray,options)),
    nativeDCT:(bytes,options={})=>serial(()=>nativeDCTDirect(bytes,options)),
    nativeCategorySource:(encoded,options={})=>serial(()=>runWithResourceRecovery(({resourceOperation})=>nativeCategorySourceDirect(encoded,{...options,resourceOperation}),{budget:options.budget,signal:options.signal,owner:'doctamper-preparation',operation:'DTD-native-JPEG-categories',onRecovery:event=>options.onProgress?.({...event,method:'doctamper'})})),
    workingDCT:(gray,options={})=>serial(async()=>{
      const bytes=await encodeDirect(gray,options),result=await nativeDCTDirect(bytes,options);
      result.provenance={...result.provenance,source:'declared Q90 working JPEG, equal gray values copied to RGB',
        encoderWasmSha256:ASSETS.stream.sha256,quality:options.quality??90,encodedBytes:bytes.length,
        pillowGrayscaleDCTParity:'must be checked on declared reference fixture; RGB JPEG bitstream is not identical to grayscale JPEG'};
      return result;
    }),
    memoryBytes:()=> (coefficientModule?.HEAPU8.byteLength??0)+(streamModule?.HEAPU8.byteLength??0),
    async dispose(){await tail;disposed=true;coefficientModule=null;streamModule=null;coefficientPromise=null;streamPromise=null;},
  };
}
