"""Reference complete tuned ALIKED -> LightGlue -> MAGSAC, no model stand-in."""
from pathlib import Path
import sys,json
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import runtime,WEIGHTS,verified
runtime()
from sherloq_clone_models.forgeryscope.matcher.lightglue import LightGlueOverlap
torch.set_num_threads(2)
matcher=LightGlueOverlap(max_keypoints=4096,matcher_features='sift',device='cpu',depth_confidence=.9,width_confidence=.9)
_,sha=verified(root.parent/'models/external/sift_lightglue.pth')
out=root/'.build/forgeryscope';cases=[]
y,x=np.mgrid[:96,:128]
periodic=np.stack([(x*7+y*11)%256,(x*3+y*13)%256,(x*17+y*5)%256],axis=2).astype(np.uint8)
texture=np.random.default_rng(73).integers(0,256,(96,128,3),dtype=np.uint8)
for index,(a,b) in enumerate([(texture,texture.copy()),(texture,np.ascontiguousarray(texture[:,::-1]))]):
    images=[]
    for j,img in enumerate([a,b]):
        name=f'micro-chain-{index}-{j}.rgb';img.tofile(out/name);images.append(dict(file=name,width=img.shape[1],height=img.shape[0]))
    result=matcher.compute_overlap(a,b,test_transforms=True)
    expected={k:list(v.exterior.coords) if k.startswith('overlap_poly') else v.tolist() if isinstance(v,np.ndarray) else v for k,v in result.items()}
    cases.append(dict(id=index,images=images,expected=expected))
(out/'micro-chain-reference.json').write_text(json.dumps(dict(checkpointSha256=sha,cases=cases),separators=(',',':'))+'\n')
print([(c['id'],c['expected'].get('inliers'),c['expected'].get('mean_match_score')) for c in cases])
