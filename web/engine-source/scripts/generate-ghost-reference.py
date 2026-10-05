from pathlib import Path
from itertools import product
import sys,json,hashlib,numpy as np,matplotlib
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.ghost_maps import GhostEngine,block_error
OUT=ROOT/'web-engine/fixtures';rng=np.random.default_rng(5612);cases=[]
for name,width,height in [('random',35,33),('flat',32,32),('texture',137,129),('blocks',64,48)]:
 data=rng.integers(0,256,(height,width,3),np.uint8)
 if name=='flat':data.fill(127)
 if name=='blocks':data=np.where((np.indices((height,width)).sum(axis=0)//8%2)[:,:,None],np.array([255,80,1],np.uint8),np.array([0,180,245],np.uint8)).astype(np.uint8)
 file='ghost-'+name+'.rgb';(OUT/file).write_bytes(data.tobytes());engine=GhostEngine(data[:,:,::-1].copy(),workers=1);expected=[]
 for x,y in product(range(8) if name=='random' else [0,1,7],repeat=2):
  for low,high,step in [(0,0,1),(0,100,20),(50,90,5),(95,100,1)]+([(0,100,1)] if x==y==0 else []):
   params=(low,high,step,x,y,False,False);maps=engine.maps(params);qualities=GhostEngine.validate(params);raw=np.stack([engine.blocks.get((x,y,q)) for q in qualities],axis=2);expected.append(dict(params=dict(low=low,high=high,step=step,x=x,y=y),shape=list(maps.shape),sha256=hashlib.sha256(maps.tobytes()).hexdigest(),rawSha256=hashlib.sha256(raw.tobytes()).hexdigest(),previews={palette:[hashlib.sha256(matplotlib.colormaps[palette](maps[:,:,i],bytes=True)[:,:,:3].copy().tobytes()).hexdigest() for i in range(len(qualities))] for palette in ['gray','viridis']},maps=maps.ravel().tolist(),raw=raw.ravel().tolist()))
 cases.append(dict(name=name,file=file,width=width,height=height,expected=expected));print(name,len(expected),flush=True)
(OUT/'ghost-reference.json').write_text(json.dumps(dict(schema=1,cases=cases),separators=(',',':'))+'\n')
