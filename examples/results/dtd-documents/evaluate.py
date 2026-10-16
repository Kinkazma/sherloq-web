"""Recompute the published DTD pixel counts from frozen scientific maps."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parent
dataset=json.loads((root/'dataset.json').read_text())
expected=json.loads((root/'evaluation.json').read_text())
outputs=json.loads((root/'outputs.json').read_text())
assert hashlib.sha256((root/'dataset.json').read_bytes()).hexdigest()==expected['datasetSha256']
counts=np.zeros(4,dtype=np.int64)
for sample in dataset['samples']:
 for field,identity in [('input','inputSha256'),('mask','maskSha256')]:
  assert hashlib.sha256((root/sample[field]).read_bytes()).hexdigest()==sample[identity]
 record=next(x for x in outputs['maps'] if x['id']==sample['id'])
 for field in ['response','validity']:
  item=record[field];assert hashlib.sha256((root/item['file']).read_bytes()).hexdigest()==item['sha256']
 response=np.fromfile(root/record['response']['file'],dtype='<f4').reshape(dataset['height'],dataset['width'])
 valid=np.fromfile(root/record['validity']['file'],dtype='u1').reshape(response.shape)>0
 assert valid.all() and np.isfinite(response).all()
 prediction=response>=dataset['protocol']['pixelThreshold']
 reference=np.asarray(Image.open(root/sample['mask']))>0
 counts+=np.array([(prediction&reference).sum(),(prediction&~reference).sum(),(~prediction&reference).sum(),(~prediction&~reference).sum()])
actual=dict(zip(['TP','FP','FN','TN'],map(int,counts)))
assert actual=={k:expected['pixelMetrics'][k] for k in actual}
print(json.dumps(actual,indent=2))
