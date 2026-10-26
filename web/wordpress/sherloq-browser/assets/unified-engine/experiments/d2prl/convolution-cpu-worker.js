import {installWorkerMessageProtocol} from '../../src/worker-message-protocol.js';
import {EngineError,serializeEngineError,normalizeResourceError} from '../../src/errors.js';
let module, pointers = [], tile, loading;
function clear() { if (module) pointers.forEach(p => module._free(p)); pointers = [];loading=null; }
installWorkerMessageProtocol(self,async data => {
  try {
    if (data.kind === 'init') {
      const {default: factory} = await import(data.moduleUrl); module = await factory();
    } else if (data.kind === 'load') {
      clear();
      for (const array of [data.input, data.weights, data.bias, data.shape, data.ranges]) {
        const pointer = module._malloc(Math.max(8, array.byteLength)); if (!pointer) throw new EngineError('MEMORY_ALLOCATION','CPU convolution allocation refused'); pointers.push(pointer);
        module.HEAPU8.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), pointer);
      }
      tile = data.tile; const pointer = module._malloc(tile * 4); if (!pointer) throw new EngineError('MEMORY_ALLOCATION','CPU convolution tile allocation refused'); pointers.push(pointer);
    } else if(data.kind==='load-begin'){
      clear();loading={lengths:data.lengths,at:data.lengths.map(()=>0)};
      for(const bytes of data.lengths){const pointer=module._malloc(Math.max(8,bytes));if(!pointer)throw new EngineError('MEMORY_ALLOCATION','CPU convolution allocation refused');pointers.push(pointer);}
      tile=data.tile;const pointer=module._malloc(tile*4);if(!pointer)throw new EngineError('MEMORY_ALLOCATION','CPU convolution tile allocation refused');pointers.push(pointer);
    } else if(data.kind==='load-chunks'){
      for(const {index,at,value} of data.chunks){if(!loading||at!==loading.at[index]||value.byteLength>loading.lengths[index]-at)throw Error('CPU convolution upload range');module.HEAPU8.set(value,pointers[index]+at);loading.at[index]+=value.byteLength;}
    } else if(data.kind==='load-end'){
      if(!loading||loading.at.some((n,i)=>n!==loading.lengths[i]))throw Error('Incomplete CPU convolution input');loading=null;
    } else if (data.kind === 'compute') {
      if (data.count < 1 || data.count > tile) throw Error('CPU convolution tile');
      if (module._d2prl_convolution_range(...pointers.slice(0, 5), data.start, data.count, pointers[5]) !== 1) throw Error('CPU convolution rejected');
      const values = module.HEAPF32.slice(pointers[5] / 4, pointers[5] / 4 + data.count);
      self.postMessage({ok: true, values, heapBytes: module.HEAPU8.length}, [values.buffer]); return;
    } else if (data.kind === 'clear') clear();
    else throw Error('CPU convolution worker command');
    self.postMessage({ok: true, heapBytes: module.HEAPU8.length});
  } catch (error) { if(data.kind!=='compute')clear(); self.postMessage({ok:false,error:serializeEngineError(normalizeResourceError(error,data.kind==='compute'?{requestedBytes:data.count*4}:undefined))}); }
},{label:'d2prl-convolution-cpu',onFailure:error=>self.postMessage({protocolFailure:true,ok:false,error:serializeEngineError(error)})});
