import fs from 'node:fs/promises';
import makeModule from '../.build/cloning-features-native-orb.mjs';
const base = new URL('../.build/cloning-study/', import.meta.url);
const reference = JSON.parse(await fs.readFile(new URL('reference.json', base)));
const expected = JSON.parse(await fs.readFile(new URL('matches-reference.json', base)));
const m = await makeModule();
const direct=process.argv.includes('--direct-matches'),match=direct?m._features_match_direct:m._features_match;
const load = file => fs.readFile(new URL(file, base));
const allocate = data => { const p=m._malloc(Math.max(1, data.length)); m.HEAPU8.set(data,p); return p; };
const f64 = buffer => new Float64Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset+buffer.byteLength));
const selection = [], matching = [];
for (const record of expected.selection) {
  const image = reference.images.find(x=>x.name===record.image);
  const native = image.results.find(x=>x.algorithm===1 && x.mask===record.mask);
  const source=allocate(await load(image.gray)), mask=native.maskFile ? allocate(await load(native.maskFile)) : 0;
  const total=m._features_detect(source,mask,image.width,image.height,1);
  const count=m._features_select(record.response);
  const nativePoints=f64(await load(native.points)), nativeDesc=await load(native.descriptors);
  let pointDifferences=0, descriptorDifferences=0;
  const points=m._features_points()/8, desc=m._features_descriptors();
  if (count===record.selected.length) for(let i=0; i<count; i++) {
    const index=record.selected[i];
    for(let j=0; j<7; j++) pointDifferences += m.HEAPF64[points+i*7+j] !== nativePoints[index*7+j];
    for(let j=0; j<32; j++) descriptorDifferences += m.HEAPU8[desc+i*32+j] !== nativeDesc[index*32+j];
  }
  selection.push({...record,selected:undefined,total,count,expectedCount:record.selected.length,pointDifferences,descriptorDifferences});
  m._free(source);if(mask)m._free(mask);m._features_release();
}
for(const record of expected.matching) {
  const source=allocate(await load(record.file)), native=f64(await load(record.matches));
  const actual=[];
  for(let start=0;start<record.count;start+=64) {
    const count=match(source,record.count,record.stride,record.radius,start,Math.min(64,record.count-start));
    if(count<0)throw Error('Matching failed '+count);
    const at=m._features_matches()/8;
    for(let i=0;i<count*3;i++)actual.push(m.HEAPF64[at+i]);
  }
  let differences=0;
  for(let i=0;i<native.length;i++)differences+=native[i]!==actual[i];
  matching.push({...record,actualCount:actual.length/3,differences});m._free(source);m._features_release();
}
const output={selection,matching};await fs.writeFile(new URL(direct?'matches-direct-results.json':'matches-results.json',base),JSON.stringify(output,null,2)+'\n');
console.log('selection failures',selection.filter(x=>x.count!==x.expectedCount||x.pointDifferences||x.descriptorDifferences));
console.log('matching failures',matching.filter(x=>x.actualCount!==x.matchCount||x.differences));
