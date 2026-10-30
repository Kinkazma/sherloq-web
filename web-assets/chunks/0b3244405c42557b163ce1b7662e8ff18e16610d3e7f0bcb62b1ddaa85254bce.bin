import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';

export const ENERGY_CONTEXT_PLAN_POLICY='maximal-admissible-native-energy-rectangles/1';
const LIMIT=8192,MAX_SIDE=65500,ADDRESS=2**31;
// Same native formula as source-region-fragmented-energy.js. No JPEG or pixels.
export function energyNativeContextAdmission(rect,requestedBlock){
 requireValue([16,32,64,96].includes(requestedBlock),'Invalid native Energy block.');
 requireValue([rect?.width,rect?.height].every(n=>Number.isSafeInteger(n)&&n>0),'Invalid native Energy dimensions.');
 let block=requestedBlock;while(Math.floor(rect.height/block)*Math.floor(rect.width/block)>16384)block+=8;
 const cells=Math.floor(rect.height/block)*Math.floor(rect.width/block),jpegDimensions=rect.width<=MAX_SIDE&&rect.height<=MAX_SIDE,energyAddressing=rect.width*rect.height<ADDRESS;
 return{evaluable:cells>=25&&jpegDimensions&&energyAddressing,reason:!jpegDimensions?'native-jpeg-dimensions':!energyAddressing?'native-energy-addressing':cells<25?'native-25-complete-cells':null,requestedBlock,effectiveBlock:block,completeCells:cells,requiredCompleteCells:25,nativeMinimum:'25 complete native cells',nativeDimensions:[rect.width,rect.height]};
}
function retirementOwner(){
 const leases=new Set(),controller=new AbortController();let closed=false,pending,lastFailure,hasFailure=false;
 const owner={cancel(){controller.abort();},get signal(){return controller.signal;},get state(){return{closed,leases:leases.size,retiring:!!pending,hasFailure,lastFailure};},hold(f){requireValue(typeof f==='function','Budget reservation must return a retirement function.');leases.add(f);},dispose(){if(closed)return Promise.resolve();if(pending)return pending;controller.abort();pending=(async()=>{let failed=false,primary;for(const f of leases)try{await f();leases.delete(f);}catch(e){if(!failed){failed=true;primary=e;}}if(failed){hasFailure=true;lastFailure=primary;throw primary;}closed=true;})();pending.then(()=>{pending=null;},()=>{pending=null;});return pending;}};owner.release=()=>owner.dispose();return owner;
}
const planFailure=(reason,details={})=>new EngineError('SOURCE_SCOPE_UNSUPPORTED','The complete native Energy context plan is unavailable.',{details:{phase:'energy-context-planning',reason,...details}});

/** Geometry only. onOwner is synchronous and mandatory: a refused cleanup must
 * remain reachable by the parent even when this Promise rejects with 0/false.
 * Domain/view must be the same immutable compiled Original certificate.
 * Coverage counts RGB supports, NOT a common statistical Energy population. */
