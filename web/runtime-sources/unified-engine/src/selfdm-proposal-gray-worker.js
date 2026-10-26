import "../../runtime-context.js?v=0.25.0";
import {installTransformStripWorker} from './transform-strip-worker.js';
import {requireValue,EngineError} from './errors.js';
import {allocateWasmMemory,wasmAllocationFailure} from './allocation.js';
import {fetchVerifiedAsset} from './fetch-verified-asset.js';
import {SELFDM_PROPOSAL_CV} from './selfdm-proposal-assets.js';

let cv,cap;
/** Gray-only entry point to the EXISTING native ROI preparation. SEEDS stays
 * one common native hierarchy on the real proposal union, never one per crop.
 * The legacy RGB->BGR2GRAY/Float32 resize and /255 normalization are unchanged. */
installTransformStripWorker(async job=>{
 requireValue(job?.command==='gray'&&job.source instanceof Uint8Array&&[job.width,job.height,...job.resize].every(n=>Number.isSafeInteger(n)&&n>0)&&job.source.length===job.width*job.height*3,'Literal native Proposal gray geometry required');
 requireValue(Number.isSafeInteger(job.heapBytes)&&job.heapBytes>=16*1024**2&&job.heapBytes<=2*1024**3&&job.heapBytes%65536===0,'Admitted native Proposal gray memory required');
 if(!cv){const wasmBinary=await fetchVerifiedAsset({...SELFDM_PROPOSAL_CV,id:'selfdm-proposal-cv',url:job.cvURL}),{default:create}=await import('../vendor/selfdm-proposal/proposal-cv.mjs');cap=job.heapBytes;cv=await create({wasmBinary,memoryMaximumBytes:cap,wasmMemory:allocateWasmMemory({initial:256,maximum:cap/65536},{label:'native-proposal-gray-heap'})})}
 requireValue(cap===job.heapBytes,'Native gray imported memory identity changed');const [width,height]=job.resize,n=width*height,pointers=[];
 const malloc=size=>{const p=cv._malloc(size);if(!p)throw wasmAllocationFailure(cv,'Native Proposal gray scratch allocation failed.',size);pointers.push(p);return p};
 try{
  const source=malloc(job.source.byteLength),gray=malloc(n*4),colour=malloc(n*3);cv.HEAPU8.set(job.source,source);
  const status=cv._proposal_prepare_roi(source,job.width,job.height,0,0,job.width,job.height,width,height,gray,colour);
  if(status<0){const at=cv._proposal_seeds_error(),end=cv.HEAPU8.indexOf(0,at),message=new TextDecoder().decode(cv.HEAPU8.subarray(at,end));if(/bad_alloc|out of memory|allocate/i.test(message))throw wasmAllocationFailure(cv,'Native gray preparation allocation failed.',undefined,new Error(message));throw new EngineError('INVALID_INPUT','Native Proposal gray preparation refused its input.',{details:{nativeError:message}})}
  const data=cv.HEAPF32.slice(gray/4,gray/4+n);for(let i=0;i<data.length;i++)data[i]=Math.fround(data[i]/255);
  return{gray:data,shape:[1,1,height,width],heapBytes:cv.HEAPU8.byteLength,nativePreparation:'unchanged-proposal_prepare_roi-native-crop-resize-and-divide255'};
 }finally{for(const p of pointers)cv._free(p)}
},{label:'selfdm-proposal-gray'});
