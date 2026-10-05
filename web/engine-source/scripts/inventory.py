"""Static inventory; never imports native models or private image fixtures."""
from pathlib import Path
import ast,json,hashlib,sys
ROOT=Path(__file__).resolve().parents[2];APP=ROOT/'source/gui/sherloq_app';OUT=ROOT/'web-engine/docs'
modules=[]
for path in sorted([*APP.glob('tools/**/*.py'),*APP.glob('core/*.py'),*APP.glob('ui/ela*.py')]):
 if path.name=='__init__.py':continue
 text=path.read_text();tree=ast.parse(text);entry=dict(path=path.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(text.encode()).hexdigest(),functions=[],constants={},choices=[],imports=[])
 for n in ast.walk(tree):
  if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)):entry['functions'].append(dict(name=n.name,line=n.lineno))
  if isinstance(n,ast.ImportFrom):entry['imports'].append('.'*n.level+(n.module or ''))
  if isinstance(n,ast.Import):entry['imports'].extend(x.name for x in n.names)
  if isinstance(n,ast.Assign):
   for target in n.targets:
    if isinstance(target,ast.Name) and target.id.isupper():entry['constants'][target.id]=ast.get_source_segment(text,n.value)
  if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in ('addItems','addItem'):
   entry['choices'].append(dict(line=n.lineno,expression=ast.get_source_segment(text,n)))
 entry['imports']=sorted(set(entry['imports']));modules.append(entry)
OUT.mkdir(exist_ok=True)
(OUT/'native-inventory.json').write_text(json.dumps(dict(schema=1,method='AST enumeration; runtime parity remains separate',modules=modules),indent=2,ensure_ascii=False)+'\n')
# Recheck local files only; no checkpoint loading or network request.
weights=[]
checkpoint_extensions={'.pth','.pt','.ckpt','.onnx','.h5','.index','.safetensors','.hdf5','.pb','.tflite','.ubj','.weights'}
native_model_files={'source/gui/models/median_b64.json':'XGBoost JSON, binary logistic,128 features',
                    'source/gui/models/jpeg_qf.mdl':'joblib native model; executable deserialization not used by this inventory'}
