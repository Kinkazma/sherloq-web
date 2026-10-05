"""Rounding-sensitive geometric and angle-statistic cases for copy/move."""
from pathlib import Path
import json, sys
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.cloning import cluster_matches
assert np.__version__=='1.26.4' and cv.__version__=='4.11.0'
out=root/'.build/cloning-study';rng=np.random.default_rng(250003)
deltas=rng.uniform(-4096,4096,(10000,2))
scalar=np.asarray([np.linalg.norm(delta) for delta in deltas])
np.column_stack([deltas,scalar]).astype('<f8').tofile(out/'norm-primitives.f64')
stats=[]
for length in [0,1,2,7,8,9,127,128,129,8191,8192,8193,16383,16384,16385,338086]:
    for mode in ['random','below','at','above','flat']:
        a=rng.uniform(0,np.pi,length).astype(np.float32)
        if mode in ['below','at','above']:
            scale={'below':.19999998,'at':.2,'above':.20000003}[mode]
            a=(np.arange(length)%2*scale).astype(np.float32)
        if mode=='flat':a.fill(np.float32(np.pi))
        file=f'std-{mode}-{length}.f32';a.astype('<f4').tofile(out/file)
        stats.append(dict(file=file,std=float(np.std(a)) if length else None))
geometry=[]
for i in range(30):
    x,y=rng.uniform(1,90,2);distance=np.linalg.norm([x,y]);points=np.zeros((8,7),np.float64)
    points[:,:2]=[[0,0],[100,100],[x,y],[100+x,100+y],[2*x,2*y],[100+2*x,100+2*y],[x+1,y+2],[101+x,102+y]]
    matches=np.array([[0,1,0],[1,0,0],[2,3,1],[3,2,1],[4,5,2],[5,4,2],[6,7,3],[7,6,3]],np.float64)
    for cutoff in [np.nextafter(distance,0),distance,np.nextafter(distance,np.inf)]:
        filtered,groups=cluster_matches(points,matches,cutoff,1)
        geometry.append(dict(points=points.ravel().tolist(),matches=matches.ravel().tolist(),distance=cutoff,filtered=filtered.ravel().tolist(),lengths=[len(g) for g in groups],groups=np.concatenate(groups).tolist() if groups else []))
(out/'primitives-reference.json').write_text(json.dumps(dict(stats=stats,geometry=geometry),indent=2)+'\n')
print(len(deltas),'norms;',len(stats),'float32 standard deviations;',len(geometry),'boundary geometries')
