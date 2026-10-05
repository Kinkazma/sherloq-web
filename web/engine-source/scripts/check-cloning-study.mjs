// Offline exact comparisons; a successful process is not product qualification.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const akaze=process.argv.includes('--native-akaze'),unmasked=process.argv.includes('--unmasked-only');
const variant = akaze ? '-akaze-area' : process.argv.includes('--native-brisk-area') ? '-brisk-area' : process.argv.includes('--native-brisk') ? '-native-brisk' : process.argv.includes('--native-orb') ? '-native-orb' : '';
const wasmFile='../.build/cloning-features'+variant+'.wasm',wasmSha256=createHash('sha256').update(await fs.readFile(new URL(wasmFile,import.meta.url))).digest('hex');
const {default: makeModule} = await import('../.build/cloning-features'+variant+'.mjs');
const directory = new URL(process.argv.includes('--akaze-expanded') ? '../.build/akaze-expanded-study/' : process.argv.includes('--brisk-expanded') ? '../.build/brisk-expanded-study/' : '../.build/cloning-study/', import.meta.url);
const reference = JSON.parse(await fs.readFile(new URL('reference.json', directory), 'utf8'));
const module = await makeModule();
const copy = async file => {
  const data = await fs.readFile(new URL(file, directory));
  const pointer = module._malloc(data.byteLength);
  module.HEAPU8.set(data, pointer);
  return pointer;
};
const records = [];
for (const input of reference.images) {
  const gray = await copy(input.gray);
  for (const expected of input.results.filter(x=>(!akaze||x.algorithm===2)&&(!unmasked||x.mask==='all'))) {
    const mask = expected.maskFile ? await copy(expected.maskFile) : 0;
    const count = module._features_detect(gray, mask, input.width, input.height, expected.algorithm);
    let row = { image: input.name, algorithm: expected.algorithm, mask: expected.mask, nativeCount: expected.count ?? null, actualCount: count };
    if (!expected.error && count === expected.count && count > 0) {
      const buffer = await fs.readFile(new URL(expected.points, directory));
      const native = new Float64Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset+buffer.byteLength));
      const points = module.HEAPF64.slice(module._features_points()/8, module._features_points()/8+count*7);
      const errors = Array(7).fill(0), differences = Array(7).fill(0);
      for (let i=0; i<points.length; i++) {
        if (points[i] !== native[i]) differences[i%7]++;
        errors[i%7] = Math.max(errors[i%7], Math.abs(points[i]-native[i]));
      }
      const desc = await fs.readFile(new URL(expected.descriptors, directory));
      const stride = module._features_descriptor_size();
      let descriptorDifferences = 0;
      const pointer = module._features_descriptors();
      for (let i=0; i<desc.length; i++) if (desc[i] !== module.HEAPU8[pointer+i]) descriptorDifferences++;
      row = {...row, errors, differences, nativeDescriptorSize: expected.descriptorSize, actualDescriptorSize: stride, descriptorDifferences};
    }
    records.push(row);
    if (mask) module._free(mask);
    module._features_release();
  }
  module._free(gray);
  console.log(input.name, records.filter(r => r.image === input.name && (r.nativeCount !== r.actualCount || r.differences?.some(Boolean) || r.descriptorDifferences)));
}
await fs.writeFile(new URL('detector'+variant+(unmasked?'-unmasked':'')+'-results.json', directory), JSON.stringify({referenceSource: reference.sourceSha256, wasmSha256, records}, null, 2)+'\n');
