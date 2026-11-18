import {withRetirementOwner} from './owner-retirement-error.js';
import {EngineError,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {segmentedPca} from './segmented-pca.js';
import {pcaParams} from './pca.js';
import {detachPcaCloudOwner,attachPcaCloudOwner} from './pca-cloud.js';

// PCA is invariant to the two-dimensional placement of its observations.
// Keep their ORIGINAL row order, however: merging per-rectangle covariance
// matrices changes the maintained floating arithmetic. The packed stream is
// never supplied to a spatial filter or presented as a new source image.
export async function sourceRegionPca({task,original,view,domain,budget,signal,onProgress,publishResult}){
 const params=pcaParams(task.params),count=domain.countIncluded,width=domain.width,height=domain.height;
 if(!Number.isSafeInteger(count)||count<1||count>2147483647)throw new EngineError('INVALID_INPUT','The admitted PCA observation count exceeds its native integer domain.');
 const blockPixels=Math.min(65536,Math.max(1,Math.floor((budget.limit-budget.retained-budget.active-16*1024**2)/144)));
 let packed,packedSurface,projection,output,outputSurface,analysis,analysisSurface,published=false,failure,hadFailure=false,cloudOwner;const refused=new Set(),foreign=new Set();let cleanupFlight;
 const owned=()=>[['projection',projection?.surface],['packed',packedSurface??packed],...(!published?[['output',outputSurface??output],['analysis',analysisSurface??analysis]]:[])];
 const forget=key=>{if(key==='projection')projection=null;else if(key==='packed')packedSurface=packed=null;else if(key==='output')outputSurface=output=null;else if(key==='analysis')analysisSurface=analysis=null;};
 const ack=value=>{if(value===false||value===0)throw new EngineError('BUSY','Regional PCA retirement was not acknowledged.');};
 const cleanupOwner={dispose({skip=new Set()}={}){if(cleanupFlight)return cleanupFlight;const task=Promise.resolve().then(async()=>{let failed=false,primary;
  for(const [key,owner]of owned()){if(!owner)continue;if(skip.has(owner)){failed=true;primary??=new EngineError('BUSY','Regional PCA retains the refused owner.');continue;}try{ack(await owner.dispose());forget(key);}catch(error){failed=true;primary??=error;}}
  for(const owner of [...foreign]){if(skip.has(owner)){failed=true;primary??=new EngineError('BUSY','Regional PCA retains the refused child.');continue;}try{ack(await owner.dispose());foreign.delete(owner);}catch(error){failed=true;primary??=error;}}
  if(failed)throw withRetirementOwner(primary,cleanupOwner,primary);
  if(cloudOwner){await cloudOwner.release?.();cloudOwner=null;}
 });cleanupFlight=task;void task.finally(()=>{if(cleanupFlight===task)cleanupFlight=null;}).catch(()=>{});return task;}};
 async function retire(key){const owner=owned().find(([name])=>name===key)?.[1];if(!owner)return;try{ack(await owner.dispose());forget(key);}catch(primary){refused.add(owner);throw withRetirementOwner(primary,cleanupOwner,primary);}}
 const make=bytes=>createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});
 async function observations(visitor){let offset=0;for(let y=0;y<height;y++){
  for(const[left,right]of domain.rowIntervals(y))for(let x=left;x<right;x+=blockPixels){checkAbort(signal);const rect={x,y,width:Math.min(blockPixels,right-x),height:1};await visitor(rect,offset);offset+=rect.width;}
  if((y&31)===31)await controlCheckpoint(signal);
 }if(offset!==count)throw new EngineError('SOURCE_REGIONS_INVALID','PCA observation traversal differs from its certified domain.');}
 try{
  packed=await make(count*3);
  await observations(async(rect,offset)=>{const lease=await view.readWindow(rect,{signal});try{await packed.write(lease.pixels.data,offset*3);}finally{lease.release();}onProgress?.({phase:'source-region-pca-observations',completed:offset+rect.width,total:count});});await packed.flush();
  packedSurface=createRgbSurface(packed,{width:count,height:1,budget});
  const basisKey=task.imageId+'\0source-region/pca/basis/'+domain.fingerprint,basis=budget.get(basisKey)?.value;
  projection=await segmentedPca({surface:packedSurface,session:original.session,ensureTemporarySession:original.ensureTemporarySession},params,{budget,signal,onProgress,blockPixels,...(basis?{basis}:{})});
  if(!basis)budget.put(basisKey,{value:projection.basis.slice(),byteLength:projection.basis.byteLength},[task.imageId]);
  await retire('packed');
  output=await make(width*height*3);analysis=await make(width*height);
  // The unanalysed original is only a background. It cannot reach PCA's
  // moments, projection extrema, histogram or equalization.
  const backgroundRows=Math.max(1,Math.floor(blockPixels/width));
  for(let y=0;y<height;y+=backgroundRows){checkAbort(signal);const rows=Math.min(backgroundRows,height-y),lease=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:rows},{signal});try{await output.write(lease.pixels.data,y*width*3);}finally{lease.release();}const release=budget.reserve(width*rows);try{await analysis.write(new Uint8Array(width*rows),y*width);}finally{release();}}
  await observations(async(rect,offset)=>{const lease=await projection.surface.readWindow({x:offset,y:0,width:rect.width,height:1},{signal});let release;try{await output.write(lease.pixels.data,(rect.y*width+rect.x)*3);release=budget.reserve(rect.width);await analysis.write(new Uint8Array(rect.width).fill(1),rect.y*width+rect.x);}finally{release?.();lease.release();}onProgress?.({phase:'source-region-pca-scatter',completed:offset+rect.width,total:count});});
  cloudOwner=detachPcaCloudOwner(projection.surface);
  const data=projection.data,pcaMetrics=projection.metrics;await retire('projection');await output.flush();await analysis.flush();checkAbort(signal);
  outputSurface=createRgbSurface(output,{width,height,budget});analysisSurface=createMaskSurface(analysis,{width,height,budget,range:[0,1],semantics:'1=original observation included in PCA moments, extrema and histogram;0=original display-only background.'});
  attachPcaCloudOwner(outputSurface,cloudOwner);cloudOwner=null;
  const semantics='Native ordered float64 PCA over admitted original observations; one global covariance, projection normalization and equalization. Original coordinates restored without treating excluded pixels as zero observations.';
  const metrics={...pcaMetrics,observations:count,basisCached:!!basis,sourceRegionPolicy:'ordered-admitted-global-pca',originalCoordinateScatter:true},record={surface:outputSurface,maskRecords:{analysis_scope:{surface:analysisSurface}},data,semantics,metrics},bundle=publishResult(task.imageId,record);published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,data,semantics,metrics,provenance:{params,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-mean-covariance-extrema-and-equalization',presentationOutsideDomain:'original-unanalysed',observationOrder:'original-y-then-x',originalEncodedBytesPreserved:true}};
 }catch(error){hadFailure=true;failure=error;const child=error?.cleanupOwner;if(child&&child!==cleanupOwner&&typeof child.dispose==='function'){if(!owned().some(([,owner])=>owner===child))foreign.add(child);refused.add(child);}throw error;}
 finally{
  try{await cleanupOwner.dispose({skip:refused});}catch(cleanup){throw withRetirementOwner(hadFailure?failure:cleanup,cleanupOwner,cleanup);}
 }
}
