import "../../runtime-context.js?v=0.30.0";
import {createRgbSurface} from './rgb-surface.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {createReadCooperation} from './read-cooperation.js';

/** Read-only native rectangle, never an encoded crop. It borrows the original
 * decoder and temporary-session owner; only its own view/cache is disposable. */
export function createSourceRegionRecord(original,domain,{budget,maxReadPixels=1024*1024}={}){
 const d=original.surface?.descriptor;
 requireValue(d?.format==='rgb8'&&d.width===domain.sourceWidth&&d.height===domain.sourceHeight&&original.sha256===domain.sourceSha256,'Original-source crop grid or identity differs.');
 requireValue(!domain.empty&&domain.rect&&budget&&Number.isSafeInteger(maxReadPixels)&&maxReadPixels>0,'An admitted native crop is required.');
 const width=domain.width,height=domain.height,rowBytes=width*3,byteLength=rowBytes*height,chunkBytes=Math.max(3,Math.min(4*1024**2,byteLength)-Math.min(4*1024**2,byteLength)%3);let disposed=false;const reads=createReadCooperation();
 const alive=signal=>{checkAbort(signal);if(disposed)throw new EngineError('DISPOSED','Original-source crop view is closed.');};
 const range=(offset,length)=>requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=byteLength-length,'Invalid native crop byte range.');
 async function nativeInto(rect,target,options){
  alive(options.signal);const sourceRect={...rect,x:rect.x+domain.origin[0],y:rect.y+domain.origin[1]};
  if(original.surface.readWindowInto){await original.surface.readWindowInto(sourceRect,target,options);alive(options.signal);return;}
  const window=await original.surface.readWindow(sourceRect,options);try{alive(options.signal);target.set(window.pixels.data);}finally{window.release?.();}
 }
 const store={byteLength,chunkBytes,storage:'original-native-rectangle-view',readOnly:true,
  async readInto(target,offset=0,options={}){
   requireValue(target instanceof Uint8Array,'A native byte destination is required.');range(offset,target.byteLength);alive(options.signal);let done=0;const read=reads.begin(options.signal);
   try{while(done<target.length){
    await read.checkpoint();alive(options.signal);const at=offset+done,y=Math.floor(at/rowBytes),within=at%rowBytes,remaining=target.length-done;
    if(within===0&&remaining>=rowBytes&&width<=maxReadPixels){const rows=Math.min(height-y,Math.floor(remaining/rowBytes),Math.max(1,Math.floor(maxReadPixels/width))),n=rows*rowBytes;await read.wait(()=>nativeInto({x:0,y,width,height:rows},target.subarray(done,done+n),options));done+=n;continue;}
    const x=Math.floor(within/3),channel=within%3,n=Math.min(remaining,rowBytes-within,maxReadPixels*3-channel),pixels=Math.ceil((channel+n)/3);
    if(channel===0&&n%3===0)await read.wait(()=>nativeInto({x,y,width:pixels,height:1},target.subarray(done,done+n),options));
    else{const window=await read.wait(()=>original.surface.readWindow({x:x+domain.origin[0],y:y+domain.origin[1],width:pixels,height:1},options));try{alive(options.signal);target.set(window.pixels.data.subarray(channel,channel+n),done);}finally{window.release?.();}}
    done+=n;
   }
   alive(options.signal);return target;}finally{read.finish();}
  },
  async visit(visitor,{signal,offset=0,length=byteLength-offset,blockBytes=chunkBytes}={}){
   range(offset,length);requireValue(typeof visitor==='function'&&Number.isSafeInteger(blockBytes)&&blockBytes>0,'Invalid native crop visitor.');alive(signal);if(!length)return;
   const output=allocateOwnedTypedArray(Uint8Array,Math.min(blockBytes,length),{budget,owner:'source-region',label:'native-crop-visit'});
   try{for(let at=offset;at<offset+length;){alive(signal);const part=output.data.subarray(0,Math.min(output.data.length,offset+length-at));await store.readInto(part,at,{signal});await visitor(part,at);alive(signal);at+=part.length;}}finally{output.release();}
  },
  write(){throw new EngineError('SOURCE_REGION_READONLY','An original-source crop cannot modify its original pixels.');},flush(){alive();},dispose(){disposed=true;}
 };
 const surface=createRgbSurface(store,{width,height,budget,ownsStore:true});
 return{kind:'image',segmented:true,surface,store,sha256:original.sha256,retainedBytes:0,ownsTemporarySession:false,
  get session(){return original.session;},ensureTemporarySession:original.ensureTemporarySession?options=>original.ensureTemporarySession(options):undefined,
  originalSource:original,originalEncodedChannel:Object.freeze({sha256:original.sha256,get blob(){return original.blob??original.source?.blob?.();},bytes:original.bytes,source:original.source}),sourceFile:original.sourceFile,
  sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],
  provenance:{...original.provenance,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],derivedInput:{kind:'original-native-rectangle-view',origin:[...domain.origin],width,height,sourceWidth:d.width,sourceHeight:d.height,sourceRegionFingerprint:domain.fingerprint,encodedBytesRewritten:false}},
  metrics:{originalSourceBorrowed:true,sourcePixelsCopied:false,sourceRegionFingerprint:domain.fingerprint}
 };
}
