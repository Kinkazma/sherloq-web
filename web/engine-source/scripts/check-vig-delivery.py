"""Bind qualified VIG code to the copied runtime; derive metrics from saved NPZ."""
from pathlib import Path
import hashlib,json
import numpy as np
root=Path(__file__).resolve().parents[1];version='0.30.0-m1.31';copy=root/'.build'/('segmentation-runtime-'+version)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((root/'runtime-manifest.json').read_text());assert manifest['version']==version
assert sha(copy/'runtime-manifest.json')==sha(root/'runtime-manifest.json')
for r in manifest['files']:assert sha(root/r['file'])==sha(copy/r['file'])==r['sha256']
proofs=['vig-model-corpus-proof.json','vig-useful-workers-proof.json','neural-segmented-mgcfdn-vig-cpu-m1-31-extracted-proof.json','neural-segmented-mgcfdn-vig-cpu-m1-31-extracted-npz-proof.json','neural-segmented-mgcfdn-tnt-cpu-m1-31-extracted-proof.json','neural-segmented-mgcfdn-tnt-cpu-m1-31-extracted-npz-proof.json'];bindings=[]
for name in proofs:
 p=root/'docs'/name;r=json.loads(p.read_text());assert r['status']=='passed';sources={k:v for k,v in r.get('sources',{}).items() if not k.startswith('scripts/')}
 for file,digest in sources.items():assert sha(root/file)==digest,(name,file)
 bindings.append(dict(file='docs/'+name,sha256=sha(p),runtimeAndNumericalSourcesVerified=len(sources)))
# No new inference or benchmark: read the actual previously verified export.
base=root/'.build/neural-segmented/mgcfdn-vig';reference=json.loads((base/'reference.json').read_text());browser=json.loads((root/'docs'/proofs[2]).read_text());archive=base/'browser-cpu-m1-31.npz';assert sha(archive)==browser['exported']['sha256']
metrics={}
with np.load(archive,allow_pickle=False) as arrays:
 for key,spec in reference['records'][-1]['outputs'].items():
  expected=np.fromfile(base/spec['file'],spec['dtype']).reshape(spec['shape']);actual=arrays[key];delta=np.abs(actual.astype(np.float64)-expected.astype(np.float64));metrics[key]=dict(unit='probability [0,1]' if key=='map' else 'binary label',maxAbs=float(delta.max()),meanAbs=float(delta.mean()),different=int(np.count_nonzero(actual!=expected)))
report=dict(schema=1,status='passed',version=version,scope='All copied runtime bytes and existing proof numerical/runtime sources bound; recipe hashes remain as measured in their original reports. Mean errors derived offline from the same NumPy-verified export, no new inference or timing.',runtimeFiles=len(manifest['files']),runtimeManifestSha256=sha(root/'runtime-manifest.json'),proofs=bindings,cachedViewExport=metrics)
(root/'docs/vig-delivery-binding.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(status=report['status'],runtimeFiles=len(manifest['files']),metrics=metrics)))
