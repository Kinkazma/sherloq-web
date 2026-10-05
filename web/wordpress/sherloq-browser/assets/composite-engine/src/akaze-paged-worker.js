import "../../runtime-context.js?v=0.14.5";
import createFast from '../vendor/akaze-paged/akaze-paged.js';
import {boundWasmMemory} from './wasm-memory-limit.js';
import {roundEven} from './pixel-utils.js';
let m,config;
self.onmessage=async({data:job})=>{
 const pointers=[],alloc=n=>{const p=m._malloc(Math.max(8,n));if(!p)throw Error('AKAZE memory allocation failed');pointers.push(p);return p;},put=a=>{const p=alloc(a.byteLength);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;},floats=(p,n)=>m.HEAPF32.slice(p/4,p/4+n),ok=v=>{if(v!==1)throw Error('AKAZE native stage failed');},core=field=>{const [x,y,w,h]=job.core,out=new Float32Array(w*h),p=m._m3_akaze_plane(field)/4;for(let yy=0;yy<h;yy++)out.set(m.HEAPF32.subarray(p+(y+yy)*job.width+x,p+(y+yy)*job.width+x+w),yy*w);return out;};
 try{
  if(job.kind==='init'){const create=job.reference?(await import('../vendor/akaze-paged/reference.js')).default:createFast;m=await create({wasmBinary:boundWasmMemory(job.wasm,job.maximumHeapBytes),print(){},printErr(){}});const count=m._m3_akaze_init(job.width,job.height);if(count<=0)throw Error('AKAZE global configuration');config=floats(m._m3_akaze_config(),count*10);postMessage({config,heapBytes:m.HEAPU8.byteLength});return;}
  let result;
  if(job.kind==='prepare'){ok(m._m3_akaze_prepare(put(job.input),job.width,job.height));result={base:core(0),magnitude:core(1)};}
  else if(job.kind==='histogram'){const p=put(job.input),hp=alloc(1200);m.HEAP32.fill(0,hp/4,hp/4+300);m._m3_akaze_histogram(p,job.input.length,job.maximum,hp);result={histogram:m.HEAP32.slice(hp/4,hp/4+300)};}
  else if(job.kind==='contrast'){result={contrast:m._m3_akaze_contrast(put(job.histogram),job.count,job.maximum)};}
  else if(job.kind==='evolve'){ok(m._m3_akaze_evolve(put(job.input),job.width,job.height,job.level,job.contrast));result={lt:core(0),smooth:core(1),det:core(2)};}
  else if(job.kind==='resize'){ok(m._m3_akaze_resize_rows(put(job.input),job.width,job.rows,job.fullHeight,job.sourceY,job.targetWidth,job.targetHeight,job.targetY,job.count));result={base:floats(m._m3_akaze_plane(0),job.targetWidth*job.count)};}
  else if(job.kind==='same'){const dp=put(job.det),mp=put(job.mask);ok(m._m3_akaze_same(dp,mp,job.width,job.rows,job.originY,job.fullHeight,job.level,job.startY,job.count));result={mask:m.HEAPU8.slice(mp,mp+job.mask.length)};}
  else if(job.kind==='cross'){const dp=put(job.det),mp=put(job.mask),td=put(job.targetDet),tm=put(job.targetMask);ok(m._m3_akaze_cross(dp,mp,job.width,job.rows,job.originY,td,tm,job.targetWidth,job.targetRows,job.targetY,job.level,job.direction,job.startY,job.count));result={mask:m.HEAPU8.slice(tm,tm+job.targetMask.length)};}
  else if(job.kind==='refine'){const n=m._m3_akaze_refine(put(job.det),put(job.mask),job.width,job.rows,job.originY,job.level,job.startY,job.count);if(n<0)throw Error('AKAZE refinement');result={points:floats(m._m3_akaze_points(),n*7)};}
  else if(job.kind==='select'){
   const {width,height,regions=[],excluded=[],zoneCount=1}=job,n=width*height,mp=alloc(n),poly=alloc(Math.max(1,...[...regions,...excluded].map(p=>p.length))*8),raw=put(job.points),draw=(polygons,value)=>{for(const polygon of polygons){m.HEAP32.set(Int32Array.from(polygon.flat(),roundEven),poly/4);ok(m._m3_akaze_polygon(mp,width,height,poly,polygon.length,value));}};
   if(job.mask)m.HEAPU8.set(job.mask,mp);else{m.HEAPU8.fill(regions.length?0:255,mp,mp+n);draw(regions,255);draw(excluded,0);}
   const count=m._m3_akaze_select(raw,job.points.length/7,mp,width,height,job.limit??0,+!job.historical);if(count<0)throw Error('AKAZE selection');const points=floats(m._m3_akaze_points(),count*7),members=new Uint8Array(count*zoneCount),totalFeatures=m._m3_akaze_selected_total();
   if(!regions.length)members.fill(1);else for(let z=0;z<zoneCount;z++){m.HEAPU8.fill(0,mp,mp+n);draw([regions[z]],255);for(let i=0;i<count;i++){const x=Math.max(0,Math.min(width-1,roundEven(points[i*7]))),y=Math.max(0,Math.min(height-1,roundEven(points[i*7+1])));members[i*zoneCount+z]=+(m.HEAPU8[mp+y*width+x]>0);}}
   result={points,members,totalFeatures};
  }else if(job.kind==='describe'){
   const smooth=put(job.smooth);ok(m._m3_akaze_gradients(smooth,job.width,job.height,job.level));const lx=m._m3_akaze_plane(0),ly=m._m3_akaze_plane(1),lt=put(job.lt),points=put(job.points),count=job.points.length/7;
   if(m._m3_akaze_describe(lt,lx,ly,job.width,job.height,job.originX,job.originY,job.level,points,count)!==count)throw Error('AKAZE descriptor support');const dp=m._m3_akaze_descriptors();result={points:floats(m._m3_akaze_points(),count*7),descriptors:m.HEAPU8.slice(dp,dp+count*61)};
  }else throw Error('Unknown AKAZE stage');
  result.heapBytes=m.HEAPU8.byteLength;postMessage(result,Object.values(result).filter(ArrayBuffer.isView).map(a=>a.buffer));
 }catch(error){postMessage({error:/memory|alloc|OOM|maximum|out of bounds/i.test(String(error))?'MEMORY_LIMIT':'FEATURE_EXTRACTION_FAILED',message:String(error?.message??error)});}
 finally{if(m){m._m3_akaze_release();for(const p of pointers)m._free(p);}}
};
