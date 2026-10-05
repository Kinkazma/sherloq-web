from pathlib import Path
import ast,json,os,hashlib
import numpy as np
from scipy.spatial import cKDTree
from scipy.ndimage import median_filter
root=Path(__file__).resolve().parents[1];core=Path(os.environ['SHERLOQ_NATIVE_CORE']);ns=dict(np=np,cKDTree=cKDTree,median_filter=median_filter,check=lambda cancel:None,MAXIMUM_CONTENT_DISTANCE=.4,LOG_FLOOR=.1)
sources={}
for filename,name in [('ela_biomes.py','peer_scores'),('ela_ghosts.py','score_curves'),('ela_background.py','score_background')]:
 text=(core/filename).read_text();sources[filename]=hashlib.sha256(text.encode()).hexdigest();tree=ast.parse(text);node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
 # Remove only relative import of check; use the same no-op cancellation hook.
 node.body=[n for n in node.body if not isinstance(n,ast.ImportFrom)]
 exec(compile(ast.Module(body=[node],type_ignores=[]),filename,'exec'),ns)
def clean(v):
 if isinstance(v,np.ndarray):return v.tolist()
 if isinstance(v,np.generic):return v.item()
 if isinstance(v,dict):return {k:clean(x) for k,x in v.items()}
 if isinstance(v,(tuple,list)):return [clean(x) for x in v]
 return v
cases=[]
for seed,rows,cols,mode in [(18,6,7,'flat'),(19,17,19,'varied'),(22,9,13,'duplicates'),(4,3,5,'small')]:
 state=seed
 def rand():
  global state
  state=(state*1664525+1013904223)&0xffffffff;return state
 n=rows*cols;c=np.array([(rand()%32)/64 for _ in range(n*6)],np.float32).reshape(n,6)
 c[:,0]+=128;c[:,4]+=20
 if mode=='flat':c[:]=c[0]
 if mode=='duplicates':c=np.floor(c*4)/4
 usable=np.array([rand()%5>0 for _ in range(n)])
 p=np.array([(rand()%64)/16 for _ in range(n*15)],np.float32).reshape(n,3,5)
 bg=np.array([(rand()%64)/32 for _ in range(n*9)],np.float32).reshape(rows,cols,3,3)
 curves=np.array([(rand()%1000)/1000 for _ in range(n*71)]).reshape(rows,cols,71)
 scores,signed,counts=ns['peer_scores'](c,p,usable,(rows,cols),lambda:False)
 background=ns['score_background'](c.reshape(rows,cols,6),bg,usable.reshape(rows,cols))
 ghost,gq,gc=ns['score_curves'](c.reshape(rows,cols,6),curves,usable.reshape(rows,cols))
 cases.append(dict(seed=seed,rows=rows,cols=cols,mode=mode,legacy=dict(quality_scores=scores,signed_scores=signed,peer_count=counts),background=background,ghost=dict(ghost_score=ghost,ghost_quality=gq,ghost_peer_count=gc,ghost_supported=gc>=16)))
(root/'tests/data/ela-peer-native.json').write_text(json.dumps(clean(dict(sources=sources,cases=cases)),separators=(',',':'))+'\n')
