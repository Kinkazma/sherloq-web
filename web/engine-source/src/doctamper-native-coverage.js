import {requireValue,checkAbort,createCooperator} from './errors.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {allocateTypedArray} from './allocation.js';
function intersect(a,b){const out=[];let i=0,j=0;while(i<a.length&&j<b.length){const x=Math.max(a[i][0],b[j][0]),r=Math.min(a[i][1],b[j][1]);if(r>x)out.push([x,r]);if(a[i][1]<b[j][1])i++;else j++;}return out;}
/** Exact area of overlapping native contexts; the population is never the sum
 * of context areas. Sweep-line ownership counts repeated observations once. */
async function unionArea(contexts,{budget,signal}){
 if(!contexts.length)return 0;const release=budget.reserve(4096+contexts.length*1024),cooperate=createCooperator(signal);
 try{const xs=[...new Set(contexts.flatMap(c=>[c.bounds[0],c.bounds[2]]))].sort((a,b)=>a-b),at=new Map(xs.map((x,i)=>[x,i])),events=contexts.flatMap(c=>[{y:c.bounds[1],l:at.get(c.bounds[0]),r:at.get(c.bounds[2]),delta:1},{y:c.bounds[3],l:at.get(c.bounds[0]),r:at.get(c.bounds[2]),delta:-1}]).sort((a,b)=>a.y-b.y),n=xs.length-1,count=allocateTypedArray(Int32Array,n*4+8,{label:'DTD-coverage-counts'}),length=allocateTypedArray(Float64Array,n*4+8,{label:'DTD-coverage-length'});
  function update(p,left,right,a,b,d){if(a>=right||b<=left)return;if(a<=left&&right<=b)count[p]+=d;else{const mid=(left+right)>>>1;update(p*2,left,mid,a,b,d);update(p*2+1,mid,right,a,b,d);}length[p]=count[p]>0?xs[right]-xs[left]:right-left===1?0:length[p*2]+length[p*2+1];}
  let area=0,y=events[0].y;for(const e of events){await cooperate();area+=(e.y-y)*length[1];update(1,0,n,e.l,e.r,e.delta);y=e.y;}requireValue(Number.isSafeInteger(area),'DTD coverage exceeds the exact native coordinate range.');return area;
 }finally{release();}
}
/** Every valid512 window on the Original8-pixel phase is considered. Equal
 * adjacent intervals of window origins form a rectangle of origins; expanding
 * it by504 pixels gives a true admitted RGB rectangle, never an L-shape bbox.
 * Their union is precisely all pixels with an admissible native footprint.
 * No dense image-sized grid or per-position CNN call is constructed. */
export async function planDocTamperNativeCoverage(domain,{budget,signal}={}){
 checkAbort(signal);
 requireValue(domain&&typeof domain.originalRowIntervals==='function'&&budget,'A certified Original DTD domain and shared admission are required.');
 const w=domain.sourceWidth,h=domain.sourceHeight,aw=Math.floor(w/8)*8,ah=Math.floor(h/8)*8,releaseWork=budget.reserve(65536+sourceRegionTransportBytes(domain.descriptor,{allowUndefined:true,allowAliases:true})*128),leases=[],contexts=[],cooperate=createCooperator(signal),ring=[];let active=new Map(),physicalCompletePixels=0,nativeEligiblePixels=0,completeBlocks=0,rowsVisited=0;
 const emit=r=>{const bounds=[r.x,r.y,r.right+504,r.bottom+504];leases.push(budget.reserve(4096));contexts.push({bounds,domainFingerprint:domain.fingerprint,pixels:(bounds[2]-bounds[0])*(bounds[3]-bounds[1])});};
 try{
  const first=Math.floor(domain.origin[1]/8)*8,last=Math.min(h,Math.ceil((domain.origin[1]+domain.height)/8)*8);
  for(let y=first;y<last;y+=8){await cooperate();rowsVisited++;const height=Math.min(8,h-y);let spans=domain.originalRowIntervals(y);
   for(let yy=y+1;yy<y+height&&spans.length;yy++){await cooperate();spans=intersect(spans,domain.originalRowIntervals(yy));}
   const row=[];for(const[a,b]of spans){const x=Math.ceil(a/8)*8,right=b===w?w:Math.floor(b/8)*8;if(right<=x)continue;physicalCompletePixels+=(right-x)*height;completeBlocks+=Math.ceil((right-x)/8);const r=Math.min(right,aw);if(y<ah&&r>x){nativeEligiblePixels+=(r-x)*8;if(height===8)row.push([x,r]);}}
   if(height===8){ring.push(row);if(ring.length>64)ring.shift();}else ring.length=0;
   if(ring.length<64)continue;
   let common=ring[0];for(let i=1;i<64&&common.length;i++){await cooperate();common=intersect(common,ring[i]);}
   const top=y-504,next=new Map();for(const[x,right]of common){if(right-x<512)continue;const end=right-504,key=x+':'+end,prior=active.get(key);next.set(key,prior?{...prior,bottom:top+8}:{x,y:top,right:end,bottom:top+8});}
   for(const[key,r]of active)if(!next.has(key))emit(r);active=next;
  }
  for(const r of active.values())emit(r);
  // Stable top/left order is also the explicit first-context pixel owner order.
  contexts.sort((a,b)=>a.bounds[1]-b.bounds[1]||a.bounds[0]-b.bounds[0]||a.bounds[3]-b.bounds[3]||a.bounds[2]-b.bounds[2]);
  const evaluatedPixels=await unionArea(contexts,{budget,signal});requireValue(evaluatedPixels<=nativeEligiblePixels&&physicalCompletePixels<=domain.countIncluded,'DTD native footprint coverage exceeds admitted block support.');checkAbort(signal);let released=false;
  return Object.freeze({contexts:Object.freeze(contexts.map((c,index)=>Object.freeze({...c,index,bounds:Object.freeze(c.bounds)}))),selectedPixels:domain.countIncluded,evaluatedPixels,completeBlocks,partialStoredBlockPixels:domain.countIncluded-physicalCompletePixels,nativeBorderPixels:physicalCompletePixels-nativeEligiblePixels,noNativeContextPixels:nativeEligiblePixels-evaluatedPixels,nonEvaluablePixels:domain.countIncluded-evaluatedPixels,contextObservedPixels:contexts.reduce((n,c)=>n+c.pixels,0),domainFingerprint:domain.fingerprint,coverage:'maximal union of all admitted512x512 windows on the Original8-pixel phase',overlapOwnership:'first context in stable Original top/left/bottom/right order; native last-write within each context',work:Object.freeze({rowsVisited,denseGrid:false,windowOriginBands:contexts.length}),release(){if(released)return;released=true;releaseWork();for(const lease of leases)lease();}});
 }catch(error){releaseWork();for(const lease of leases)lease();throw error;}
}
