// Audit existing complete runs; do not rerun unchanged models to build a table.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),read=async file=>JSON.parse(await readFile(new URL('docs/'+file,root)));
const specs=[
  ['D2PRL CPU','d2prl-large-rich-cpu-m1-37-extracted','M1.37','Rich positive source, two large ROI plus full envelope; native448, complete CPU graph and six source-coordinate planes, cached refilter.'],
  ['D2PRL GPU','d2prl-large-rich-webgpu-m1-37-extracted','M1.37','The identical rich source and three zones, ordered GPU convolutions with CPU auxiliaries, shared budget, full six-plane refilter/export.'],
  ['MGCF ST CPU','mgcfdn-st-large-rich-cpu-projection-retention','M1.32','Common independent single-thread ONNX source/preparation/projection path for base,16,MPDN,EffNet and ST; ST is the six-plane and largest-model-byte case. This is shared memory-path evidence, not five newly executed96MP networks.'],
  ['MGCF MPDN GPU','mgcfdn-mpdn-large-rich-webgpu-m1-34-extracted','M1.34','Separate ONNX WebGPU/CPU session and buffer accounting.'],
  ['MGCF16 GPU','mgcfdn-16-large-rich-webgpu-m1-41-candidate','M1.41','Larger-model-byte representative of the shared bounded sigmoid ONNX WebGPU/WASM adapter for MPDN/16/EffNet. EffNet memory-path reuse is explicit, not a separately executed96MP EffNet network; its small positive corpus has one declared threshold-mask difference. See MGCF-ORT-GPU.md.'],
  ['MGCF ST split GPU','mgcfdn-st-large-rich-webgpu-m1-43-candidate','M1.43','Bounded two-session GPU encoder/CPU head path, larger split-model assets and six full output planes. M1.43 retires idle hybrid residency before large projections; all full output hashes equal M1.42, cached view uses five RAM planes and one temporary plane. Base uses the same split-session memory adapter with four planes; its96MP qualification reuses this representative path, not a newly executed base network. GPU ST head remains rejected; continuous CPU/GPU planes can differ while native masks are exact. See MGCF-SPLIT-GPU.md.'],
  ['CMSeg generalization CPU','cmseg-generalization-large-rich-cpu-m1-33-extracted','M1.33','Native512, CPU convolution and Winograd backbone plus three global correlations.'],
  ['CMSeg generalization GPU','cmseg-generalization-large-rich-webgpu-m1-46-candidate','M1.46','Ordered GPU convolutions and resident-input streamed dot rows for the128x128 global correlation; CPU normalization/Gaussian/softmax/TopK, smaller correlations and Winograd retained.32MiB postprocess workers and parameter/session reuse. New96MP path retains all M1.40 plane hashes; exact binding in cmseg-resident-delivery-binding.json.'],
  ['CMSeg addnoise CPU','cmseg-addnoise-large-rich-cpu-m1-34-extracted','M1.34','Native512 ONNX encoder with the distinct qualified correlation arithmetic.'],
  ['CMSeg addnoise GPU','cmseg-addnoise-large-rich-webgpu-m1-45-candidate','M1.45','Original CPU ONNX encoder/decoder with resident-input ordered GPU dot rows for the largest full-global correlation. Separate addnoise CPU normalization and all Gaussian/softmax/TopK, two smaller correlations and thresholds unchanged. New distinct96MP path; native masks exact, continuous CPU/GPU planes differ. See CMSEG-ADDNOISE-GPU.md.'],
  ['MGCF VIG CPU','mgcfdn-vig-large-rich-cpu-m1-34-extracted','M1.34','Native-order graph backbone with bounded useful CPU convolution workers.'],
  ['MGCF VIG GPU','mgcfdn-vig-large-rich-webgpu-m1-39-candidate','M1.39','Ordered GPU convolutions and graph dot products; native normalization/TopK/dilation/gather unchanged, with parameter/session reuse; exact delivery binding in vig-distance-delivery-binding.json.'],
  ['MGCF TNT CPU','mgcfdn-tnt-large-rich-cpu-m1-34-extracted','M1.34','Native-order attention backbone with bounded useful CPU linear workers.'],
  ['MGCF TNT GPU','mgcfdn-tnt-large-rich-webgpu-m1-38-candidate','M1.38','Ordered GPU linear layers and outer attention, CPU inner attention/norm/softmax; parameter/session reuse, exact delivery binding in tnt-attention-delivery-binding.json.']
];
const records=[];
for(const [family,stem,version,coverage] of specs){
  const proofFile='neural-segmented-'+stem+'-proof.json',npzFile='neural-segmented-'+stem+'-npz-proof.json';
  const p=await read(proofFile),npz=await read(npzFile);assert.equal(p.status,'passed');assert.equal(npz.status,'passed');
  assert(p.exported.width*p.exported.height>=94e6);assert.equal(p.exported.sha256,npz.sha256);assert.equal(p.exported.byteLength,npz.bytes);
  assert.equal(p.memory.retainedBytes+p.memory.cacheBytes+p.memory.activeReservationBytes,0);assert(p.memory.peakAccountedBytes<=p.memory.budgetBytes);
  for(const row of p.records){assert(Object.values(row.outputs).every(v=>v.accepted));assert.equal(row.outputs.mask.different,0);}
  for(const r of npz.records){assert(r.accepted);assert.equal(r.sha256,p.records.at(-1).outputs[r.array].sha256);}
  let foreground=p.records[0].outputs.mask.nonzero;
  if(foreground===undefined){
    // The older D2 report predates nonzero counts. Verify its all-zero mask
    // digest, rather than manufacturing a count from its absent metadata.
    assert.equal(p.variant,'d2prl');const zero=Buffer.alloc(65536),digest=createHash('sha256');
    for(let n=p.exported.width*p.exported.height;n>0;n-=zero.length)digest.update(zero.subarray(0,Math.min(zero.length,n)));
    assert.equal(p.records[0].outputs.mask.sha256,digest.digest('hex'));foreground=0;
  }
  assert(foreground>0,'The current coverage table requires an actual positive large mask: '+family);
  records.push({family,version,coverage,width:p.exported.width,height:p.exported.height,rich:!!p.rich,backend:p.backend,inferences:p.records[0].inferences,foreground,map:p.records[0].outputs.map,planeSha256:p.records.map(r=>Object.fromEntries(Object.entries(r.outputs).map(([key,v])=>[key,v.sha256]))),
    loadMs:p.loadMs,analysisMs:p.records[0].rpcMs,cacheMs:p.records[1]?.rpcMs??null,exportMs:p.exportMs,
    budgetBytes:p.memory.budgetBytes,peakAccountedBytes:p.memory.peakAccountedBytes,storage:p.records.map(r=>r.metrics.projection?.storage),exportStorage:p.exported.metrics.temporaryBackend,
    exportBytes:npz.bytes,exportSha256:npz.sha256,arrays:npz.records.length,proofFile,npzFile,
    proofSha256:createHash('sha256').update(await readFile(new URL('docs/'+proofFile,root))).digest('hex'),runtimeManifestSha256:p.runtimeManifestSha256??null});
}
for(const name of ['D2PRL','CMSeg generalization','MGCF VIG','MGCF TNT'])assert.deepEqual(records.find(r=>r.family===name+' CPU').planeSha256,records.find(r=>r.family===name+' GPU').planeSha256,name+' CPU/GPU plane identity');
const seconds=n=>n===null?'—':(n/1000).toFixed(3),integer=n=>n.toLocaleString('en-US');
const rows=records.map(r=>`| ${r.family} (${r.version}) | ${integer(r.foreground)} | ${r.map.maxAbs.toExponential(3)} | ${seconds(r.loadMs)} / ${seconds(r.analysisMs)} / ${seconds(r.cacheMs)} / ${seconds(r.exportMs)} | ${integer(r.peakAccountedBytes)} | ${r.arrays} / ${integer(r.exportBytes)} |`).join('\n');
const report={schema:1,status:'passed',scope:'Actual12000x8000 JPEG source paths and complete native-coordinate arrays/NPZ. Shared adapter reuse is explicit per row. Functional times on a shared workstation, accounted capacities not RSS, no claim that every model or device has been independently run.',records};
await writeFile(new URL('docs/neural-96mp-coverage.json',root),JSON.stringify(report,null,2)+'\n');
await writeFile(new URL('docs/NEURAL-96MP-COVERAGE.md',root),`# Neural96MP memory paths\n\nAll rows use actual12000×8000 JPEG originals and unchanged native448/256/512\nnetwork inputs. Rich cases exercise two large regions and a full-image envelope,\nthree actual inferences, retained full-resolution outputs and a cache-only view.\nEvery native-coordinate value and every exported NPZ plane is checked. Masks are\nexact on these sources; continuous probability differences are reported below.\n\n| Path / proof version | Positive mask pixels | Max map error | Load / analysis / cache / NPZ preparation, s | Peak accounted bytes | Planes / NPZ bytes |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${rows}\n\nTimes are functional observations on the shared workstation; this table is not\na CPU/GPU speed benchmark. The NPZ timer measures archive preparation; complete\nreadback is verified separately. All runs use a3GiB shared budget, source/results may\nuse RAM or temporary storage, and exports use OPFS. Detailed storage, exact NPZ\nSHA, proof hashes, mean error and execution metadata are in\n[the coverage records](neural-96mp-coverage.json). All final owned reservations\nare zero. Accounted peaks include heap ceilings and admitted buffers, not driver\nresidency, browser Blob residency or process RSS.\n\n${records.map(r=>`- **${r.family}:** ${r.coverage} [Browser proof](${r.proofFile}), [complete NPZ check](${r.npzFile}).`).join('\n')}\n\nThe historical M1.27 D2PRL CPU noise-source run had an empty mask and no cached\nsecond view; its [browser proof](neural-segmented-d2prl-large-cpu-extracted-proof.json)\nand [full NPZ check](neural-segmented-d2prl-large-cpu-extracted-npz-proof.json) remain\navailable. The table now uses new rich positive CPU/GPU source recipes, without\nrelabelling that older run. Complete plane identity is verified for D2PRL, CMSeg\ngeneralization, VIG and TNT on each family's same rich source.\n\nThese results do not prove WordPress cohabitation with the other engines under a\nshared budget; that integration belongs to the assembled runtime and UI recipe.\nPhysical mobile devices and additional browser/GPU vendors remain unqualified.\nNo synthetic calibration is added to the user path and no native training or\nremote service is used.\n`);
console.log(JSON.stringify({status:'passed',paths:records.length}));
