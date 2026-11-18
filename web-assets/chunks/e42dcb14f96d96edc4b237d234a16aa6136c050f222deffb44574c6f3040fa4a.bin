import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {allocateTypedArray} from './allocation.js';
import {withRetirementOwner} from './owner-retirement-error.js';

// Small complete model and bounded presentation observations, owned by actual
// Core table descriptors. No full image is cloned or hidden in a cache entry.
export function createPcaResultTables(basis,sample,{budget,onOwner,copySample=false}={}){
 requireValue(basis instanceof Float64Array&&basis.length===15&&sample?.data?.rgb instanceof Uint8Array&&typeof onOwner==='function','A complete funded PCA model/sample is required.');
 let modelOwner,sampleOwner=copySample?null:sample,cloneOwner;const records={},prefixes=new Set();let disposal;
 const owner={tableRecords:records,get model(){return modelOwner?.data;},dispose(){if(disposal)return disposal;const task=(async()=>{for(const page of [...prefixes])page.release();for(const value of Object.values(records))await value.surface.dispose();if(modelOwner){modelOwner.release();modelOwner=null;}if(sampleOwner){await sampleOwner.release?.();sampleOwner=null;}if(cloneOwner){cloneOwner.release();cloneOwner=null;}})().catch(primary=>{throw withRetirementOwner(primary,owner,primary);});disposal=task;void task.finally(()=>{if(disposal===task)disposal=null;}).catch(()=>{});return task;}};
 const adopted=onOwner(owner);requireValue(adopted!==false&&adopted!==0&&!(adopted&&typeof adopted.then==='function'),'PCA table adoption must be synchronous.'); // All allocation prefixes are adopted now.
 // Local byte owners clear each retirement prefix only after success. A zero
 // backing return is a legitimate byte counter, never an ACK refusal.
 function ownArray(Type,length,label,{page=false,scope=prefixes}={}){
  let credit,backing,bytes=length*Type.BYTES_PER_ELEMENT,closed=false;
  const held={data:null,published:false,release(){if(closed)return;held.data=null;if(backing){const retired=backing();backing=null;if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??bytes);}if(credit){credit();credit=null;}closed=true;scope.delete(held);}};
  scope.add(held); // Constructor prefixes remain reachable through adopted owner.
  try{credit=budget.reserve(bytes);held.data=allocateTypedArray(Type,length,{label});backing=budget.registerBacking?.('array-buffer',bytes,{owner:'pca-table',label,identity:held.data.buffer});if(!page)scope.delete(held);return held;}
  catch(primary){try{held.release();}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;}
 }
 modelOwner=ownArray(Float64Array,15,'retained-binary64-model');modelOwner.data.set(basis);
 function table(name,{rows,columns,Type,format,value,retire,metadata={}}){
  const pending=new Set(),pages=new Set();let closed=false,closing=false,flight;const descriptor=Object.freeze({id:crypto.randomUUID(),revision:1,format,rowCount:rows,columns,order:'row,column',storage:'memory',...metadata});
  const api={descriptor,
   readRows({offset=0,length=4096}={},{signal}={}){requireValue(!closing&&!closed&&Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&offset<rows&&length>0,'Invalid PCA table page.');length=Math.min(length,rows-offset);const task=(async()=>{let output;try{checkAbort(signal);output=ownArray(Type,length*columns.length,name,{page:true,scope:pages});for(let r=0;r<length;r++){if(r%1024===0)checkAbort(signal);for(let c=0;c<columns.length;c++)output.data[r*columns.length+c]=value(offset+r,c);}checkAbort(signal);const page={tableId:descriptor.id,revision:1,offset,length,totalRows:rows,columns,data:output.data,done:offset+length===rows,release(){page.data=null;output.published=false;try{output.release();}catch(primary){throw withRetirementOwner(primary,owner,primary);}}};output.published=true;return page;}catch(primary){try{output?.release();}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;}})();pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task;},
   async readCsv(request,hooks={}){let page,credit;try{page=await api.readRows(request,hooks);credit=budget.reserve((page.length*columns.length*32+256)*4);let text=page.offset===0?columns.join(',')+'\r\n':'';for(let r=0;r<page.length;r++){if(r%1024===0)await controlCheckpoint(hooks.signal);text+=Array.from(page.data.subarray(r*columns.length,(r+1)*columns.length)).join(',')+'\r\n';}return{tableId:descriptor.id,revision:1,offset:page.offset,length:page.length,nextOffset:page.offset+page.length,totalRows:rows,done:page.done,mime:'text/csv',bytes:new TextEncoder().encode(text),release:credit};}catch(primary){credit?.();throw primary;}finally{page?.release();}},
   dispose(){if(closed)return Promise.resolve();if(flight)return flight;closing=true;const task=Promise.resolve().then(async()=>{await Promise.allSettled([...pending]);for(const page of [...pages]){if(page.published)throw new EngineError('BUSY','A PCA table page is still owned by its reader.');page.release();}await retire();closed=true;});flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;},
  };records[name]={surface:api};return api;
 }
 table('pca_model',{rows:5,columns:['B','G','R'],Type:Float64Array,format:'float64-table',value:(r,c)=>modelOwner.data[r*3+c],retire(){modelOwner?.release();modelOwner=null;},metadata:{role:'complete-PCA-binary64-model',rowLabels:['mean','PC1','PC2','PC3','variance'],channelOrder:'BGR'}});
 let d=sample.data;if(copySample){requireValue(!d.rgb16,'The independent compatibility copy is for8-bit clouds only.');cloneOwner=ownArray(Uint8Array,d.rgb.length,'independent-pca8-table-cloud');cloneOwner.data.set(d.rgb);d={...d,rgb:cloneOwner.data};}sample=null;let values=d.rgb16??d.rgb;const depth=d.inputDepth??8;
 table('pca_cloud',{rows:d.count,columns:['input_red','input_green','input_blue','display_red','display_green','display_blue'],Type:Float32Array,format:'float32-table',value:(r,c)=>c<3?values[r*3+c]:d.rgb[r*3+c-3],async retire(){d=null;values=null;if(sampleOwner){await sampleOwner.release?.();sampleOwner=null;}if(cloneOwner){cloneOwner.release();cloneOwner=null;}},metadata:{role:'bounded-presentation-observations-only',inputDepth:depth,inputDomain:d.inputDomain,colorDomain:d.colorDomain??'canonical-sdr-rgb8',population:d.total,stride:d.stride,sampling:d.sampling}});
 return owner;
}
