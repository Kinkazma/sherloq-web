"""Stage only CMSeg computational kernels and provenance, never model weights."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1];target=root/'vendor/segmentation';target.mkdir(exist_ok=True)
files={};builds={}
for folder,stem in [('cmseg-correlation','correlation'),('cmseg-spatial','spatial512')]:
    base=root/'.build'/folder;builds[folder]=json.loads((base/'build.json').read_text())
    for extension in ['js','wasm']:
        name=stem+'.'+extension;data=(base/name).read_bytes();assert b'/Users/' not in data
        (target/name).write_bytes(data);files[name]=dict(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
sources=json.loads((root/'.build/torch28-reference/cmseg-softmax-sources.json').read_text())
(target/'CMSEG-PINNED.json').write_text(json.dumps(dict(schema=1,scope='Bounded full-global CMSeg correlation and512 source projection. No model parameters. Existing PyTorch/SLEEF/OpenCV notices in vendor/d2prl and vendor/opencv apply.',builds=builds,referenceSources=sources,files=files),indent=2)+'\n')
print('Staged',len(files),'CMSeg runtime files')
