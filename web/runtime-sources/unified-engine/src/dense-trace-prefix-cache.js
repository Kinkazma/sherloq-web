import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort} from './errors.js';
import {onceDenseRetirement} from './dense-owner-retirement.js';

function same(a,b){
 if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||a.constructor!==b.constructor)return false;
 if(ArrayBuffer.isView(a)){if(a.byteLength!==b.byteLength)return false;const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);return x.every((v,i)=>v===y[i]);}
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
}
const viewKey=view=>{const {traceOverlap,...key}=view;return key;};
const groupKey=groups=>groups.map(({index,rows})=>({index,rows:Array.from(rows)}));
// A single, explicitly financed presentation prefix belongs to one live native
// archive. A failed retirement remains reachable and cannot become a reader.
export function createDenseTracePrefixCache({result,budget}){
 let entry,closing=false;
 const stop=async current=>{
  current.retiring=true;
  await current.ready.catch(()=>{});
  if(current.readers)await new Promise(resolve=>current.waiters.push(resolve));
 };
 const retire=async current=>{
  await stop(current);
  await current.free();
  current.value=null;if(entry===current)entry=null;
 };
 const releaseReader=current=>{current.readers--;if(!current.readers)for(const resolve of current.waiters.splice(0))resolve();};
 return{
  forView(view){return{async reserveFrame(bytes,reserve,{signal}={}){
   checkAbort(signal);requireValue(!closing,'Dense trace prefix owner is retiring.');
   try{return reserve(bytes);}catch(error){
    const current=entry;
    if(error?.code!=='MEMORY_LIMIT'||!current||current.readers||current.building)throw error;
    // Optional persistent storage may not make the historical frame inadmissible.
    // Reuse no credit until the idle entry's actual retirement ACK.
    await retire(current);checkAbort(signal);return reserve(bytes);
   }
  },async acquire(native,groups,bytes,build,{signal}={}){
   requireValue(native===result&&!closing,'Dense trace prefix native owner has retired or changed.');checkAbort(signal);
   const key=viewKey(view),selected=groupKey(groups);
   for(;;){
    const current=entry;
    if(current&&(current.retiring||!same(current.view,key)||!same(current.groups,selected))){await retire(current);checkAbort(signal);requireValue(!closing,'Dense trace prefix owner is retiring.');continue;}
    let reused=!!current;
    if(!current){
     let free;try{free=budget.reserve(bytes);}catch(error){if(error?.code==='MEMORY_LIMIT')return null;throw error;}
     // The historical conservative bound is reserved before snapshots or build.
     const next={view:null,groups:null,readers:0,waiters:[],retiring:false,building:true,value:null,free:onceDenseRetirement(free),ready:Promise.resolve()};entry=next;
     try{next.view=structuredClone(key);next.groups=structuredClone(selected);}catch(error){await retire(next);throw error;}
     next.ready=Promise.resolve().then(async()=>{next.value=await build();return next.value;}).finally(()=>{next.building=false;});
    }
    const owned=entry;owned.readers++;let live=true;
    const release=()=>{if(live){live=false;releaseReader(owned);}};
    try{const value=await owned.ready;checkAbort(signal);requireValue(!owned.retiring&&!closing,'Dense trace prefix retired before its reader was admitted.');return{value,reused,release};}
    catch(error){release();if(closing)await stop(owned);else await retire(owned);throw error;}
   }
  }};},
  // Native archive retirement stops readers first; the credit is not returned
  // until its caller has received the archive's actual retirement ACK.
  retire:onceDenseRetirement(async()=>{closing=true;if(entry)await stop(entry);}),
  dispose:onceDenseRetirement(async()=>{closing=true;if(entry)await retire(entry);})
 };
}
