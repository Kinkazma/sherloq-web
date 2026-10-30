import {noisesnifferOwnerRetirement as retirement} from '../../src/noisesniffer-owner-retirement.js';
import {requireValue} from '../../src/errors.js';
import {preserveConvolutionPrimary} from './convolution-retirement.js';
// One cache lease and one independent lease per published view. The cached
// projection never retains its analysis entry, avoiding a parent/child cycle.
export async function createCertifiedProjectionOwner(value,interval,{budget,onRetirementOwner}={}){
 requireValue(value&&typeof value.dispose==='function'&&Array.isArray(interval)&&interval.length===2&&interval.every(Number.isSafeInteger)&&interval[0]>=0&&interval[0]<=interval[1]&&interval[1]<=5000&&budget?.reserve,'Certified projection owner required');
 let view=value,credit,refs=1,cached=true,closed=false;const range=Object.freeze([...interval]);
 const output=retirement([()=>view.dispose()]),metadata=retirement([async()=>{if(credit){await credit();credit=null;}}]);
 const close=retirement([async()=>{await output();await metadata();}],{onRetired(){closed=true;view=null;}});
 const release=async record=>{if(!record.released){record.released=true;refs--;requireValue(refs>=0,'Projection lease underflow');}if(refs===0)await close();};
 const cacheRecord={released:false},dropCache=retirement([()=>release(cacheRecord)]);
 const owner={interval:range,get references(){return refs;},get cached(){return cached;},get closed(){return closed;},
  admits(minimum){return cached&&!close.started&&Number.isInteger(minimum)&&minimum>=range[0]&&minimum<=range[1];},
  async acquire(minimum){
   requireValue(owner.admits(minimum),'Projection cache is not admitted');const record={released:false},dispose=retirement([()=>release(record)]);refs++;
   try{return{...view,dispose,release:dispose};}catch(error){try{await dispose();}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw error;}
  },
  dispose(){cached=false;return dropCache();}
 };
 try{onRetirementOwner?.(owner);credit=budget.reserve(2048);return owner;}catch(error){try{await owner.dispose();}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw error;}
}
