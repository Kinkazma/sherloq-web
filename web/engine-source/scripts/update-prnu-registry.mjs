import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),path=new URL('docs/engine-registry.json',root),registry=JSON.parse(await readFile(path));
Object.assign(registry.panels.find(r=>r.nativeId==='5:4'),{
 status:'partial',operation:'noise.prnu',
 cpu:'Native float64 direct/FFT Wiener residual, buffered NCC, stable ranking, original/guarded SIMD FMA, typed HDF5 import and ordered streaming JPEG snapshot build',
 gpu:'No qualified GPU or additional-worker path; one main worker, SIMD optimization measured separately',
 data:'Public synthetic fixtures only; 30 valid residuals/3 invalid sizes, 25 NCC probes, two JPEG camera means, 14 databases; additional 4096x2048 recipe',
 reference:'fixtures/prnu-reference.json and prnu-large-reference.json; unchanged core/prnu.py, SciPy 1.17.1 pocketfft and pinned binary64 trigonometric seeds',
 errors:'Residual/NCC float64 bits, raw thresholds, five-decimal ties-to-even display, rankings and JPEG means exact; 8 MP residual SHA exact in Node and scores exact in Chrome; explicit NUMERIC_RANGE for undefined NCC',
 measurements:'docs/prnu-benchmark.json: 1 MP RPC median 1038.8 ms original / 405.5 ms SIMD; cold 539.1 ms, chain 409 ms; prnu-kernel-benchmark.json isolates arithmetic',
 integration:'Worker and direct API, original database bytes, two source lifetimes, residual/result caches, query exclusion, memory admission, cancellation, JSON/CSV/HDF5 qualified; WordPress pending',
 deviceLimits:'WASM SIMD; padded FFT lengths <=2^21; geometric admission and 1900 MiB working cap; 8 MP Chrome probe uses explicit 3 GiB budget; physical devices untested',
 tests:'tests/prnu.test.mjs; prnu-{chrome,firefox,webkit}-proof.json; prnu-native-readback.json; prnu-memory-chrome-proof.json; docs/PRNU.md'
});
await writeFile(path,JSON.stringify(registry,null,2)+'\n');
const lines=['# Browser engine register','','All 50 native panels remain individually enumerated. A partial status means callable','qualified subsets; it does not claim every sub-engine or WordPress panel is complete.','Sources, functions and choices: native-inventory.json. Presence of native weights','does not prove browser conversion. Controls and evidence are linked from README.','','| ID | Panel | Browser status | Native variants |','| --- | --- | --- | --- |'];for(const r of registry.panels)lines.push(`| ${r.nativeId} | ${r.panel} | ${r.status} | ${r.variants.replaceAll('|','/')} |`);await writeFile(new URL('docs/ENGINE-REGISTER.md',root),lines.join('\n')+'\n');
