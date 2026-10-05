import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),path=new URL('docs/engine-registry.json',root),registry=JSON.parse(await readFile(path));
Object.assign(registry.panels.find(r=>r.nativeId==='2:3'),{
 status:'partial',operation:'comparison.image',
 cpu:'All 20 scores, four displays, eq/gray rendering; pinned float64 Sewar, SSIM, histogram semantics, SSIMULACRA and Butteraugli; two-image stage caches',
 gpu:'Not selected; no qualified GPU or extra-worker path',
 data:'Synthetic publicable fixtures only; 33 image pairs including 1 MP and three 4097-square histogram count cases',
 reference:'fixtures/comparison-reference.json, comparison-count-reference.json; native source and helper binary hashes pinned',
 errors:'528 displays exact; helper printed scores exact; other finite scores within absolute/relative 1e-12; undefined outcomes equal; historical histogram correlation flagged with separate full-bin result',
 measurements:'docs/comparison-benchmark.json; baseline, rejected scalar arithmetic attempt and isolated contiguous/SIMD experiment retained separately',
 integration:'Portable worker, two source lifetimes, ownership, cancellation, cache invalidation, JSON/CSV qualified; WordPress controls/rendering pending',
 deviceLimits:'WebAssembly SIMD; one main CPU worker; conservative 1900 MiB working limit under global budget; physical Safari/mobile untested',
 tests:'tests/comparison.test.mjs, comparison-counts.test.mjs; comparison-{chrome,firefox,webkit}-proof.json; COMPARISON.md and COMPARISON-ARITHMETIC.md'
});
await writeFile(path,JSON.stringify(registry,null,2)+'\n');
const lines=['# Browser engine register','','All 50 native panels remain individually enumerated. A partial status means callable','qualified subsets; it does not claim every sub-engine or WordPress panel is complete.','Sources, functions and choices: native-inventory.json. Presence of native weights','does not prove browser conversion. Controls and evidence are linked from README.','','| ID | Panel | Browser status | Native variants |','| --- | --- | --- | --- |'];for(const r of registry.panels)lines.push(`| ${r.nativeId} | ${r.panel} | ${r.status} | ${r.variants.replaceAll('|','/')} |`);await writeFile(new URL('docs/ENGINE-REGISTER.md',root),lines.join('\n')+'\n');
