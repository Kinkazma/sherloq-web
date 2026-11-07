import {ramByteCacheBytes} from './ram-byte-cache.js';
import {migrationWorkspaceBytes} from './migration-workspace.js';
import {isGradientField} from './gradient-field-parameters.js';
import {gradientFieldHeadroom} from './gradient-field.js';
const MiB=1024**2,H=64*MiB;
const safe=v=>Number.isSafeInteger(v)&&v>=0;
function finish(operation,components,extra={}){const bytes=Object.values(components).reduce((n,v)=>n+v,0);return Object.values(components).every(safe)&&safe(bytes)&&bytes>0?{operation,bytes,completeResidentAlternative:true,...extra,components}:null;}
/** Full admission for registered native Adjust/Gradient only. This finances the
 * maximum permitted arithmetic actors, including their input/output windows;
 * no preview owner is allowed to reduce their concurrency, rows or output grid.
 * Existing stores are already in Budget.total; these components finance the
 * callee's additional complete RAM alternative and any construction copy. */
export function externalPreviewParallelHeadroom(operation,image,p,{runtimeBytes=0,transportBytes=0,profile={},cpuKernel='auto',backend='auto',contract,domainShape='identity',domain,workersAvailable=typeof globalThis.Worker!=='undefined'}={}){
 if(!['inspection.adjust','detail.gradient'].includes(operation)||p?.recompression||!image?.surface?.descriptor||!safe(runtimeBytes)||!safe(transportBytes)||!['identity','rectangle'].includes(domainShape))return null;
 const d=image.surface.descriptor,w=domainShape==='rectangle'?domain?.width:d.width,h=domainShape==='rectangle'?domain?.height:d.height,n=w*h;if(![w,h,n,n*3].every(Number.isSafeInteger)||w<1||h<1||!['auto','single','reference'].includes(cpuKernel))return null;
 if(operation==='detail.gradient'&&isGradientField(p)){const headroom=gradientFieldHeadroom(w,h,p,{runtimeBytes,transportBytes});return headroom?{operation,...headroom,registeredParallel:true,domainShape}:null;}
 let contiguous=null;if(contract&&safe(contract.scratchFactor)&&safe(contract.extraBytes??0)&&!contract.dynamicResultBudget&&!contract.resultMemory){let admission;try{admission=contract.admissionBytes?.({width:w,height:h,format:'rgb8'},p,image.bytes)??0;}catch{return null;}if(!safe(admission))return null;
  contiguous=finish(operation,{runtime:runtimeBytes,declaredScratch:n*3*contract.scratchFactor,declaredExtra:contract.extraBytes??0,declaredAdditional:admission,resultAndClone:n*6,gpuDisplay:operation==='inspection.adjust'&&cpuKernel!=='reference'&&backend!=='cpu'?64*MiB:0,metadata:transportBytes*8+262144},{parallelWorkers:0,registeredContiguous:true});
 }
 const segmentedRoute=image.segmented||domainShape==='rectangle'||operation==='detail.gradient'&&cpuKernel!=='reference'&&image.provenance?.decoder==='bounded-parameter-preview';
 if(!segmentedRoute)return contiguous;
 if(!Number.isSafeInteger(profile.maxWorkers)||profile.maxWorkers<1)return null;
 const maxWorkers=cpuKernel==='auto'&&workersAvailable?profile.maxWorkers:1,io=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*MiB:0,migration=image.session||image.ensureTemporarySession?migrationWorkspaceBytes(Math.max(n*4,n*3),image.session):0;
 let parallel;
 if(operation==='inspection.adjust'){
  if(!Number.isInteger(p?.sharpen)||p.sharpen<0||p.sharpen>100||!Number.isInteger(p?.equalize)||p.equalize<0||p.equalize>5||n>2147483647)return null;
  const halo=Math.floor(p.sharpen/4),heapRows=Math.floor((H-4*MiB-256*1024)/(w*48)),maxRows=heapRows>=h?h:heapRows-2*halo,rows=Math.min(h,Math.max(1,Math.floor(262144/w)),maxRows);if(rows<1)return null;
  const actors=Math.min(32,maxWorkers,Math.ceil(h/rows)),windowRows=Math.min(h,rows+2*halo);
  parallel=finish(operation,{runtime:runtimeBytes,mainArithmeticHeap:H,workerHeaps:actors>1?actors*H:0,allActorWindows:actors*w*(rows*2+windowRows)*3,outputAndConstructionCopies:n*9,nativePrefixCache:ramByteCacheBytes(n*3,1024),metadata:transportBytes*12+256*1024+Math.max(w,h)*3+actors*65536,sourceAndIO:16*MiB+io+Math.max(w,h,d.width,d.height)*16,migrationWorkspace:migration},{parallelWorkers:actors,rowsPerBlockUpper:rows,registeredParallel:true});
 }else{
  if(!['sobel','krawetz'].includes(p?.method))return null;
  const heapRows=Math.floor((H-2*MiB-w*8)/(w*8)),rows=Math.min(h,Math.max(1,Math.floor(262144/w)),heapRows);if(rows<1)return null;
  const actors=Math.min(maxWorkers,Math.ceil(h/rows)),overhead=H+io+w*24+Math.max(w,h)*3+16384,banks=n*7+ramByteCacheBytes(n*4,48)-n*4,derivatives=overhead-(actors>1?H:0)+12*w*rows+actors*(H+24*w*(rows+2)+3*w*(rows+3)),cpuRender=overhead+16*w*rows,gpuRender=p.method==='sobel'&&cpuKernel!=='reference'&&backend!=='cpu'?cpuRender+13*n+8*Math.min(4*w*rows,4*n)+6*MiB:0;
  parallel=finish(operation,{runtime:runtimeBytes,banksAndCacheMetadata:banks,maximumUsefulPhase:Math.max(derivatives,cpuRender,gpuRender),metadata:transportBytes*12+262144,sourceAndIO:16*MiB+Math.max(w,h,d.width,d.height)*16,migrationWorkspace:migration},{parallelWorkers:actors,rowsPerBlockUpper:rows,registeredParallel:true});
 }
 return parallel&&{...parallel,domainShape,effectiveDimensions:[w,h]};
}
