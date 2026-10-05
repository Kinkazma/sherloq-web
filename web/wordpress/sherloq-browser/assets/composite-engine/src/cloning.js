import "../../runtime-context.js?v=0.14.5";
import {parameters,gray,rows} from './pixel-utils.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {cloningHeapBytes,cloningImageHeapBound,cloningPagedHeapBound,cloningPointHeapBound,cloningCountHeapBound,cloningDetect,cloningSelect,cloningDescribeBrisk,cloningMatches,cloningNormFunction,cloningRegionCount,cloningRenderer} from './cloning-math.js';
import {cloningGeometry,cloningAngles,cloningAngleStd,cloningGroupIndices,cloningCommand} from './cloning-post.js';

export function cloningParams(input={}){
  const p=parameters(input,{response:90,matching:20,distance:15,minimum:5,showPoints:false,hideLines:false,maskImageId:null},{minimum:[1,20]},{},['showPoints','hideLines']);
  for(const [key,low]of [['response',0],['matching',1],['distance',1]])requireValue(Number.isFinite(p[key])&&p[key]>=low&&p[key]<=100,`Invalid ${key}.`);
  requireValue(p.maskImageId===null||typeof p.maskImageId==='string'&&p.maskImageId.length>0&&p.maskImageId.length<=128&&!p.maskImageId.includes('\0'),'Invalid mask image id.');return p;
}
export const cloningReferences=p=>p.maskImageId?[p.maskImageId]:[];
// The native heap covers staging/drawing inside WASM. Outside it, admit gray
// and optional mask (2N), plus the completed RGB readback (3N). Source leases,
// detected/selected arrays and geometry are admitted by their owners.
export function cloningAdmission(image){return Math.max(0,cloningImageHeapBound(image.width,image.height)-cloningHeapBytes())+image.width*image.height*5+32*1024**2;}
export function cloningAKAZEAdmission(image){return Math.max(0,(cloningUsesPagedAKAZE(image)?cloningPagedHeapBound(image.width,image.height):cloningImageHeapBound(image.width,image.height,'AKAZE'))-cloningHeapBytes())+image.width*image.height*5+32*1024**2;}
const bytes=value=>{if(ArrayBuffer.isView(value))return value.byteLength;if(value===null||typeof value!=='object')return 8;return Object.values(value).reduce((sum,v)=>sum+bytes(v)+32,64);};
const stage=(hooks,low,high)=>({signal:hooks.signal,onProgress:f=>hooks.onProgress?.(low+(high-low)*f)});
export function cloningBRISKAdmission(image){return Math.max(0,cloningImageHeapBound(image.width,image.height,'BRISK')-cloningHeapBytes())+image.width*image.height*5+32*1024**2;}
export const cloningBRISKData=(image,p,hooks,context)=>cloningData(image,p,hooks,context,'BRISK');
export const cloningAKAZEData=(image,p,hooks,context)=>cloningData(image,p,hooks,context,'AKAZE');
export const cloningUsesPagedAKAZE=image=>image.width*image.height*256>512*1024**2;
export async function cloningData(image,p,hooks={},context,algorithm='ORB'){
  const metrics={cloningPreparationMs:0,cloningDetectionMs:0,cloningSelectionMs:0,cloningMatchingMs:0,cloningClusteringMs:0,cloningCountMs:0};
  const account=context.reserveMemory;
  requireValue(typeof account==='function','Copy/move requires shared dynamic memory admission.');
  const paged=algorithm==='AKAZE'&&cloningUsesPagedAKAZE(image)&&context.pagedAkazeExtract;
  let admittedHeap=Math.max(cloningHeapBytes(),paged?cloningPagedHeapBound(image.width,image.height):cloningImageHeapBound(image.width,image.height,algorithm));
  const reserveHeap=size=>{if(size>admittedHeap){account(size-admittedHeap);admittedHeap=size;}};
  const memo=async(name,metric,compute,imageOnly=false)=>{
    const run=async()=>{const start=performance.now(),value=await compute();metrics[metric]+=performance.now()-start;return value;};
    const value=await(imageOnly?context.memoImage(name,run):context.memo(name,run));
    // Retain the active value even if a later admission evicts its cache entry.
    account(bytes(value));return value;
  };
  const grayImage=await memo('gray','cloningPreparationMs',async()=>{
    const output=new Uint8Array(image.width*image.height);
    await rows(image.height,stage(hooks,0,.04),y=>{for(let x=0;x<image.width;x++){const i=(y*image.width+x)*3;output[y*image.width+x]=gray(image.data[i],image.data[i+1],image.data[i+2]);}});return output;
  },true);
  let mask=null;
  if(p.maskImageId){
    const source=context.references[0]?.pixels;requireValue(source&&source.width===image.width&&source.height===image.height,'The detection mask must have the same dimensions as the source.');
    mask=await memo('mask','cloningPreparationMs',async()=>{
      const output=new Uint8Array(image.width*image.height);
      await rows(image.height,stage(hooks,.04,.08),y=>{for(let x=0;x<image.width;x++){const i=(y*image.width+x)*3;output[y*image.width+x]=gray(source.data[i],source.data[i+1],source.data[i+2])>0?1:0;}});return output;
    });
  }
  hooks.onProgress?.(.08);
  const detected=await memo('detected','cloningDetectionMs',async()=>{
    if(algorithm==='AKAZE'&&cloningUsesPagedAKAZE(image)&&context.pagedAkazeExtract){const result=await context.pagedAkazeExtract(grayImage,mask,image.width,image.height,stage(hooks,.08,.2));try{account(result.points.byteLength+result.descriptors.byteLength);return {total:result.totalFeatures,points:result.points,descriptors:result.descriptors,descriptorSize:61,algorithm,pagedMetadata:result.metadata};}finally{result.release();}}
    return cloningDetect(grayImage,mask,image.width,image.height,{signal:hooks.signal,account,algorithm,pointsOnly:algorithm==='BRISK'});
  });hooks.onProgress?.(.2);
  const selected=await memo('selected/'+p.response,'cloningSelectionMs',async()=>{reserveHeap(cloningPointHeapBound(detected.points.length/7));const selected=await cloningSelect(detected,p.response,{signal:hooks.signal,account});return detected.pointsOnly?cloningDescribeBrisk(selected,grayImage,image.width,image.height,{signal:hooks.signal,account}):selected;});hooks.onProgress?.(.25);
  reserveHeap(cloningPointHeapBound(selected.points.length/7,{matching:true,descriptorSize:selected.descriptorSize}));
  const matchKey=p.response+'/'+p.matching+'/'+(context.backend??'cpu'),raw=await memo('matches/'+matchKey,'cloningMatchingMs',()=>cloningMatches(selected.descriptors,p.matching/100*255,{...stage(hooks,.25,.5),account,descriptorSize:selected.descriptorSize,backend:context.backend??'cpu',metrics}));hooks.onProgress?.(.5);
  const geometryKey=matchKey+'/'+p.distance;let geometryComputed=false;
  const geometry=await memo('geometry/'+geometryKey,'cloningClusteringMs',async()=>{geometryComputed=true;return cloningGeometry(selected.points,raw,p.distance/100*Math.min(image.width,image.height)/2,await cloningNormFunction(hooks),{...stage(hooks,.5,.9),account,pool:context.cloningGroupPool});});hooks.onProgress?.(.9);
  const groupMetrics=geometryComputed?(geometry.metrics??{cloningGroupWorkers:1}):{cloningGroupWorkers:0,cloningGroupScheduling:{reused:true,preflightExecutions:0,taskExecutions:0}};
  const regions=await memo('count/'+geometryKey+'/'+p.minimum,'cloningCountMs',async()=>{
    const angles=await cloningAngles(selected.points,geometry,p.minimum,{signal:hooks.signal,account}),std=cloningAngleStd(angles,{account});
    if(std===null)return 0;if(std<.1)return 1;
    reserveHeap(cloningCountHeapBound(angles.length));return cloningRegionCount(angles,hooks);
  });
  checkAbort(hooks.signal);hooks.onProgress?.(1);
  const clusters=geometry.lengths.reduce((sum,n)=>sum+(n>=p.minimum),0);
  return {data:{algorithm,points:selected.points,matches:geometry.matches,groupLengths:geometry.lengths,groupIndices:geometry.groups,minimum:p.minimum,stats:{total:detected.total,filtered:selected.points.length/7,matches:geometry.matches.length/3,clusters,regions}},engineMetrics:{...metrics,...(detected.pagedMetadata?{cloningPagedExtraction:detected.pagedMetadata}:{}),...(algorithm==='BRISK'?{cloningDescriptorPolicy:'selected-response-native'}:{}),cloningGeometryStrategy:geometry.strategy,backend:metrics.hammingBackend==='webgpu'?'hybrid':'cpu',kernel:'copy-move-'+algorithm.toLowerCase()+'-reference',workers:Math.max(1,groupMetrics.cloningGroupWorkers),...groupMetrics},semantics:`Historical ${algorithm} keypoints, ordered Hamming matches and overlapping geometric groups. Region count is a directional clustering heuristic, not a number of proven forgeries. ${algorithm==='BRISK'?'Portable libm angle differences from the pinned native build remain documented.':'This explicit operation does not substitute for the historical BRISK default.'}`};
}
export async function cloningView(result,p,hooks={},context){
  const renderer=await cloningRenderer(context.image,hooks),data=result.data,geometry={matches:data.matches,lengths:data.groupLengths,groups:data.groupIndices},commands=new Int32Array(128*8);
  try{
    if(p.showPoints)for(let i=0;i<data.points.length;i+=512*7)await renderer.points(data.points.subarray(i,i+512*7));
    let count=0;
    for(const index of cloningGroupIndices(geometry,p.minimum)){
      cloningCommand(data.points,data.matches,index,p.matching/100*255,commands,count*8);count++;
      if(count===128){await renderer.matches(commands,p.hideLines);count=0;}
    }
    if(count)await renderer.matches(commands.subarray(0,count*8),p.hideLines);
    checkAbort(hooks.signal);result.pixels={width:context.image.width,height:context.image.height,format:'rgb8',data:renderer.pixels()};
  }finally{renderer.dispose();}
}
