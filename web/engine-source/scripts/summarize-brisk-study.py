"""Summarize the offline detector studies without changing availability."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1];sets={}
for name,directory in [('initial','cloning-study'),('expanded','brisk-expanded-study')]:
    source=json.loads((root/'.build'/directory/'detector-brisk-area-results.json').read_text())
    rows=[r for r in source['records'] if r['algorithm']==0]
    sets[name]=dict(cases=len(rows),countMismatches=sum(r['actualCount']!=r['nativeCount'] for r in rows),nativeKeypoints=sum(r['nativeCount'] for r in rows),differingFields=dict(zip(['x','y','size','angle','response','octave','classId'],[sum(r.get('differences',[0]*7)[i] for r in rows) for i in range(7)])),maxDegrees=max(r.get('errors',[0]*7)[3] for r in rows),descriptorBytesDifferent=sum(r.get('descriptorDifferences',0) for r in rows),records=rows)
files=['experiments/cloning/brisk-area.cpp','scripts/build-cloning-study.py','.build/cloning-features-brisk-area.mjs','.build/cloning-features-brisk-area.wasm']
hashes={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
proof=dict(schema=1,status='unavailable',scope='offline detector only; no pipeline/runtime/WordPress claim',hashes=hashes,sets=sets)
(root/'docs/brisk-detector-study.json').write_text(json.dumps(proof,indent=2)+'\n')
print({name:{k:v for k,v in record.items() if k!='records'} for name,record in sets.items()})
