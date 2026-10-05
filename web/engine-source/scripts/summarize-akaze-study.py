"""Publish completed detector evidence; reject partial or divergent studies."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
source=json.loads((root/'.build/akaze-expanded-study/detector-akaze-area-results.json').read_text())
rows=source['records'];assert len(rows)==128
assert all(r['algorithm']==2 and r['nativeCount']==r['actualCount'] and r['actualCount']>=0 for r in rows)
assert all(not any(r.get('differences',[])) and not r.get('descriptorDifferences',0) for r in rows)
assert all(r.get('nativeDescriptorSize',61)==61 and r.get('actualDescriptorSize',61)==61 for r in rows)
wasm=root/'.build/cloning-features-akaze-area.wasm'
assert hashlib.sha256(wasm.read_bytes()).hexdigest()==source['wasmSha256'],'Prototype changed after qualification'
files=['scripts/build-akaze-study.py','experiments/cloning/akaze-angles.cpp','experiments/cloning/akaze-filters.cpp','experiments/cloning/akaze-separable.cpp','experiments/cloning/akaze-area.cpp']
proof=dict(schema=1,scope='Offline detector, all seven point fields and complete descriptors; product qualification is separate',nativeSourceSha256=source['referenceSource'],prototypeWasmSha256=source['wasmSha256'],cases=len(rows),nativeKeypoints=sum(r['nativeCount'] for r in rows),differentCounts=0,differentFields=0,differentDescriptorBytes=0,sourceHashes={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in files},records=rows)
(root/'docs/akaze-detector-study.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({k:proof[k] for k in ['cases','nativeKeypoints','differentCounts','differentFields','differentDescriptorBytes']}))
