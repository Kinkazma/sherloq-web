import {prnuTrainingResidualProvenance} from './prnu-training-provenance.js';
import {createPrnuMeanPageWriter} from './prnu-mean-pages.js';
import {EngineError,requireValue,checkpoint,createCooperator,checkAbort} from './errors.js';
import {PRNU_SCHEMA} from './prnu.js';import {prnuCameraLabel,validLabel,hdf5NameOrder} from './prnu-builder.js';
import {createBlobSource} from './blob-source.js';import {loadSegmentedJpeg,disposeSegmentedImage} from './image-sources.js';
import {createTemporarySession} from './temporary-storage.js';import {createFloatPlane} from './segmented-float-plane.js';
import {retireWaveletPlans,appendWaveletCleanup} from './wavelet-strip-pool.js';
import {segmentedPrnuResidual} from './segmented-prnu.js';import {PrnuStripPool} from './prnu-strip-pool.js';
// One training JPEG at a time; completed camera means live in independent stores.
// The recurrence and crop order are exactly the native incremental mean.
export async function buildPrnuStoredSnapshot(input,querySha256,{budget,signal,onProgress,onStage,profile={},onTemporarySession}={}){
 requireValue(Array.isArray(input.files)&&input.files.length>0,'Select JPEG files for the new PRNU snapshot.');requireValue(input.singleCamera==null||validLabel(input.singleCamera),'Invalid single-camera label.');
 const backend=input.backend??'cpu';requireValue(['cpu','webgpu','auto'].includes(backend),'Invalid PRNU training backend.');const trainingBackends={cpu:0,webgpu:0};let trainingGpuBands=0;
 const cooperate=createCooperator(signal);const storage=input.fingerprintStorage??'auto';requireValue(['auto','memory','temporary'].includes(storage),'Invalid fingerprint storage.');
 const grouped=new Map(),owned=new Set(),reads=new Set(),loans=new Set(),pool=new PrnuStripPool(budget,profile);let session,metadataRelease,detached=false,disposed=false,closing=false,detaching;
 // The existing transform registry owns every refused retirement. Neither a
 // failed drop nor a failed snapshot release can orphan a plane or its credit.
 const loan=(value,dispose,group)=>{const record={async dispose(){await dispose(value);loans.delete(record);group?.delete(record);}};loans.add(record);group?.add(record);return record;};
 const drop=async p=>{if(owned.has(p)){await p.dispose();owned.delete(p);}};
 const retireTogether=async sets=>{let failed=false,primary;for(const set of sets)try{await retireWaveletPlans(set);}catch(error){if(!failed){failed=true;primary=error;}else appendWaveletCleanup(primary,error);}if(failed)throw primary;};
 const cleanup=pool.ownCleanup(async capture=>{
  if(detaching)await detaching.catch(()=>{});
  await retireWaveletPlans(reads,capture);
  let failed=false,primary;for(const set of[loans,owned])try{await retireWaveletPlans(set,capture);}catch(error){if(!failed){failed=true;primary=error;}else appendWaveletCleanup(primary,error);}if(failed)throw primary;
  if(session){await session.dispose();session=null;}
  if(metadataRelease){await metadataRelease();metadataRelease=null;}
  disposed=true;
 });
 const disposeDatabase=()=>{closing=true;return cleanup.retire({endpoints:true,retryEndpoints:true});};
 const release=()=>detached?Promise.resolve():disposeDatabase();
 const ensure=async()=>{if(!session){session=await createTemporarySession({budget,signal,id:input.temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});}return session;};

 try{
  let metadataBytes=0;for(const item of input.files){requireValue(typeof item?.name==='string'&&!item.name.includes('\0'),'A training file name is required.');metadataBytes+=item.name.length*8+2048;}metadataRelease=budget.reserve(metadataBytes);
  for(const item of input.files){const blob=item.blob??item;requireValue(blob instanceof Blob,'Training images must be immutable Blob/File values.');const name=item.name.split('/').at(-1);if(!/^.+\.jpe?g$/i.test(name))continue;const label=input.singleCamera??prnuCameraLabel(name);requireValue(validLabel(label),'Invalid camera label derived from file name.');if(!grouped.has(label))grouped.set(label,[]);grouped.get(label).push({name,blob});}
  const groups=[...grouped].filter(([,files])=>files.length>=2);requireValue(groups.length,'At least two JPEGs per camera are required. Use a single-camera label for ordinary filenames.');const total=groups.reduce((n,[,files])=>n+files.length,0),cameras=[];let done=0;
  for(const [name,files]of groups){let mean=null;const trainingManifest=[],skippedImages=[];
   for(const item of files){let image,source,residual,residualProvenance,residualGpuBands=0,failed=false,primary;const imageLoans=new Set(),imageReads=new Set();try{
    await checkpoint(signal);source=createBlobSource(item.blob,{budget});loan(source,value=>value.dispose(),imageLoans);const digest=await source.sha256({signal});if(digest===querySha256){skippedImages.push({name:item.name,reason:'query excluded from training'});continue;}
    const signature=await source.read(0,Math.min(2,source.byteLength),{signal}),signatureOwner={async dispose(){await signature.release();reads.delete(signatureOwner);imageReads.delete(signatureOwner);}};reads.add(signatureOwner);imageReads.add(signatureOwner);let signatureFailed=false,signaturePrimary;try{requireValue(signature.bytes[0]===255&&signature.bytes[1]===216,'Unreadable JPEG signature.');}catch(error){signatureFailed=true;signaturePrimary=error;throw error;}finally{try{await signatureOwner.dispose();}catch(error){if(!signatureFailed)throw error;appendWaveletCleanup(signaturePrimary,error);}}
    image=await loadSegmentedJpeg(item.blob,{budget,signal,getTemporarySession:ensure});loan(image,disposeSegmentedImage,imageLoans);
    if(image.sha256!==digest)throw new EngineError('SOURCE_CHANGED','The decoded PRNU training image no longer matches its captured original identity.');
    residual=await segmentedPrnuResidual({surface:image.surface,get session(){return session;},ensureTemporarySession:ensure},{budget,signal,storage,pool,backend,onProgress:p=>onStage?.({...p,camera:name,fileName:item.name,fileIndex:done,fileCount:total})});owned.add(residual);residualProvenance=prnuTrainingResidualProvenance(backend,residual);residualGpuBands=residual.gpuMetrics?.calls??0;
    const count=trainingManifest.length+1;
    if(!mean){mean=residual;residual=null;}
    else{const width=Math.min(mean.width,residual.width),height=Math.min(mean.height,residual.height),workspace=loan(null,budget.reserve(8192*32));let next,writer,workspaceFailed=false,workspacePrimary;
     try{next=await createFloatPlane(width,height,{budget,signal,storage,getTemporarySession:ensure,chunkBytes:65536});owned.add(next);writer=await createPrnuMeanPageWriter(next,{budget,pool,readers:[mean,residual],backend:session?.backend,signal,pageBytes:session?.snapshot?.().pageBytes??1024**2});const step=Math.max(1,Math.floor(8192/width));
      for(let y=0;y<height;y+=step){const h=Math.min(step,height-y);for(let x=0;x<width;x+=8192){await cooperate();const w=Math.min(8192,width-x),values=await mean.read(x,y,w,h,{signal,cooperate}),sample=await residual.read(x,y,w,h,{signal,cooperate});for(let i=0;i<values.length;i++)values[i]+=(sample[i]-values[i])/count;if(writer)await writer.append(values,x,y,w,h);else await next.write(values,x,y,w,h,{signal,cooperate});}}if(writer)await writer.finish();await next.store.flush();
     }catch(error){workspaceFailed=true;workspacePrimary=error;throw error;}finally{try{let cleanupFailed=false,cleanupPrimary;for(const retire of[()=>writer?.dispose(),()=>workspace.dispose()])try{await retire();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}else appendWaveletCleanup(cleanupPrimary,error);}if(cleanupFailed)throw cleanupPrimary;}catch(error){if(!workspaceFailed)throw error;appendWaveletCleanup(workspacePrimary,error);}}await drop(mean);await drop(residual);residual=null;mean=next;
    }trainingManifest.push({name:item.name,sha256:digest,prnuResidual:residualProvenance});trainingBackends[residualProvenance.backend]++;trainingGpuBands+=residualGpuBands;
   }catch(error){if(error?.code!=='INVALID_INPUT'){failed=true;primary=error;throw error;}skippedImages.push({name:item.name,reason:error.message});}
   finally{let cleanupFailed=false,cleanupPrimary;try{await retireWaveletPlans(imageReads);await retireTogether([imageLoans,residual?new Set([{dispose:()=>drop(residual)}]):new Set()]);}catch(error){cleanupFailed=true;cleanupPrimary=error;}try{done++;onProgress?.(done/total);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}else appendWaveletCleanup(cleanupPrimary,error);}if(cleanupFailed){if(!failed)throw cleanupPrimary;appendWaveletCleanup(primary,cleanupPrimary);}}
   }
   requireValue(trainingManifest.length>=2,name+': fewer than two readable JPEGs remain after query exclusion.');cameras.push({name,fingerprint:mean,trainingManifest,skippedImages,nImages:files.length,nUsed:trainingManifest.length});
  }
  checkAbort(signal);cameras.sort(hdf5NameOrder);const database={schema:PRNU_SCHEMA,complete:true,legacy:false,trainingMembershipVerified:true,layout:'segmented',cameras,decodedBytes:cameras.reduce((n,c)=>n+c.fingerprint.width*c.fingerprint.height*8,0),dispose:disposeDatabase};
  pool.clear();
  return {database,metrics:{...pool.metrics(),temporaryBackend:session?.backend??null,trainingBackendRequested:backend,trainingBackends:{...trainingBackends},trainingGpuBands,adaptiveTrainingAutoImplemented:false},release,detach(){
   requireValue(!disposed&&!closing&&!detached,'Snapshot ownership already transferred.');if(detaching)return detaching;
   const task=Promise.resolve().then(async()=>{if(metadataRelease){await metadataRelease();metadataRelease=null;}requireValue(!closing,'Snapshot retirement began during transfer.');detached=true;return database;});detaching=task;void task.finally(()=>{if(detaching===task)detaching=null;}).catch(()=>{});return task;
  }};
 }catch(error){try{await disposeDatabase();}catch(cleanupError){appendWaveletCleanup(error,cleanupError);}throw error;}

}
