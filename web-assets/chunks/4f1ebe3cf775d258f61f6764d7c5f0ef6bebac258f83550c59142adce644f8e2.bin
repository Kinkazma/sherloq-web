import "../../runtime-context.js?v=0.14.5";
import {copyTypedArray} from './allocation.js';
import {EngineError,serializeEngineError} from './errors.js';
import {siftReplyWithInput} from './sift-input-transport.js';
import {wasmRange} from './memory-range.js';
import {createSiftWorkerResources} from './sift-paged-worker-resources.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import create from '../vendor/sift-paged/sift-paged.js';
import {boundWasmMemory} from './wasm-memory-limit.js';
import {createSiftGaussianGpu} from './sift-paged-gaussian.js';
import {selectUniqueSift} from './sift-regions.js';
import {roundEven} from './pixel-utils.js';
let m,gpu,config,kernels,cachedPyramid;
const clearPyramid=()=>{if(!cachedPyramid)return;m._m3_sift_release();for(const pointer of cachedPyramid.pointers)m._free(pointer);cachedPyramid=null;};
const f=Math.fround,resources=createSiftWorkerResources(message=>postMessage(message));
installWorkerMessageProtocol(self,async job=>{
 if(job.resourceReply){resources.reply(job.resourceReply);return;}
 resources.clearOutputs();if(!['detect','refine','refine-batch','describe'].includes(job.kind))clearPyramid();
 const reply=result=>{const packet=siftReplyWithInput(job,result);postMessage(packet.message,packet.transfer);if(job.reusableInput)job.input=null;};
 let pyramidBuilds=0,pyramidCacheHits=0;const pointers=[];const alloc=n=>{const p=m._malloc(Math.max(8,n));if(!p)throw new EngineError('MEMORY_ALLOCATION','SIFT workspace memory allocation failed',{details:{allocationKind:'wasm',requestedBytes:n}});pointers.push(p);return p;},put=a=>{const p=alloc(a.byteLength);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;},copy=(p,n)=>copyTypedArray(m.HEAPF32.subarray(p/4,p/4+n),{label:'sift-paged-worker-output'});
 const copyOutput=async(p,n,label)=>{const output=await resources.allocate(Float32Array,n,label);output.set(m.HEAPF32.subarray(p/4,p/4+n));return output;};
 const build=async(input,w,h)=>{const key=job.cacheKey?JSON.stringify([job.cacheKey,w,h,config.layers,config.provider]):null;if(key&&cachedPyramid?.key===key){pyramidCacheHits++;return;}clearPyramid();const start=pointers.length;if(gpu){const count=w*h*(config.layers+3),p=alloc(count*4);resources.heap(m.HEAPU8.byteLength);await gpu.pyramidInto(input,w,h,kernels.slice(1),wasmRange(m,p,count*4));await resources.recover('sift-dog',()=>{if(m._m3_sift_build_supplied(p,w,h,config.layers)!==1)throw new EngineError('MEMORY_ALLOCATION','SIFT supplied octave allocation failed',{details:{allocationKind:'wasm',requestedBytes:w*h*(config.layers+2)*4}});},{bytes:w*h*(config.layers+2)*4,kind:'wasm'});}else{const p=put(input);if(m._m3_sift_build(p,w,h,config.layers)!==1)throw new EngineError('MEMORY_ALLOCATION','SIFT octave allocation failed',{details:{allocationKind:'wasm'}});}
  pyramidBuilds++;if(key)cachedPyramid={key,pointers:pointers.splice(start)};};
 try{
  if(job.kind==='init'){
   config=job;m=await create({wasmBinary:boundWasmMemory(job.wasm,job.maximumHeapBytes),print(){},printErr(){}});kernels=[];for(let step=0;step<job.layers+3;step++){const n=m._m3_sift_kernel(job.layers,step);if(n<0)throw Error('SIFT Gaussian kernel');kernels.push(copy(m._m3_sift_kernel_data(),n));}if(job.provider==='webgpu')gpu=await createSiftGaussianGpu({phase:(...args)=>resources.phase(...args),backing:(...args)=>resources.backing(...args),recover:(...args)=>resources.recover(...args)});resources.heap(m.HEAPU8.byteLength);postMessage({ready:true,heapBytes:m.HEAPU8.byteLength});return;
  }
  let result;
  if(job.kind==='scale'){
   const p=put(job.input);m._m3_sift_normalize(p,job.input.length,job.low,job.high);if(m._m3_sift_scale_four(p,job.width,job.height)!==1)throw new EngineError('MEMORY_ALLOCATION','SIFT native scale allocation failed',{details:{allocationKind:'wasm'}});const ptr=m._m3_sift_scaled_gray();const output=await resources.allocate(Uint8Array,job.input.length*16,'sift-scale-output');output.set(m.HEAPU8.subarray(ptr,ptr+output.length));result={gray:output};
  }else if(job.kind==='prepare'){
   const p=put(job.input);if(job.normalize)m._m3_sift_normalize(p,job.input.length,job.low,job.high);const w=job.width*2,h=job.height*2,n=w*h;let base;
   if(gpu){if(m._m3_sift_upsample(p,job.width,job.height)!==1)throw new EngineError('MEMORY_ALLOCATION','SIFT initial resize allocation failed',{details:{allocationKind:'wasm'}});const source=m._m3_sift_initial_data(),destination=alloc(n*8);resources.heap(m.HEAPU8.byteLength);await gpu.pyramidInto(()=>m.HEAPF32.subarray(source/4,source/4+n),w,h,[kernels[0]],wasmRange(m,destination,n*8));base=m.HEAPF32.subarray(destination/4+n,destination/4+2*n);}
   else{if(m._m3_sift_initial(p,job.width,job.height)!==1)throw new EngineError('MEMORY_ALLOCATION','SIFT initial Gaussian allocation failed',{details:{allocationKind:'wasm'}});base=m.HEAPF32.subarray(m._m3_sift_initial_data()/4,m._m3_sift_initial_data()/4+n);}
   const [x,y,cw,ch]=job.core,output=await resources.allocate(Float32Array,cw*ch,'sift-initial-output');for(let yy=0;yy<ch;yy++)output.set(base.subarray((y+yy)*w+x,(y+yy)*w+x+cw),yy*cw);result={base:output};
  }else if(job.kind==='detect'){
   await build(job.input,job.width,job.height);const {x0,y0,globalWidth,globalHeight,core,octave}=job,[x,y,cw,ch]=core,n=m._m3_sift_detect(x0,y0,globalWidth,globalHeight,x-x0,y-y0,cw,ch,octave,config.contrast);if(n<0)throw new EngineError('MEMORY_ALLOCATION','SIFT extremum workspace allocation failed',{details:{allocationKind:'wasm'}});const points=await copyOutput(m._m3_sift_points(),n*7,'sift-points'),count=m._m3_sift_escape_count(),ep=m._m3_sift_escapes(),escapes=await resources.allocate(Int32Array,count*6,'sift-escapes'),xx=Math.ceil(x/2),yy=Math.ceil(y/2),nw=Math.max(0,Math.min(Math.floor(globalWidth/2),Math.ceil((x+cw)/2))-xx),nh=Math.max(0,Math.min(Math.floor(globalHeight/2),Math.ceil((y+ch)/2))-yy),next=await resources.allocate(Float32Array,nw*nh,'sift-next-base'),lp=m._m3_sift_layer(config.layers)/4;
   escapes.set(m.HEAP32.subarray(ep/4,ep/4+count*6));for(let r=0;r<nh;r++)for(let c=0;c<nw;c++)next[r*nw+c]=m.HEAPF32[lp+((yy+r)*2-y0)*job.width+(xx+c)*2-x0];result={points,escapes,next,nextRect:[xx,yy,nw,nh]};
  }else if(job.kind==='refine'){
   await build(job.input,job.width,job.height);const state=Int32Array.from(job.state),sp=put(state),np=alloc(108),kp=alloc(28);let status=1,points=new Float32Array();
   for(;;){const c=m.HEAP32[sp/4],r=m.HEAP32[sp/4+1],layer=m.HEAP32[sp/4+2],{x0,y0,width,height,globalWidth,globalHeight}=job;
    if(x0>0&&c<x0+128||y0>0&&r<y0+128||x0+width<globalWidth&&c>=x0+width-128||y0+height<globalHeight&&r>=y0+height-128)break;
    if(m._m3_sift_neighborhood(c-x0,r-y0,layer,np)!==1)throw Error('SIFT global neighborhood');status=m._m3_sift_refine(sp,np,globalWidth,globalHeight,config.layers,job.octave,config.contrast,kp);if(status===0)break;
    if(status===2){const n=m._m3_sift_finish_orientation(kp,c,r,layer,job.octave,x0,y0);if(n<0)throw new EngineError('MEMORY_ALLOCATION','SIFT orientation allocation failed',{details:{allocationKind:'wasm'}});points=await copyOutput(m._m3_sift_points(),n*7,'sift-refined-points');break;}
   }
   const finalState=await resources.allocate(Int32Array,4,'sift-refined-state');finalState.set(m.HEAP32.subarray(sp/4,sp/4+4));result={status,state:finalState,points};
  }else if(job.kind==='refine-batch'){
   await build(job.input,job.width,job.height);const count=job.states.length/4,sp=alloc(16),np=alloc(108),kp=alloc(28),statuses=await resources.allocate(Uint8Array,count,'sift-batch-status'),states=await resources.allocate(Int32Array,count*4,'sift-batch-states'),offsets=await resources.allocate(Uint32Array,count+1,'sift-batch-offsets'),points=await resources.allocate(Float32Array,count*36*7,'sift-batch-points');let at=0;
   for(let index=0;index<count;index++){
    m.HEAP32.set(job.states.subarray(index*4,index*4+4),sp/4);let status=1;offsets[index]=at;
    for(;;){const c=m.HEAP32[sp/4],r=m.HEAP32[sp/4+1],layer=m.HEAP32[sp/4+2],{x0,y0,width,height,globalWidth,globalHeight}=job;
     if(x0>0&&c<x0+128||y0>0&&r<y0+128||x0+width<globalWidth&&c>=x0+width-128||y0+height<globalHeight&&r>=y0+height-128)break;
     if(m._m3_sift_neighborhood(c-x0,r-y0,layer,np)!==1)throw Error('SIFT global neighborhood');status=m._m3_sift_refine(sp,np,globalWidth,globalHeight,config.layers,job.octave,config.contrast,kp);if(status===0)break;
     if(status===2){const n=m._m3_sift_finish_orientation(kp,c,r,layer,job.octave,x0,y0);if(n<0)throw new EngineError('MEMORY_ALLOCATION','SIFT orientation allocation failed',{details:{allocationKind:'wasm'}});if(n>36)throw new EngineError('NUMERIC_RANGE','SIFT orientations exceed the native 36-bin invariant.');points.set(m.HEAPF32.subarray(m._m3_sift_points()/4,m._m3_sift_points()/4+n*7),at);at+=n*7;break;}
    }
    statuses[index]=status;states.set(m.HEAP32.subarray(sp/4,sp/4+4),index*4);
   }
   offsets[count]=at;result={statuses,states,offsets,points};
  }else if(job.kind==='describe'){
   await build(job.input,job.width,job.height);const p=put(job.points),n=job.points.length/7;if(m._m3_sift_describe(p,n,job.x0,job.y0)!==n)throw new EngineError('MEMORY_ALLOCATION','SIFT descriptor allocation failed',{details:{allocationKind:'wasm'}});result={descriptors:await copyOutput(m._m3_sift_descriptors(),n*128,'sift-descriptors')};
  }else if(job.kind==='select'){
   const {width,height,regions,excluded,limit,family,scale,zoneCount,independentZone}=job,mask=alloc(width*height),poly=alloc(Math.max(1,...[...regions,...excluded].map(p=>p.length))*8),raw=put(job.points);
   const draw=(polys,value)=>{for(const polygon of polys){m.HEAP32.set(Int32Array.from(polygon.flat(),roundEven),poly/4);if(!m._m3_sift_polygon(mask,width,height,poly,polygon.length,value))throw Error('SIFT mask rasterization failed');}};
   m.HEAPU8.fill(regions.length?0:255,mask,mask+width*height);draw(regions,255);draw(excluded,0);
   const n=family==='Forgeryscope-SIFT'?m._m2_sift_forgeryscope_select(raw,job.points.length/7,width,height):m._m3_sift_select(raw,job.points.length/7,family==='SIFT-LightGlue'?0:family==='SIFT-G2NN'?limit*2:limit,mask,width,height,scale);if(n<0)throw new EngineError('MEMORY_ALLOCATION','SIFT global ranking allocation failed',{details:{allocationKind:'wasm'}});let points=await resources.allocate(Float64Array,n*7,'sift-ranked-points'),totalFeatures=n;points.set(m.HEAPF32.subarray(m._m3_sift_points()/4,m._m3_sift_points()/4+n*7));
   for(let i=0;i<points.length;i+=7)for(let d=0;d<3;d++)points[i+d]/=scale;
   if(family==='SIFT-G2NN'){points=(await selectUniqueSift(points,await resources.allocate(Float32Array,n*128,'sift-uniqueness-descriptors'),limit,{reserveMemory(){}})).points;}
   else if(family!=='Forgeryscope-SIFT'){
    let ids=[];
    if(family==='SIFT-LightGlue'){
     const best=new Map(),cell=i=>roundEven(f(points[i*7+1]-.5))*width+roundEven(f(points[i*7]-.5));
     for(let i=0;i<n;i++){const key=cell(i),v=best.get(key),response=points[i*7+4],angle=points[i*7+3];if(!v||response>v[0])best.set(key,[response,angle]);else if(response===v[0]&&angle<v[1])v[1]=angle;}
     for(let i=0;i<n;i++){const v=best.get(cell(i));if(points[i*7+4]===v[0]&&points[i*7+3]===v[1])ids.push(i);}totalFeatures=ids.length;
    }else ids=Array.from({length:n},(_,i)=>i);
    ids.sort((a,b)=>points[b*7+4]-points[a*7+4]||a-b);ids=ids.slice(0,limit);if(family==='SIFT-LightGlue')ids.sort((a,b)=>points[a*7+1]-points[b*7+1]||points[a*7]-points[b*7]||a-b);
    const chosen=await resources.allocate(Float64Array,ids.length*7,'sift-selected-points');ids.forEach((id,i)=>chosen.set(points.subarray(id*7,id*7+7),i*7));points=chosen;
   }
   const descriptorPoints=await resources.allocate(Float32Array,points.length,'sift-descriptor-points');descriptorPoints.set(points);for(let i=0;i<descriptorPoints.length;i+=7)for(let d=0;d<3;d++)descriptorPoints[i+d]*=scale;
   const count=points.length/7,members=await resources.allocate(Uint8Array,count*zoneCount,'sift-members');
   if(independentZone!==null){for(let i=0;i<count;i++)members[i*zoneCount+independentZone]=1;}else if(!regions.length)members.fill(1);else for(let z=0;z<zoneCount;z++){m.HEAPU8.fill(0,mask,mask+width*height);draw([regions[z]],255);for(let i=0;i<count;i++){const x=Math.max(0,Math.min(width-1,roundEven(points[i*7]))),y=Math.max(0,Math.min(height-1,roundEven(points[i*7+1])));members[i*zoneCount+z]=+(m.HEAPU8[mask+y*width+x]>0);}}
   if(family==='SIFT-LightGlue')for(let i=0;i<count;i++){points[i*7+3]=f(f(points[i*7+3]*f(Math.PI/180))*f(180/Math.PI));points[i*7+5]=0;points[i*7+6]=-1;}
   if(family==='Forgeryscope-SIFT')for(let i=0;i<count;i++){points[i*7]=f(f(points[i*7]+.5)-.5);points[i*7+1]=f(f(points[i*7+1]+.5)-.5);points[i*7+3]=f(points[i*7+3]*f(Math.PI/180));}
   result={points,descriptorPoints,members,totalFeatures};
  }else throw Error('Unknown SIFT stage');
  result.pyramidBuilds=pyramidBuilds;result.pyramidCacheHits=pyramidCacheHits;result.resourceOutputs=await resources.outputMetadata(result);resources.heap(m.HEAPU8.byteLength);result.heapBytes=m.HEAPU8.byteLength;result.provider=gpu?'webgpu':'cpu';reply(result);
 }catch(error){resources.releaseOutputs();reply({error:serializeEngineError(error,'FEATURE_EXTRACTION_FAILED')});}
 finally{if(m){if(!cachedPyramid)m._m3_sift_release();m._m3_sift_scaled_release();for(const p of pointers)m._free(p);}}
},{label:'sift-paged-worker',onFailure:error=>{resources.fail(error);postMessage({error:serializeEngineError(error,'FEATURE_EXTRACTION_FAILED')});}});
