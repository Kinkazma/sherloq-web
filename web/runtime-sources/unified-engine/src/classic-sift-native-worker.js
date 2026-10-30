import "../../runtime-context.js?v=0.30.0";
import {wasmAllocationFailure,copyTypedArray} from './allocation.js';
import {sparseExtractionFailure} from './sparse-extract-errors.js';
import {EngineError,requireValue,checkAbort,serializeEngineError} from './errors.js';
import {boundWasmMemory} from './wasm-memory-limit.js';
import {selectUniqueSift} from './sift-regions.js';
import {roundEven} from './pixel-utils.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {classicSiftRetireAll,attachClassicSiftCleanup} from './classic-sift-retirement.js';
// The classical worker publishes only after all native pointers acknowledge
// release. Other sparse families continue using sparse-extract-worker.js.
let module,maximumHeapBytes,active,controller,closing=false;const nativePointers=new Set();
async function retireNative(){if(module)await classicSiftRetireAll([()=>module._sparse_release(),...[...nativePointers].map(p=>()=>{module._free(p);nativePointers.delete(p);})]);}
async function run(data){let imagePointer=0,maskPointer=0,polygonPointer=0,result,failed=false,primary;controller=new AbortController();
 try{
  if(data.kind==='init'){
   maximumHeapBytes=data.maximumHeapBytes;module=null;let arithmetic='scalar-reference',precisionFallback=null;
   if(data.optimizedWasm instanceof Uint8Array&&WebAssembly.validate(data.optimizedWasm)){
    try{const {default:create}=await import('../vendor/sparse-extract-simd/sparse-extract.js');module=await create({wasmBinary:boundWasmMemory(data.optimizedWasm,data.maximumHeapBytes),print(){},printErr(){}});
     const differences=module._sparse_fma_qualify();if(differences!==0||module._sparse_fma_enabled()!==1){module=null;precisionFallback={code:'SIMD_FMA_QUALIFICATION',message:'Original scalar feature extraction retained',differences};}else arithmetic='exact-f32-fused-simd-qualified';
    }catch(error){module=null;precisionFallback={code:'SIMD_UNAVAILABLE',message:'Original scalar feature extraction retained'};}
   }
   if(!module){const {default:create}=await import('../vendor/sparse-extract/sparse-extract.js');module=await create({wasmBinary:boundWasmMemory(data.wasm,data.maximumHeapBytes),print(){},printErr(){}});}
   result={ready:true,arithmetic,precisionFallback,heapBytes:module.HEAPU8.byteLength};
  }else{
   requireValue(data.kind==='extract'&&(data.family===0||data.family===4),'Invalid classical SIFT native command');checkAbort(controller.signal);
  const {image,regions,excluded,family,limit,zoneCount,independentZone}=data,n=image.width*image.height;
  const allocate=bytes=>{const p=module._malloc(Math.max(8,bytes));if(!p)throw wasmAllocationFailure(module,'WASM memory allocation failed',Math.max(8,bytes));nativePointers.add(p);return p;};
  imagePointer=allocate(image.data.length);module.HEAPU8.set(image.data,imagePointer);
  const maxVertices=[...regions,...excluded].reduce((n,p)=>Math.max(n,p.length),0);
  if(regions.length||excluded.length){maskPointer=allocate(n);polygonPointer=allocate(maxVertices*8);}
  const draw=(polygons,value)=>{for(const polygon of polygons){const xy=Int32Array.from(polygon.flat(),roundEven);module.HEAPU8.set(new Uint8Array(xy.buffer),polygonPointer);if(!module._sparse_polygon(maskPointer,image.width,image.height,polygonPointer,polygon.length,value))throw Error('Polygon rasterization failed');}};
  if(maskPointer){module.HEAPU8.fill(regions.length?0:255,maskPointer,maskPointer+n);draw(regions,255);draw(excluded,0);}
  const total=module._sparse_extract(imagePointer,maskPointer,image.width,image.height,limit,family,+!!image.grayscale);
  if(total<0)throw sparseExtractionFailure(total,module,{family,width:image.width,height:image.height,limit,maximumHeapBytes});
  let points=Float64Array.from(module.HEAPF32.subarray(module._sparse_points()/4,module._sparse_points()/4+total*7));
  const binary=family>=1&&family<=3,descriptorSize=module._sparse_descriptor_size()||[128,61,64,32,128,128][family],ptr=module._sparse_descriptors();
  let descriptors=binary?copyTypedArray(module.HEAPU8.subarray(ptr,ptr+total*descriptorSize),{label:'sparse-extract-worker-output'}):copyTypedArray(module.HEAPF32.subarray(ptr/4,ptr/4+total*descriptorSize),{label:'sparse-extract-worker-output'});
  const totalFeatures=module._sparse_total_features();module._sparse_release();
  if(family===4){const unique=await selectUniqueSift(points,descriptors,limit,{reserveMemory(){},signal:controller.signal});points=unique.points;descriptors=unique.descriptors;}
  else if(family!==5){
   const ids=Array.from({length:total},(_,i)=>i).sort((a,b)=>points[b*7+4]-points[a*7+4]||a-b).slice(0,limit),selected=new Float64Array(ids.length*7),desc=new (binary?Uint8Array:Float32Array)(ids.length*descriptorSize);
   ids.forEach((id,i)=>{selected.set(points.subarray(id*7,id*7+7),i*7);desc.set(descriptors.subarray(id*descriptorSize,(id+1)*descriptorSize),i*descriptorSize);});points=selected;descriptors=desc;
  }
  const members=new Uint8Array(points.length/7*zoneCount);
  if(independentZone!==null){for(let i=0;i<points.length/7;i++)members[i*zoneCount+independentZone]=1;}
  else if(!regions.length)members.fill(1);
  else for(let zone=0;zone<zoneCount;zone++){
   module.HEAPU8.fill(0,maskPointer,maskPointer+n);draw([regions[zone]],255);
   for(let i=0;i<points.length/7;i++){const x=Math.max(0,Math.min(image.width-1,roundEven(points[i*7]))),y=Math.max(0,Math.min(image.height-1,roundEven(points[i*7+1])));members[i*zoneCount+zone]=+(module.HEAPU8[maskPointer+y*image.width+x]>0);}
  }
   result={points,descriptors,members,descriptorSize,totalFeatures,heapBytes:module.HEAPU8.buffer.byteLength};
  }
  checkAbort(controller.signal);
 }catch(error){failed=true;primary=error;}
 let retired=true;try{await retireNative();}catch(cleanup){retired=false;if(failed)attachClassicSiftCleanup(primary,cleanup);else{failed=true;primary=cleanup;}}
 if(!failed)try{checkAbort(controller.signal);}catch(error){failed=true;primary=error;}
 if(failed)postMessage({requestId:data.requestId,retired,error:serializeEngineError(primary,'FEATURE_EXTRACTION_FAILED')});
 else{const transfer=[...new Set(Object.values(result).filter(ArrayBuffer.isView).map(a=>a.buffer))];postMessage({requestId:data.requestId,retired,...result},transfer);}
}
installWorkerMessageProtocol(self,async data=>{
 if(data.kind==='cancel'){if(active&&data.requestId===active.id)controller?.abort();return;}
 if(data.kind==='shutdown'){closing=true;controller?.abort();await active?.promise;try{await retireNative();module=null;postMessage({shutdownAck:data.token,retired:true});}catch(error){postMessage({shutdownAck:data.token,error:serializeEngineError(error,'FEATURE_EXTRACTION_FAILED')});}return;}
 requireValue(!closing&&!active&&Number.isSafeInteger(data.requestId)&&data.requestId>0,'Concurrent or invalid SIFT native request');const entry={id:data.requestId,promise:null};active=entry;entry.promise=run(data);try{await entry.promise;}finally{if(active===entry)active=null;controller=null;}
},{label:'classic-sift-native-worker',onFailure:error=>postMessage({protocolError:serializeEngineError(error,'FEATURE_EXTRACTION_FAILED')})});
