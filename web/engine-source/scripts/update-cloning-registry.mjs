// Run only after the exact product/browser corpus has passed for current sources.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=async file=>JSON.parse(await readFile(new URL(file,root))),fixture=await read('fixtures/cloning/reference.json');
for(const browser of ['chrome','firefox','webkit'])for(const size of ['','large-']){
  const proof=await read('docs/cloning-parallel-'+size+browser+'-proof.json');
  if(proof.status!=='passed'||proof.cpuKernel!=='auto'||proof.cases!==(size?80:fixture.cases.length)||!size&&proof.payloadSha256!==fixture.payload.sha256)throw Error('Current product qualification missing: '+browser+size);
  for(const [file,expected]of Object.entries(proof.runtimeFiles)){const bytes=await readFile(new URL(file,root));if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Qualification source changed: '+file);}
}
const registry=await read('docs/engine-registry.json'),row=registry.panels.find(x=>x.nativeId==='7:1');
Object.assign(row,{
  variants:'BRISK default; ORB; AKAZE; response normalization; ordered radius Hamming; displacement/proximity groups; binary1 detection mask; minimum count; seeded kmeans regions; points/lines/JSON',
  status:'partial',operation:'tampering.copyMove.orb',
  cpu:'Explicit ORB only; native angle/FMA and equal-distance sort, exact point-pair cache and independent row workers; BRISK/AKAZE unavailable',
  gpu:'Unavailable; no qualified detector/grouping/drawing GPU path; CPU retained',
  data:'Generated synthetic PNG sources/masks and original progressive/oriented JPEG, RGB/gray16-bit TIFF and alpha; no private photos or trained weights',
  reference:'core/cloning.py SHA161d3b3589383740fafd97cd9871f531c7ee2313db55ac5620a8c9770637db27; NumPy1.26.4/OpenCV4.11.0; public fixture and prototype manifests',
  errors:'64 prototype detections,256 selections,104 ordered match cases,10000 norms,80 float32 standard deviations,90 boundary geometries exact. Product238 complete outputs and4 expected native group-budget refusals in Chrome/Firefox/WebKit; point/match/group/statistic/RGB identity on corpus.',
  measurements:'cloning-kernel-chrome-benchmark.json and cloning-chrome-benchmark.json; isolated grouping startup/transfers included, complete RPC/cold/warm/cache/illustrative display reported separately; accounting is not RSS',
  integration:'Portable worker API, decoded bytes, binary1 masks, stage invalidation, owned outputs, bounded JSON, cancellation/reload and resource retry qualified; WordPress controls and native panel BRISK/AKAZE remain unavailable',
  deviceLimits:'Full-memory only; lazy32MiB to1GiB WASM heap and shared dynamic admission;16-row grouping workers without detector heaps; no segmentation; physical Safari/mobile/non-Apple hardware untested',
  tests:'tests/cloning.test.mjs; cloning-parallel-*-proof.json and cloning-pool-*-proof.json; COPY-MOVE-ORB.md; BRISK/AKAZE rejection records retained',
  memoryLayout:{status:'full-memory-only',detail:'Full-image ORB pyramid; dynamic matches/group indices/results plus worker inputs/staging under one budget; native caps preserved, no hidden threshold/resolution change'}
});
const resampling=registry.panels.find(x=>x.nativeId==='7:3');resampling.cpu=resampling.cpu.replace('Probability EM remains unavailable.','Probability EM remains unavailable: both LU candidates rejected on190 cases, including changed valid/refused outcomes. See RESAMPLING-EM-STUDY.md.');
await writeFile(new URL('docs/engine-registry.json',root),JSON.stringify(registry,null,2)+'\n');
const lines=['# Browser engine register','','All50 native panels remain individually enumerated. Partial means callable qualified','subsets, not completion of every variant, export or WordPress panel. Static native','functions/choices are in native-inventory.json. Model presence does not prove parity.','','| ID | Panel | Browser status | Native variants |','| --- | --- | --- | --- |'];
for(const row of registry.panels)lines.push(`| ${row.nativeId} | ${row.panel} | ${row.status} | ${row.variants.replaceAll('|','/')} |`);
await writeFile(new URL('docs/ENGINE-REGISTER.md',root),lines.join('\n')+'\n');
console.log(JSON.stringify({panels:registry.panels.length,statuses:registry.panels.reduce((a,r)=>(a[r.status]=(a[r.status]??0)+1,a),{}),memory:registry.panels.reduce((a,r)=>(a[r.memoryLayout.status]=(a[r.memoryLayout.status]??0)+1,a),{})}));
