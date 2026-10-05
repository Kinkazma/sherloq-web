"""Native OpenCV + Shapely/skimage geometry oracle from supplied matched points."""
from pathlib import Path
import sys, json, hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import runtime
runtime()
from sherloq_clone_models.forgeryscope.matcher.lightglue import LightGlueOverlap,merge_masks_by_max_cliques
from sherloq_clone_models.forgeryscope.matcher.geometry import polygon_to_mask,polygon_to_bbox_mask
import cv2
rng=np.random.default_rng(920)
cases=[]
for index,(blot,transform) in enumerate([(False,'original'),(False,'fliplr'),(False,'flipud'),(False,'rot180'),(True,'original')]):
    p1=rng.uniform([5,5],[115,85],(32,2)).astype(np.float32)
    matrix=np.array([[.91,-.17,13.4],[.17,.91,-8.25]],np.float64)
    if blot:matrix[0,1]=.13
    p0=cv2.transform(p1[:,None],matrix)[:,0]
    p0+=rng.normal(0,.07,p0.shape).astype(np.float32)
    p0[::7]+=np.array([36,-25],np.float32)
    scores=np.linspace(.71,.98,len(p0),dtype=np.float32)
    obj=LightGlueOverlap.__new__(LightGlueOverlap)
    obj.estimator_method='MAGSAC' if blot else 'RANSAC'
    obj.reprojThreshold=3. if blot else 5.
    obj.estimator_confidence=.9999;obj.estimator_maxIters=5000;obj.estimator_refineIters=10
    obj._match_features=lambda *_:(p0,p1,scores,None)
    result=obj._compute_overlap_single(torch.empty(3,100,130),torch.empty(3,90,120),transform)
    assert 'error' not in result
    masks=[]
    for name,size in [('overlap_poly_img0',(100,130)),('overlap_poly_img1',(90,120))]:
        masks.append(dict(polygon=np.flatnonzero(polygon_to_mask(result[name],*size)).tolist(),bbox=np.flatnonzero(polygon_to_bbox_mask(result[name],*size)[1]).tolist()))
    result={k:list(v.exterior.coords) if k.startswith('overlap_poly') else v.tolist() if isinstance(v,np.ndarray) else v for k,v in result.items()}
    cases.append(dict(blot=blot,transform=transform,points0=p0.tolist(),points1=p1.tolist(),scores=scores.tolist(),size0=[130,100],size1=[120,90],expected=result,masks=masks))
source=Path(sys.modules[LightGlueOverlap.__module__].__file__)
out=root/'tests/data/forgeryscope/geometry.json'
out.write_text(json.dumps(dict(opencv=cv2.__version__,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),cases=cases),separators=(',',':'))+'\n')
print(out)
graphs=[[(0,1),(1,2)],[(0,1),(1,2),(0,2),(0,3),(1,3)],[(32,64),(64,128),(32,128),(32,256),(64,256),(2,7),(2,7)]]
cliques=[]
for edges in graphs:
    info=[dict(panel_id0=a,panel_id1=b,poly_coords0=[[a,0]],poly_coords1=[[b,0]],match_result=dict(inliers=i+8,mean_match_score=.8+i*.01)) for i,(a,b) in enumerate(edges)]
    masks=[np.ones((2,2),np.uint8) for _ in info]
    _,groups=merge_masks_by_max_cliques(masks,info)
    cliques.append(dict(info=info,expected=groups))
(root/'tests/data/forgeryscope/cliques.json').write_text(json.dumps(cliques,separators=(',',':'))+'\n')