export async function planEnergyNativeContexts({domain,view,requestedBlock},{budget,signal,onOwner}={}){
 requireValue(budget&&typeof budget.reserve==='function'&&typeof onOwner==='function','A budget and synchronous Energy plan owner capture are required.');
 const owner=retirementOwner();onOwner(owner);
 const joined=signal?AbortSignal.any([signal,owner.signal]):owner.signal,cooperate=createCooperator(joined);
 let reservedBytes=0;
 const reserve=bytes=>{requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Energy planning bytes exceed exact addressing.');checkAbort(joined);const free=budget.reserve(bytes);owner.hold(free);reservedBytes+=bytes;};
 try{
  reserve(8192);
  requireValue(domain?.schema==='sherloq.source-region-domain/1'&&Object.isFrozen(domain)&&typeof domain.rowIntervals==='function'&&/^[a-f0-9]{64}$/.test(domain.sourceSha256??'')&&Array.isArray(domain.origin)&&domain.origin.length===2,'An immutable compiled Original Energy domain is required.');
  requireValue([16,32,64,96].includes(requestedBlock),'Invalid native Energy block.');
  const W=domain.width,H=domain.height;requireValue([W,H].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=131072)&&Number.isSafeInteger(domain.countIncluded)&&domain.countIncluded>=0,'Invalid Energy domain dimensions.');
  requireValue(domain.empty?domain.countIncluded===0&&W===0&&H===0:view?.domain===domain&&view.descriptor?.sourceRegionDomain?.fingerprint===domain.fingerprint,'Energy planning view and domain certificates differ.');
  // The parent owns immutable input polygons. A row call also creates
  // crossings, polygon/union/subtraction/intersection lists for each ceiling.
  // Admit those before calling it, not merely the final (width-bounded) row.
  // 2048 per vertex is a conservative transport-metadata envelope for these
  // sequential lists and their sort scratch; it is not an engine RSS claim.
  let domainLevels=0,domainVertices=0,slow=domain.descriptor,fast=domain.descriptor;
  for(let certificate=domain.descriptor;certificate;certificate=certificate.ceiling){
   await cooperate();requireValue(Object.isFrozen(certificate)&&Array.isArray(certificate.snapshot?.zones),'Energy domain needs its compiled certificate chain.');domainLevels++;domainVertices+=4;
   for(const zone of certificate.snapshot.zones){await cooperate();requireValue(Array.isArray(zone.polygon),'Energy domain has no certified polygon.');domainVertices+=zone.polygon.length;}
   slow=slow?.ceiling;fast=fast?.ceiling?.ceiling;requireValue(!fast||fast!==slow,'Energy domain certificate chain is cyclic.');
  }
  const rowScratchBytes=128+256*Math.ceil(W/2)+4096*domainLevels+2048*domainVertices;reserve(rowScratchBytes+4*(W+1)+Math.ceil((W+1)/8));
  const previous=new Uint32Array(W+1),bits=new Uint8Array(Math.ceil((W+1)/8));let B=0,S=0,scans=0;
  let edges,offsets,spans;
  async function scan(fill){let b=0,s=0,priorLength=-1,total=0;
   for(let y=0;y<H;y++){
    await cooperate();const row=domain.rowIntervals(y);scans++;
    requireValue(Array.isArray(row)&&row.length<=Math.ceil(W/2),'Invalid canonical Energy row.');let last=-1,same=row.length*2===priorLength;
    for(let i=0;i<row.length;i++){if((i&127)===0)await cooperate();const pair=row[i];requireValue(Array.isArray(pair)&&pair.length===2&&pair.every(Number.isSafeInteger)&&pair[0]>last&&pair[0]>=0&&pair[0]<pair[1]&&pair[1]<=W,'Energy rows must contain canonical disjoint integer spans.');last=pair[1];total+=pair[1]-pair[0];if(previous[i*2]!==pair[0]||previous[i*2+1]!==pair[1])same=false;}
    if(!same){if(fill){requireValue(b<B&&s+row.length<=S,'Energy geometry changed between planning passes.');edges[b]=y;offsets[b]=s;for(const[a,z]of row){spans[s*2]=a;spans[s*2+1]=z;s++;}}else{s+=row.length;for(const[a,z]of row){bits[a>>>3]|=1<<(a&7);bits[z>>>3]|=1<<(z&7);}}b++;}
    for(let i=0;i<row.length;i++){previous[i*2]=row[i][0];previous[i*2+1]=row[i][1];}priorLength=row.length*2;
   }
   requireValue(total===domain.countIncluded,'Energy geometry differs from its certified population.');
   if(fill){requireValue(b===B&&s===S,'Energy geometry changed between planning passes.');edges[B]=H;offsets[B]=S;}return{B:b,S:s};
  }
  ({B,S}=await scan(false));requireValue(S<2**32&&B<2**32,'Energy band storage exceeds Uint32 addressing.');
  let U=0;for(let x=0;x<=W;x++){if((x&1023)===0)await cooperate();if(bits[x>>>3]&(1<<(x&7)))U++;}
  reserve(8*(B+1)+8*S+12*U);edges=new Uint32Array(B+1);offsets=new Uint32Array(B+1);spans=new Uint32Array(2*S);const xs=new Uint32Array(U),a=new Uint32Array(U),b=new Uint32Array(U);for(let x=0,at=0;x<=W;x++)if(bits[x>>>3]&(1<<(x&7)))xs[at++]=x;
  await scan(true);
  const preservedRectangle=B===1&&S===1&&spans[0]===0&&spans[1]===W;
  let C=0,contextRgbPositions=0,geomMax=0,pairs=0,comparisons=0,records;
  async function enumerate(fill){let count=0,area=0,maxima=0;
   for(let i=0;i<B;i++){
    let common=a,scratch=b,length=2*(offsets[i+1]-offsets[i]);common.set(spans.subarray(offsets[i]*2,offsets[i+1]*2),0);
    for(let j=i;j<B&&length;j++){
     await cooperate();pairs++;
     if(j>i){let p=0,q=offsets[j]*2,n=0,end=offsets[j+1]*2;while(p<length&&q<end){if((comparisons++&127)===0)await cooperate();const l=Math.max(common[p],spans[q]),r=Math.min(common[p+1],spans[q+1]);if(l<r){scratch[n++]=l;scratch[n++]=r;}if(common[p+1]<spans[q+1])p+=2;else q+=2;}[common,scratch]=[scratch,common];length=n;if(!length)break;}
     let up=i?offsets[i-1]*2:0,down=j+1<B?offsets[j+1]*2:0;
     for(let k=0;k<length;k+=2){await cooperate();const l=common[k],r=common[k+1];if(i)while(up<offsets[i]*2&&spans[up+1]<=l)up+=2;if(j+1<B)while(down<offsets[j+2]*2&&spans[down+1]<=l)down+=2;
      const extendUp=i&&up<offsets[i]*2&&spans[up]<=l&&spans[up+1]>=r,extendDown=j+1<B&&down<offsets[j+2]*2&&spans[down]<=l&&spans[down+1]>=r;if(extendUp||extendDown)continue;maxima++;
      const w=r-l,h=edges[j+1]-edges[i],rect={x:l,y:edges[i],width:w,height:h};
      if(!preservedRectangle&&(w>MAX_SIDE||h>MAX_SIDE||w*h>=ADDRESS))throw planFailure('native-limit-aware-maxima-not-enumerated',{bounds:[l,edges[i],r,edges[j+1]],nativeLimits:{maximumSide:MAX_SIDE,addressExclusive:ADDRESS}});
      const admission=energyNativeContextAdmission(rect,requestedBlock);if(!admission.evaluable)continue;if(++count>LIMIT)throw planFailure('context-count-exceeds-consumer-limit',{limit:LIMIT,requiredAtLeast:count});area+=w*h;
      if(fill){requireValue(count<=C,'Energy maxima changed between planning passes.');const at=(count-1)*6;records.set([l,edges[i],r,edges[j+1],admission.effectiveBlock,admission.completeCells],at);}
     }
    }
   }
   if(fill)requireValue(count===C&&area===contextRgbPositions&&maxima===geomMax,'Energy maxima changed between planning passes.');return{count,area,maxima};
  }
  const counted=await enumerate(false);C=counted.count;contextRgbPositions=counted.area;geomMax=counted.maxima;
  const template={id:'x'.repeat(100),bounds:[0,0,0,0],originalBounds:[0,0,0,0],width:1,height:1,jpegPhase:[0,0],evaluable:true,status:'admissible-unexecuted',admission:energyNativeContextAdmission({width:80,height:80},16)};
  reserve(24*C+4*(B+1)+16*C+4*Math.max(0,U-1)+8*(C+1)+C*sourceRegionTransportBytes(template)*4+8192);
  records=new Uint32Array(6*C);await enumerate(true);
  // In-place heap sort of six-word records: no hidden candidate list/sort copy.
  const compare=(i,j)=>records[i*6+1]-records[j*6+1]||records[i*6]-records[j*6]||records[i*6+3]-records[j*6+3]||records[i*6+2]-records[j*6+2];
  const swap=(i,j)=>{for(let k=0;k<6;k++){const t=records[i*6+k];records[i*6+k]=records[j*6+k];records[j*6+k]=t;}};
  async function sift(root,end){while(root*2+1<end){await cooperate();let child=root*2+1;if(child+1<end&&compare(child,child+1)<0)child++;if(compare(root,child)>=0)return;swap(root,child);root=child;}}
  for(let i=Math.floor(C/2)-1;i>=0;i--)await sift(i,C);for(let end=C-1;end>0;end--){swap(0,end);await sift(0,end);}
  const heads=new Int32Array(B+1).fill(-1),eventContext=new Int32Array(2*C),next=new Int32Array(2*C),multiplicity=new Int32Array(Math.max(0,U-1)),bins=new Float64Array(C+1);
  const find=(array,value)=>{let l=0,h=array.length;while(l<h){const m=(l+h)>>>1;if(array[m]<value)l=m+1;else h=m;}requireValue(array[l]===value,'Energy context edge lost its canonical coordinate.');return l;};
  for(let i=0;i<C;i++){await cooperate();for(let side=0;side<2;side++){const at=i*2+side,band=find(edges,records[i*6+(side?3:1)]);eventContext[at]=side?-(i+1):i+1;next[at]=heads[band];heads[band]=at;}}
  let coveredUniquePixels=0,maximumMultiplicity=0,weighted=0,selected=0;
  for(let band=0;band<=B;band++){
   await cooperate();for(let e=heads[band];e>=0;e=next[e]){const c=Math.abs(eventContext[e])-1,delta=eventContext[e]>0?1:-1,l=find(xs,records[c*6]),r=find(xs,records[c*6+2]);for(let x=l;x<r;x++){if((x&127)===0)await cooperate();multiplicity[x]+=delta;requireValue(multiplicity[x]>=0,'Energy coverage event is unbalanced.');}}
   if(band===B)break;const dy=edges[band+1]-edges[band];for(let s=offsets[band];s<offsets[band+1];s++){const first=find(xs,spans[s*2]),last=find(xs,spans[s*2+1]);for(let x=first;x<last;x++){if((x&127)===0)await cooperate();const k=multiplicity[x],pixels=(xs[x+1]-xs[x])*dy;bins[k]+=pixels;selected+=pixels;weighted+=k*pixels;if(k){coveredUniquePixels+=pixels;maximumMultiplicity=Math.max(maximumMultiplicity,k);}}}
  }
  requireValue(selected===domain.countIncluded&&weighted===contextRgbPositions&&multiplicity.every(k=>k===0),'Energy coverage and context populations differ.');
  const header=JSON.stringify([ENERGY_CONTEXT_PLAN_POLICY,domain.sourceSha256,domain.origin,W,H,requestedBlock,C]);reserve(4096+8*(B+1)+8*S+24*C);const encoded=new TextEncoder().encode(header),hashInput=new Uint8Array(4+encoded.length+8*(B+1)+8*S+24*C),dv=new DataView(hashInput.buffer);dv.setUint32(0,encoded.length,true);hashInput.set(encoded,4);let at=4+encoded.length;
  for(const values of[edges,offsets,spans,records])for(let i=0;i<values.length;i++){if((i&127)===0)await cooperate();dv.setUint32(at,values[i],true);at+=4;}
  const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',hashInput))].map(x=>x.toString(16).padStart(2,'0')).join('');checkAbort(joined);
  const contexts=[];for(let i=0;i<C;i++){await cooperate();const v=records.subarray(i*6,i*6+6),bounds=[v[0],v[1],v[2],v[3]],admission=energyNativeContextAdmission({width:v[2]-v[0],height:v[3]-v[1]},requestedBlock);contexts.push(Object.freeze({id:'energy_ctx_'+fingerprint+'_'+i,bounds:Object.freeze(bounds),originalBounds:Object.freeze(bounds.map((x,j)=>x+domain.origin[j%2])),width:v[2]-v[0],height:v[3]-v[1],jpegPhase:Object.freeze([0,0]),evaluable:true,status:'admissible-unexecuted',admission:Object.freeze({...admission,nativeDimensions:Object.freeze(admission.nativeDimensions)})}));}
  const histogram=[];for(let k=0;k<bins.length;k++)if(bins[k])histogram.push(Object.freeze({multiplicity:k,pixels:bins[k]}));
  const rectangleAdmission=preservedRectangle?energyNativeContextAdmission({width:W,height:H},requestedBlock):null,rectangle=preservedRectangle?Object.freeze({bounds:Object.freeze([0,0,W,H]),admission:Object.freeze({...rectangleAdmission,nativeDimensions:Object.freeze(rectangleAdmission.nativeDimensions)})}):null;
  return Object.freeze({policy:ENERGY_CONTEXT_PLAN_POLICY,fingerprint,sourceSha256:domain.sourceSha256,domainFingerprint:domain.fingerprint,origin:Object.freeze([...domain.origin]),width:W,height:H,requestedBlock,contexts:Object.freeze(contexts),preservedRectangle,rectangle,status:domain.empty?'empty':C?'admissible-unexecuted':'native-not-evaluable',coverage:Object.freeze({selectedPixels:domain.countIncluded,coveredUniquePixels,uncoveredSelectedPixels:domain.countIncluded-coveredUniquePixels,contextRgbPositions,overlapExtraPositions:contextRgbPositions-coveredUniquePixels,maximumMultiplicity,histogram:Object.freeze(histogram)}),planning:Object.freeze({domainLevels,domainVertices,rowScratchBytes,bands:B,spans:S,xCoordinates:U,contexts:C,maximalRectangles:geomMax,rowScans:scans,bandPairsVisited:pairs,intervalComparisons:comparisons,enumerationPasses:2,bandPairsPerPassBound:(BigInt(B)*BigInt(B+1)/2n).toString(),candidateComponentsPerPassBound:(BigInt(B)*BigInt(B+1)/2n*BigInt(Math.floor(U/2))).toString(),reservedBytes}),owner,release:owner.release,dispose:()=>owner.dispose()});
 }catch(primary){try{await owner.dispose();}catch{}throw primary;}
}
