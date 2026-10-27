import "../../runtime-context.js?v=0.16.0";
import {installTransformStripWorker} from './transform-strip-worker.js';
import {requireValue,EngineError} from './errors.js';
import {allocateWasmMemory,wasmAllocationFailure} from './allocation.js';
import {fetchVerifiedAsset} from './fetch-verified-asset.js';
import {prepareProposalPyramid} from './selfdm-proposal-pyramid.js';
import {SELFDM_PROPOSAL_CV} from './selfdm-proposal-assets.js';

let cv,cap;
const check=(module,value)=>{
 if(value>=0)return value;
 const pointer=module._proposal_seeds_error(),end=module.HEAPU8.indexOf(0,pointer),message=new TextDecoder().decode(module.HEAPU8.subarray(pointer,end));
 if(/bad_alloc|out of memory|allocate/i.test(message))throw wasmAllocationFailure(module,'Proposal OpenCV allocation failed.',undefined,new Error(message));
 throw new EngineError('INVALID_INPUT','Proposal OpenCV rejected its input.',{details:{nativeError:message}});
};
async function cvInstance(job){
 if(cv){requireValue(cap===job.heapBytes,'Proposal CV worker memory identity changed.');return cv;}
 requireValue(Number.isSafeInteger(job.heapBytes)&&job.heapBytes>=16*1024**2&&job.heapBytes<=2*1024**3&&job.heapBytes%65536===0,'Explicit CV heap admission required');
 const asset={...SELFDM_PROPOSAL_CV,url:job.cvURL,id:'selfdm-proposal-cv'},bytes=await fetchVerifiedAsset(asset);
 const {default:create}=await import('../vendor/selfdm-proposal/proposal-cv.mjs');
 cap=job.heapBytes;cv=await create({wasmBinary:bytes,memoryMaximumBytes:cap,wasmMemory:allocateWasmMemory({initial:256,maximum:cap/65536},{label:'selfdm-proposal-cv-heap'})});return cv;
}
function buffers(module,sizes,compute){
 const pointers=[];
 try{for(const size of sizes){const pointer=module._malloc(size);if(!pointer)throw wasmAllocationFailure(module,'Proposal CV scratch allocation failed.',size);pointers.push(pointer);}return compute(pointers);}
 finally{for(const pointer of pointers)module._free(pointer);}
}
installTransformStripWorker(async job=>{
 requireValue([job?.width,job?.height].every(value=>Number.isSafeInteger(value)&&value>0),'Proposal worker source dimensions');
 const module=await cvInstance(job);
 if(job.command==='pyramid'){
  const prepared=prepareProposalPyramid(job.source,job.width,job.height,job.scale,module,{window:job.window,patch:job.patch});
  return {...prepared,heapBytes:module.HEAPU8.byteLength};
 }
 if(job.command==='mask-box')return buffers(module,[112*112*4,16],([input,output])=>{
  requireValue(job.mask instanceof Float32Array&&job.mask.length===112*112,'Proposal mask geometry');module.HEAPF32.set(job.mask,input/4);
  const found=check(module,module._proposal_mask_box(input,job.width,job.height,job.scale,job.row,job.col,output));
  return {found,box:found?module.HEAP32.slice(output/4,output/4+4):new Int32Array(0),heapBytes:module.HEAPU8.byteLength};
 });
 if(job.command==='roi'){
  const [x0,y0,x1,y1]=job.box,[w,h]=job.resize,n=w*h;
  return buffers(module,[job.source.byteLength,n*4,n*3,n*4],([source,gray,color,labels])=>{
   module.HEAPU8.set(job.source,source);
   const patch=job.patch??{width:job.width,height:job.height,x:0,y:0};
   check(module,module._proposal_prepare_roi(source,patch.width,patch.height,x0-patch.x,y0-patch.y,x1-x0,y1-y0,w,h,gray,color));
   const labelCount=check(module,module._proposal_seeds(color,w,h,labels)),data=module.HEAPF32.slice(gray/4,gray/4+n);
   for(let i=0;i<data.length;i++)data[i]=Math.fround(data[i]/255);
   return {gray:data,labels:module.HEAP32.slice(labels/4,labels/4+n),labelCount,heapBytes:module.HEAPU8.byteLength};
  });
 }
 if(job.command==='resize'){
  const [w,h]=job.resize,[outWidth,outHeight]=job.target;
  return buffers(module,[job.map.byteLength,outWidth*outHeight*4],([input,output])=>{
   module.HEAPF32.set(job.map,input/4);check(module,module._proposal_resize_float(input,w,h,outWidth,outHeight,output));
   return {data:module.HEAPF32.slice(output/4,output/4+outWidth*outHeight),heapBytes:module.HEAPU8.byteLength};
  });
 }
 throw new EngineError('INVALID_INPUT','Unknown SelfDM Proposal worker stage');
},{label:'selfdm-proposal'});
