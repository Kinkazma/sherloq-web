import "../../runtime-context.js?v=0.14.5";
import {SIFT_PAGED_WASM} from './sift-paged-assets.js';
import {fetchM3Asset} from './m3-asset.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {TypedPages} from './m3-typed-pages.js';
import {researchRows} from './m3-research-rows.js';
import {validateRgbRows} from './rgb-row-source.js';
import {gray,roundEven} from './pixel-utils.js';
import {siftRegionPlan} from './sift-regions.js';
import {remapReflectedSiftPoints} from './sift-g2nn.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
const MiB=1024**2,f=Math.fround,byteView=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength),roundHeap=n=>Math.min(2048*MiB,Math.ceil(n/(64*MiB))*64*MiB);
class SiftPool{
 constructor(owner,options){Object.assign(this,options);this.owner=owner;this.records=[];this.metrics={executions:0,retries:0,peakHeapBytes:0,workers:0,failures:[]};}
 async open(count,heap=this.heap,provider=this.provider){
  for(let i=0;i<count;i++){let release;try{release=this.budget.reserve(this.cost(heap,provider));}catch(error){if(this.records.length)break;if(provider==='webgpu'&&this.backend==='auto'){provider='cpu';i--;continue;}throw error;}
   const rec={heap,provider,release,worker:null,reject:null};this.records.push(rec);this.owner.workers.add(rec);
  }
  if(!this.records.length&&provider==='cpu'){const release=this.budget.reserve(this.cost(heap,provider)),rec={heap,provider,release,worker:null,reject:null};this.records.push(rec);this.owner.workers.add(rec);}requireValue(this.records.length>0,'No admitted SIFT worker');this.metrics.workers=Math.max(this.metrics.workers,this.records.length);
 }
 stopRecord(rec){rec.worker?.terminate();rec.worker=null;rec.reject?.(new EngineError('CANCELLED','SIFT work stopped'));rec.reject=null;}
 close(){for(const rec of this.records){this.stopRecord(rec);rec.release();this.owner.workers.delete(rec);}this.records=[];}
 rpc(rec,message,transfer=[]){return new Promise((resolve,reject)=>{rec.reject=reject;rec.worker.onmessage=({data})=>{rec.reject=null;data.error?reject(new EngineError(data.error,data.message)):resolve(data);};rec.worker.onerror=e=>{rec.reject=null;reject(new EngineError('WORKER_FAILED',e.message||'SIFT worker failed'));};rec.worker.postMessage(message,transfer);});}
 async execute(rec,make){
  for(;;){checkAbort(this.signal);const message=await make();checkAbort(this.signal);
   try{
    if(!rec.worker){rec.worker=new Worker(new URL('./sift-paged-worker.js',import.meta.url),{type:'module'});await this.rpc(rec,{kind:'init',wasm:this.wasm,maximumHeapBytes:rec.heap,provider:rec.provider,layers:this.layers,contrast:this.contrast});}
    this.metrics.executions++;const transfer=message.kind==='select'?[]:Object.values(message).filter(ArrayBuffer.isView).map(a=>a.buffer),result=await this.rpc(rec,message,transfer);checkAbort(this.signal);this.metrics.peakHeapBytes=Math.max(this.metrics.peakHeapBytes,result.heapBytes??0);this.metrics.gaussianProvider=rec.provider;return result;
   }catch(error){checkAbort(this.signal);this.stopRecord(rec);this.metrics.failures.push({provider:rec.provider,code:error.code,message:error.message});let changed=false;
    if(rec.provider==='webgpu'&&this.backend==='auto'){rec.provider='cpu';changed=true;}else if(['MEMORY_LIMIT','WORKER_FAILED'].includes(error.code)&&rec.heap<2048*MiB){rec.heap=Math.min(2048*MiB,rec.heap*2);changed=true;}
    if(!changed)throw error;rec.release();rec.release=()=>{};rec.release=this.budget.reserve(this.cost(rec.heap,rec.provider));this.metrics.retries++;
   }
  }
 }
 async run(jobs,make,accept){
  const done=new Set();let cursor=0;
  for(;;){let failed=false;
   const work=await Promise.allSettled(this.records.map(async rec=>{while(cursor<jobs.length&&!failed){const i=cursor++;if(done.has(i))continue;let result;try{result=await this.execute(rec,()=>make(jobs[i]));}catch(error){failed=true;throw error;}try{await accept(result,jobs[i]);}catch(error){failed=true;error.siftOutputFailure=true;throw error;}done.add(i);}}));
   const error=work.find(r=>r.status==='rejected')?.reason;if(!error)return;checkAbort(this.signal);
   if(error.siftOutputFailure||error.code!=='MEMORY_LIMIT'||this.records.length===1)throw error;const heap=Math.max(...this.records.map(r=>r.heap)),provider=this.records.some(r=>r.provider==='cpu')?'cpu':'webgpu';this.close();await this.open(1,heap,provider);this.metrics.retries++;this.metrics.concurrencyReductions=(this.metrics.concurrencyReductions??0)+1;cursor=0;
  }
 }
}
export class PagedSiftFeatureEngine{
 constructor(budget,profile){this.budget=budget;this.profile=profile;this.workers=new Set();this.controller=null;}
 stop(){this.controller?.abort();for(const r of this.workers){r.worker?.terminate();r.worker=null;r.reject?.(new EngineError('CANCELLED','Paged SIFT stopped'));r.reject=null;}}
 dispose(){this.stop();}
 async extract(image,options={}){
  const {family='SIFT',regions=[],excluded=[],independent=true,reflected=false}=options,releases=[],admit=n=>{const free=this.budget.reserve(n);releases.push(free);return free;},perRegion=family==='SIFT-G2NN'&&independent;
  try{const plan=siftRegionPlan(image.width,image.height,perRegion?regions:[],excluded,{reflected,reserveMemory:admit});if(!perRegion){siftRegionPlan(image.width,image.height,regions,[],{reflected,reserveMemory:admit});plan.jobs[0].regions=regions.map(p=>p.map(([x,y])=>[reflected?image.width-1-x:x,y]));}return await this.extractPlan(image,plan,Math.max(1,regions.length),options);}finally{releases.forEach(f=>f());}
 }
 async extractPlan(image,plan,zoneCount,{family='SIFT',limit=6000,independent=true,reflected=false,backend='auto',signal,onProgress,storageContext,storage='auto'}={}){
  requireValue(!this.controller&&['SIFT','SIFT-G2NN','SIFT-LightGlue','Forgeryscope-SIFT'].includes(family),'Invalid or busy paged SIFT family');const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;this.controller=controller;const abort=()=>this.stop();combined.addEventListener('abort',abort,{once:true});const budget=this.budget,results=[];let completed=false,releaseFinal;
  try{
   const freeAsset=budget.reserve(SIFT_PAGED_WASM.bytes*3+64*MiB);let wasm;
   try{wasm=await fetchM3Asset(new URL('../vendor/sift-paged/sift-paged.wasm',import.meta.url),SIFT_PAGED_WASM,combined);
    for(let i=0;i<plan.jobs.length;i++){const result=await this.extractJob(image,plan.jobs[i],zoneCount,{family,limit,independent,backend,signal:combined,wasm,storageContext,storage,onProgress:e=>onProgress?.({...e,fraction:(i+e.fraction)/plan.jobs.length})});const r=plan.jobs[i].rectangle;for(let j=0;j<result.points.length;j+=7){result.points[j]+=r.x;result.points[j+1]+=r.y;}if(reflected)result.points=remapReflectedSiftPoints(result.points,image.width);results.push(result);}
   }finally{freeAsset();}
   const count=results.reduce((s,r)=>s+r.points.length/7,0);releaseFinal=budget.reserve(count*(56+512+zoneCount)+4096);const points=new Float64Array(count*7),descriptors=new Float32Array(count*128),members=new Uint8Array(count*zoneCount);let at=0,totalFeatures=0;
   for(const r of results){points.set(r.points,at*7);descriptors.set(r.descriptors,at*128);members.set(r.members,at*zoneCount);at+=r.points.length/7;totalFeatures+=r.totalFeatures;}checkAbort(combined);completed=true;return {points,descriptors,members,descriptorSize:128,zoneCount,totalFeatures,release:releaseFinal,metadata:{provider:results.some(r=>r.metadata.stages.some(s=>s.gaussianProvider==='webgpu'))?'webgpu':'cpu',family,opencv:'4.11.0',inputLayout:'global-octave-bases',featurePolicy:family==='SIFT-G2NN'&&independent?'independent_roi_v2':'global',reflectedPixels:reflected,preflightExecutions:0,jobs:results.map(r=>r.metadata),workers:Math.max(0,...results.map(r=>r.metadata.workers)),peakWorkerHeapBytes:Math.max(0,...results.map(r=>r.metadata.peakHeapBytes)),executions:results.reduce((s,r)=>s+r.metadata.executions,0),retries:results.reduce((s,r)=>s+r.metadata.retries,0),qualification:family==='Forgeryscope-SIFT'?'qualified against dense native-profile port; cross-platform residuals documented':'qualified native arithmetic with global paged dependencies'}};
  }catch(error){checkAbort(combined);throw error;}
  finally{combined.removeEventListener('abort',abort);for(const r of results)r.release();if(!completed)releaseFinal?.();this.stop();this.controller=null;}
 }
 async extractJob(image,job,zoneCount,options){
  const {family,limit,independent,backend,signal,wasm,onProgress,storageContext,storage}=options,budget=this.budget,source=researchRows(image),rectangle=job.rectangle,width=rectangle.width,height=rectangle.height,scale=family==='SIFT-G2NN'?job.scale:1,layers=['SIFT-LightGlue','Forgeryscope-SIFT'].includes(family)?4:3,contrast=family==='SIFT-G2NN'?.001:['SIFT-LightGlue','Forgeryscope-SIFT'].includes(family)?.0066667:.04,sw=width*scale,sh=height*scale,core=1024,halo=128,maximumPixels=Math.min(sw*2,core+2*halo)*Math.min(sh*2,core+2*halo),provider=backend==='cpu'?'cpu':backend==='webgpu'||globalThis.navigator?.gpu?'webgpu':'cpu';
  const frees=[],stores=[],bases=[],account=n=>{const free=budget.reserve(n);frees.push(free);return free;},makeStore=async n=>{const store=await createSegmentedBytes(n,{budget,storage:storage==='auto'&&n>Math.min(budget.limit/12,(budget.limit-budget.total())/4)?'temporary':storage,temporarySession:storageContext?.temporarySession??image.temporarySession,getTemporarySession:storageContext?.getTemporarySession??image.getTemporarySession,signal});stores.push(store);return store;},heap=roundHeap(128*MiB+maximumPixels*(2*layers+8)*4),cost=(heap,provider)=>heap+64*MiB+maximumPixels*(provider==='webgpu'?256:128),metrics={sourceRows:height,sourceReads:0,globalCandidates:0,continuationSeeds:0,continuationWindows:0,octaveBases:[],preflightExecutions:0,grayScale:scale,coreSize:core,supportHalo:halo};
  let pool,postPool,grayStore,returned=false,freeResult,pages;const completedMetrics=[];
  const newPool=()=>new SiftPool(this,{budget,wasm,backend,provider,heap,cost,layers,contrast,signal});
  const recordPool=p=>{if(p)completedMetrics.push({...p.metrics});};
  async function readRect(store,w,x,y,cw,ch,Type){const output=new Type(cw*ch);for(let r=0;r<ch;r++){if(r%64===0)checkAbort(signal);await store.readInto(byteView(output.subarray(r*cw,(r+1)*cw)),((y+r)*w+x)*Type.BYTES_PER_ELEMENT);}return output;}
  async function writeRect(store,w,rect,data){const [x,y,cw,ch]=rect;for(let r=0;r<ch;r++)await store.write(byteView(data.subarray(r*cw,(r+1)*cw)),((y+r)*w+x)*data.BYTES_PER_ELEMENT);}
  const grid=(w,h,step)=>{const jobs=[];for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step)jobs.push({x,y,cw:Math.min(step,w-x),ch:Math.min(step,h-y)});return jobs;};
  try{
   account(32*MiB+image.width*64*8);pool=newPool();await pool.open(Math.min(this.profile.maxWorkers,grid(sw*2,sh*2,core).length));grayStore=await makeStore(width*height);let low=255,high=0;
   for(let y=0;y<height;y+=64){await controlCheckpoint(signal);const rows=Math.min(64,height-y),lease=await source.readRows(rectangle.y+y,rows,{signal});metrics.sourceReads++;try{const rgb=validateRgbRows(lease,image.width,rows),output=new Uint8Array(width*rows);for(let yy=0;yy<rows;yy++)for(let x=0;x<width;x++){const sx=job.reflected?image.width-1-rectangle.x-x:rectangle.x+x,at=(yy*image.width+sx)*3,value=['SIFT-LightGlue','Forgeryscope-SIFT'].includes(family)?f(f(f(f(f(rgb[at]/255)*f(.299))+f(f(rgb[at+1]/255)*f(.587)))+f(f(rgb[at+2]/255)*f(.114)))*255):gray(rgb[at],rgb[at+1],rgb[at+2]);output[yy*width+x]=value;low=Math.min(low,output[yy*width+x]);high=Math.max(high,output[yy*width+x]);}await grayStore.write(output,y*width);}finally{lease.release();}onProgress?.({phase:'sift-gray',fraction:.04*(y+rows)/height});}
   if(scale===4){const target=await makeStore(sw*sh);await pool.run([0],async()=>({kind:'scale',input:await readRect(grayStore,width,0,0,width,height,Uint8Array),width,height,low,high}),async r=>target.write(r.gray,0));await grayStore.dispose();grayStore=target;}
   let w=sw*2,h=sh*2,base=await makeStore(w*h*4),prepared=0;const initialJobs=grid(sw,sh,core/2);
   await pool.run(initialJobs,async t=>{const x0=Math.max(0,t.x-16),y0=Math.max(0,t.y-16),x1=Math.min(sw,t.x+t.cw+16),y1=Math.min(sh,t.y+t.ch+16);return {kind:'prepare',input:await readRect(grayStore,sw,x0,y0,x1-x0,y1-y0,Uint8Array),width:x1-x0,height:y1-y0,core:[(t.x-x0)*2,(t.y-y0)*2,t.cw*2,t.ch*2],normalize:family==='SIFT-G2NN'&&scale===1,low,high};},async(r,t)=>{await writeRect(base,w,[t.x*2,t.y*2,t.cw*2,t.ch*2],r.base);prepared++;onProgress?.({phase:'sift-initial',fraction:.04+.12*prepared/initialJobs.length});});await grayStore.dispose();grayStore=null;
   pages=new TypedPages(Float32Array,7,account);const octaves=roundEven(Math.log(Math.min(w,h))/Math.log(2)-2)+1;
   for(let octave=0;octave<octaves;octave++){
    const record={store:base,w,h};bases.push(record);metrics.octaveBases.push({width:w,height:h,bytes:w*h*4,storage:base.storage});const nw=Math.floor(w/2),nh=Math.floor(h/2),next=octave+1<octaves?await makeStore(nw*nh*4):null,tasks=grid(w,h,core),escapes=[];let detected=0;
    await pool.run(tasks,async t=>{const x0=Math.max(0,t.x-halo),y0=Math.max(0,t.y-halo),x1=Math.min(w,t.x+t.cw+halo),y1=Math.min(h,t.y+t.ch+halo);return {kind:'detect',input:await readRect(base,w,x0,y0,x1-x0,y1-y0,Float32Array),width:x1-x0,height:y1-y0,x0,y0,globalWidth:w,globalHeight:h,core:[t.x,t.y,t.cw,t.ch],octave};},async(r,t)=>{pages.append(r.points);if(r.escapes.length){account(r.escapes.byteLength+256);escapes.push(r.escapes);}if(next)await writeRect(next,nw,r.nextRect,r.next);detected++;onProgress?.({phase:'sift-octave',fraction:.16+.54*(octave+detected/tasks.length)/octaves,octave,completed:detected,total:tasks.length});});
    let pending=[];for(const data of escapes)for(let i=0;i<data.length;i+=6)pending.push({state:[data[i],data[i+1],data[i+2],0]});metrics.continuationSeeds+=pending.length;
    while(pending.length){const again=[];await pool.run(pending,async t=>{const [c,r]=t.state,x0=Math.max(0,c-256),y0=Math.max(0,r-256),x1=Math.min(w,c+257),y1=Math.min(h,r+257);metrics.continuationWindows++;return {kind:'refine',input:await readRect(base,w,x0,y0,x1-x0,y1-y0,Float32Array),width:x1-x0,height:y1-y0,x0,y0,globalWidth:w,globalHeight:h,state:t.state,octave};},async r=>{if(r.status===1)again.push({state:Array.from(r.state)});else pages.append(r.points);});pending=again;}
    base=next;w=nw;h=nh;
   }
   metrics.globalCandidates=pages.length;const raw=pages.finish();recordPool(pool);pool.close();pool=null;const selectionHeap=roundHeap(raw.byteLength*5+width*height*2+128*MiB);postPool=new SiftPool(this,{budget,wasm,backend:'cpu',provider:'cpu',heap:selectionHeap,cost:heap=>heap+raw.byteLength*3+limit*(600+zoneCount)+64*MiB,layers,contrast,signal});await postPool.open(1);let selected;
   await postPool.run([0],async()=>({kind:'select',points:raw,width,height,regions:job.regions,excluded:job.excluded,limit,family,scale,zoneCount,independentZone:family==='SIFT-G2NN'&&independent?job.zone:null}),async r=>{account(r.points.byteLength+r.descriptorPoints.byteLength+r.members.byteLength);selected=r;});recordPool(postPool);postPool.close();postPool=null;onProgress?.({phase:'sift-global-ranking',fraction:.73});
   const count=selected.points.length/7;freeResult=budget.reserve(count*(56+512+zoneCount)+4096);const descriptors=new Float32Array(count*128),byWindow=new Map();
   for(let i=0;i<count;i++){const p=selected.descriptorPoints.subarray(i*7,i*7+7),low=p[5]&255,octave=(low<128?low:low-256)+1,scale=2**(1-octave),x=Math.floor(p[0]*scale/core)*core,y=Math.floor(p[1]*scale/core)*core,key=octave+':'+x+':'+y;let t=byWindow.get(key);if(!t){t={octave,x,y,ids:[]};byWindow.set(key,t);}t.ids.push(i);}
   const descriptionJobs=[...byWindow.values()];if(descriptionJobs.length){pool=newPool();await pool.open(Math.min(this.profile.maxWorkers,descriptionJobs.length));let described=0;
    await pool.run(descriptionJobs,async t=>{const {store,w,h}=bases[t.octave],x0=Math.max(0,t.x-halo),y0=Math.max(0,t.y-halo),x1=Math.min(w,t.x+core+halo),y1=Math.min(h,t.y+core+halo),points=new Float32Array(t.ids.length*7);t.ids.forEach((id,i)=>points.set(selected.descriptorPoints.subarray(id*7,id*7+7),i*7));return {kind:'describe',input:await readRect(store,w,x0,y0,x1-x0,y1-y0,Float32Array),width:x1-x0,height:y1-y0,x0,y0,points};},async(r,t)=>{t.ids.forEach((id,i)=>descriptors.set(r.descriptors.subarray(i*128,(i+1)*128),id*128));described++;onProgress?.({phase:'sift-descriptors',fraction:.73+.26*described/descriptionJobs.length});});recordPool(pool);pool.close();pool=null;
   }
   if(family==='SIFT-LightGlue'){const epsilon=f(1e-6),lanes=new Float32Array(4);for(let i=0;i<count;i++){if(i%128===0)await controlCheckpoint(signal);let sum=0;for(let j=0;j<128;j++)sum=f(sum+descriptors[i*128+j]);sum=Math.max(sum,epsilon);lanes.fill(0);for(let j=0;j<128;j++){const d=f(Math.sqrt(Math.max(f(descriptors[i*128+j]/sum),epsilon)));descriptors[i*128+j]=d;lanes[j%4]=f(lanes[j%4]+f(d*d));}const norm=Math.max(f(Math.sqrt(f(f(f(lanes[0]+lanes[1])+lanes[2])+lanes[3]))),epsilon);for(let j=0;j<128;j++)descriptors[i*128+j]=f(descriptors[i*128+j]/norm);}}
   checkAbort(signal);returned=true;return {points:selected.points,descriptors,members:selected.members,totalFeatures:selected.totalFeatures,release:freeResult,metadata:{...metrics,workers:Math.max(0,...completedMetrics.map(r=>r.workers)),peakHeapBytes:Math.max(0,...completedMetrics.map(r=>r.peakHeapBytes)),executions:completedMetrics.reduce((s,r)=>s+r.executions,0),retries:completedMetrics.reduce((s,r)=>s+r.retries,0),stages:completedMetrics}};
  }finally{pool?.close();postPool?.close();pages?.dispose();for(const store of stores)await store.dispose();frees.forEach(f=>f());if(!returned)freeResult?.();}
 }
}
