import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';

// Budgeted accumulation: no per-value JS objects and no fixed result-count cap.
// Output remains an owned typed array for the existing transport/cache contract.
export class TypedPages {
 constructor(Type,width,account,{pageRows=16384}={}){
  requireValue(typeof account==='function'&&Number.isSafeInteger(width)&&width>0,'Typed pages require memory admission.');
  this.Type=Type;this.width=width;this.account=account;this.pageRows=pageRows;this.pages=[];this.length=0;
 }
 push(...row){
  requireValue(row.length===this.width,'Invalid typed row.');
  let page=this.pages.at(-1);
  if(!page||page.used===page.capacity){
   let capacity=this.pageRows,release,data;
   for(;;){try{release=this.account(capacity*this.width*this.Type.BYTES_PER_ELEMENT+128);data=new this.Type(capacity*this.width);break;}catch(error){release?.();if(error.code!=='MEMORY_LIMIT'&&!(error instanceof RangeError))throw error;if(capacity===1)throw new EngineError('MEMORY_LIMIT','Typed result page cannot fit the shared budget.');capacity=Math.max(1,Math.floor(capacity/2));}}
   page={data,capacity,used:0,start:this.length,release};this.pages.push(page);
  }
  page.data.set(row,page.used*this.width);page.used++;this.length++;
 }
 append(array){requireValue(array instanceof this.Type&&array.length%this.width===0,'Invalid typed page input.');for(let i=0;i<array.length;i+=this.width)this.push(...array.subarray(i,i+this.width));}
 get(index,column=0){let lo=0,hi=this.pages.length;while(lo+1<hi){const mid=(lo+hi)>>>1;if(this.pages[mid].start<=index)lo=mid;else hi=mid;}const p=this.pages[lo];return p.data[(index-p.start)*this.width+column];}
 finish(){
  this.account(this.length*this.width*this.Type.BYTES_PER_ELEMENT);let out;
  try{out=new this.Type(this.length*this.width);}catch{throw new EngineError('MEMORY_LIMIT','Contiguous result cannot fit; no results were truncated.');}
  for(const p of this.pages){out.set(p.data.subarray(0,p.used*this.width),p.start*this.width);p.data=null;p.release?.();}this.pages=[];return out;
 }
 dispose(){for(const p of this.pages){p.data=null;p.release?.();}this.pages=[];}
}

// Last assignment wins for G2NN, exactly as the native dictionary; sorting is
// global across pages. Spatial matches keep their original order within a zone.
export function finishCorrespondences(rows,{deduplicate=false,maxPairs=Number.MAX_SAFE_INTEGER}={}){
 const free=rows.account(rows.length*8); // index array plus stable-sort scratch
 try{
  const order=Uint32Array.from({length:rows.length},(_,i)=>i);
  order.sort((a,b)=>rows.get(a,4)-rows.get(b,4)||(deduplicate?(rows.get(a,0)-rows.get(b,0)||rows.get(a,1)-rows.get(b,1)):0)||a-b);
  const same=(a,b)=>rows.get(a,4)===rows.get(b,4)&&rows.get(a,0)===rows.get(b,0)&&rows.get(a,1)===rows.get(b,1);
  let count=0;for(let i=0;i<order.length;i++)if(!deduplicate||i===order.length-1||!same(order[i],order[i+1]))count++;
  if(count>maxPairs)throw new EngineError('MEMORY_LIMIT','Correspondences exceed the explicit caller limit.');
  rows.account(count*36);const pairs=new Float64Array(count*4),pairSearchRegions=new Int32Array(count);let at=0;
  for(let i=0;i<order.length;i++){if(deduplicate&&i+1<order.length&&same(order[i],order[i+1]))continue;const row=order[i];for(let d=0;d<4;d++)pairs[at*4+d]=rows.get(row,d);pairSearchRegions[at++]=rows.get(row,4);}
  return {pairs,pairSearchRegions};
 }finally{free?.();rows.dispose();}
}
