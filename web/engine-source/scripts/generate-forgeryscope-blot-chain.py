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
matcher=LightGlueOverlap(max_keypoints=512,matcher_features='aliked',device='cpu',depth_confidence=-1,width_confidence=-1,estimator_method='MAGSAC',reprojThreshold=3.)
weight,sha=verified(WEIGHTS/'02_forgeryscope/aliked_wblot.pth')
state=torch.load(weight,map_location='cpu',weights_only=True)['model']
matcher.extractor.load_state_dict({k.removeprefix('extractor.'):v for k,v in state.items() if k.startswith('extractor.')},strict=True)
weights={k.removeprefix('matcher.'):v for k,v in state.items() if k.startswith('matcher.')}
for i in range(9):weights={k.replace(f'self_attn.{i}',f'transformers.{i}.self_attn').replace(f'cross_attn.{i}',f'transformers.{i}.cross_attn'):v for k,v in weights.items()}
weights.setdefault('confidence_thresholds',matcher.matcher.confidence_thresholds)
matcher.matcher.load_state_dict(weights,strict=True)
out=root/'.build/forgeryscope';cases=[]
y,x=np.mgrid[:96,:128]
periodic=np.stack([(x*7+y*11)%256,(x*3+y*13)%256,(x*17+y*5)%256],axis=2).astype(np.uint8)
texture=np.random.default_rng(73).integers(0,256,(96,128,3),dtype=np.uint8)
for index,(a,b) in enumerate([(periodic,periodic.copy()),(texture[:,:100],texture[:,28:])]):
    images=[]
    for j,img in enumerate([a,b]):
        name=f'blot-chain-{index}-{j}.rgb';img.tofile(out/name);images.append(dict(file=name,width=img.shape[1],height=img.shape[0]))
    result=matcher.compute_overlap(a,b,test_transforms=False)
    expected={k:list(v.exterior.coords) if k.startswith('overlap_poly') else v.tolist() if isinstance(v,np.ndarray) else v for k,v in result.items()}
    cases.append(dict(id=index,images=images,expected=expected))
(out/'blot-chain-reference.json').write_text(json.dumps(dict(checkpointSha256=sha,cases=cases),separators=(',',':'))+'\n')
print([(c['id'],c['expected'].get('inliers'),c['expected'].get('mean_match_score')) for c in cases])
