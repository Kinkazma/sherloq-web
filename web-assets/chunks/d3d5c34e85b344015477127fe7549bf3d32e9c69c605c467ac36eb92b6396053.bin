import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';

const RANGE=Symbol('renewable byte range'),owners=new WeakMap();
// A range owns its address, not the allocation at that address. The caller must
// keep that allocation alive and exclusive until the complete I/O has settled.
// No borrowed TypedArray crosses an await: consumers obtain a fresh view only
// for the synchronous copy. Growing a Wasm heap preserves numeric addresses.
export function wasmRange(module,pointer,length){
 requireValue(module&&typeof module==='object'&&Number.isSafeInteger(pointer)&&pointer>=0&&Number.isSafeInteger(length)&&length>=0,'Invalid Wasm byte range.');
 let owner=owners.get(module);if(!owner){owner={module,closed:false};owners.set(module,owner);}
 const range={[RANGE]:true,byteLength:length,view(offset,count){if(owner.closed)throw new EngineError('DISPOSED','Memory range owner closed.');const heap=owner.module.HEAPU8;if(!(heap instanceof Uint8Array)||pointer>heap.byteLength-length)throw new EngineError('MEMORY_RANGE_INVALID','Wasm byte range is outside its current heap.');return new Uint8Array(heap.buffer,heap.byteOffset+pointer+offset,count);}};
 byteView(range);return Object.freeze(range);
}
export function closeMemoryRanges(module){const owner=owners.get(module);if(owner){owner.closed=true;owner.module=null;}}
export function byteLength(value){requireValue(value?.[RANGE]===true||value instanceof Uint8Array,'A byte array or renewable memory range is required.');return value.byteLength;}
export function byteView(value,offset=0,length=byteLength(value)-offset){
 const total=byteLength(value);requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=total-length,'Invalid memory subrange.');
 if(value[RANGE])return value.view(offset,length);
 // Construction also rejects detached ordinary buffers, including zero-length
 // views; do not interpret detachment as an empty, successfully copied range.
 try{return new Uint8Array(value.buffer,value.byteOffset+offset,length);}catch(error){throw new EngineError('MEMORY_RANGE_INVALID','Byte range backing is detached or unavailable.',{cause:error});}
}
// Freeze the intended extent of ordinary arrays too. Their backing cannot be
// renewed, but detachment must fail explicitly instead of truncating a loop.
export function byteRange(value){
 if(value?.[RANGE])return value;
 const length=byteLength(value),buffer=value.buffer,offset=value.byteOffset;byteView(value);
 return {[RANGE]:true,byteLength:length,view(at,count){try{return new Uint8Array(buffer,offset+at,count);}catch(error){throw new EngineError('MEMORY_RANGE_INVALID','Byte range backing is detached or unavailable.',{cause:error});}}};
}
export function byteSubrange(value,offset=0,length=byteLength(value)-offset){
 const parent=byteRange(value);byteView(parent,offset,length);
 return {[RANGE]:true,byteLength:length,view(at,count){return byteView(parent,offset+at,count);}};
}
