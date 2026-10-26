import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort,createCooperator} from './errors.js';

export const GHOST_CONTEXT_PLAN_VERSION='canonical-admitted-ghost-contexts/2';
const right=r=>r.x+r.width,bottom=r=>r.y+r.height;
const order=(a,b)=>a.y-b.y||a.x-b.x||bottom(a)-bottom(b)||right(a)-right(b);
function union(spans){spans.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const out=[];for(const[a,b]of spans){const p=out.at(-1);if(p&&a<=p[1])p[1]=Math.max(p[1],b);else out.push([a,b]);}return out;}
function intersect(a,b){const out=[];let i=0,j=0;while(i<a.length&&j<b.length){const l=Math.max(a[i][0],b[j][0]),r=Math.min(a[i][1],b[j][1]);if(l<r)out.push([l,r]);if(a[i][1]<b[j][1])i++;else j++;}return out;}
function subtract(spans,taken){const out=[];for(const[a,b]of spans){let x=a;for(const[l,r]of taken){if(r<=x)continue;if(l>=b)break;if(l>x)out.push([x,Math.min(l,b)]);x=Math.max(x,r);if(x>=b)break;}if(x<b)out.push([x,b]);}return out;}
function axis(size,extent,phase){if(!extent)return[];if(extent===size)return[[0,size]];const start=(size-phase)%size,end=start+extent;return end<=size?[[start,end]]:[[0,end-size],[start,size]];}

/** The inverse native circular phase of the COMPLETE cells, not of the RGB
 * rectangle. A wrapped footprint has at most four admitted rectangles. */
export function ghostCompleteFootprints(rect,roll=[0,0]){
 requireValue(roll.length===2&&roll.every(v=>Number.isInteger(v)&&v>=0&&v<=7),'Invalid native Ghost phase.');
 const columns=Math.floor(rect.width/16),rows=Math.floor(rect.height/16);if(!columns||!rows||rect.width>65500||rect.height>65500)return[];
 return axis(rect.height,rows*16,roll[1]).flatMap(([y,end])=>axis(rect.width,columns*16,roll[0]).map(([x,r])=>({x:rect.x+x,y:rect.y+y,width:r-x,height:end-y})));
}

/** Geometric expansion follows admitted-native-context-cover's band algorithm.
 * Ghost retains every candidate until COMPLETE native cells establish its
 * coverage; RGB first-owner pruning would lose valid cells in earlier tails.
 * No RGB, codec, sampled atlas or forbidden observations enter this planner. */
