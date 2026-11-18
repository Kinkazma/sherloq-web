import "../../runtime-context.js?v=0.33.2";
import {requireValue} from './errors.js';
import {NATIVE16_NLM_LAYOUT,SEPARATION_HEAP_BYTES} from './separation-math.js';
const pair=Object.freeze(['horizontal','main']),single=Object.freeze(['main']);
/** Shared actual filter extents; no pixels, tables, device or reservation. */
export function native16SeparationFilterPlan(p){
 requireValue(p&&[0,1,2,3,4].includes(p.mode)&&Number.isInteger(p.radius)&&p.radius>=1&&p.radius<=(p.mode===1?25:10)&&typeof p.grayscale==='boolean','Invalid native16 separation filter plan.');
 if(p.mode===3)requireValue(Number.isInteger(p.sigma)&&p.sigma>=1&&p.sigma<=200,'Invalid native16 bilateral sigma.');
 const channels=p.grayscale?1:3,k=2*p.radius+1;
 if(p.mode===4){
  const countL=Math.floor(65025/(64/49)+1),countAB=p.grayscale?0:Math.floor(130050/(64/49)+1),packedPixelBytes=p.grayscale?8:16;
  return{passes:single,channels,taps:countL,countL,countAB,tableBytes:(countL+countAB)*4,packedPixelBytes,outputPackedPixelBytes:packedPixelBytes,coefficientCount:0,nativeTapsBytes:0,nativeSpatialBytes:0,nativeColorBytes:0,needsHorizontal:false,halo:13,workgroupSize:[8,8],workgroupStorageBytes:308*(p.grayscale?8:16)};
 }
 let taps=0;if(p.mode===3)for(let y=-p.radius;y<=p.radius;y++)for(let x=-p.radius;x<=p.radius;x++)if(Math.sqrt(x*x+y*y)<=p.radius)taps++;
 const colorCount=p.mode===3?channels*65536:0,tableBytes=p.mode===1?k*4:p.mode===3?(taps*4+colorCount)*4:4;
 return{passes:p.mode===1||p.mode===2?pair:single,channels,taps,colorCount,tableBytes,coefficientCount:p.mode===1?k:0,nativeTapsBytes:p.mode===3?k*k*8:0,nativeSpatialBytes:p.mode===3?k*k*4:0,nativeColorBytes:colorCount*4,needsHorizontal:p.mode===1||p.mode===2};
}

// Same staging used by the single existing prepare actor. Its fixed64MiB is
// charged once by the owner; these are internal capacity requirements only.
export function native16NlmGpuHeapPlan(w,h,rows,grayscale){
 requireValue([w,h,rows].every(Number.isSafeInteger)&&w>0&&h>0&&rows>0&&rows<=h&&typeof grayscale==='boolean','Invalid native16 NLM heap geometry');
 const n=w*h,total=w*rows,word=grayscale?8:16,conversion=grayscale?0:24;
 const plan=native16SeparationFilterPlan({mode:4,radius:1,grayscale}),packBytes=n*(6+word+(grayscale?2:conversion)),repairBytes=grayscale?0:n*word+total*word+plan.tableBytes,unpackBytes=total*(word+6+conversion),allocatorAllowanceBytes=NATIVE16_NLM_LAYOUT.baseBytes+NATIVE16_NLM_LAYOUT.mallocSlackBytes;
 const requiredBytes=Math.max(packBytes,repairBytes,unpackBytes)+allocatorAllowanceBytes;
 requireValue(Number.isSafeInteger(requiredBytes),'Unsafe native16 NLM heap extent');
 return{packBytes,repairBytes,unpackBytes,allocatorAllowanceBytes,requiredBytes,heapBytes:SEPARATION_HEAP_BYTES};
}
