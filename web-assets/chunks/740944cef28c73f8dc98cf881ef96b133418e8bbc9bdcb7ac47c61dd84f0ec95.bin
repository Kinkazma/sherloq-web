self.onmessage = async ({data}) => {
  try {
    const {default: factory} = await import(data.moduleUrl), module = await factory(), n = data.width * data.height;
    const ip = module._malloc(data.raw.byteLength), op = module._malloc(n * 16); if (!ip || !op) throw Error('Postprocess allocation');
    try {
      module.HEAPF32.set(data.raw, ip / 4); self.postMessage({phase: 'compute'});
      if (module._d2prl_postprocess(ip, data.width, data.height, data.minimum, op, op + n * 12) !== 1) throw Error('Postprocess rejected');
      const masks = module.HEAPF32.slice(op / 4, op / 4 + 3 * n), filtered = module.HEAPF32.slice(op / 4 + 3 * n, op / 4 + 4 * n);
      self.postMessage({ok: true, masks, filtered, heapBytes: module.HEAPU8.length}, [masks.buffer, filtered.buffer]);
    } finally { module._free(ip); module._free(op); }
  } catch (error) { self.postMessage({ok: false, error: String(error?.message ?? error)}); }
};
