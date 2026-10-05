"""Verify full RGB drawing independently with native CM2 render and saved NPZ."""
from pathlib import Path
import sys,json,time
import numpy as np,cv2
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));cv2.setNumThreads(2)
from gui.sherloq_app.core.cloning2 import render
name=sys.argv[1] if len(sys.argv)>1 else 'aliked';out=root/'.build/m3';start=time.time();archive=np.load(out/f'96mp-{name}.npz',allow_pickle=False);meta=json.loads(str(archive['metadata_json']));image=cv2.imread(str(out/(sys.argv[2] if len(sys.argv)>2 else 'm3-96mp-noise-copy.jpg' if name=='orb' else 'm3-96mp-sparse.jpg')))
r=dict(points=archive['points'],pairs=archive['pairs'],colors=archive['colors_bgr'],groups=tuple(np.array(g,np.int64) for g in meta['biomes']),bases=tuple(tuple(c) for c in meta['biome_colors_bgr']),self_match_filter=meta['self_match_filter'])
expected,visible,legend=render(image,r,(0.,100000.,4,(),True,True,False,True,(),False));del image
actual=cv2.imread(str(out/f'96mp-{name}.png'));assert actual.shape==expected.shape==(8000,12000,3)
count=0;maximum=0
for y in range(0,8000,32):
 d=np.abs(actual[y:y+32].astype(np.int16)-expected[y:y+32].astype(np.int16));count+=int(np.count_nonzero(d));maximum=max(maximum,int(d.max()))
assert count==0,(count,maximum)
report=dict(sourceSize=[12000,8000],points=len(r['points']),pairs=len(r['pairs']),groups=len(r['groups']),visible=visible,legend=legend,comparedBytes=288000000,differentBytes=count,maximumError=maximum,seconds=time.time()-start,scope='Native drawing of exported browser point/pair/model data; not a second96MP native neural inference.')
(root/'docs'/f'm3-96mp-sparse-export-{name}-proof.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
