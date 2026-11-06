// Native Canvas allocation admission. Logical RGBA backing size is
// accounted; this is not an assertion about browser/GPU allocator overhead.
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
export function nativeCanvasBytes(width,height){const bytes=width*height*4;if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(bytes))throw new RangeError('Invalid native Canvas geometry.');return bytes;}
export function createAccountedNativeCanvasFactory(base,budget){
 if(!base||!['create','reset','destroy'].every(k=>typeof base[k]==='function')||typeof budget?.reserve!=='function')throw new TypeError('Native Canvas factory and Budget required.');
 const records=new Map(),retired=new WeakSet(),retiredAliases=new WeakSet();let closed=false,closeTask,bytes=0,peakBytes=0;
 function reserve(n){const release=budget.reserve(n);bytes+=n;peakBytes=Math.max(bytes,peakBytes);let live=true;return()=>{if(live){release();live=false;bytes-=n;}};}
 function admitted(width,height){if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError('Invalid native Canvas allocation.');return{width:Math.ceil(width),height:Math.ceil(height)};}
 function alive(){if(closed)throw new Error('Native Canvas factory closed.');}
 const factory={
  create(width,height){alive();const admittedSize=admitted(width,height),release=reserve(nativeCanvasBytes(admittedSize.width,admittedSize.height));let item;try{item=base.create(width,height);records.set(item.canvas,{item,releases:[release],width:item.canvas.width??admittedSize.width,height:item.canvas.height??admittedSize.height});return item;}catch(error){release();throw error;}},
  reset(item,width,height){alive();const current=records.get(item.canvas);if(!current)throw new Error('Unowned native Canvas.');
   // PDF.js5.6.205 resets width before height. Admit that reachable
   // intermediate backing, not the Cartesian product of old/new extremes.
   const size=admitted(width,height),finalBytes=nativeCanvasBytes(size.width,size.height),peakBytes=nativeCanvasBytes(size.width,Math.max(size.height,current.height));let next,temporary;
   try{next=reserve(finalBytes);temporary=peakBytes>finalBytes?reserve(peakBytes-finalBytes):()=>{};}catch(error){next?.();throw error;}
   const previous=[...current.releases];current.releases.push(next,temporary);
   try{base.reset(item,width,height);}catch(error){current.width=item.canvas?.width??current.width;current.height=item.canvas?.height??current.height;throw error;}
   for(const release of previous)release();temporary();current.releases=[next];current.width=item.canvas.width??size.width;current.height=item.canvas.height??size.height;
  },
  destroy(item){const canvas=item?.canvas;if(retiredAliases.has(item)||canvas&&retired.has(canvas))return;const current=records.get(canvas);if(!current)throw new Error('Unowned native Canvas.');base.destroy(item);for(const release of current.releases)release();records.delete(canvas);retired.add(canvas);retiredAliases.add(item);},
  get metrics(){return{backings:records.size,accountedBytes:bytes,peakBytes,closed};},
  dispose(){if(closeTask)return closeTask;closed=true;closeTask=retireCompositeOwners([...records.values()].map(record=>()=>factory.destroy(record.item)));closeTask.then(()=>{},()=>{closeTask=null;});return closeTask;}
 };
 return factory;
}
