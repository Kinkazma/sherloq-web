import {SparseFeatureEngine} from './sparse-extract.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {createSourceRegionView} from './source-region-view.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from './source-region-geometry.js';
import {selectUniqueSift} from './sift-regions.js';
import {roundEven} from './pixel-utils.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
const families=['SIFT','AKAZE','BRISK','ORB','SIFT-G2NN','SIFT-LightGlue'];
const rectangle=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
const pointKey=(x,y)=>roundEven(x*1e6)/1e6+','+roundEven(y*1e6)/1e6;
function clipped(poly,width,height){let out=poly.map(p=>[...p]);for(const[axis,bound,less]of[[0,0,false],[0,width,true],[1,0,false],[1,height,true]]){const next=[],inside=p=>less?p[axis]<=bound:p[axis]>=bound;for(let i=0;i<out.length;i++){const a=out[i],b=out[(i+1)%out.length],ai=inside(a),bi=inside(b);if(ai)next.push(a);if(ai!==bi){const t=(bound-a[axis])/(b[axis]-a[axis]);next.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}out=next;if(!out.length)break;}return out;}
/** An exact native context row source. It copies only admitted native windows,
 * including when the existing extractor requests more than one bounded row.
 * All temporary source leases settle before its output lease is published. */
export function sparseStrictContextRows(view,rect,budget){
 requireValue(view?.includesRectangle(rect),'Sparse descriptor RGB must be a completely admitted native context.');
 return{format:'rgb8',width:rect.width,height:rect.height,async readRows(y,count,{signal}={}){
  requireValue(Number.isSafeInteger(y)&&Number.isSafeInteger(count)&&y>=0&&count>0&&y+count<=rect.height,'Sparse context row range changed.');checkAbort(signal);const bytes=rect.width*count*3,free=budget.reserve(bytes);let complete=false;
  try{const data=new Uint8Array(bytes),columns=Math.min(rect.width,view.maxReadPixels),rows=Math.max(1,Math.floor(view.maxReadPixels/columns));
   for(let yy=0;yy<count;yy+=rows)for(let x=0;x<rect.width;x+=columns){checkAbort(signal);const width=Math.min(columns,rect.width-x),height=Math.min(rows,count-yy);let lease,primary,failed=false;
    try{lease=await view.readWindow({x:rect.x+x,y:rect.y+y+yy,width,height},{signal});checkAbort(signal);for(let row=0;row<height;row++)data.set(lease.pixels.data.subarray(row*width*3,(row+1)*width*3),((yy+row)*rect.width+x)*3);}
    catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>lease?.release?.()],failed?{primary}:{});}}
   checkAbort(signal);complete=true;let released=false;return{pixels:{format:'rgb8',width:rect.width,height:count,data},release(){if(!released){released=true;free();}}};
  }finally{if(!complete)free();}
 }};
}
/** The public sparse pipeline keeps its global matcher and geometry. This
 * owner supplies only the native point/descriptor bank. Each original search
 * job (including a comparison envelope) keeps its own limit and memberships;
 * true negatives are removed before every native pyramid or descriptor. */
