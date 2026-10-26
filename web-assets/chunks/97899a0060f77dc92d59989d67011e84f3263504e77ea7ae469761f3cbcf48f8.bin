import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort,createCooperator} from './errors.js';

const right=r=>r.x+r.width,bottom=r=>r.y+r.height;
const order=(a,b)=>a.y-b.y||a.x-b.x||bottom(a)-bottom(b)||right(a)-right(b);
function union(spans){
 spans.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const out=[];
 for(const [a,b]of spans){const last=out.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else out.push([a,b]);}return out;
}
function intersection(a,b){const out=[];let i=0,j=0;while(i<a.length&&j<b.length){const x=Math.max(a[i][0],b[j][0]),r=Math.min(a[i][1],b[j][1]);if(x<r)out.push([x,r]);if(a[i][1]<b[j][1])i++;else j++;}return out;}
function subtract(a,b){const out=[];let x=a[0];for(const [l,r]of b){if(r<=x)continue;if(l>=a[1])break;if(l>x)out.push([x,Math.min(l,a[1])]);x=Math.max(x,r);if(x>=a[1])break;}if(x<a[1])out.push([x,a[1]]);return out;}
function splitAxis(start,length,alignment,maximum){
 const size=Math.min(Math.floor(length/alignment)*alignment,Math.floor(maximum/alignment)*alignment);requireValue(size>0,'A native context has no aligned extent.');
 const out=[];for(let x=start;x<start+length;x+=size){const at=Math.min(x,start+length-size);if(out.at(-1)!==at)out.push(at);if(at+size===start+length)break;}return{size,starts:out};
}

/** Geometry only. Cover the union of ALL fully admitted minimum-size windows,
 * rather than treating a disjoint partition's narrow stripes as a CNN limit.
 * Rectangles may overlap for context, but first-context ownership is disjoint
 * BEFORE any normalization or feature bank is built. No RGB is read here.
 * Alignment controls dimensions, not the phase of each rectangle's origin.
 * A single admitted rectangle preserves its original native resizing contract. */