export async function planGhostNativeContexts(view,{budget,signal,roll=[0,0]}={}){
 requireValue(view?.admittedRectangles&&view?.includesRectangle&&budget?.reserve,'A certified Ghost source view and budget are required.');
 const cooperate=createCooperator(signal),temporary=[],retained=[],hold=(list,n=256)=>list.push(budget.reserve(n)),rectangles=[],candidates=[],unique=new Set();let complete=false;
 const add=r=>{const key=[r.x,r.y,r.width,r.height].join('/');if(unique.has(key))return;requireValue(view.includesRectangle(r),'A Ghost context contains excluded RGB.');hold(retained,1024);unique.add(key);candidates.push({...r});};
 try{
  hold(retained,4096);for(const r of view.admittedRectangles()){await cooperate();requireValue([r.x,r.y,r.width,r.height].every(Number.isSafeInteger)&&r.width>0&&r.height>0&&view.includesRectangle(r),'Invalid Ghost admitted geometry.');hold(temporary);rectangles.push({...r});}
  hold(temporary,4096+rectangles.length*256);const cuts=[...new Set(rectangles.flatMap(r=>[r.y,bottom(r)]))].sort((a,b)=>a-b),bands=[];let selected=0;
  for(let i=0;i+1<cuts.length;i++){await cooperate();const y=cuts[i],end=cuts[i+1],spans=union(rectangles.filter(r=>r.y<=y&&bottom(r)>=end).map(r=>[r.x,right(r)]));hold(temporary,256+spans.length*64);bands.push({y,end,spans});for(const[a,b]of spans)selected+=(b-a)*(end-y);}
  const emit=r=>{
   const contains=b=>b.spans.some(([a,z])=>a<=r.x&&z>=right(r));let first=bands.findIndex(b=>b.end>r.y),last=first;while(last+1<bands.length&&bands[last+1].y<bottom(r))last++;
   while(first>0&&contains(bands[first-1]))first--;while(last+1<bands.length&&contains(bands[last+1]))last++;
   let common=bands[first].spans;for(let i=first+1;i<=last;i++)common=intersect(common,bands[i].spans);const span=common.find(([a,b])=>a<=r.x&&b>=right(r));requireValue(span,'Ghost context expansion lost its admitted interval.');
   add({x:span[0],y:bands[first].y,width:span[1]-span[0],height:bands[last].end-bands[first].y});
  };
  const height=view.domain.height,last=height-16+1;
  if(last>0){const startCuts=new Set([0,last]);for(const b of bands)for(const z of[b.y,b.end])for(const y of[z,z-15])if(y>0&&y<last)startCuts.add(y);const starts=[...startCuts].sort((a,b)=>a-b);let active=new Map();
   for(let i=0;i+1<starts.length;i++){await cooperate();const y=starts[i],end=starts[i+1];let common=null;for(const b of bands){if(b.end<=y||b.y>=y+16)continue;common=common===null?b.spans:intersect(common,b.spans);if(!common.length)break;}
    const next=new Map();for(const[a,b]of common??[]){if(b-a<16)continue;const r=b-15,key=a+':'+r,prior=active.get(key);hold(temporary);next.set(key,prior?{...prior,end}:{x:a,right:r,y,end});}for(const[k,r]of active)if(!next.has(k))emit({x:r.x,y:r.y,width:r.right-r.x+15,height:r.end-r.y+15});active=next;
   }for(const r of active.values())emit({x:r.x,y:r.y,width:r.right-r.x+15,height:r.end-r.y+15});
  }
  // Preserve explicit unavailable fragments without inventing a 16px cell.
  const covered=[...candidates],unavailable=[];let unavailableActive=new Map();
  for(const b of bands){const ys=[...new Set([b.y,b.end,...covered.flatMap(r=>[Math.max(b.y,Math.min(b.end,r.y)),Math.max(b.y,Math.min(b.end,bottom(r)))])])].sort((a,z)=>a-z);for(let i=0;i+1<ys.length;i++){const y=ys[i],end=ys[i+1],taken=union(covered.filter(r=>r.y<=y&&bottom(r)>=end).map(r=>[r.x,right(r)])),next=new Map();for(const[a,z]of subtract(b.spans,taken)){const key=a+':'+z,old=unavailableActive.get(key);if(old&&bottom(old)===y){old.height=end-old.y;next.set(key,old);}else{hold(temporary);const r={x:a,y,width:z-a,height:end-y};unavailable.push(r);next.set(key,r);}}unavailableActive=next;}}
  for(const r of unavailable)add(r);
  candidates.sort(order);const contexts=[],prior=[];let uniqueScoredPixels=0,contextScoredPixels=0,contextPixels=0;
  for(const rect of candidates){await cooperate();const footprints=ghostCompleteFootprints(rect,roll),owned=[],active=new Map();const ys=[...new Set([...footprints,...prior].flatMap(r=>[r.y,bottom(r)]))].sort((a,b)=>a-b);
   for(let i=0;i+1<ys.length;i++){const y=ys[i],end=ys[i+1],spans=union(footprints.filter(r=>r.y<=y&&bottom(r)>=end).map(r=>[r.x,right(r)])),taken=union(prior.filter(r=>r.y<=y&&bottom(r)>=end).map(r=>[r.x,right(r)])),next=new Map();
    for(const[a,b]of subtract(spans,taken)){const key=a+':'+b,old=active.get(key);if(old&&bottom(old)===y){old.height=end-old.y;next.set(key,old);}else{hold(retained);const r={x:a,y,width:b-a,height:end-y};owned.push(r);next.set(key,r);}}active.clear();for(const[k,v]of next)active.set(k,v);
   }
   const ownedPixels=owned.reduce((n,r)=>n+r.width*r.height,0);uniqueScoredPixels+=ownedPixels;contextScoredPixels+=footprints.reduce((n,r)=>n+r.width*r.height,0);contextPixels+=rect.width*rect.height;prior.push(...footprints);contexts.push(Object.freeze({rect:Object.freeze(rect),ownedRectangles:Object.freeze(owned.map(Object.freeze)),ownedPixels}));
  }
  requireValue(Number.isSafeInteger(selected)&&Number.isSafeInteger(contextPixels)&&Number.isSafeInteger(contextScoredPixels)&&uniqueScoredPixels<=selected,'Ghost native coverage exceeds admitted membership.');checkAbort(signal);let disposed=false;complete=true;
  return{version:GHOST_CONTEXT_PLAN_VERSION,contexts:Object.freeze(contexts),selectedPixels:selected,uniqueScoredPixels,contextScoredPixels,contextPixels,release(){if(disposed)return;disposed=true;for(const free of retained.splice(0))free();}};
 }finally{for(const free of temporary)free();if(!complete)for(const free of retained)free();}
}
