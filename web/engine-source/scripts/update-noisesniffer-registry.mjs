import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),path=new URL('docs/engine-registry.json',root),registry=JSON.parse(await readFile(path));
Object.assign(registry.panels.find(r=>r.nativeId==='5:5'),{
 status:'partial',operation:'noise.noisesniffer',
 cpu:'Corrected IPOL statistics, pinned DCT-II, native unstable NumPy selection, float64 binomial survival and region growth; guarded exact FMA and calibrated DCT-band workers',
 gpu:'No GPU path qualified; full-image means/extrema stay on CPU, no independent tiled FFT substitute',
 data:'Synthetic public corpus: 36 statistics, 120 analyses/360 views, 24 regional cases, 96 sorts, 796 tail probes; two 1 MP recipes and 90 large-tail probes',
 reference:'fixtures/noisesniffer-reference.json and noisesniffer-large-reference.json; unchanged core/noisesniffer.py; SciPy 1.17.1 pocketfft/Boost.Math and NumPy 1.26.4',
 errors:'Statistic bits, selections, masks, cell memberships and views exact on corpus and 1 MP; corpus log10 NFA max error 4.55e-13, log-tail 9.10e-13; significance within 1e-9 of zero explicitly unavailable',
 measurements:'Sequential 1 MP Chrome: original/FMA/pool RPC medians 3459.8/2611.3/2242 ms (3x3), 9936.7/4955.7/1783 ms (8x8); 5/10 active workers; first auto 15422.2/38801.5 ms includes calibration',
 integration:'Direct/worker API, native positive result, typed NPZ/JSON, native NPZ readback, cached statistics/views, budget, reload and nested-worker cancellation verified in three browsers; WordPress pending',
 deviceLimits:'WASM SIMD and current 2 GiB module; shared admission 320 bytes/pixel plus 64 MiB; 1 MP qualified, not all photo sizes; segmented/storage-backed paths and physical devices pending',
 tests:'85-test global regression; noisesniffer-{chrome,firefox,webkit}-proof.json; noisesniffer-large-*-proof.json; noisesniffer-npz-proof.json; docs/NOISESNIFFER.md'
});
await writeFile(path,JSON.stringify(registry,null,2)+'\n');
const lines=['# Browser engine register','','All 50 native panels remain individually enumerated. A partial status means callable','qualified subsets; it does not claim every sub-engine or WordPress panel is complete.','Sources, functions and choices: native-inventory.json. Presence of native weights','does not prove browser conversion. Controls and evidence are linked from README.','','| ID | Panel | Browser status | Native variants |','| --- | --- | --- | --- |'];for(const r of registry.panels)lines.push(`| ${r.nativeId} | ${r.panel} | ${r.status} | ${r.variants.replaceAll('|','/')} |`);await writeFile(new URL('docs/ENGINE-REGISTER.md',root),lines.join('\n')+'\n');
