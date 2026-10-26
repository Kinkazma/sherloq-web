import "../../runtime-context.js?v=0.25.0";
import{requireValue}from'./errors.js';

/** Scientific API export only. Native window fields keep their complete tree
 * and identity, with typed values stored bit-for-bit in distinct NPY entries.
 * The caller admits the full metadata bound before invoking this traversal;
 * numeric arrays are borrowed, never cloned into a second JSON number bank. */
export function sparseWindowNpzMetadata(data,add){
 requireValue(['independent','global'].includes(data.cloneWindowMode)&&data.metadata?.cloneWindowMode===data.cloneWindowMode&&typeof add==='function','An actually executed clone-window mode is required for scientific export.');
 const arrays=new WeakMap();let next=0;
 const convert=value=>{
  if(ArrayBuffer.isView(value)){
   requireValue(!(value instanceof DataView),'Native sparse DataView needs its explicit export type.');if(arrays.has(value))return arrays.get(value);
   const descr={Float64Array:'<f8',Float32Array:'<f4',Uint8Array:'|u1',Uint8ClampedArray:'|u1',Int8Array:'|i1',Uint16Array:'<u2',Int16Array:'<i2',Uint32Array:'<u4',Int32Array:'<i4'}[value.constructor.name];requireValue(descr,'Native sparse array type needs its scientific NPY adapter.');
   const key='native_window_array_'+next++,reference={npy:key+'.npy',type:value.constructor.name,shape:[value.length]};arrays.set(value,reference);add(key,value,[value.length],descr);return reference;
  }
  if(value instanceof ArrayBuffer){if(arrays.has(value))return arrays.get(value);const key='native_window_array_'+next++,reference={npy:key+'.npy',type:'ArrayBuffer',shape:[value.byteLength]};arrays.set(value,reference);add(key,new Uint8Array(value),[value.byteLength],'|u1');return reference;}
  if(value===undefined)return{nativeUndefined:true};
  if(typeof value==='bigint')return{nativeBigInt:String(value)};
  if(typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0)))return{nativeNumber:Object.is(value,-0)?'-0':String(value)};
  if(Array.isArray(value))return value.map(convert);
  if(value&&typeof value==='object'){requireValue(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null,'Native sparse metadata requires an explicit adapter for this object type.');const answer={};for(const[key,child]of Object.entries(value)){requireValue(typeof child!=='function','A native scientific result must not serialize an owner.');answer[key]=convert(child);}return answer;}
  return value;
 };
 return{presentationMetadata:convert(data.metadata),cloneWindowMode:data.cloneWindowMode,native_window_results:convert(data.windowResults??[]),...(data.globalResult!==undefined?{native_global_result:convert(data.globalResult)}:{}),native_array_storage:'Native typed-array values retain dtype/order/bits in their referenced NPY entries; row ranges in cloneAnalysisWindows describe presentation only.'};
}
