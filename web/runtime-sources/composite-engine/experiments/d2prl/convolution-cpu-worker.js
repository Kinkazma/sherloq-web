let module, pointers = [], tile;
function clear() { if (module) pointers.forEach(p => module._free(p)); pointers = []; }
self.onmessage = async ({data}) => {
  try {
    if (data.kind === 'init') {
      const {default: factory} = await import(data.moduleUrl); module = await factory();
    } else if (data.kind === 'load') {
      clear();
      for (const array of [data.input, data.weights, data.bias, data.shape, data.ranges]) {
        const pointer = module._malloc(Math.max(8, array.byteLength)); if (!pointer) throw Error('CPU convolution allocation'); pointers.push(pointer);
        module.HEAPU8.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), pointer);
      }
      tile = data.tile; const pointer = module._malloc(tile * 4); if (!pointer) throw Error('CPU convolution tile allocation'); pointers.push(pointer);
    } else if (data.kind === 'compute') {
      if (data.count < 1 || data.count > tile) throw Error('CPU convolution tile');
      if (module._d2prl_convolution_range(...pointers.slice(0, 5), data.start, data.count, pointers[5]) !== 1) throw Error('CPU convolution rejected');
      const values = module.HEAPF32.slice(pointers[5] / 4, pointers[5] / 4 + data.count);
      self.postMessage({ok: true, values, heapBytes: module.HEAPU8.length}, [values.buffer]); return;
    } else if (data.kind === 'clear') clear();
    else throw Error('CPU convolution worker command');
    self.postMessage({ok: true, heapBytes: module.HEAPU8.length});
  } catch (error) { clear(); self.postMessage({ok: false, error: String(error?.message ?? error)}); }
};