export async function planAdmittedNativeContexts(view,{width=view?.descriptor?.width,height=view?.descriptor?.height,minimumWidth,minimumHeight,alignmentX=1,alignmentY=1,maximumWidth=Number.MAX_SAFE_INTEGER,maximumHeight=Number.MAX_SAFE_INTEGER,preserveRectangle=true,retainNonOwningContexts=false,budget,signal}={}){
 requireValue(view?.admittedRectangles&&view?.includesRectangle&&budget?.reserve,'An admitted RGB view and budget are required.');
 for(const n of [width,height,minimumWidth,minimumHeight,alignmentX,alignmentY,maximumWidth,maximumHeight])requireValue(Number.isSafeInteger(n)&&n>0,'Native context dimensions must be positive safe integers.');
 requireValue(Number.isSafeInteger(width*height)&&minimumWidth%alignmentX===0&&minimumHeight%alignmentY===0&&maximumWidth>=minimumWidth&&maximumHeight>=minimumHeight,'Native context alignment/limits are inconsistent.');
 requireValue(typeof retainNonOwningContexts==='boolean','Native context retention must be explicit.');
 checkAbort(signal);const cooperate=createCooperator(signal),temporary=[],retained=[],reserve=(list,n=256)=>{const free=budget.reserve(n);list.push(free);},rectangles=[],contexts=[];let completed=false;
 reserve(retained,4096);
 try{
  for(const value of view.admittedRectangles()){
   await cooperate();requireValue(value&&[value.x,value.y,value.width,value.height].every(Number.isSafeInteger)&&value.x>=0&&value.y>=0&&value.width>0&&value.height>0&&right(value)<=width&&bottom(value)<=height,'Invalid admitted rectangle.');
   requireValue(view.includesRectangle(value),'A context-cover input rectangle contains forbidden RGB.');reserve(temporary);rectangles.push({...value});
  }
  // Row bands come from the VIEW's admitted context, not view.domain, which may
  // instead certify candidate membership and intentionally exclude RGB gaps.
  const ys=new Set([0,height]);for(const r of rectangles){ys.add(r.y);ys.add(bottom(r));}const cuts=[...ys].sort((a,b)=>a-b),bands=[];let sourceAdmittedPixels=0;
  for(let i=0;i+1<cuts.length;i++){
   await cooperate();const y=cuts[i],end=cuts[i+1],spans=union(rectangles.filter(r=>r.y<=y&&bottom(r)>=end).map(r=>[r.x,right(r)]));reserve(temporary,256+spans.length*64);bands.push({y,end,spans});for(const[a,b]of spans)sourceAdmittedPixels+=(b-a)*(end-y);
  }
  const unique=new Set(),addContext=rect=>{
   const key=[rect.x,rect.y,rect.width,rect.height].join(':');if(unique.has(key))return;
   requireValue(rect.width>=minimumWidth&&rect.height>=minimumHeight&&rect.width<=maximumWidth&&rect.height<=maximumHeight&&view.includesRectangle(rect),'A proposed native context is not wholly admitted.');reserve(retained,512);unique.add(key);contexts.push({...rect});
  };
  const emit=rect=>{
   // A change in a minimum-window start band is not a boundary of the RGB
   // context. Grow to the real admitted edges before native-size splitting,
   // otherwise an early narrow strip would own pixels despite a taller real
   // context being available for exactly the same observations.
   const contains=band=>band.spans.some(([a,b])=>a<=rect.x&&b>=right(rect));let first=bands.findIndex(b=>b.end>rect.y),last=first;while(last+1<bands.length&&bands[last+1].y<bottom(rect))last++;
   while(first>0&&contains(bands[first-1]))first--;while(last+1<bands.length&&contains(bands[last+1]))last++;
   let common=bands[first].spans;for(let i=first+1;i<=last;i++)common=intersection(common,bands[i].spans);const span=common.find(([a,b])=>a<=rect.x&&b>=right(rect));requireValue(span,'Native context expansion lost its admitted source interval.');rect={x:span[0],y:bands[first].y,width:span[1]-span[0],height:bands[last].end-bands[first].y};
   const xs=splitAxis(rect.x,rect.width,alignmentX,maximumWidth),ys=splitAxis(rect.y,rect.height,alignmentY,maximumHeight);for(const y of ys.starts)for(const x of xs.starts)addContext({x,y,width:xs.size,height:ys.size});
  };
  const nonempty=bands.filter(b=>b.spans.length),bounds=nonempty.length?{x:Math.min(...nonempty.flatMap(b=>b.spans.map(s=>s[0]))),y:nonempty[0].y,width:0,height:nonempty.at(-1).end-nonempty[0].y}:null;
  if(bounds)bounds.width=Math.max(...nonempty.flatMap(b=>b.spans.map(s=>s[1])))-bounds.x;
  const oneRectangle=bounds&&sourceAdmittedPixels===bounds.width*bounds.height;
  let preservedRectangle=false;
  if(oneRectangle&&preserveRectangle&&bounds.width>=minimumWidth&&bounds.height>=minimumHeight&&bounds.width<=maximumWidth&&bounds.height<=maximumHeight){addContext(bounds);preservedRectangle=true;}
  else if(width>=minimumWidth&&height>=minimumHeight){
   const last=height-minimumHeight+1,startCuts=new Set([0,last]);for(const b of bands)for(const boundary of[b.y,b.end])for(const y of[boundary,boundary-minimumHeight+1])if(y>0&&y<last)startCuts.add(y);
   const starts=[...startCuts].sort((a,b)=>a-b);let active=new Map();
   for(let i=0;i+1<starts.length;i++){
    await cooperate();const y=starts[i],end=starts[i+1];let common=null;
    for(const band of bands){if(band.end<=y||band.y>=y+minimumHeight)continue;common=common===null?band.spans:intersection(common,band.spans);if(!common.length)break;}
    const next=new Map();for(const[a,b]of common??[]){if(b-a<minimumWidth)continue;const r=b-minimumWidth+1,key=a+':'+r,prior=active.get(key);reserve(temporary);next.set(key,prior?{...prior,end}:{x:a,right:r,y,end});}
    for(const[key,r]of active)if(!next.has(key))emit({x:r.x,y:r.y,width:r.right-r.x+minimumWidth-1,height:r.end-r.y+minimumHeight-1});active=next;
   }
   for(const r of active.values())emit({x:r.x,y:r.y,width:r.right-r.x+minimumWidth-1,height:r.end-r.y+minimumHeight-1});
  }
  contexts.sort(order);let uniqueObservedPixels=0,contextObservedPixels=0;
  for(let index=0;index<contexts.length;index++){
   await cooperate();const context=contexts[index],prior=contexts.slice(0,index),ycuts=new Set([context.y,bottom(context)]);for(const r of prior)if(bottom(r)>context.y&&r.y<bottom(context)){ycuts.add(Math.max(r.y,context.y));ycuts.add(Math.min(bottom(r),bottom(context)));}const rows=[...ycuts].sort((a,b)=>a-b),owned=[];let active=new Map();
   for(let i=0;i+1<rows.length;i++){
    await cooperate();const y=rows[i],end=rows[i+1],taken=union(prior.filter(r=>r.y<=y&&bottom(r)>=end).map(r=>[r.x,right(r)])),spans=subtract([context.x,right(context)],taken),next=new Map();
    for(const[a,b]of spans){const key=a+':'+b,existing=active.get(key);if(existing){existing.height=end-existing.y;next.set(key,existing);}else{reserve(retained);const r={x:a,y,width:b-a,height:end-y};owned.push(r);next.set(key,r);}}active=next;
   }
   context.index=index;context.ownedRectangles=Object.freeze(owned.map(Object.freeze));context.ownedPixels=owned.reduce((n,r)=>n+r.width*r.height,0);uniqueObservedPixels+=context.ownedPixels;
  }
  // A context already covered in full owns no observation or candidate. It
  // contributes no normalization sample and needs no model execution.
  if(!retainNonOwningContexts)for(let i=contexts.length-1;i>=0;i--)if(!contexts[i].ownedPixels)contexts.splice(i,1);
  contexts.forEach((context,index)=>{context.index=index;contextObservedPixels+=context.width*context.height;Object.freeze(context);});
  const unsupportedRectangles=[];let unsupportedActive=new Map();
  for(const band of bands){
   const ycuts=new Set([band.y,band.end]);for(const r of contexts)if(bottom(r)>band.y&&r.y<band.end){ycuts.add(Math.max(band.y,r.y));ycuts.add(Math.min(band.end,bottom(r)));}const rows=[...ycuts].sort((a,b)=>a-b);
   for(let i=0;i+1<rows.length;i++){
    await cooperate();const y=rows[i],end=rows[i+1],taken=union(contexts.filter(r=>r.y<=y&&bottom(r)>=end).map(r=>[r.x,right(r)])),next=new Map();
    for(const span of band.spans)for(const[a,b]of subtract(span,taken)){const key=a+':'+b,existing=unsupportedActive.get(key);if(existing&&bottom(existing)===y){existing.height=end-existing.y;next.set(key,existing);}else{reserve(retained);const r={x:a,y,width:b-a,height:end-y};unsupportedRectangles.push(r);next.set(key,r);}}unsupportedActive=next;
   }
  }
  checkAbort(signal);let disposed=false;completed=true;
  const alive=()=>requireValue(!disposed,'Native context coverage was retired.');
  return{contexts:Object.freeze(contexts),unsupportedRectangles:Object.freeze(unsupportedRectangles.map(Object.freeze)),sourceAdmittedPixels,uniqueObservedPixels,contextObservedPixels,noNativeSupportPixels:sourceAdmittedPixels-uniqueObservedPixels,preservedRectangle,
   policy:'complete-admitted-native-window-cover/1',ownership:'first context in Original row/column/bottom/right order; overlapping RGB context is not a duplicated observation',
   ownsPoint(index,x,y){alive();return contexts[index]?.ownedRectangles.some(r=>x>=r.x&&x<right(r)&&y>=r.y&&y<bottom(r))??false;},
   ownedRowSpans(index,y){alive();return contexts[index]?.ownedRectangles.filter(r=>y>=r.y&&y<bottom(r)).map(r=>[r.x,right(r)])??[];},
   dispose(){if(disposed)return;disposed=true;for(const free of retained.splice(0))free();}};
 }finally{for(const free of temporary)free();if(!completed)for(const free of retained)free();}
}
