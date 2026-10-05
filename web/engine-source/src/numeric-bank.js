import {createSegmentedBytes} from './segmented-bytes.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
/** Lossless row-major scientific array. Windows retain the real scalar type;
 * files and RAM pages share the same safe-integer global element offsets. */
export async function createNumericBank(Type,shape,{budget,signal,...options}={}){
 requireValue([Float32Array,Float64Array,Uint8Array].includes(Type)&&shape.length>0&&shape.every(x=>Number.isSafeInteger(x)&&x>0),'Invalid numeric bank type/shape.');
 const length=shape.reduce((a,b)=>a*b,1),itemBytes=Type.BYTES_PER_ELEMENT,rowElements=length/shape[0],byteLength=length*itemBytes;requireValue(Number.isSafeInteger(byteLength),'Numeric bank exceeds safe offsets.');
 const store=await createSegmentedBytes(byteLength,{budget,signal,...options}),view=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
 return {shape:shape.slice(),length,byteLength,BYTES_PER_ELEMENT:itemBytes,elementType:Type.name,storage:store.storage,
  async readInto(target,offset=0,{signal}={}){requireValue(target instanceof Type&&Number.isSafeInteger(offset)&&offset>=0&&offset<=length-target.length,'Invalid numeric bank read.');checkAbort(signal);await store.readInto(view(target),offset*itemBytes);checkAbort(signal);return target;},
  async readBytes(target,offset=0,{signal}={}){checkAbort(signal);await store.readInto(target,offset);checkAbort(signal);return target;},
  async write(data,offset=0,{signal}={}){requireValue(data instanceof Type&&Number.isSafeInteger(offset)&&offset>=0&&offset<=length-data.length,'Invalid numeric bank write.');checkAbort(signal);await store.write(view(data),offset*itemBytes);checkAbort(signal);},
  async readRows(top,rows,options){requireValue(Number.isInteger(top)&&Number.isInteger(rows)&&rows>0&&top>=0&&top<=shape[0]-rows,'Invalid numeric bank rows.');const release=budget.reserve(rows*rowElements*itemBytes);try{await controlCheckpoint(options?.signal);const data=await this.readInto(new Type(rows*rowElements),top*rowElements,options);return {data,dims:[rows,...shape.slice(1)],release};}catch(e){release();throw e;}},
  async writeRows(top,rows,data,options){requireValue(Number.isInteger(top)&&Number.isInteger(rows)&&rows>0&&top>=0&&top<=shape[0]-rows&&data.length===rows*rowElements,'Invalid numeric bank output rows.');await controlCheckpoint(options?.signal);return this.write(data,top*rowElements,options);},
  flush:()=>store.flush(),dispose:()=>store.dispose()
 };
}
