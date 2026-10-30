import "../../runtime-context.js?v=0.30.0";
import{requireValue,checkAbort,createCooperator}from'./errors.js';
import{sourceRegionTransportBytes}from'./source-region-transport.js';
function intersection(a,b){const result=[];let i=0,j=0;while(i<a.length&&j<b.length){const left=Math.max(a[i][0],b[j][0]),right=Math.min(a[i][1],b[j][1]);if(right>left)result.push([left,right]);if(a[i][1]<b[j][1])i++;else j++;}return result;}
/** Complete physical8x8 Y support, in the already-oriented Original grid.
 * It is equivalent to testing every raw block for orientation1, while work
 * follows admitted row spans rather than the width of a huge empty envelope. */
export async function planDocTamperBlockContexts(domain,{budget,signal}={}){
 requireValue(domain&&typeof domain.originalRowIntervals==='function'&&Array.isArray(domain.origin)&&typeof domain.fingerprint==='string'&&budget,'A certified Original DTD domain and shared budget are required.');
 const w=domain.sourceWidth,h=domain.sourceHeight,credit=budget.reserve(65536+sourceRegionTransportBytes(domain.descriptor,{allowUndefined:true,allowAliases:true})*8),leases=[],contexts=[],cooperate=createCooperator(signal);let active=new Map(),evaluatedPixels=0,completeBlocks=0,rowsVisited=0,spanIntersections=0;
 const emit=r=>{contexts.push(Object.freeze({index:contexts.length,bounds:Object.freeze([r.x,r.y,r.x+r.width,r.y+r.height]),domainFingerprint:domain.fingerprint,pixels:r.width*r.height}));};
 try{
  const first=Math.floor(domain.origin[1]/8)*8,last=Math.min(h,Math.ceil((domain.origin[1]+domain.height)/8)*8);
  for(let y=first;y<last;y+=8){await cooperate();rowsVisited++;const height=Math.min(8,h-y);let spans=domain.originalRowIntervals(y);
   for(let yy=y+1;yy<y+height&&spans.length;yy++){await cooperate();spans=intersection(spans,domain.originalRowIntervals(yy));spanIntersections++;}
   const runs=[];for(const[a,b]of spans){const x=Math.ceil(a/8)*8,right=b===w?w:Math.floor(b/8)*8;if(right>x){runs.push([x,right]);evaluatedPixels+=(right-x)*height;completeBlocks+=Math.ceil((right-x)/8);}}
   const next=new Map();for(const[x,right]of runs){const key=x+':'+right,prior=active.get(key);if(prior)next.set(key,{...prior,height:prior.height+height});else{leases.push(budget.reserve(4096));next.set(key,{x,y,width:right-x,height});}}
   for(const[key,r]of active)if(!next.has(key))emit(r);active=next;
  }
  for(const r of active.values())emit(r);checkAbort(signal);requireValue(Number.isSafeInteger(evaluatedPixels)&&evaluatedPixels<=domain.countIncluded,'DTD complete block support exceeds its selected Original observations.');let released=false;
  return Object.freeze({contexts:Object.freeze(contexts),selectedPixels:domain.countIncluded,evaluatedPixels,nonEvaluablePixels:domain.countIncluded-evaluatedPixels,completeBlocks,domainFingerprint:domain.fingerprint,work:Object.freeze({rowsVisited,spanIntersections,fullWidthBlockScan:false}),release(){if(released)return;released=true;credit();for(const release of leases)release();}});
 }catch(e){credit();for(const release of leases)release();throw e;}
}
