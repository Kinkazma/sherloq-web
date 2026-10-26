import {requireValue,checkpoint,controlCheckpoint,checkAbort} from './errors.js';
import {PRNU_SCHEMA} from './prnu.js';import {prnuCameraLabel,validLabel,hdf5NameOrder} from './prnu-builder.js';
import {createBlobSource} from './blob-source.js';import {loadSegmentedJpeg,disposeSegmentedImage} from './image-sources.js';
import {createTemporarySession} from './temporary-storage.js';import {createFloatPlane} from './segmented-float-plane.js';
import {segmentedPrnuResidual} from './segmented-prnu.js';import {PrnuStripPool} from './prnu-strip-pool.js';
// One training JPEG at a time; completed camera means live in independent stores.
// The recurrence and crop order are exactly the native incremental mean.
export async function buildPrnuStoredSnapshot(input,querySha256,{budget,signal,onProgress,onStage,profile={},onTemporarySession}={}){
 requireValue(Array.isArray(input.files)&&input.files.length>0,'Select JPEG files for the new PRNU snapshot.');requireValue(input.singleCamera==null||validLabel(input.singleCamera),'Invalid single-camera label.');
 const storage=input.fingerprintStorage??'auto';requireValue(['auto','memory','temporary'].includes(storage),'Invalid fingerprint storage.');
 const grouped=new Map(),owned=new Set(),pool=new PrnuStripPool(budget,profile);let session,metadataRelease,detached=false,disposed=false;
 const ensure=async()=>{if(!session){session=await createTemporarySession({budget,signal,id:input.temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});}return session;};
 const release=async()=>{if(disposed||detached)return;disposed=true;try{await Promise.all([...owned].map(p=>p.dispose()));}finally{try{await session?.dispose();}finally{metadataRelease?.();metadataRelease=null;}}};
 const disposeDatabase=async()=>{if(disposed)return;disposed=true;try{await Promise.all([...owned].map(p=>p.dispose()));}finally{try{await session?.dispose();}finally{metadataRelease?.();metadataRelease=null;}}};
 const drop=async p=>{if(owned.delete(p))await p.dispose();};
 try{
  let metadataBytes=0;for(const item of input.files){requireValue(typeof item?.name==='string'&&!item.name.includes('\0'),'A training file name is required.');metadataBytes+=item.name.length*8+2048;}metadataRelease=budget.reserve(metadataBytes);
  for(const item of input.files){const blob=item.blob??item;requireValue(blob instanceof Blob,'Training images must be immutable Blob/File values.');const name=item.name.split('/').at(-1);if(!/^.+\.jpe?g$/i.test(name))continue;const label=input.singleCamera??prnuCameraLabel(name);requireValue(validLabel(label),'Invalid camera label derived from file name.');if(!grouped.has(label))grouped.set(label,[]);grouped.get(label).push({name,blob});}
  const groups=[...grouped].filter(([,files])=>files.length>=2);requireValue(groups.length,'At least two JPEGs per camera are required. Use a single-camera label for ordinary filenames.');const total=groups.reduce((n,[,files])=>n+files.length,0),cameras=[];let done=0;
  for(const [name,files]of groups){let mean=null;const trainingManifest=[],skippedImages=[];
   for(const item of files){let image,source,residual;try{
    await checkpoint(signal);source=createBlobSource(item.blob,{budget});const digest=await source.sha256({signal});if(digest===querySha256){skippedImages.push({name:item.name,reason:'query excluded from training'});continue;}
    const signature=await source.read(0,Math.min(2,source.byteLength),{signal});try{requireValue(signature.bytes[0]===255&&signature.bytes[1]===216,'Unreadable JPEG signature.');}finally{signature.release();}
    image=await loadSegmentedJpeg(item.blob,{budget,signal,getTemporarySession:ensure});
    residual=await segmentedPrnuResidual({surface:image.surface,get session(){return session;},ensureTemporarySession:ensure},{budget,signal,storage,pool,onProgress:p=>onStage?.({...p,camera:name,fileName:item.name,fileIndex:done,fileCount:total})});owned.add(residual);
    const count=trainingManifest.length+1;
    if(!mean){mean=residual;residual=null;}
    else{const width=Math.min(mean.width,residual.width),height=Math.min(mean.height,residual.height),workspace=budget.reserve(8192*32);let next;
     try{next=await createFloatPlane(width,height,{budget,signal,storage,getTemporarySession:ensure,chunkBytes:65536});owned.add(next);const step=Math.max(1,Math.floor(8192/width));
      for(let y=0;y<height;y+=step){const h=Math.min(step,height-y);for(let x=0;x<width;x+=8192){await controlCheckpoint(signal);const w=Math.min(8192,width-x),values=await mean.read(x,y,w,h,{signal}),sample=await residual.read(x,y,w,h,{signal});for(let i=0;i<values.length;i++)values[i]+=(sample[i]-values[i])/count;await next.write(values,x,y,w,h,{signal});}}await next.store.flush();
     }finally{workspace();}await drop(mean);await drop(residual);residual=null;mean=next;
    }trainingManifest.push({name:item.name,sha256:digest});
   }catch(error){if(error.code!=='INVALID_INPUT')throw error;skippedImages.push({name:item.name,reason:error.message});}
   finally{if(residual)await drop(residual);source?.dispose();await(image&&disposeSegmentedImage(image));done++;onProgress?.(done/total);}
   }
   requireValue(trainingManifest.length>=2,name+': fewer than two readable JPEGs remain after query exclusion.');cameras.push({name,fingerprint:mean,trainingManifest,skippedImages,nImages:files.length,nUsed:trainingManifest.length});
  }
  checkAbort(signal);cameras.sort(hdf5NameOrder);const database={schema:PRNU_SCHEMA,complete:true,legacy:false,trainingMembershipVerified:true,layout:'segmented',cameras,decodedBytes:cameras.reduce((n,c)=>n+c.fingerprint.width*c.fingerprint.height*8,0),dispose:disposeDatabase};
  return {database,metrics:{...pool.metrics(),temporaryBackend:session?.backend??null},release,detach(){requireValue(!disposed&&!detached,'Snapshot ownership already transferred.');detached=true;metadataRelease?.();metadataRelease=null;return database;}};
 }catch(error){await release();throw error;}finally{pool.clear();}
}
