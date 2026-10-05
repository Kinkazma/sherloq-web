import "../../runtime-context.js?v=0.14.5";
import {wasmAllocationFailure,copyTypedArray} from './allocation.js';
import {sparseExtractionFailure} from './sparse-extract-errors.js';
import {serializeEngineError} from './errors.js';
import {boundWasmMemory} from './wasm-memory-limit.js';
import {selectUniqueSift} from './sift-regions.js';
import {roundEven} from './pixel-utils.js';
let module,maximumHeapBytes;
self.onmessage=async({data})=>{
 let imagePointer=0,maskPointer=0,polygonPointer=0;
 try{
  if(data.kind==='init'){
   maximumHeapBytes=data.maximumHeapBytes;const {default:create}=await import('../vendor/sparse-extract/sparse-extract.js');module=await create({wasmBinary:boundWasmMemory(data.wasm,data.maximumHeapBytes),print(){},printErr(){}});postMessage({ready:true});return;
  }
  const {image,regions,excluded,family,limit,zoneCount,independentZone}=data,n=image.width*image.height;
  const allocate=bytes=>{const p=module._malloc(Math.max(8,bytes));if(!p)throw wasmAllocationFailure(module,'WASM memory allocation failed',Math.max(8,bytes));return p;};
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
  if(family===4){const unique=await selectUniqueSift(points,descriptors,limit,{reserveMemory(){}});points=unique.points;descriptors=unique.descriptors;}
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
  postMessage({points,descriptors,members,descriptorSize,totalFeatures,heapBytes:module.HEAPU8.buffer.byteLength},[points.buffer,descriptors.buffer,members.buffer]);
 }catch(error){error.details={...error.details,stage:data.kind,family:data.family,width:data.image?.width,height:data.image?.height,limit:data.limit,maximumHeapBytes};postMessage({error:serializeEngineError(error,'FEATURE_EXTRACTION_FAILED')});}
 finally{if(module){module._sparse_release();for(const p of [imagePointer,maskPointer,polygonPointer])if(p)module._free(p);}}
};
