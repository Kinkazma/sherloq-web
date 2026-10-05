// One single-thread WASM helper. Each job owns complete output channels;
// splitting work never splits or reorders a dot product.
let module, geometry, pointers = [], input, weight, bias, output;
const clear = () => { for (const p of pointers) module._free(p); pointers = []; geometry = null; };
const allocate = bytes => {
  const p = module._malloc(bytes);
  if (!p) throw Error('TNT linear heap admission');
  pointers.push(p); return p;
};
self.onmessage = async ({data}) => {
  const {id, kind} = data;
  try {
    if (kind === 'init') {
      module = await (await import(data.moduleUrl)).default();
      if (module.HEAPU8.length !== 64 * 1024 ** 2) throw Error('TNT heap identity');
    } else if (kind === 'load') {
      clear(); geometry = data.geometry;
      input = allocate(data.input.byteLength); weight = allocate(data.weight.byteLength);
      bias = allocate(data.bias.byteLength); output = allocate(geometry.tile * geometry.rows * 4);
      module.HEAPF32.set(data.input, input / 4); module.HEAPF32.set(data.weight, weight / 4);
      module.HEAPF32.set(data.bias, bias / 4);
    } else if (kind === 'compute') {
      const {rows, ci, co, hasBias, tile} = geometry ?? {};
      if (!Number.isInteger(data.first) || !Number.isInteger(data.count) || data.first < 0 || data.count < 1 || data.count > tile || data.first + data.count > co) throw Error('TNT channel range');
      module._tnt_linear(input, weight, bias, rows, ci, co, Number(hasBias), data.first, data.count, output);
      const values = module.HEAPF32.slice(output / 4, output / 4 + data.count * rows);
      self.postMessage({id, ok: true, values, heapBytes: module.HEAPU8.length}, [values.buffer]); return;
    } else if (kind === 'clear') clear();
    else throw Error('TNT linear operation');
    self.postMessage({id, ok: true, heapBytes: module.HEAPU8.length});
  } catch (error) {
    if (module) clear();
    self.postMessage({id, ok: false, error: String(error?.message ?? error)});
  }
};
