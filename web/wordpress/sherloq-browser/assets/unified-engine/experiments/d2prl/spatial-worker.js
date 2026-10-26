import {serializeEngineError} from '../../src/errors.js';
import {installWorkerMessageProtocol} from '../../src/worker-message-protocol.js';
installWorkerMessageProtocol(self,async data => {
  try {
    const {default: factory} = await import(data.moduleUrl), module = await factory(), n = data.outWidth * data.outHeight;
    const ip = module._malloc(data.input.byteLength), op = module._malloc(n * 4); if (!ip || !op) throw Error('Spatial allocation');
    try {
      module.HEAPF32.set(data.input, ip / 4); self.postMessage({phase: 'compute'});
      if (module._d2prl_resize_plane(ip, data.width, data.height, data.outWidth, data.outHeight, Number(data.nearest), op) !== 1) throw Error('Spatial resize rejected');
      const values = module.HEAPF32.slice(op / 4, op / 4 + n); self.postMessage({ok: true, values, heapBytes: module.HEAPU8.length}, [values.buffer]);
    } finally { module._free(ip); module._free(op); }
  } catch (error) { self.postMessage({ok: false, error: serializeEngineError(error)}); }
},{label:'d2prl-spatial',onFailure:error=>self.postMessage({protocolFailure:true,ok:false,error:serializeEngineError(error)})});
