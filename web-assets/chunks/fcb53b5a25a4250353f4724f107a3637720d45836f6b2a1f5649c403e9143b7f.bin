import "../../runtime-context.js?v=0.14.5";
import createPost from '../vendor/xfeat-paged/post.js';
import {XFEAT_PAGED_POST,XFEAT_PAGED_MODEL} from './xfeat-paged-assets.js';
import {SPARSE_EXTRACT_WASM} from './sparse-extract-assets.js';
import {boundWasmMemory} from './wasm-memory-limit.js';
import {fetchM3Asset,verifyM3Bytes} from './m3-asset.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {TypedPages} from './m3-typed-pages.js';
import {researchRows} from './m3-research-rows.js';
import {prepareXfeatRows} from './xfeat-paged-prepare.js';
import {roundEven} from './pixel-utils.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
const MiB=1024**2,f=Math.fround,bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
// Overlap is the full backbone receptive field, aligned to the native 32-grid.
// Only convolution is windowed. Normalization, NMS, masks and ranking are global.
export async function extractXfeatPaged(image,{budget,profile,model,limit,regions,excluded,backend,signal,onProgress,storage='auto',coreSize=1024}={}){
 requireValue(model?.data instanceof Uint8Array&&model.sha256===XFEAT_PAGED_MODEL.sha256,'Pinned XFeat local graph required.');requireValue(Number.isInteger(coreSize)&&coreSize>=32&&coreSize%32===0,'XFeat core must align to native scales.');await verifyM3Bytes(model.data,XFEAT_PAGED_MODEL,signal);
 const width=image.width,height=image.height,w=Math.floor(width/32)*32,h=Math.floor(height/32)*32,n=w*h,fw=w/8,fh=h/8,zoneCount=Math.max(1,regions.length),sx=f(width/w),sy=f(height/h),stores=[],workers=[],frees=[],pointers=new Map(),metrics={executions:0,retries:0,failures:[],maximumActualHeapBytes:0,preflightExecutions:0,halo:256,coreSize};let m,maskModule,maskPointer,polyPointer,gray,heat,dense,returned=false,freeResult,heapReserved=0,live=0,pages;
 const account=n=>{const free=budget.reserve(n);frees.push(free);return free;};
 const heapRoom=need=>{const want=Math.min(2048*MiB,Math.ceil((need*1.5+32*MiB)/(16*MiB))*16*MiB);if(want>heapReserved){account(want-heapReserved);heapReserved=want;}};
 const alloc=size=>{heapRoom(live+size);const p=m._malloc(Math.max(size,8));if(!p)throw new EngineError('MEMORY_LIMIT','Global XFeat postprocessing does not fit the admitted WASM address space.');live+=size;pointers.set(p,size);return p;},free=p=>{if(pointers.has(p)){live-=pointers.get(p);m._free(p);pointers.delete(p);}};
 const stop=()=>{for(const rec of workers){rec.worker?.terminate();rec.worker=null;rec.reject?.(new EngineError('CANCELLED','XFeat window work stopped.'));rec.reject=null;}};signal?.addEventListener('abort',stop,{once:true});
 try{
  heapRoom(width*6+w*4);m=await createPost({wasmBinary:await fetchM3Asset(new URL('../vendor/xfeat-paged/post.wasm',import.meta.url),XFEAT_PAGED_POST,signal),wasmMemory:new WebAssembly.Memory({initial:256,maximum:32768})});
  const maskHeapBytes=Math.ceil((width*height*2+32*MiB)/65536)*65536;account(maskHeapBytes+model.data.byteLength*3+8*MiB);const {default:createMasks}=await import('../vendor/sparse-extract/sparse-extract.js');maskModule=await createMasks({wasmBinary:boundWasmMemory(await fetchM3Asset(new URL('../vendor/sparse-extract/sparse-extract.wasm',import.meta.url),SPARSE_EXTRACT_WASM,signal),maskHeapBytes),print(){},printErr(){}});
  maskPointer=maskModule._malloc(width*height);polyPointer=maskModule._malloc(Math.max(1,...[...regions,...excluded].map(p=>p.length))*8);if(!maskPointer||!polyPointer)throw new EngineError('MEMORY_LIMIT','XFeat native mask allocation failed.');
  const draw=(polys,value)=>{for(const polygon of polys){maskModule.HEAPU8.set(bytes(Int32Array.from(polygon.flat(),roundEven)),polyPointer);if(!maskModule._sparse_polygon(maskPointer,width,height,polyPointer,polygon.length,value))throw Error('Native mask rasterization failed');}};
  maskModule.HEAPU8.fill(regions.length?0:255,maskPointer,maskPointer+width*height);draw(regions,255);draw(excluded,0);
  let provider=backend==='cpu'?'wasm':backend==='webgpu'||globalThis.navigator?.gpu?'webgpu':'wasm';
  const tiles=[];for(let y=0;y<h;y+=coreSize)for(let x=0;x<w;x+=coreSize)tiles.push({x,y,cw:Math.min(coreSize,w-x),ch:Math.min(coreSize,h-y),x0:Math.max(0,x-256),y0:Math.max(0,y-256),x1:Math.min(w,x+coreSize+256),y1:Math.min(h,y+coreSize+256)});
  const tileN=Math.min(w,coreSize+512)*Math.min(h,coreSize+512),roundHeap=b=>Math.min(2048*MiB,Math.ceil(b/(64*MiB))*64*MiB),defaultHeap=p=>roundHeap(128*MiB+tileN*(p==='wasm'?320:64)),cost=(p,heap)=>heap+64*MiB+tileN*24+(p==='webgpu'?tileN*384+64*MiB:0);
  const workerCount=Math.min(profile.maxWorkers,tiles.length);for(let i=0;i<workerCount;i++){
   let heap=defaultHeap(provider),release;try{release=budget.reserve(cost(provider,heap));}catch(error){if(workers.length)break;if(provider==='webgpu'&&backend==='auto'){metrics.failures.push({provider,stage:'admission',code:error.code});provider='wasm';heap=defaultHeap(provider);release=budget.reserve(cost(provider,heap));}else throw error;}
   workers.push({provider,heap,release,worker:null,reject:null,initialized:false});
  }
  metrics.workers=workers.length;metrics.workerAdmittedBytes=workers.reduce((a,r)=>a+cost(r.provider,r.heap),0);
  const make=async length=>{const s=await createSegmentedBytes(length,{budget,storage,temporarySession:image.temporarySession,getTemporarySession:image.getTemporarySession,signal});stores.push(s);return s;};
  // Reserve inference first; segmented stores spill instead of taking its room.
  account(n/16+Math.min(w*64,n)*16+fw*64*4*4+width*3*65);gray=await make(n*4);heat=await make(n*4);dense=await make(n*4);const reliability=new Float32Array(n/64);
  const prep=await prepareXfeatRows(researchRows(image),gray,m,{signal,onProgress:e=>onProgress?.({...e,fraction:e.fraction*.12})});metrics.preparation=prep;metrics.storage={gray:gray.storage,heat:heat.storage,dense:dense.storage,bytes:n*12};let next=0,done=0;
  async function execute(rec,tile){
   for(;;){checkAbort(signal);const tw=tile.x1-tile.x0,th=tile.y1-tile.y0,input=new Float32Array(tw*th);
    for(let yy=0;yy<th;yy++)await gray.readInto(bytes(input.subarray(yy*tw,(yy+1)*tw)),((tile.y0+yy)*w+tile.x0)*4);for(let i=0;i<input.length;i++)input[i]=f(f(input[i]-prep.mean)*prep.inverseStd);metrics.executions++;
    try{
     if(!rec.worker){rec.worker=new Worker(new URL('./xfeat-paged-worker.js',import.meta.url),{type:'module'});rec.initialized=false;}
     const output=await new Promise((resolve,reject)=>{rec.reject=reject;rec.worker.onmessage=({data})=>{rec.reject=null;data.error?reject(new EngineError(data.error,data.message)):resolve(data);};rec.worker.onerror=e=>{rec.reject=null;reject(new EngineError('WORKER_FAILED',e.message||'XFeat worker failed.'));};rec.worker.postMessage({input,width:tw,height:th,core:[tile.x-tile.x0,tile.y-tile.y0,tile.cw,tile.ch],...(!rec.initialized?{model:model.data,provider:rec.provider,maximumHeapBytes:rec.heap,threads:Math.max(1,Math.floor(profile.maxWorkers/workers.length))}:{})},[input.buffer]);});rec.initialized=true;
     checkAbort(signal);metrics.maximumActualHeapBytes=Math.max(metrics.maximumActualHeapBytes,output.actualHeapBytes);
     for(let yy=0;yy<tile.ch;yy++)await heat.write(bytes(output.heat.subarray(yy*tile.cw,(yy+1)*tile.cw)),((tile.y+yy)*w+tile.x)*4);
     for(let yy=0;yy<tile.ch/8;yy++){const at=((tile.y/8+yy)*fw+tile.x/8);await dense.write(bytes(output.dense.subarray(yy*tile.cw*8,(yy+1)*tile.cw*8)),at*256);reliability.set(output.reliability.subarray(yy*tile.cw/8,(yy+1)*tile.cw/8),at);}
     done++;onProgress?.({phase:'learned-windows',fraction:.12+.68*done/tiles.length,completed:done,total:tiles.length});return;
    }catch(error){checkAbort(signal);rec.worker?.terminate();rec.worker=null;metrics.failures.push({provider:rec.provider,stage:'useful-work',code:error.code});let changed=false;
     if(rec.provider==='webgpu'&&backend==='auto'&&['MEMORY_LIMIT','LEARNED_INFERENCE_FAILED','WORKER_FAILED'].includes(error.code)){rec.provider='wasm';rec.heap=defaultHeap('wasm');changed=true;}else if(error.code==='MEMORY_LIMIT'&&rec.heap<2048*MiB){rec.heap=Math.min(rec.heap*2,2048*MiB);changed=true;}
     if(!changed)throw error;rec.release();rec.release=()=>{};rec.release=budget.reserve(cost(rec.provider,rec.heap));metrics.retries++;
    }
   }
  }
  const completed=new Set();
  for(;;){
   let pressure=false;
   const work=await Promise.allSettled(workers.map(async rec=>{while(next<tiles.length&&!pressure){const index=next++;if(completed.has(index))continue;try{await execute(rec,tiles[index]);completed.add(index);}catch(error){pressure=true;throw error;}}}));
   const failed=work.find(r=>r.status==='rejected');if(!failed)break;checkAbort(signal);
   if(failed.reason.code!=='MEMORY_LIMIT'||workers.length===1)throw failed.reason;
   // Preserve completed cores. Retire concurrency only after pressure from real
   // work, then retry the unfinished cores with the enlarged admitted heap.
   stop();for(const r of workers){r.release();r.release=()=>{};}
   const provider=workers.some(r=>r.provider==='wasm')?'wasm':'webgpu',heap=Math.max(defaultHeap(provider),...workers.map(r=>r.heap));workers.splice(0,workers.length,{provider,heap,release:budget.reserve(cost(provider,heap)),worker:null,reject:null,initialized:false});
   metrics.concurrencyReductions=(metrics.concurrencyReductions??0)+1;metrics.retries++;next=0;
  }
  metrics.finalWorkers=workers.length;
  stop();for(const r of workers){r.release();r.release=()=>{};}await gray.dispose();gray=null;
  const rp=alloc(reliability.byteLength);m.HEAPF32.set(reliability,rp/4);const hp=alloc(w*Math.min(h,68)*4),op=alloc(w*Math.min(h,64)*12);pages=new TypedPages(Float32Array,3,account);let stamp=performance.now();
  for(let y=0;y<h;y+=64){checkAbort(signal);const first=Math.max(0,y-2),last=Math.min(h,y+66),rows=Math.min(64,h-y);await heat.readInto(m.HEAPU8.subarray(hp,hp+(last-first)*w*4),first*w*4);const count=m._xfeat_candidates(hp,first,w,h,y,rows,rp,op);
   for(let i=0;i<count;i++){const at=op/4+i*3,x=m.HEAPF32[at],yy=m.HEAPF32[at+1],ox=Math.min(width-1,Math.max(0,roundEven(f(x*sx)))),oy=Math.min(height-1,Math.max(0,roundEven(f(yy*sy))));pages.push(x,yy,maskModule.HEAPU8[maskPointer+oy*width+ox]?m.HEAPF32[at+2]:-1);}
   if(performance.now()-stamp>8){onProgress?.({phase:'learned-global-nms',fraction:.8+.1*(y+rows)/h});await controlCheckpoint(signal);stamp=performance.now();}
  }
  await heat.dispose();heat=null;free(hp);free(op);free(rp);metrics.globalCandidates=pages.length;
  const cp=alloc(pages.length*12),orderp=alloc(limit*4);for(const p of pages.pages)m.HEAPF32.set(p.data.subarray(0,p.used*3),cp/4+p.start*3);pages.dispose();
  // Sorting also allocates one global int32 index array inside the native kernel.
  heapRoom(live+pages.length*4);const rankedCount=m._xfeat_order(cp,pages.length,limit,orderp);if(rankedCount<0)throw new EngineError('MEMORY_LIMIT','Global XFeat ranking allocation failed.');
  account(rankedCount*128);const selected=Array.from(m.HEAP32.subarray(orderp/4,orderp/4+rankedCount),id=>[m.HEAPF32[cp/4+id*3],m.HEAPF32[cp/4+id*3+1],m.HEAPF32[cp/4+id*3+2]]).filter(row=>row[2]>0).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);const count=selected.length;free(cp);free(orderp);
  freeResult=budget.reserve(count*(56+256+zoneCount));const points=new Float64Array(count*7),descriptors=new Float32Array(count*64),members=new Uint8Array(count*zoneCount),patch=alloc(4096),sample=alloc(256),loc=alloc(8),cache=new Map();
  for(let i=0;i<count;i++){
   const [x,y,score]=selected[i];m._xfeat_sample_location(x,y,w,h,loc);const xx=m.HEAP32[loc/4],yy=m.HEAP32[loc/4+1];for(const key of cache.keys())if(key<yy-1||key>yy+2)cache.delete(key);
   m.HEAPF32.fill(0,patch/4,patch/4+1024);for(let dy=0;dy<4;dy++){const py=yy-1+dy;if(py<0||py>=fh)continue;let row=cache.get(py);if(!row){row=new Float32Array(fw*64);await dense.readInto(bytes(row),py*fw*256);cache.set(py,row);}for(let dx=0;dx<4;dx++){const px=xx-1+dx;if(px>=0&&px<fw)m.HEAPF32.set(row.subarray(px*64,(px+1)*64),patch/4+(dy*4+dx)*64);}}
   m._xfeat_sample(patch,x,y,w,h,sample);descriptors.set(m.HEAPF32.subarray(sample/4,sample/4+64),i*64);points.set([f(x*sx),f(y*sy),8,-1,score,0,-1],i*7);
   if(performance.now()-stamp>8){await controlCheckpoint(signal);stamp=performance.now();onProgress?.({phase:'learned-global-descriptors',fraction:.9+.09*(i+1)/count});}
  }
  if(!regions.length)members.fill(1);else for(let z=0;z<zoneCount;z++){await controlCheckpoint(signal);maskModule.HEAPU8.fill(0,maskPointer,maskPointer+width*height);draw([regions[z]],255);for(let i=0;i<count;i++){const x=Math.max(0,Math.min(width-1,roundEven(points[i*7]))),y=Math.max(0,Math.min(height-1,roundEven(points[i*7+1])));members[i*zoneCount+z]=+(maskModule.HEAPU8[maskPointer+y*width+x]>0);}}
  checkAbort(signal);returned=true;return {points,descriptors,members,zoneCount,descriptorSize:64,totalFeatures:count,metadata:{family:'XFeat',provider:workers.some(r=>r.provider==='webgpu')?'webgpu':'wasm',execution:'global-normalization-paged-backbone-global-selection',...metrics,postHeapBytes:m.HEAPU8.byteLength,maskHeapBytes:maskModule.HEAPU8.byteLength},release:freeResult};
 }finally{stop();signal?.removeEventListener('abort',stop);for(const r of workers)r.release();pages?.dispose();for(const p of pointers.keys())m._free(p);if(maskPointer)maskModule._free(maskPointer);if(polyPointer)maskModule._free(polyPointer);for(const s of stores)await s.dispose();frees.forEach(f=>f());if(!returned)freeResult?.();}
}
