import {subimageParams,subimageData} from './auto-zones.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort,createCooperator,EngineError} from './errors.js';

const POLICY='native-panels-independent-admitted-contexts-v1';
const metadataBytes=value=>65536+sourceRegionTransportBytes(value,{allowAliases:true})*2;

/** The original geometric kernel is unchanged. Every call receives one real
 * admitted RGB rectangle, including its own native palette, wrap, morphology,
 * size/border tests and ordering. A partition boundary is an explicit context
 * boundary; this is not an equivalent whole-image detector with a final mask. */
export async function detectSourceRegionPanels(view,{budget,signal,onProgress}={}){
 requireValue(view?.domain&&typeof view.admittedRectangles==='function'&&typeof view.readWindow==='function'&&budget?.reserve,'An admitted native source view and budget are required.');
 const domain=view.domain,cooperate=createCooperator(signal),metadata=[],fragments=[],regions=[],polygons=[];let completed=0,reads=0,outputFree,returned=false;
 try{
  metadata.push(budget.reserve(65536));
  for(const rect of view.admittedRectangles()){
   await cooperate();checkAbort(signal);
   requireValue(['x','y','width','height'].every(k=>Number.isSafeInteger(rect[k]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=domain.width&&rect.y+rect.height<=domain.height&&view.includesRectangle(rect),'A panel context must be wholly admitted on its native grid.');
   metadata.push(budget.reserve(4096));const index=fragments.length,n=rect.width*rect.height,freeRgb=budget.reserve(n*3),nativeReservations=[];let native;
   try{
    const data=new Uint8Array(n*3),chunk=Math.min(rect.width,view.maxReadPixels??65536,65536),rows=Math.max(1,Math.min(32,Math.floor((view.maxReadPixels??65536)/chunk)));
    for(let y=0;y<rect.height;y+=rows)for(let x=0;x<rect.width;x+=chunk){
     await cooperate();const width=Math.min(chunk,rect.width-x),height=Math.min(rows,rect.height-y),part=await view.readWindow({x:rect.x+x,y:rect.y+y,width,height},{signal});
     try{for(let row=0;row<height;row++)data.set(part.pixels.data.subarray(row*width*3,(row+1)*width*3),((y+row)*rect.width+x)*3);reads++;}finally{await part.release?.();}
     checkAbort(signal);
    }
    native=await subimageData({format:'rgb8',width:rect.width,height:rect.height,data},subimageParams(),{signal,onProgress:f=>onProgress?.({phase:'source-region-subimages-context',completed,total:domain.countIncluded,sourceFragment:index,contextFraction:f})},{reserveMemory:n=>nativeReservations.push(budget.reserve(n))});
    checkAbort(signal);const detected=native.data;requireValue(Array.isArray(detected?.regions)&&Array.isArray(detected.polygons)&&detected.regions.length===detected.polygons.length,'Native panel geometry changed its paired representation.');
    metadata.push(budget.reserve(4096+sourceRegionTransportBytes(detected,{allowAliases:true})*2));
    for(let i=0;i<detected.regions.length;i++){
     const r=detected.regions[i],b=r.bounds,p=detected.polygons[i];requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]>=0&&b[1]>=0&&b[2]>b[0]&&b[3]>b[1]&&b[2]<=rect.width&&b[3]<=rect.height,'Native panel bounds left their admitted context.');
     requireValue(Array.isArray(p)&&p.length===4&&p.every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isSafeInteger)&&q[0]>=b[0]&&q[0]<b[2]&&q[1]>=b[1]&&q[1]<b[3]),'Native panel polygon left its native bounds.');
     regions.push({id:'panel-'+regions.length,bounds:b.map((v,k)=>v+(k%2?rect.y:rect.x)),sourceFragment:index});polygons.push(p.map(([x,y])=>[x+rect.x,y+rect.y]));
    }
    const bounds=[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height];fragments.push({index,bounds,originalBounds:bounds.map((v,k)=>v+domain.origin[k%2]),observedPixels:n,panels:detected.regions.length,status:detected.regions.length?'proposals':'no-proposals',sampleStep:Math.max(1,Math.ceil(Math.max(rect.width,rect.height)/1800)),nativePolicy:'unchanged auto_zones.detect_panels in this exact complete RGB context'});completed+=n;
   }finally{for(const free of nativeReservations)free();freeRgb();}
   onProgress?.({phase:'source-region-subimages-fragments',completed,total:domain.countIncluded,fragmentCount:fragments.length});checkAbort(signal);
  }
  requireValue(completed===domain.countIncluded,'Panel contexts omitted or repeated admitted pixels.');checkAbort(signal);
  const data={regions,polygons,coordinates:'source-region-native-pixel-centres',boundsConvention:'half-open',sourceRegionPanels:{schema:'sherloq.strict-subimages/1',policy:POLICY,sourceSha256:domain.sourceSha256,domainFingerprint:domain.fingerprint,origin:[...domain.origin],observedPixels:completed,contextCount:fragments.length,fragments,order:'Native panel order within each canonical admitted rectangle; no invented adjacency, merge or whole-frame fallback between contexts.',partitionEffect:'Exclusions or acquisition gaps may split a panel or its gutter. The unchanged detector evaluates only each complete admitted context and may return no proposal there.'}};
  outputFree=budget.reserve(metadataBytes(data));returned=true;let released=false;return{data,metrics:{selectedPixels:domain.countIncluded,observedPixels:completed,fragmentCount:fragments.length,sourceReads:reads,resolutionReduced:false,excludedPixelsRead:false},release(){if(released)return;released=true;outputFree();}};
 }finally{for(const free of metadata)free();if(!returned)outputFree?.();}
}