export function createStrictSparseNativeFeatures({budget,profile,nativeFactory=()=>new SparseFeatureEngine(budget,profile)}={}){
 requireValue(budget?.reserve&&Number.isSafeInteger(profile?.maxWorkers)&&profile.maxWorkers>0,'Strict sparse features need the existing shared budget/profile.');let active=false,closed=false,controller;
 // Children remain retryable until their actual ACK settles. Metadata stays
 // admitted while a refused child still owns a native output or source loan.
 const held=new Set(),viewsHeld=new Set(),metadata=new Set();let finished=Promise.resolve(),disposal;
 function retain(release,owners=held){let done=false,pending;const retire=()=>{
  if(done||pending)return pending;const answer=release();
  if(answer&&typeof answer.then==='function'){pending=Promise.resolve(answer).then(()=>{done=true;owners.delete(retire);},error=>{pending=undefined;throw error;});return pending;}
  done=true;owners.delete(retire);return answer;
 };owners.add(retire);return retire;}
 async function settleOwners(options={}){await retireCompositeOwners([...held],options);if(!held.size)await retireCompositeOwners([...viewsHeld],options);if(!held.size&&!viewsHeld.size)await retireCompositeOwners([...metadata],options);}
 return{
  async extract(context,{family='SIFT-G2NN',limit=6000,regions=[],excluded=[],independent=true,reflected=false,backend='auto',storageContext,checkpointKey,signal,onProgress}={}){
   requireValue(!active&&!closed,'Strict sparse extractor is busy or disposed.');requireValue(families.includes(family)&&Number.isSafeInteger(limit)&&limit>=100&&limit<=20000,'Unsupported strict native descriptor family.');
   const{source,candidateDomain,contextDomain,origin,width,height}=context??{};requireValue(source?.readWindow&&candidateDomain?.descriptor&&contextDomain?.descriptor&&candidateDomain.sourceSha256===contextDomain.sourceSha256&&Array.isArray(origin)&&origin.length===2&&origin.every(Number.isSafeInteger)&&Number.isSafeInteger(width)&&Number.isSafeInteger(height),'Verified sparse candidate/context domains required.');
   checkAbort(signal);controller=new AbortController();const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal,cooperate=createCooperator(combined),views=[],raw=[],records=[],jobs=[],admit=n=>retain(budget.reserve(n),metadata);active=true;let finish;finished=new Promise(resolve=>finish=resolve);let primary,failed=false,outputFree,returned=false;
   try{
    await settleOwners();checkAbort(combined);
    admit(262144+sourceRegionTransportBytes([regions,excluded],{allowAliases:true})*8);regions=structuredClone(regions);excluded=structuredClone(excluded);
    const perRegion=family==='SIFT-G2NN'&&independent,zoneCount=Math.max(1,regions.length),search=perRegion&&regions.length?regions.map((polygon,zone)=>({polygon,zone})):[{polygon:null,zone:null}];
    for(const job of search){await cooperate();admit(2048);let domain=contextDomain;
     if(job.polygon){const state=await createOriginalSourceRegionsState({sourceSha256:contextDomain.sourceSha256,width:contextDomain.sourceWidth,height:contextDomain.sourceHeight}),polygon=clipped(job.polygon,contextDomain.sourceWidth,contextDomain.sourceHeight);if(polygon.length>=3){const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]),x0=Math.min(...xs),y0=Math.min(...ys),x1=Math.max(...xs),y1=Math.max(...ys);if(x1>x0&&y1>y0)await state.add('acquisition',{x0,y0,x1,y1,polygon});else await state.replaceZones([],{enabled:true,positiveMode:'selected'});}else await state.replaceZones([],{enabled:true,positiveMode:'selected'});domain=await compileOriginalSourceRegions(state.snapshot(),{ceiling:contextDomain});}
     const view=domain.empty?null:await createSourceRegionView({...source,sha256:contextDomain.sourceSha256},domain.descriptor,{budget,signal:combined});if(view){views.push(view);retain(()=>view.dispose(),viewsHeld);}const index=jobs.length;jobs.push({index,zone:job.zone,domain,view,records:[]});if(!view)continue;
     for(const rect of view.admittedRectangles()){await cooperate();admit(2048);const nativeMinimum=['AKAZE','ORB'].includes(family)?2:1,evaluable=rect.width>=nativeMinimum&&rect.height>=nativeMinimum,originalBounds=[rect.x+domain.origin[0],rect.y+domain.origin[1],rect.x+domain.origin[0]+rect.width,rect.y+domain.origin[1]+rect.height],record={index:records.length,job:index,zone:job.zone,rect:{...rect},originalBounds,evaluable,status:evaluable?'native':'native-not-evaluable',nativeMinimum};records.push(record);jobs[index].records.push(record);}
    }
    let next=0,completed=0,firstFailure,firstFailed=false;const tasks=records.filter(r=>r.evaluable),lanes=Math.min(profile.maxWorkers,tasks.length);
    const settled=await Promise.allSettled(Array.from({length:lanes},async()=>{const native=nativeFactory(),retireNative=retain(()=>native.dispose());let workerFailed=false,workerPrimary;try{while(next<tasks.length){checkAbort(combined);const r=tasks[next++],job=jobs[r.job],[ox,oy]=r.originalBounds,shift=polys=>polys.map(poly=>poly.map(([x,y])=>[x-ox,y-oy])),localRegions=job.zone===null?shift(regions):shift([regions[job.zone]]),rows=sparseStrictContextRows(job.view,r.rect,budget),result=await native.extract(rows,{family,limit,regions:localRegions,excluded:shift(excluded),independent:false,reflected,backend,storageContext,checkpointKey:checkpointKey===undefined?undefined:checkpointKey+'/strict/'+contextDomain.fingerprint+'/'+r.originalBounds.join('/'),signal:combined,onProgress:e=>onProgress?.({...e,phase:'sparse-strict-context',sourceFragment:r.index,completed,total:tasks.length})});raw.push(result);retain(()=>result.release());checkAbort(combined);
      const binary=['AKAZE','BRISK','ORB'].includes(family),size={AKAZE:61,BRISK:64,ORB:32}[family]??128,n=result.points?.length/7;requireValue(result.points instanceof Float64Array&&Number.isSafeInteger(n)&&result.descriptors instanceof(binary?Uint8Array:Float32Array)&&result.descriptors.length===n*size&&result.descriptorSize===size&&result.members instanceof Uint8Array&&result.members.length===n*Math.max(1,localRegions.length),'Native sparse descriptor geometry changed.');admit(n*32+4096+sourceRegionTransportBytes(result.metadata??{},{allowUndefined:true,allowAliases:true})*2);const kept=[];
      for(let i=0;i<n;i++){const x=result.points[i*7]+ox,y=result.points[i*7+1]+oy;requireValue(Number.isFinite(x)&&Number.isFinite(y),'Nonfinite strict sparse feature.');if(candidateDomain.containsOriginal(roundEven(x),roundEven(y)))kept.push(i);}
      r.result=result;r.kept=kept;r.totalFeatures=result.totalFeatures;r.retainedFeatures=kept.length;r.nativeMetadata=structuredClone(result.metadata);completed++;onProgress?.({phase:'sparse-strict-context',sourceFragment:r.index,completed,total:tasks.length,fraction:completed/Math.max(1,tasks.length)});
     }}catch(error){workerFailed=true;workerPrimary=error;if(!firstFailed){firstFailed=true;firstFailure=error;}controller.abort();throw error;}finally{await retireCompositeOwners([retireNative],workerFailed?{primary:workerPrimary}:{});}}));if(firstFailed)throw firstFailure;for(const x of settled)if(x.status==='rejected')throw x.reason;checkAbort(combined);
    const binary=['AKAZE','BRISK','ORB'].includes(family),descriptorSize={AKAZE:61,BRISK:64,ORB:32}[family]??128,Type=binary?Uint8Array:Float32Array,selected=[],nativeTotal=records.reduce((n,r)=>n+(r.totalFeatures??0),0);let count=0;
    for(const job of jobs){await cooperate();const countIn=job.records.reduce((n,r)=>n+(r.kept?.length??0),0);admit(countIn*(56+descriptorSize*Type.BYTES_PER_ELEMENT+zoneCount));const points=new Float64Array(countIn*7),descriptors=new Type(countIn*descriptorSize),members=new Uint8Array(countIn*zoneCount);let offset=0;
     for(const r of job.records){if(!r.result)continue;const[ox,oy]=r.originalBounds,a=r.result;for(const id of r.kept){points.set(a.points.subarray(id*7,id*7+7),offset*7);points[offset*7]+=ox-origin[0];points[offset*7+1]+=oy-origin[1];descriptors.set(a.descriptors.subarray(id*descriptorSize,(id+1)*descriptorSize),offset*descriptorSize);if(job.zone===null)members.set(a.members.subarray(id*zoneCount,(id+1)*zoneCount),offset*zoneCount);else members[offset*zoneCount+job.zone]=1;offset++;}}
     let chosen;if(family==='SIFT-G2NN'){const unique=await selectUniqueSift(points,descriptors,limit,{signal:combined,reserveMemory:admit});admit(countIn*160);const first=new Map();for(let i=0;i<countIn;i++){const key=pointKey(points[i*7],points[i*7+1]);if(!first.has(key))first.set(key,i);}admit(unique.points.length/7*zoneCount);const chosenMembers=new Uint8Array(unique.points.length/7*zoneCount);for(let i=0;i<unique.points.length/7;i++){const id=first.get(pointKey(unique.points[i*7],unique.points[i*7+1]));requireValue(id!==undefined,'Strict SIFT selection lost its native membership.');chosenMembers.set(members.subarray(id*zoneCount,(id+1)*zoneCount),i*zoneCount);}chosen={points:unique.points,descriptors:unique.descriptors,members:chosenMembers};}
     else{admit(countIn*16);const ids=Array.from({length:countIn},(_,i)=>i).sort((a,b)=>points[b*7+4]-points[a*7+4]||a-b).slice(0,limit);if(family==='SIFT-LightGlue')ids.sort((a,b)=>points[a*7+1]-points[b*7+1]||points[a*7]-points[b*7]||a-b);admit(ids.length*(56+descriptorSize*Type.BYTES_PER_ELEMENT+zoneCount));chosen={points:new Float64Array(ids.length*7),descriptors:new Type(ids.length*descriptorSize),members:new Uint8Array(ids.length*zoneCount)};for(let i=0;i<ids.length;i++){const id=ids[i];chosen.points.set(points.subarray(id*7,id*7+7),i*7);chosen.descriptors.set(descriptors.subarray(id*descriptorSize,(id+1)*descriptorSize),i*descriptorSize);chosen.members.set(members.subarray(id*zoneCount,(id+1)*zoneCount),i*zoneCount);}}
     selected.push(chosen);count+=chosen.points.length/7;
    }
    outputFree=budget.reserve(count*(56+descriptorSize*Type.BYTES_PER_ELEMENT+zoneCount)+65536+records.length*4096);const points=new Float64Array(count*7),descriptors=new Type(count*descriptorSize),members=new Uint8Array(count*zoneCount);let offset=0;for(const s of selected){points.set(s.points,offset*7);descriptors.set(s.descriptors,offset*descriptorSize);members.set(s.members,offset*zoneCount);offset+=s.points.length/7;}
    checkAbort(combined);let released=false;returned=true;const free=outputFree;return{points,descriptors,members,zoneCount,descriptorSize,totalFeatures:nativeTotal,release(){if(!released){released=true;free();}},metadata:{family,featurePolicy:perRegion?'strict-native-independent-jobs':'strict-native-global-contexts',provider:records.some(r=>r.nativeMetadata?.provider==='webgpu')?'webgpu':'cpu',workers:records.reduce((n,r)=>Math.max(n,r.nativeMetadata?.workers??0),lanes),preflightExecutions:0,contextFingerprint:contextDomain.fingerprint,candidateFingerprint:candidateDomain.fingerprint,admittedReturnedFeatures:records.reduce((n,r)=>n+(r.retainedFeatures??0),0),strictSourceRegions:{sourceSha256:contextDomain.sourceSha256,origin:[...origin],width,height,excludedParticipation:'absent before native grayscale/pyramid/descriptors',comparison:'one native global feature bank and downstream matcher; no per-fragment matcher',nativeBoundaries:'Exact context crops; no uncut-image descriptor equivalence claimed'},contexts:records.map(({result,kept,rect,...r})=>r)}};
   }catch(error){failed=true;primary=error;throw error;}finally{if(!returned)outputFree?.();try{await settleOwners(failed?{primary}:{});if(returned)checkAbort(combined);}catch(error){if(returned)outputFree?.();throw error;}finally{active=false;controller=null;finish();}}
  },
  async retirePending(){await finished;await settleOwners();},
  dispose(){closed=true;controller?.abort();if(disposal)return disposal;const task=finished.then(()=>settleOwners()).finally(()=>{disposal=undefined;});disposal=task;return task;}
 };
}
