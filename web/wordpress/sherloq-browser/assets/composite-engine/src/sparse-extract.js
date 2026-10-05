import {m3ImageShape} from './m3-image-shape.js';
import {PagedSiftFeatureEngine} from './sift-paged.js';
import {PagedAkazeFeatureEngine} from './akaze-paged.js';
import {researchRows} from './m3-research-rows.js';
import {validateRgbRows} from './rgb-row-source.js';
import {gray} from './pixel-utils.js';
import {SPARSE_EXTRACT_WASM} from './sparse-extract-assets.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {siftRegionPlan} from './sift-regions.js';
import {remapReflectedSiftPoints} from './sift-g2nn.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
const MiB=1024**2,FAMILIES=['SIFT','AKAZE','BRISK','ORB','SIFT-G2NN','SIFT-LightGlue'];

export class SparseFeatureEngine{
 constructor(budget,profile){requireValue(budget&&typeof budget.reserve==='function'&&Number.isFinite(budget.limit)&&profile&&Number.isInteger(profile.maxWorkers)&&profile.maxWorkers>0,'Feature extraction requires shared budget and worker profile.');this.budget=budget;this.profile=profile;this.paged=new PagedSiftFeatureEngine(budget,profile);this.pagedAkaze=new PagedAkazeFeatureEngine(budget,profile);this.adaptive=new AdaptiveConcurrency();this.workers=new Set();this.pending=new Map();this.running=false;}
 stop(){this.paged.stop();this.pagedAkaze.stop();for(const worker of this.workers){worker.terminate();this.pending.get(worker)?.reject(new EngineError('CANCELLED','Feature extraction stopped.'));}this.workers.clear();this.pending.clear();}
 dispose(){this.stop();this.adaptive.clear();}
 rpc(worker,message,transfer=[]){return new Promise((resolve,reject)=>{this.pending.set(worker,{reject});worker.onmessage=({data})=>{this.pending.delete(worker);data.error?reject(new EngineError(data.error,data.message)):resolve(data);};worker.onerror=()=>{this.pending.delete(worker);reject(new EngineError('WORKER_FAILED','Feature worker failed.'));};try{worker.postMessage(message,transfer);}catch(error){this.pending.delete(worker);reject(error);}});}
 async extract(image,{family='SIFT-G2NN',limit=6000,regions=[],excluded=[],independent=true,reflected=false,backend='auto',storageContext,signal,onProgress}={}){
  requireValue(!this.running&&typeof Worker!=='undefined','Feature worker unavailable or engine busy.');
  m3ImageShape(image?.width,image?.height);
  requireValue(image?.format==='rgb8'&&(typeof image.readRows==='function'||image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3),'RGB8 image required.');
  requireValue(FAMILIES.includes(family)&&Number.isInteger(limit)&&limit>=100&&limit<=20000,'Invalid feature family or count.');
  checkAbort(signal);this.running=true;const releases=[],freeOutputs=[],admit=n=>{const release=this.budget.reserve(n);releases.push(release);},abort=()=>this.stop();signal?.addEventListener('abort',abort,{once:true});let returned=false;
  try{
   const perRegion=family==='SIFT-G2NN'&&independent;
   const plan=siftRegionPlan(image.width,image.height,perRegion?regions:[],excluded,{reflected,reserveMemory:admit}),zoneCount=Math.max(1,regions.length);
   if(!perRegion){siftRegionPlan(image.width,image.height,regions,[],{reflected,reserveMemory:admit});plan.jobs[0].regions=regions.map(p=>p.map(([x,y])=>[reflected?image.width-1-x:x,y]));}
   const jobs=plan.jobs;
   const largest=jobs.reduce((n,j)=>Math.max(n,j.rectangle.width*j.rectangle.height*(family==='SIFT-G2NN'?j.scale*j.scale:1)),0);
   if(family.startsWith('SIFT')&&largest*180>Math.min(512*MiB,this.budget.limit*.6))return await this.paged.extractPlan(image,plan,zoneCount,{family,limit,independent,reflected,backend,storageContext,signal,onProgress});
   if(family==='AKAZE'&&largest*180>Math.min(512*MiB,this.budget.limit*.6))return await this.pagedAkaze.extract(image,{limit,regions,excluded,storageContext,signal,onProgress});
   admit(16*MiB+jobs.length*1024);
   const response=await fetch(new URL('../vendor/sparse-extract/sparse-extract.wasm',import.meta.url),{signal});if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','Feature kernel could not load.');
   const reader=response.body.getReader(),parts=[];let bytes=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>SPARSE_EXTRACT_WASM.bytes)throw new EngineError('ASSET_INTEGRITY','Feature kernel size mismatch.');parts.push(value);}}finally{await reader.cancel();}
   const wasm=new Uint8Array(bytes);let at=0;for(const part of parts){wasm.set(part,at);at+=part.length;}
   const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',wasm)),x=>x.toString(16).padStart(2,'0')).join('');
   if(bytes!==SPARSE_EXTRACT_WASM.bytes||sha!==SPARSE_EXTRACT_WASM.sha256)throw new EngineError('ASSET_INTEGRITY','Feature kernel identity mismatch.');
   const results=new Map();let done=0,retries=0,maxWorkers=0,peakHeapBytes=0,executions=0;
   let heapBytes=Math.min(2048*MiB,Math.max(32*MiB,Math.ceil(largest*(family==='AKAZE'?180:family==='SIFT-G2NN'?300:(family==='SIFT'||family==='SIFT-LightGlue')?180:family==='BRISK'?160:36)/(16*MiB))*16*MiB));
   const key=family+'/'+jobs.length;
   while(done<jobs.length){
    checkAbort(signal);const remaining=jobs.map((_,i)=>i).filter(i=>!results.has(i)),maximum=Math.min(this.profile.maxWorkers,remaining.length),perWorker=heapBytes+largest*2+limit*(568+zoneCount)+32*MiB;
    const capacity=this.adaptive.select(key,maximum,this.budget,n=>n*perWorker),freeWorkers=this.budget.reserve(capacity.count*perWorker);maxWorkers=Math.max(maxWorkers,capacity.count);let next=0,stopped=false;const start=performance.now();
    try{
     await Promise.all(Array.from({length:capacity.count},async()=>{
      const worker=new Worker(new URL('./sparse-extract-worker.js',import.meta.url),{type:'module'});this.workers.add(worker);await this.rpc(worker,{kind:'init',wasm,maximumHeapBytes:heapBytes});
      while(next<remaining.length&&!stopped){
       checkAbort(signal);const index=remaining[next++],job=jobs[index],r=job.rectangle,bgr=new Uint8Array(r.width*r.height),source=researchRows(image),f=Math.fround;
       for(let y=0;y<r.height;y+=32){const count=Math.min(32,r.height-y),lease=await source.readRows(r.y+y,count,{signal});
        try{const rgb=validateRgbRows(lease,image.width,count);for(let yy=0;yy<count;yy++)for(let x=0;x<r.width;x++){
         const sx=job.reflected?image.width-1-r.x-x:r.x+x,at=(yy*image.width+sx)*3;
         bgr[(y+yy)*r.width+x]=family==='SIFT-LightGlue'?f(f(f(f(f(rgb[at]/255)*f(.299))+f(f(rgb[at+1]/255)*f(.587)))+f(f(rgb[at+2]/255)*f(.114)))*255):gray(rgb[at],rgb[at+1],rgb[at+2]);
        }}finally{lease.release();}await controlCheckpoint(signal);
       }
       if(stopped)break;executions++;
       const result=await this.rpc(worker,{kind:'extract',image:{width:r.width,height:r.height,data:bgr,grayscale:true},regions:job.regions,excluded:job.excluded,family:FAMILIES.indexOf(family),limit,zoneCount,independentZone:perRegion?job.zone:null},[bgr.buffer]);
       if(stopped)break;checkAbort(signal);requireValue(result.heapBytes<=heapBytes,'Feature WASM exceeds admitted heap.');peakHeapBytes=Math.max(peakHeapBytes,result.heapBytes);
       freeOutputs.push(this.budget.reserve(result.points.byteLength*2+result.descriptors.byteLength+result.members.byteLength+256));
       for(let i=0;i<result.points.length;i+=7){result.points[i]=result.points[i]+r.x;result.points[i+1]=result.points[i+1]+r.y;}
       if(reflected)result.points=remapReflectedSiftPoints(result.points,image.width);
       results.set(index,result);done++;onProgress?.({phase:'extracting',fraction:done/jobs.length,completed:done,total:jobs.length});
      }
     }));this.adaptive.observe(key,{count:capacity.count,maximum,milliseconds:performance.now()-start,units:remaining.length});
    }catch(error){stopped=true;this.stop();checkAbort(signal);if(isWorkerResourceFailure(error)&&retries<3&&(capacity.count>1||heapBytes<2048*MiB)){this.adaptive.reduce(key,capacity.count);retries++;if(error.code==='MEMORY_LIMIT')heapBytes=Math.min(2048*MiB,heapBytes*2);continue;}throw error;}
    finally{stopped=true;this.stop();freeWorkers();}
   }
   const ordered=jobs.map((_,i)=>results.get(i)),count=ordered.reduce((n,r)=>n+r.points.length/7,0),binary=['AKAZE','BRISK','ORB'].includes(family),descriptorSize=ordered[0]?.descriptorSize??({AKAZE:61,BRISK:64,ORB:32}[family]??128);
   const freeResult=this.budget.reserve(count*(56+descriptorSize*(binary?1:4)+zoneCount)+4096);freeOutputs.push(freeResult);
   const points=new Float64Array(count*7),descriptors=new (binary?Uint8Array:Float32Array)(count*descriptorSize),members=new Uint8Array(count*zoneCount);let offset=0,totalFeatures=0;
   for(const r of ordered){points.set(r.points,offset*7);descriptors.set(r.descriptors,offset*descriptorSize);members.set(r.members,offset*zoneCount);offset+=r.points.length/7;totalFeatures+=r.totalFeatures;}
   checkAbort(signal);let released=false;returned=true;
   return {points,descriptors,members,zoneCount,descriptorSize,totalFeatures,release(){if(!released){released=true;freeResult();}},metadata:{family,opencv:'4.11.0',featurePolicy:perRegion?'independent_roi_v2':'global',reflectedPixels:reflected,workers:maxWorkers,peakWorkerHeapBytes:peakHeapBytes,executions,retries,preflightExecutions:0,inputLayout:'source-rows-gray',qualification:['ORB','AKAZE'].includes(family)?'CM2 integration under verification':'native arithmetic differences unresolved'}};
  }finally{signal?.removeEventListener('abort',abort);this.stop();releases.forEach(f=>f());freeOutputs.slice(0,returned?-1:undefined).forEach(f=>f());this.running=false;}
 }
}
