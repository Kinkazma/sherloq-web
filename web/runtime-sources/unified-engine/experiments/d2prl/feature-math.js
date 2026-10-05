import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';
// Experimental bounded CPU helpers for composing the qualified feature graph.
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
const PAGE = 16 * 1024 ** 2, MAX = 512 * 1024 ** 2;
export async function createFeatureMath(factory, {budget,arena,operation:recover=(_label,work)=>work()} = {}) {
  requireValue(budget && typeof budget.reserve === 'function', 'Shared budget required');
  const ownsArena=!arena;
  const resident = [];
  let backing;let module, accounted = PAGE, busy = false, disposed = false;
  try { resident.push(budget.reserve(PAGE));arena??=createWasmTensorArena({budget});module = await factory(); } catch (error) { resident.pop()?.();if(ownsArena)arena?.dispose(); throw error; }
  let trackedHeapBytes=0;const trackHeap=()=>{const bytes=module.HEAPU8.byteLength;if(bytes===trackedHeapBytes)return;backing?.();backing=budget.registerBacking?.('wasm',bytes,{owner:'d2prl',label:'feature-math-heap'});trackedHeapBytes=bytes;};trackHeap();
  return {
    async run(operation, args, {signal,resourceOperation} = {}) {
      requireValue(!disposed && !busy, 'Feature math unavailable');
      const {input, channels, height, width, outHeight, outWidth, pad = 7, params, epsilon = 1e-5, imag} = args;
      requireValue(input instanceof Float32Array && input.length > 0, 'Float32 input required');
      let arrays = [input], outputElements = input.length, half = false, scratch = 0, inPlace = false;
      if (['reflect', 'resize', 'affine'].includes(operation)) {
        requireValue([channels,height,width].every(Number.isInteger) && channels > 0 && channels <= 512 && height >= 2 && height <= 1024 && width >= 2 && width <= 1024 && input.length === channels*height*width, 'Feature dimensions');
      }
      if (operation === 'reflect') {
        requireValue(Number.isInteger(pad) && pad >= 0 && pad <= 7 && pad < height && pad < width, 'Reflection padding');
        outputElements = channels*(height+2*pad)*(width+2*pad);
      } else if (operation === 'resize') {
        requireValue([outHeight,outWidth].every(Number.isInteger) && outHeight >= 2 && outWidth >= 2 && outHeight <= 1024 && outWidth <= 1024 && outHeight+outWidth > 128, 'Qualified resize dimensions');
        outputElements = channels*outHeight*outWidth;
      } else if (operation === 'affine') {
        requireValue(params instanceof Float32Array && params.length === 4*channels && Number.isFinite(epsilon) && epsilon > 0, 'BatchNorm parameters');
        arrays.push(params); scratch = channels*8; inPlace = true;
      } else if (operation === 'magnitude') {
        requireValue(imag instanceof Float32Array && imag.length === input.length, 'Complex feature dimensions');
        arrays.push(imag); inPlace = true;
      } else if (operation === 'half') half = true;
      else throw Error('Unknown feature operation');
      const outputBytes = outputElements*(half ? 2 : 4), borrowed = arrays.reduce((n,a) => n+a.byteLength, 0);
      const required = borrowed+scratch+(inPlace ? 0 : outputBytes)+PAGE;
      const target = Math.max(accounted, Math.ceil(required/PAGE)*PAGE);
      requireValue(target <= MAX, 'Feature helper heap limit');
      checkAbort(signal); busy = true;
      let active, resultRelease, complete = false;
      const pointers = [];
      try {
        resourceOperation?.setState('compute');
        active = budget.reserve(borrowed+target-accounted);
        if (target > accounted) { resident.push(active.split(target-accounted)); accounted = target; }
        const allocate = bytes => { const ptr = module._malloc(bytes);trackHeap(); if (ptr) pointers.push(ptr); if(!ptr)throw new EngineError('MEMORY_ALLOCATION','Native D2PRL allocation refused'); requireValue(module.HEAPU8.length <= accounted, 'Feature helper allocation'); return ptr; };
        let stamp = performance.now();
        for (const array of arrays) for (let i=0;i<array.length;i++) {
          requireValue(Number.isFinite(array[i]), 'Nonfinite feature input');
          if ((i&8191)===0 && performance.now()-stamp >= 8) { await controlCheckpoint(signal); stamp=performance.now(); }
        }
        const inputs = arrays.map(array => {const ptr=allocate(array.byteLength);module.HEAPF32.set(array,ptr/4);return ptr;});
        const out = inPlace ? inputs[0] : allocate(outputBytes);
        checkAbort(signal);
        if (operation === 'affine') {
          const ab=allocate(scratch),pp=inputs[1];
          requireValue(module._d2prl_batchnorm_parameters(pp,pp+channels*4,pp+channels*8,pp+channels*12,channels,epsilon,ab,ab+channels*4)===1,'BatchNorm parameters rejected');
          for(let c=0;c<channels;c++) {
            requireValue(module._d2prl_affine(inputs[0]+c*height*width*4,ab+c*4,ab+(channels+c)*4,1,height*width,1,out+c*height*width*4)===1,'Affine rejected');
            if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}
          }
        } else if (operation === 'resize') {
          for(let c=0;c<channels;c++) {
            requireValue(module._d2prl_resize_large(inputs[0]+c*height*width*4,1,height,width,outHeight,outWidth,out+c*outHeight*outWidth*4)===1,'Resize rejected');
            if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}
          }
        } else if (operation === 'reflect') {
          requireValue(module._d2prl_reflect(inputs[0],channels,height,width,pad,out)===1,'Reflection rejected');
        } else for(let begin=0;begin<input.length;begin+=65536) {
          const count=Math.min(65536,input.length-begin);
          const ok=operation==='half' ? module._d2prl_half_bits(inputs[0]+begin*4,count,out+begin*2) : module._d2prl_magnitude(inputs[0]+begin*4,inputs[1]+begin*4,count,out+begin*4);
          requireValue(ok===1,'Feature operation rejected');
          if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}
        }
        checkAbort(signal);
        resourceOperation?.commit();resourceOperation?.setState('waiting-child');
        const result=await recover('feature:copy:'+operation,({resourceOperation:copyOperation}={})=>{copyOperation?.setState('compute');const value=arena.allocate(half?Uint16Array:Float32Array,outputElements,{signal,zero:false,label:'feature:'+operation});try{value.data.set(half?new Uint16Array(module.HEAPU8.buffer,out,outputElements):module.HEAPF32.subarray(out/4,out/4+outputElements));return value;}catch(error){value.release();throw error;}},{bytes:outputBytes});
        resultRelease=result.release;complete=true;return result;
      } finally { resourceOperation?.setState('waiting-child');for(const ptr of pointers)module._free(ptr);active?.();if(!complete)resultRelease?.();busy=false; }
    },
    dispose() { requireValue(!busy,'Feature math busy');if(disposed)return;disposed=true;if(ownsArena)arena.dispose();const heapBytes=module.HEAPU8.byteLength;module=null;backing?.();backing=null;budget.notifyBackingRelease?.('wasm',heapBytes);for(const free of resident)free(); }
  };
}
