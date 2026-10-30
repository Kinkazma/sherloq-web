import "../../runtime-context.js?v=0.30.0";
import {requireValue} from './errors.js';
// Same canonicalization already qualified for EfficientLoFTR index kernels.
// WGSL aliases are the same type; canonical aliases avoid nominal Metal structs.
export function canonicalizeEfficientLoFtrIndexAliases(code){
 if(typeof code!=='string'||!code.includes('set_output_by_indices'))return code;
 const first=new Map();return code.replace(/^(\s*)alias\s+((?:input_\d+|output)_indices_t)\s*=\s*array\s*<\s*u32\s*,\s*(\d+)u?\s*>\s*;/gm,(full,space,name,count)=>{const size=Number(count);if(size<=4||!Number.isSafeInteger(size))return full;const prior=first.get(size);if(!prior){first.set(size,name);return full;}return space+'alias '+name+' = '+prior+';';});
}
/** One actual EfficientLoFTR session device only. Never patches GPUDevice's
 * prototype or other family devices. Parent adopts before property mutation. */
export function createEfficientLoFtrDeviceIndexAliases(device,{onOwner,observe}={}){
 requireValue(device&&typeof device.createShaderModule==='function'&&typeof onOwner==='function','A real target device and durable native owner required.');
 const previous=Object.getOwnPropertyDescriptor(device,'createShaderModule'),original=device.createShaderModule;let attempted=false,closed=false;
 const owner={get closed(){return closed;},dispose(){if(closed)return;if(attempted){if(previous)Object.defineProperty(device,'createShaderModule',previous);else if(!Reflect.deleteProperty(device,'createShaderModule'))throw false;}closed=true;}};
 onOwner(owner);requireValue(!closed,'EfficientLoFTR index owner closed during adoption.');attempted=true;
 Object.defineProperty(device,'createShaderModule',{configurable:true,writable:true,value:function(descriptor){const code=canonicalizeEfficientLoFtrIndexAliases(descriptor.code);observe?.({original:descriptor.code,code});return original.call(this,code===descriptor.code?descriptor:{...descriptor,code});}});return owner;
}
