// Offline arithmetic qualification only. Never run as a user-path calibration.
export async function checkFmaCorpus(module, reference, read) {
  const records = [];
  for (const row of reference.records) {
    const arrays = await Promise.all(['a', 'b', 'c', 'output'].map(key => read(row[key])));
    const pointers = arrays.map(() => module._malloc(row.count * 4));
    try {
      if (pointers.some(p => !p)) throw Error('FMA corpus allocation');
      arrays.slice(0, 3).forEach((a, i) => module.HEAPU8.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), pointers[i]));
      const fallbackLanes = module._d2prl_fma_values(...pointers.slice(0, 3), row.count, pointers[3]);
      if (fallbackLanes < 0) throw Error('FMA input rejected');
      const expected = new Uint32Array(arrays[3].buffer, arrays[3].byteOffset, row.count);
      const actual = new Uint32Array(module.HEAPU8.buffer, pointers[3], row.count);
      let different = 0; const samples = [];
      for (let i = 0; i < row.count; i++) if (actual[i] !== expected[i]) {
        different++;
        if (samples.length < 8) samples.push({index: i, actualBits: actual[i], expectedBits: expected[i]});
      }
      records.push({name: row.name, count: row.count, different, fallbackLanes, samples});
    } finally { pointers.forEach(p => { if (p) module._free(p); }); }
  }
  return {schema: 1, scope: reference.scope, status: records.every(r => !r.different) ? 'passed' : 'rejected', values: records.reduce((n, r) => n + r.count, 0), records};
}
