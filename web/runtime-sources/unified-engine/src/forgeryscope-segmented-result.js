import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort} from './errors.js';
/** Read-only result fields. Binary arrays retain their native bytes; map is the
 * native float32 cast materialized only in requested/export windows. */
export function forgeryscopeMaskField(mask,{floating=false}={}){
 const Type=floating?Float32Array:Uint8Array,itemBytes=Type.BYTES_PER_ELEMENT,length=mask.length;
 return Object.freeze({length,byteLength:length*itemBytes,elementType:Type.name,BYTES_PER_ELEMENT:itemBytes,storage:'memory',
  async readInto(target,offset=0,{signal}={}){checkAbort(signal);requireValue(target instanceof Type&&Number.isSafeInteger(offset)&&offset>=0&&offset<=length-target.length,'Invalid Forgeryscope field range.');target.set(mask.subarray(offset,offset+target.length));return target;},
  async readBytes(target,offset=0,{signal}={}){checkAbort(signal);requireValue(target instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=length*itemBytes-target.length,'Invalid Forgeryscope byte range.');if(!floating){target.set(mask.subarray(offset,offset+target.length));return target;}for(let i=0;i<target.length;i++){const byte=offset+i,component=byte%4,value=mask[Math.floor(byte/4)];requireValue(value===0||value===1,'Forgeryscope binary mask changed.');target[i]=value?(component===2?128:component===3?63:0):0;}return target;}
 });
}
