import "../../runtime-context.js?v=0.24.0";
import {EngineError} from './errors.js';

/** Bound metadata admission before normalization creates immutable copies. */
export function sourceRegionTransportBytes(value,{allowUndefined=false,allowAliases=false}={}){
 const limit=1000000,stack=[[value,0]],seen=new WeakSet();let bytes=0,nodes=0;
 while(stack.length){const[item,depth]=stack.pop();if(++nodes>limit||depth>48)throw new EngineError('SOURCE_REGIONS_INVALID','Source-region transport exceeds its bounded metadata shape.');
  if(item===null||typeof item==='boolean'||item===undefined&&allowUndefined){bytes+=8;continue;}if(typeof item==='number'){bytes+=8;continue;}if(typeof item==='string'){bytes+=32+item.length*2;continue;}
  if(!item||typeof item!=='object'||!allowAliases&&seen.has(item)||!Array.isArray(item)&&![null,Object.prototype].includes(Object.getPrototypeOf(item)))throw new EngineError('SOURCE_REGIONS_INVALID','Source-region transport must be bounded plain metadata without cycles or unsupported ownership.');seen.add(item);bytes+=64;
  if(Array.isArray(item)){
   if(item.length>limit-nodes-stack.length)throw new EngineError('SOURCE_REGIONS_INVALID','Source-region array exceeds its metadata admission.');bytes+=item.length*16;
   for(let index=item.length-1;index>=0;index--)stack.push([item[index],depth+1]);
  }else{
   for(const key in item)if(Object.hasOwn(item,key)){if(stack.length>=limit-nodes)throw new EngineError('SOURCE_REGIONS_INVALID','Source-region object exceeds its metadata admission.');bytes+=16+key.length*2;stack.push([item[key],depth+1]);}
  }
 }
 return bytes;
}