/** A metadata result uses the same budget-owned cache/defensive-copy contract
 * as the source-region histogram. Cached values contain no view or signal. */
export async function sourceRegionSubimages({task,original,view,domain,budget,signal,onProgress,version}){
 const params=subimageParams(task.params),backend=task.backend??'auto';if(!['auto','cpu'].includes(backend))throw new EngineError('UNSUPPORTED_BACKEND','Native subimage detection uses the original CPU method.');
 requireValue(domain?.fingerprint===view.domain?.fingerprint&&domain.sourceSha256===original.sha256&&domain.width===view.domain.width&&domain.height===view.domain.height&&domain.origin.every((v,i)=>v===view.domain.origin[i]),'Panel detector source identity or domain differs.');checkAbort(signal);
 const key=task.imageId+'\0source-region/subimages/'+POLICY+'/'+original.sha256+'/'+domain.fingerprint,started=performance.now();let owner,copyFree;
 try{
  let cached=budget.get(key)?.value;const hit=!!cached;
  if(!cached){owner=await detectSourceRegionPanels(view,{budget,signal,onProgress});checkAbort(signal);cached={data:owner.data,metrics:owner.metrics};budget.put(key,{value:cached,byteLength:metadataBytes(cached)},[task.imageId]);}
  copyFree=budget.reserve(metadataBytes(cached));const result=structuredClone(cached);checkAbort(signal);
  return{id:task.id,imageId:task.imageId,operation:'subimages.detect',status:'ok',data:result.data,layers:[],semantics:'Editable geometric panel proposals from unchanged native detection in exact admitted RGB contexts. This does not classify authenticity or run OCR, and no whole-image fallback is invented.',metrics:{...result.metrics,sourceReads:hit?0:result.metrics.sourceReads,totalMs:performance.now()-started,cache:{result:hit,analysis:hit},memory:budget.snapshot()},provenance:{engine:version,operation:'subimages.detect',params,backend:'cpu',originalSha256:original.sha256,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],sourceRegionPolicy:POLICY,excludedParticipation:'absent-before-native-palette-morphology-components-and-border-tests',originalEncodedBytesPreserved:true}};
 }finally{owner?.release();copyFree?.();}
}
