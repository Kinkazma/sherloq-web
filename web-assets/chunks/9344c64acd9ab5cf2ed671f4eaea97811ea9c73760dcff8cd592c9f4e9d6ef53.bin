import "../../runtime-context.js?v=0.14.5";
import {LEARNED_PREPARE_WASM} from './learned-prepare-assets.js';
import {fetchM3Asset} from './m3-asset.js';
import {roundEven} from './pixel-utils.js';
const f=Math.fround;
export function alikedShape(width,height){const aspect=width/height;return aspect<1?[Math.trunc(1024*aspect),1024]:[1024,Math.trunc(1024/aspect)];}
// The descriptor head operates independently per keypoint. Batching keeps its
// gathers bounded without changing feature maps, NMS or the detector's 20k cap.
export async function runAliked(ort,job,mask,membership){
 const {image,model,provider,limit}=job,[w,h]=alikedShape(image.width,image.height),n=w*h,sx=f(w/image.width),sy=f(h/image.height),owned=[],sessions=[],pointers=[];
 const {default:create}=await import('../vendor/learned-prepare/prepare.js');const wasm=await fetchM3Asset(new URL('../vendor/learned-prepare/prepare.wasm',import.meta.url),LEARNED_PREPARE_WASM);
 const prepare=await create({wasmBinary:wasm,wasmMemory:new WebAssembly.Memory({initial:256,maximum:job.prepareHeapBytes/65536})});
 const alloc=bytes=>{const p=prepare._malloc(Math.max(bytes,8));if(!p)throw Error('ALIKED preparation memory allocation failed');pointers.push(p);return p;},keep=o=>{owned.push(...Object.values(o));return o;};
 const tensor=(...args)=>{const t=new ort.Tensor(...args);owned.push(t);return t;};
 const createSession=async name=>{const options={executionProviders:[provider],graphOptimizationLevel:'all'};if(name==='dense'&&provider==='webgpu')options.preferredOutputLocation={features:'gpu-buffer',scores:'cpu'};const s=await ort.InferenceSession.create(model[name],options);sessions.push(s);return s;};
 try{
  let prepared=job.prepared;if(!prepared){const ip=alloc(image.data.length),op=alloc(n*12);prepare.HEAPU8.set(image.data,ip);const status=prepare._learned_prepare(ip,image.width,image.height,w,h,op);if(status!==1)throw Error(status===-2?'ALIKED memory allocation failed':'ALIKED native preparation failed');prepared=prepare.HEAPF32.slice(op/4,op/4+n*3);}
  const denseSession=await createSession('dense'),dense=keep(await denseSession.run({image:tensor('float32',prepared,[1,3,h,w])}));postMessage({progress:{phase:'learned-encoder',fraction:.55}});
  const detect=await createSession('detect'),det=keep(await detect.run({scores:dense.scores}));const mp=alloc(n),sp=alloc(n*4),np=alloc(n*4),idsPointer=alloc(80000);
  for(let y=0;y<h;y++){const yy=Math.max(0,Math.min(image.height-1,roundEven((y+.5)/sy-.5)));for(let x=0;x<w;x++){const xx=Math.max(0,Math.min(image.width-1,roundEven((x+.5)/sx-.5)));prepare.HEAPU8[mp+y*w+x]=mask[yy*image.width+xx];}}
  prepare.HEAPF32.set(dense.scores.data,sp/4);prepare.HEAPF32.set(det.nms.data,np/4);const count=prepare._aliked_select(sp,np,mp,w,h,det.mean.data[0],idsPointer);if(count<0)throw Error(count===-2?'ALIKED memory allocation failed':'ALIKED NMS selection failed');
  if(!count)return {points:new Float64Array(),descriptors:new Float32Array(),members:new Uint8Array(),descriptorSize:128,totalFeatures:0,zoneCount:Math.max(1,job.regions.length)};
  const indices=tensor('int64',BigInt64Array.from(prepare.HEAP32.subarray(idsPointer/4,idsPointer/4+count),BigInt),[count]),localize=await createSession('localize'),local=keep(await localize.run({scores:dense.scores,indices})),keys=local.keypoints.data,scores=local.confidence.data,points=new Float64Array(count*7);
  for(let i=0;i<count;i++){const x=f(f((w-1)*f(keys[i*2]+1))/2),y=f(f((h-1)*f(keys[i*2+1]+1))/2);points.set([(x+.5)/sx-.5,(y+.5)/sy-.5,8,-1,scores[i],0,-1],i*7);}
  const members=membership(points),zoneCount=Math.max(1,job.regions.length),eligible=[];
  for(let i=0;i<count;i++){const x=Math.max(0,Math.min(image.width-1,roundEven(points[i*7]))),y=Math.max(0,Math.min(image.height-1,roundEven(points[i*7+1])));if(members.subarray(i*zoneCount,(i+1)*zoneCount).some(Boolean)&&mask[y*image.width+x])eligible.push(i);}
  const totalFeatures=eligible.length,selected=eligible.sort((a,b)=>scores[b]-scores[a]||a-b).slice(0,limit).sort((a,b)=>points[a*7+1]-points[b*7+1]||points[a*7]-points[b*7]||a-b);
  const packed=new Float64Array(selected.length*7),desc=new Float32Array(selected.length*128),member=new Uint8Array(selected.length*zoneCount),describe=selected.length?await createSession('describe'):null;
  for(let lo=0;lo<selected.length;lo+=512){const block=selected.slice(lo,lo+512),input=new ort.Tensor('float32',Float32Array.from(block.flatMap(i=>[keys[i*2],keys[i*2+1]])),[block.length,2]);let output;try{output=await describe.run({features:dense.features,keypoints:input});desc.set(output.descriptors.data,lo*128);}finally{input.dispose();for(const t of Object.values(output??{}))t.dispose();}postMessage({progress:{phase:'learned-descriptors',fraction:.6+.3*Math.min(1,(lo+512)/selected.length)}});}
  selected.forEach((id,i)=>{packed.set(points.subarray(id*7,id*7+7),i*7);member.set(members.subarray(id*zoneCount,(id+1)*zoneCount),i*zoneCount);});
  return {points:packed,descriptors:desc,members:member,descriptorSize:128,totalFeatures,zoneCount};
 }finally{for(const t of owned)t.dispose();for(const s of sessions)await s.release();for(const p of pointers)prepare._free(p);}
}
