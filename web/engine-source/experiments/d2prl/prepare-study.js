// Development comparator: expected arrays are never used as preparation inputs.
export async function prepareStudy(module, reference, read) {
  const records = [];
  for (const row of reference.records) {
    const input = await read(row.input), normalized = await read(row.normalized), expected = await read(row.output), [height, width] = row.input.shape;
    const pointers = [], allocate = bytes => { const ptr = module._malloc(bytes); if (ptr) pointers.push(ptr); if (!ptr) throw Error('Preparation allocation'); return ptr; };
    try {
      const ip = allocate(input.byteLength), np = allocate(3 * height * width * 4); module.HEAPU8.set(input, ip);
      if (module._d2prl_rgb_normalize(ip, height * width, 0, height * width, np) !== 1) throw Error('Normalization rejected');
      const compare = (name, pointer, nativeBytes) => {
        const native = new Float32Array(nativeBytes.buffer, nativeBytes.byteOffset, nativeBytes.byteLength / 4), data = module.HEAPF32.slice(pointer / 4, pointer / 4 + native.length), a = new Uint32Array(data.buffer), b = new Uint32Array(native.buffer, native.byteOffset, native.length);
        let different = 0, maxAbs = 0, nonfinite = 0;
        for (let i = 0; i < data.length; i++) { different += a[i] !== b[i]; maxAbs = Math.max(maxAbs, Math.abs(data[i] - native[i])); nonfinite += !Number.isFinite(data[i]); }
        records.push({name, elements: data.length, different, maxAbs, nonfinite});
      };
      compare(row.name + '-normalized', np, normalized);
      const table = inputSize => {
        const stride = 2 * Math.ceil(Math.max(1, Math.fround(inputSize / 448))) + 1, starts = allocate(448 * 4), counts = allocate(448 * 4), weights = allocate(448 * stride * 4);
        if (module._d2prl_aa_coefficients(inputSize, 448, starts, counts, weights) !== stride) throw Error('AA coefficients rejected');
        return {stride, starts, counts, weights};
      };
      const horizontal = table(width), vertical = table(height), temp = allocate(3 * height * 448 * 4), out = allocate(3 * 448 * 448 * 4);
      for (const fused of [0, 1]) {
        let source = np;
        if (width !== 448) {
          if (module._d2prl_aa_rows(np, 3, height, width, 448, 1, 0, 3 * height, horizontal.starts, horizontal.counts, horizontal.weights, horizontal.stride, fused, temp) !== 1) throw Error('Horizontal rejected'); source = temp;
        }
        if (height !== 448) {
          if (module._d2prl_aa_rows(source, 3, height, 448, 448, 0, 0, 3 * 448, vertical.starts, vertical.counts, vertical.weights, vertical.stride, fused, out) !== 1) throw Error('Vertical rejected'); source = out;
        }
        compare(row.name + '-fused-' + fused, source, expected);
      }
    } finally { for (const ptr of pointers) module._free(ptr); }
  }
  return {schema: 1, status: 'candidate-comparison', scope: reference.scope, records};
}