for base in [ROOT/'models',ROOT/'source/gui']:
 for p in sorted(base.rglob('*')):
  name=p.relative_to(ROOT).as_posix()
  is_tf_graph=p.suffix=='.meta' and p.with_suffix('.index').is_file()
  if p.is_file() and (p.suffix in checkpoint_extensions or is_tf_graph or p.name.endswith('.pth.tar') or '.data-' in p.name or name in native_model_files) and 'vendor/' not in p.as_posix():
   entry=dict(path=name,bytes=p.stat().st_size,status='present-on-disk',onnx='not-verified',redistribution='not-cleared')
   entry['component']='tensorflow-checkpoint-data' if '.data-' in p.name else 'checkpoint-index' if p.suffix=='.index' else 'tensorflow-meta-graph' if is_tf_graph else 'model-file'
   if name in native_model_files:entry.update(format=native_model_files[name],sha256=hashlib.sha256(p.read_bytes()).hexdigest(),inference='not verified in browser')
   if name=='source/gui/models/median_b64.json':
    proofs=[]
    for browser in ['chrome','firefox','webkit']:
     proof_file=OUT/f'median-{browser}-proof.json'
     if proof_file.is_file():
      proof=json.loads(proof_file.read_text())
      if proof.get('status')=='passed' and proof.get('modelSha256')==entry['sha256']:proofs.append(proof_file.name)
    if len(proofs)==3:entry.update(inference='native numeric JSON CPU interpreter verified on declared synthetic browser corpus; not ONNX',proofs=proofs)
   if name=='source/gui/models/jpeg_qf.mdl':
    proofs=[]
    for browser in ['chrome','firefox','webkit']:
     proof_file=OUT/f'quality-model-{browser}-proof.json'
     if proof_file.is_file():
      proof=json.loads(proof_file.read_text())
      if proof.get('status')=='passed' and proof.get('sourceModelSha256')==entry['sha256']:proofs.append(proof_file.name)
    if len(proofs)==3:entry.update(inference='hash-gated offline JSON export and numeric regression CPU interpreter verified on declared synthetic browser corpus; not ONNX',proofs=proofs,convertedSha256='bc0c961a9ac7bf0fbabb0316eb5cb34665d7987b678fb8b64b487f10908f04f2')
   if p.name in ['pretrained.pt','adapted_to_j95_database.pt','adapted_to_nojpeg_database.pt'] and p.parent==ROOT/'models/external':
    entry['sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
    proof_file=OUT/'cfa-conversion-rejection.json'
    if proof_file.is_file():
     proof=json.loads(proof_file.read_text())
     if proof.get('status')=='rejected-parity' and any(x.get('checkpointSha256')==entry['sha256'] for x in proof.get('models',[])):entry.update(onnx='export executable but WASM/WebGPU decision parity rejected; not qualified',inference='browser unavailable',proofs=[proof_file.name])
   if name=='models/external/clone_detectors/01_d2prl/d2prl.pth':
    entry['sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
    if entry['sha256']=='2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36':
     entry.update(receipt='verified local final checkpoint; 2026-09-30',inference='native strict1337-key load and CPU/MPS inference reported separately; browser unavailable',onnx='not exported or verified',redistribution='not-cleared; personal receipt is not redistribution approval')
   weights.append(entry)
missing=[]
assets=json.loads((ROOT/'integration/clone_detectors/assets.json').read_text())
for a in assets['assets']:
 if a.get('status')=='missing':missing.append(dict(id=a['id'],status='blocked',expected=a.get('expected_files',a.get('expected_components',[a.get('path','unspecified')])),received=False))
checkpoint_sets=[]
for entry in weights:
 if entry['component']!='checkpoint-index':continue
 prefix=entry['path'][:-6];shards=[w['path'] for w in weights if w['path'].startswith(prefix+'.data-')];graph=next((w['path'] for w in weights if w['path']==prefix+'.meta'),None)
 checkpoint_sets.append(dict(prefix=prefix,index=entry['path'],dataShards=shards,metaGraph=graph,status='components-present' if shards else 'data-missing',inference='not-verified',redistribution='not-cleared'))
(OUT/'weights-inventory.json').write_text(json.dumps(dict(schema=3,check='local model/checkpoint component files, including composite suffixes, data shards and paired meta graphs; path count is not distinct-model count; component presence is not inference or redistribution approval',weights=weights,tensorflowCheckpointSets=checkpoint_sets,blocked=missing),indent=2)+'\n')
print(json.dumps(dict(modules=len(modules),weights=len(weights),blocked=len(missing))))
if '--refresh-only' in sys.argv:
 # Preserve accumulated engine qualification and per-family measurements.
 # Registry initialization below is only for a newly created inventory.
 sys.exit(0)
# Explicit panel map plus mechanically captured source choices, no hidden omissions.
tool_tree=ast.parse((APP/'ui/tools.py').read_text());names=[]
for n in ast.walk(tool_tree):
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='append' and isinstance(n.func.value,ast.Name) and n.func.value.id=='tool_names':names.append([v.args[0].value for v in n.args[0].elts])
registry=[]
for line in (OUT/'PANEL-ALGORITHMS.tsv').read_text().splitlines():
 key,tool,variants,cores=line.split('\t');g,i=map(int,key.split(':'));sources=['source/gui/sherloq_app/tools/'+tool+'.py']+['source/gui/sherloq_app/core/'+c+'.py' for c in cores.split(',')]
 registry.append(dict(nativeId=key,panel=names[g][i],variants=variants,sources=sources,status='partial' if key in ('0:0','6:1') else 'unavailable',cpu='classic ELA implemented, other ELA branches unavailable' if key=='6:1' else 'analysis RGB8 accessor implemented; restricted JPEG decode' if key=='0:0' else 'not ported',gpu='experiment byte-exact; default rejected after transfer-inclusive comparison' if key=='6:1' else 'not validated',data='synthetic fixtures only' if key=='6:1' else 'reference fixture pending',reference='OpenCV 4.11.0 + libjpeg-turbo 3.0.3' if key=='6:1' else 'native modules listed',errors='measured in tests/codec.test.mjs and tests/ela.test.mjs' if key=='6:1' else 'unmeasured',measurements='docs/browser-proof.json' if key=='6:1' else 'unmeasured',integration='B reported WordPress 0.2 ELA and resource-profile validation; new 0.3 operations not integrated' if key=='6:1' else 'not integrated',deviceLimits='No native macOS library can be loaded in browser; per-module build/operator audit required',tests='see native-inventory.json for all static functions/choices; static inventory is not runtime validation'))
pixel_ops={'2:1':'inspection.histogram','4:3':'colors.stats','5:1':'noise.minmax','5:2':'noise.planes','9:2':'pixels.defects'}
for row in registry:
 if row['nativeId'] in pixel_ops:
  row.update(status='partial',operation=pixel_ops[row['nativeId']],cpu='native parameter variants ported; synthetic kernel parity validated',gpu='not measured; CPU remains selectable',data='fixtures/pixel-reference.json: synthetic RGB8, nine boundary/texture/tie cases',reference='native source SHA256 and OpenCV/NumPy versions pinned in fixture',errors='zero tested pixel, mask, count and rounded-summary differences',measurements='docs/pixel-smoke-measurements.json; single-run cold/warm RPC smoke only',integration='dedicated browser worker verified; WordPress integration pending with B',deviceLimits='restricted JPEG decoder or explicitly supplied RGB8; one worker; other browsers/devices untested',tests='tests/pixel-tools.test.mjs, tests/pixel-integration.test.mjs, docs/pixel-browser-proof.json')
assert len(registry)==sum(map(len,names))
(OUT/'engine-registry.json').write_text(json.dumps(dict(schema=1,panels=registry),indent=2,ensure_ascii=False)+'\n')
lines=['# Browser engine register','', 'All 50 native panels are enumerated. Status applies to browser implementation.', 'Detailed source hashes, functions and UI choice expressions: `native-inventory.json`.', 'Presence of native weights is separate from verified ONNX conversion and redistribution.', '', '| ID | Panel | Browser status | Native variants |','| --- | --- | --- | --- |']
for r in registry:lines.append(f"| {r['nativeId']} | {r['panel']} | {r['status']} | {r['variants']} |")
(OUT/'ENGINE-REGISTER.md').write_text('\n'.join(lines)+'\n')
print('panels',len(registry))
