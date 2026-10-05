import {readFile,writeFile} from 'node:fs/promises';
const file=new URL('../docs/engine-registry.json',import.meta.url),registry=JSON.parse(await readFile(file));
for(const panel of registry.panels){
 if(panel.operation==='detail.frequency'){panel.gpu='Gaussian mask only; offline-qualified development corpus, immediate requested dispatch, no runtime probes; CPU override retained, other adapters unverified';}
 if(panel.operation==='noise.noisesniffer'){
  panel.cpu=panel.cpu.replace('calibrated DCT-band workers','immediate DCT-band workers with session-only useful-task observations');
  panel.measurements='Chrome1MP first useful RPC 2380.4ms (3x3),1817ms (8x8); 10 active workers, no preflight, exact native arrays; subsequent medians2208.4/1726.6ms. Historical calibration measurements retained separately.';
  panel.tests='93-test global regression then targeted lifecycle/scheduling checks; three-browser corpus, 1MP output and nested-worker cancellation; immediate-pools.test.mjs, adaptive-concurrency.test.mjs; docs/IMMEDIATE-COMPUTE.md';
 }
 if(panel.operation==='jpeg.ghosts'){panel.cpu=panel.cpu.replace('shared calibrated codec pool','shared immediate codec pool');panel.measurements='docs/immediate-benchmark.json: three fresh1MP engines, no preflight; historical ghost-benchmark.json retained as pre-0.13 evidence';}
 if(panel.operation==='jpeg.zero')panel.measurements='docs/immediate-benchmark.json: fresh1MP first-use RPCs, each scientific vote pass once; zero-memory-proof.json; historical pre-0.13 measurements retained';
}
await writeFile(file,JSON.stringify(registry,null,2)+'\n');
