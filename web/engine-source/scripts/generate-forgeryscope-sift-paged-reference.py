"""Owned development fixtures; exact native SIFT and full-source 96 MP pair."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
from PIL import Image
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));out=root/'.build/forgeryscope'
from gui.sherloq_app.vendor.lightglue.sift import SIFT
from gui.sherloq_app.vendor.lightglue.utils import numpy_image_to_torch
torch.set_num_threads(2);model=SIFT().eval();cases=[]
rgb=np.random.default_rng(27512).integers(0,256,(768,1280,3),dtype=np.uint8)
for i,transform in enumerate(['original','fliplr','flipud','rot180']):
 image=np.ascontiguousarray(rgb if i==0 else rgb[:,::-1] if i==1 else rgb[::-1] if i==2 else rgb[::-1,::-1]);x=numpy_image_to_torch(image)
 with torch.inference_mode():features=model.extract(x,resize=None)
 file=f'sift-paged-{i}.rgb';rgb.tofile(out/file);files={}
 for name,value in features.items():
  namefile=f'sift-paged-{i}-{name}.f32';value.numpy().astype('<f4').tofile(out/namefile);files[name]=dict(file=namefile,shape=list(value.shape))
 cases.append(dict(id=i,transform=transform,width=1280,height=768,rgb=file,files=files));print(transform,features['keypoints'].shape,flush=True)
ref=json.loads((out/'rootsift-reference.json').read_text());ref['cases']=cases;(out/'sift-paged-reference.json').write_text(json.dumps(ref)+'\n')
# Full original source, both panels cover all pixels. Strong native feature
# density, distant mirrored duplication; no crop substituted for the source.
large=root/'.build/forgeryscope-source';panel=np.random.default_rng(27513).integers(0,256,(8000,6000,3),dtype=np.uint8)
canvas=np.concatenate([panel,panel[:,::-1]],axis=1);file='microscopy-96mp.png';Image.fromarray(canvas).save(large/file)
ref=dict(file=file,width=12000,height=8000,sha256=hashlib.sha256((large/file).read_bytes()).hexdigest(),panels=[[0,0,6000,8000],[6000,0,12000,8000]],fixture='two full 48 MP seeded rich panels, mirrored; workload proof, no independent native 96 MP oracle')
(large/'reference-microscopy-96mp.json').write_text(json.dumps(ref)+'\n');print(ref,flush=True)
