import "../../runtime-context.js?v=0.14.5";
import {mediaCodecJob} from './media-codec-client.js';
import {createBlobSource} from './blob-source.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';
import {createRgbSurface} from './rgb-surface.js';
import {checkAbort,requireValue} from './errors.js';
const MiB=1024**2;
export async function inspectExtendedImage(blob,{name=blob.name,budget,signal}={}){
 const release=budget.reserve(64*MiB+blob.size*3);
 try{return await mediaCodecJob('decode',{blob,name,inspectOnly:true},{signal});}finally{release();}
}
export async function loadExtendedImage(blob,{name=blob.name,layout='segmented',budget,signal,onProgress,temporarySessionId,onTemporarySession}={}){
 const base=budget.reserve(64*MiB+blob.size*3),source=createBlobSource(blob,{budget});let workspace,fullLease,full,session,store,surface,header,written=0;
 async function ensureTemporarySession({signal:taskSignal}={}){checkAbort(taskSignal);if(!session){session=await createTemporarySession({budget,signal:taskSignal,id:temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});}return session;}
 try{
  const start=performance.now();const result=await mediaCodecJob('decode',{blob,name},{signal,onProgress,onRequest:async(action,value)=>{
   if(action==='decode-header'){
    header=value;const n=header.width*header.height;requireValue(Number.isSafeInteger(n*24)&&n>0,'Invalid image size.');workspace=budget.reserve(n*24+4*MiB);
    if(layout==='auto'&&n*3+blob.size+4*MiB<=budget.limit-budget.total()){
     fullLease=budget.reserve(n*3+blob.size);full=new Uint8Array(n*3);
    }else{
     const fits=n*3+4*MiB<=budget.limit-budget.total();if(!fits)await ensureTemporarySession({signal});
     store=await createSegmentedBytes(n*3,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});
    }return{nativeBytes:n*24+64*MiB};
   }
   requireValue(action==='decoded-band'&&(store||full)&&value.y*header.width*3===written&&value.bytes.length===header.width*value.rows*3,'Unexpected decoded image band.');
   if(full)full.set(value.bytes,written);else await store.write(value.bytes,written);written+=value.bytes.length;return{};
  }});requireValue(written===header.width*header.height*3,'Incomplete decoded image.');await store?.flush();workspace();workspace=null;base();
  const sha256=await source.sha256({signal,onProgress:fraction=>onProgress?.({phase:'original-sha256',fraction})});checkAbort(signal);
  if(full){
   const bytes=new Uint8Array(await blob.arrayBuffer());checkAbort(signal);const retainedBytes=full.length+bytes.length;
   fullLease();fullLease=null;budget.retain(retainedBytes);source.dispose();
   return{kind:'image',blob,bytes,pixels:{width:header.width,height:header.height,format:'rgb8',data:full},sha256,provenance:{...result.provenance,layout:'rgb',originalBytesPreserved:true},retainedBytes,metrics:{decodeMs:performance.now()-start,storage:'memory',codecLifetime:'isolated worker, terminated after decoding',originalBlobBytes:blob.size}};
  }
  surface=createRgbSurface(store,{width:header.width,height:header.height,budget});
  return{kind:'image',segmented:true,source,store,surface,get session(){return session;},ensureTemporarySession,sha256,provenance:{...result.provenance,layout:'paged-rgb',originalBytesPreserved:true},retainedBytes:0,metrics:{decodeMs:performance.now()-start,storage:store.storage,temporaryBackend:session?.backend??null,codecLifetime:'isolated worker, terminated after decoding',originalBlobBytes:blob.size}};
 }catch(error){try{await surface?.dispose();if(!surface)await store?.dispose();await session?.dispose();}catch(cleanup){error.cleanupError=cleanup;}source.dispose();throw error;}
 finally{workspace?.();fullLease?.();base();}
}
