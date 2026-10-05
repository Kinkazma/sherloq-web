"""Publish only generated-study metrics/hashes, including actual mask decisions.
Converted model weights and tensor payloads remain under .build.
"""
from pathlib import Path
import json,sys,hashlib
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import postprocess
base=root/'.build/d2prl-model';ref=json.loads((base/'reference.json').read_text())
def read(entry):
 data=(base/entry['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==entry['sha256'];return np.frombuffer(data,np.float32).reshape(448,448)
native=np.stack([read(e) for e in ref['raw']]);reports=[]
for path in sorted(base.glob('*-proof.json')):
 report=json.loads(path.read_text());report['studyFile']=path.name;report['status']='experimental-rejected' if any(r['maxAbs']>1e-4 or r['nonfinite'] for r in report['rows']) else 'needs-final-decision-qualification'
 if report['stage'].startswith('heads'):
  actual=np.stack([read(report['outputs'][key]) for key in ['union','target','source']]);comparisons=[]
  for minimum in [0,17,500,5000]:
   a=postprocess(actual,minimum);b=postprocess(native,minimum);comparisons.append(dict(minimum=minimum,differentPixels={key:int(np.count_nonzero(x!=y)) for key,x,y in zip(['union','target','source'],a,b)}))
  report['nativeGridPostprocess']=comparisons
 reports.append(report)
output=dict(schema=1,scope='One generated RGB source and split local-weight ONNX graphs. Native448-grid postprocess applied to actual captured browser tensors. No complete browser detector, image-resize/zone-union qualification or tolerance exception.',source=ref['source'],nativeInput=ref['input'],nativeWrapperVerification=dict(descriptorHalfExact=ref['descriptorWrapperHalfExact'],headsExact=ref['headWrapperExact']),reports=reports)
(root/'docs/d2prl-full-block-conversion-study.json').write_text(json.dumps(output,indent=2)+'\n')
for r in reports:
 if r['stage'].startswith('heads'):print(json.dumps(dict(study=r['studyFile'],masks=r['nativeGridPostprocess'])))
