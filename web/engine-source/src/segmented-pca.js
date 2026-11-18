import {pcaExecutionPlan,pcaModelIdentity} from './pca-execution-plan.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {registerArrayViews} from './allocation.js';
import {pcaParams} from './pca.js';
import {pcaStreamMath,pcaStreamHeapBytes} from './pca-stream-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {createRgb16Surface} from './rgb16-surface.js';
import {createPcaCloudSample,attachPcaCloudOwner} from './pca-cloud.js';
import {createPcaCovariancePool} from './pca-covariance-pool.js';
import {createPcaResultTables} from './pca-result-tables.js';
import {createSourceDisplaySampler} from './source-display-sampler.js';

// The numerical traversal is shared by8/16 and all decoder layouts. Only the
// typed kernel and declared normalized output codes depend on sample depth.
export async function segmentedPca(image,params,{budget,signal,onProgress,basis:cachedBasis,basisIdentity,blockPixels:requestedBlock=65536,storage='auto',maxWorkers=1,isSourceCurrent,sourceBinding=image.pcaSourceBinding,canonicalDisplaySurface=image.canonicalDisplaySurface,presentationGrid=image.pcaPresentationGrid}={}){
 const p=pcaParams(params),descriptor=image.surface.descriptor,width=descriptor.width,height=descriptor.height,n=width*height,inputDepth=descriptor.format==='rgb16'?16:8,sampleBytes=inputDepth===16?2:1;
 requireValue(Number.isSafeInteger(n)&&n>0&&Number.isInteger(requestedBlock)&&requestedBlock>=1&&requestedBlock<=262144,'Invalid PCA surface or block size.');
 const binding=sourceBinding,display=canonicalDisplaySurface,grid=presentationGrid??{width,height,step:1,origin:[0,0],nativeSurfaceId:descriptor.id,nativeRevision:descriptor.revision};
 const current=()=>{checkAbort(signal);if(inputDepth===16&&!isSourceCurrent?.())throw new EngineError('SOURCE_CHANGED','PCA16 Original authority is no longer current.');};
 if(inputDepth===16){requireValue(binding&&typeof binding.nativeSurfaceId==='string'&&Number.isSafeInteger(binding.nativeRevision)&&typeof binding.profileIdentity==='string'&&typeof binding.imageId==='string'&&typeof binding.sourceSha256==='string'&&typeof isSourceCurrent==='function'&&display?.descriptor?.id===binding.sourceSurfaceId&&display.descriptor.revision===binding.sourceRevision&&grid.width===width&&grid.height===height&&grid.nativeSurfaceId===descriptor.id&&grid.nativeRevision===descriptor.revision&&Number.isSafeInteger(grid.step)&&grid.step>0&&Array.isArray(grid.origin)&&grid.origin.length===2&&grid.origin.every(v=>Number.isSafeInteger(v)&&v>=0)&&grid.origin[0]+(width-1)*grid.step<display.descriptor.width&&grid.origin[1]+(height-1)*grid.step<display.descriptor.height,'PCA16 needs the actual native grid, Original authority and canonical SDR partner.');current();}
 const modelIdentity=inputDepth===16?pcaModelIdentity(binding,descriptor,grid):null;
 if(inputDepth===16&&cachedBasis)requireValue(basisIdentity===modelIdentity,'PCA16 cached model belongs to another native Source/profile/grid.');
 const mode=['distance','project','crossprod'].indexOf(p.mode),channels=mode===2?3:1,room=budget.limit-budget.retained-budget.active,execution=pcaExecutionPlan({width,height,inputDepth,params:p,retainedTables:inputDepth===16||!!image.nativeSurface,availableBytes:room,blockPixels:requestedBlock,maxWorkers,heapBytes:pcaStreamHeapBytes()}),block=execution?.blockPixels;
 if(!execution)throw new EngineError('MEMORY_LIMIT','PCA minimum streaming workspace does not fit.');
 const s={tables:null,reservation:null,planning:null,input:null,raw:null,output:null,surface:null,sample:null,pool:null,projector:null,projectorCredit:null,colorSampler:null,histogram:null,histogramCredit:null,histogramBacking:null,lut:null,lutCredit:null,lutBacking:null},refused=new Set(),foreign=new Set();let covarianceMetrics,projectorMetrics;
 const acknowledge=value=>{if(value===false||value===0)throw new EngineError('BUSY','PCA resource retirement was not acknowledged.');return value;};
 const cleanupOwner={async dispose({skip=new Set(),preserveSurface=false,preserveTables=false}={}){
  let rejected=false,first;
  for(const key of ['input','colorSampler','pool','projector','raw','output','surface','tables']){const owner=s[key];if(!owner||key==='surface'&&preserveSurface||key==='tables'&&preserveTables)continue;if(skip.has(owner)){rejected=true;first??=new EngineError('BUSY','PCA keeps the refused retirement owner.');continue;}
   try{acknowledge(await(key==='input'?owner.release():owner.dispose()));s[key]=null;}catch(error){rejected=true;first??=error;}}
  for(const owner of [...foreign]){if(skip.has(owner)){rejected=true;first??=new EngineError('BUSY','PCA keeps the refused foreign retirement owner.');continue;}try{acknowledge(await owner.dispose());foreign.delete(owner);}catch(error){rejected=true;first??=error;}}
  if(rejected)throw withRetirementOwner(first,cleanupOwner,first);
  // These are owned byte counters/backing unregister callbacks, not ACK APIs.
  s.lut=null;s.histogram=null;
  for(const key of ['lutBacking','lutCredit','histogramBacking','histogramCredit'])if(s[key]){if(skip.has(s[key]))throw withRetirementOwner(new EngineError('BUSY','PCA backing retirement is still pending.'),cleanupOwner,first);try{s[key]();s[key]=null;}catch(primary){refused.add(s[key]);throw withRetirementOwner(primary,cleanupOwner,primary);}}
  if(s.sample){await s.sample.release?.();s.sample=null;}
  for(const key of ['projectorCredit','planning','reservation'])if(s[key]){if(skip.has(s[key]))throw withRetirementOwner(new EngineError('BUSY','PCA workspace retirement is still pending.'),cleanupOwner,first);try{s[key]();s[key]=null;}catch(primary){refused.add(s[key]);throw withRetirementOwner(primary,cleanupOwner,primary);}}
 }};
 async function retire(key){const owner=s[key];if(!owner)return;try{acknowledge(await(key==='input'?owner.release():owner.dispose()));s[key]=null;}catch(primary){refused.add(owner);throw withRetirementOwner(primary,cleanupOwner,primary);}}
 const cooperate=createCooperator(signal),progress=(phase,done,total)=>onProgress?.({phase,completed:done,total});
 const visit=async(fn,phase)=>{
  let done=0;
  const band=async(rect,offset)=>{let primary,bandFailed=false;s.input=await image.surface.readWindow(rect,{signal});try{current();const values=s.input.pixels.data;requireValue(inputDepth===16?values instanceof Uint16Array:values instanceof Uint8Array,'PCA input sample type changed.');await fn(values,offset,rect);}catch(error){primary=error;bandFailed=true;throw error;}finally{try{await retire('input');}catch(cleanup){throw withRetirementOwner(bandFailed?primary:cleanup,cleanupOwner,cleanup);}}};
  for(let y=0;y<height;){const rows=Math.min(height-y,Math.max(1,Math.floor(block/width)));
   if(width<=block){await band({x:0,y,width,height:rows},y*width);y+=rows;done=y*width;progress(phase,done,n);}
   else{for(let x=0;x<width;x+=block){await band({x,y,width:Math.min(block,width-x),height:1},y*width+x);done=y*width+Math.min(width,x+block);progress(phase,done,n);await cooperate();}y++;}await cooperate();}
 };
 const store=async(key,bytes)=>{s.planning=budget.reserve(block*8+2*1024**2);let primary,failed=false;try{s[key]=await createSegmentedBytes(bytes,{budget,chunkBytes:Math.max(24,block*channels*8),storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});}catch(error){primary=error;failed=true;throw error;}finally{try{s.planning();s.planning=null;}catch(cleanup){refused.add(s.planning);throw withRetirementOwner(failed?primary:cleanup,cleanupOwner,cleanup);}}};
 const bytesOf=value=>new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
 const littleEndian=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
 function outputBytes(pixels){const bytes=bytesOf(pixels);if(inputDepth===8||littleEndian)return bytes;const output=new Uint8Array(bytes.length),view=new DataView(output.buffer);for(let i=0;i<pixels.length;i++)view.setUint16(i*2,pixels[i],true);return output;}
 try{
  s.reservation=budget.reserve(execution.workspaceBytes);
  const math=await pcaStreamMath();current();let basis=cachedBasis;
  s.sample=createPcaCloudSample(n,{budget,inputDepth});
  if(inputDepth===16)s.colorSampler=createSourceDisplaySampler({source:display,binding,grid,colors:s.sample.data.rgb,total:n,maxPoints:131072,isCurrent:isSourceCurrent});
  if(!basis){
   let sums=new Float64Array(3);await visit(bytes=>{sums=math.mean(bytes,sums);},'mean');
   const mean=Float64Array.from(sums,v=>v*(1/n));let cov=new Float64Array(9);
   s.pool=createPcaCovariancePool({budget,maxWorkers,blockPixels:block,total:n,inputDepth});const repeats=n<3?3:1;
   for(let repeat=0;repeat<repeats;repeat++)await visit(async bytes=>{cov=s.pool?await s.pool.add(bytes,mean,cov,math,signal):math.covariance(bytes,mean,cov);},'covariance');
   if(s.pool){const pool=s.pool;await retire('pool');covarianceMetrics=pool.metrics();}
   basis=math.finish(mean,cov,n*repeats);
  }
  requireValue(basis instanceof Float64Array&&basis.length===15&&basis.every(Number.isFinite),'Invalid PCA basis.');
  await store('raw',n*channels*8);const limits=new Float64Array(channels*2);
  if(mode===1&&n>=1024*1024&&budget.limit-budget.total()>=8*1024**2+n*3*sampleBytes+block*8+2*1024**2){s.projectorCredit=budget.reserve(8*1024**2);s.projector=math.projector(basis,p.component,{inputDepth});}
  for(let c=0;c<channels;c++){limits[2*c]=Infinity;limits[2*c+1]=-Infinity;}
  await visit(async(bytes,offset,rect)=>{
   s.sample.add(bytes,offset);
   if(s.colorSampler){const part=await s.colorSampler.read(rect,{signal});try{s.colorSampler.collect(part,offset);}finally{await part.release();}}
   const values=s.projector?s.projector.project(bytes):math.project(bytes,basis,p.component,mode);
   if(s.projector&&s.projector.metrics.hits+s.projector.metrics.misses>=196608&&s.projector.metrics.hits/(s.projector.metrics.hits+s.projector.metrics.misses)<.2){projectorMetrics={...s.projector.metrics,disabledForLowReuse:true};await retire('projector');}
   for(let i=0;i<values.length;i++){const c=i%channels;limits[2*c]=Math.min(limits[2*c],values[i]);limits[2*c+1]=Math.max(limits[2*c+1],values[i]);}
   await s.raw.write(bytesOf(values),offset*channels*8);
  },'projection');
  if(s.projector){projectorMetrics=s.projector.metrics;await retire('projector');}if(s.colorSampler)await retire('colorSampler');
  await s.raw.flush();await store('output',n*3*sampleBytes);const binCount=inputDepth===16?65536:256;
  if(inputDepth===16&&p.equalize)s.histogramCredit=budget.reserve(3*binCount*8);
  s.histogram=new Float64Array(inputDepth===8||p.equalize?binCount*3:0);if(inputDepth===16&&p.equalize)s.histogramBacking=registerArrayViews(budget,{histogram:s.histogram},{owner:'pca16',label:'global-normalized-code-histogram'});
  await s.raw.visit(async(bytes,offset)=>{
   const values=new Float64Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/8),pixels=math.normalize(values,channels,limits,n,p.invert,{outputDepth:inputDepth});
   if(p.equalize)for(let i=0;i<pixels.length;i++)s.histogram[(i%3)*binCount+pixels[i]]++;
   await s.output.write(outputBytes(pixels),offset/(channels*8)*3*sampleBytes);progress('normalize',(offset+bytes.length)/(channels*8),n);
  },{signal,blockBytes:block*channels*8,cooperate});
  await retire('raw');
  if(p.equalize){
   if(inputDepth===16)s.lutCredit=budget.reserve(3*binCount*2);s.lut=math.lut(s.histogram,n,{outputDepth:inputDepth});if(inputDepth===16)s.lutBacking=registerArrayViews(budget,{lut:s.lut},{owner:'pca16',label:'global-cdf-lut'});
   await s.output.visit(async(bytes,offset)=>{const values=inputDepth===16?(littleEndian?new Uint16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2):Uint16Array.from({length:bytes.length/2},(_,i)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(i*2,true))):bytes;for(let i=0;i<values.length;i++)values[i]=s.lut[(i%3)*binCount+values[i]];await s.output.write(outputBytes(values),offset);progress('equalize',(offset+bytes.length)/(3*sampleBytes),n);},{signal,blockBytes:block*3*sampleBytes,cooperate});
  }
  await s.output.flush();current();
  s.surface=inputDepth===16?createRgb16Surface(s.output,{width,height,orientation:1,budget,sourceDepth:16,color:{primaries:'srgb',transfer:'srgb'},provenance:{role:'PCA-normalized-code-visualization',inputDepth:16,sourceBinding:binding}}):createRgbSurface(s.output,{width,height,orientation:1,budget});s.output=null;
  const sample=s.sample;if(inputDepth===16)createPcaResultTables(basis,sample,{budget,onOwner:owner=>{s.tables=owner;s.sample=null;}});else{attachPcaCloudOwner(s.surface,sample);s.sample=null;}await cleanupOwner.dispose({preserveSurface:true,preserveTables:true});current();const surface=s.surface,tableRecords=s.tables?.tableRecords,retainedModel=s.tables?.model;s.surface=null;s.tables=null;
  return{surface,...(tableRecords?{tableRecords,dispose:()=>retireCompositeOwners([()=>surface.dispose(),...Object.values(tableRecords).map(record=>()=>record.surface.dispose())],{requireAck:true})}:{}),basis:retainedModel??basis.slice(),data:inputDepth===16?{channelOrder:'BGR',inputDepth:16,modelIdentity,sourceBinding:binding,modelTable:'pca_model',cloudTable:'pca_cloud',cloud:{count:sample.data.count,total:sample.data.total,stride:sample.data.stride,sampling:sample.data.sampling,inputDomain:sample.data.inputDomain,colorDomain:sample.data.colorDomain}}:{channelOrder:'BGR',mean:basis.slice(0,3),eigenvectors:basis.slice(3,12),eigenvalues:basis.slice(12,15),cloud:sample.data},semantics:inputDepth===16?'Ordered float64 PCA over full working RGB16 codes; complete model, global16-bit normalized outputs and independently sampled canonical SDR presentation colors.':'Native ordered float64 PCA; global mean/covariance, extrema and histogram with segmented projection/output. Cloud is a bounded presentation sample.',metrics:{blockPixels:block,storage:surface.descriptor.storage,basisCached:!!cachedBasis,workers:covarianceMetrics?.workers??1,...(covarianceMetrics?{covarianceWorkers:covarianceMetrics}:{}),...(projectorMetrics?{projectionCache:projectorMetrics}:{}),retainedResultBytes:n*3*sampleBytes+(inputDepth===16?120:0)+sample.data.rgb.byteLength+(sample.data.rgb16?.byteLength??0),cloudSampleBytes:sample.data.rgb.byteLength+(sample.data.rgb16?.byteLength??0),cloudPoints:sample.data.count,cloudPopulation:n,...(inputDepth===16?{inputDepth:16,outputDepth:16,modelIdentity}:{})}};
 }catch(primary){const debt=primary?.cleanupOwner;if(debt&&debt!==cleanupOwner&&typeof debt.dispose==='function'){if(!Object.values(s).includes(debt))foreign.add(debt);refused.add(debt);}try{await cleanupOwner.dispose({skip:refused});}catch(cleanup){throw withRetirementOwner(primary,cleanupOwner,cleanup);}throw primary;}
}
