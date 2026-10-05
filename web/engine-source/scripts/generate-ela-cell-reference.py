"""Execute unchanged native function ASTs; write no pyc or shared fixtures."""
from pathlib import Path
import ast,hashlib,json,os
import numpy as np
import cv2 as cv
from scipy.ndimage import median_filter
root=Path(__file__).resolve().parents[1];core=Path(os.environ['SHERLOQ_NATIVE_CORE'])
ns=dict(np=np,cv=cv,median_filter=median_filter)
sources={}
for filename,names in [('ela_biomes.py',['coherent_scores','segment']),('ela_ghosts.py',['aggregate'])]:
 text=(core/filename).read_text();sources[filename]=hashlib.sha256(text.encode()).hexdigest();tree=ast.parse(text)
 body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('PROFILE_NAMES','DEFAULT_THRESHOLD','DEFAULT_MINIMUM_CELLS') for t in n.targets)]
 exec(compile(ast.Module(body=body,type_ignores=[]),filename,'exec'),ns)
def clean(v):
 if isinstance(v,np.ndarray):return v.tolist()
 if isinstance(v,np.generic):return v.item()
 if isinstance(v,dict):return {k:clean(x) for k,x in v.items()}
 if isinstance(v,(list,tuple)):return [clean(x) for x in v]
 return v
cases=[]
for seed,rows,cols,mode in [(3,8,11,0),(12,17,19,1),(42,21,16,2),(71,257,9,3)]:
 state=seed
 def rand():
  global state
  state=(state*1664525+1013904223)&0xffffffff;return state
 n=rows*cols
 signed=np.array([(rand()%65-32)/8 for _ in range(n*15)],np.float32).reshape(rows,cols,3,5)
 supported=np.array([rand()%5>0 for _ in range(n)]).reshape(rows,cols)
 score=np.array([rand()%11/2 for _ in range(n)],np.float32).reshape(rows,cols)
 legacy=np.array([rand()%7/2 for _ in range(n)],np.float32).reshape(rows,cols)
 ghost=np.array([rand()%9/2 for _ in range(n)],np.float32).reshape(rows,cols)
 background=np.array([rand()%10/2 for _ in range(n)],np.float32).reshape(rows,cols)
 ghost_supported=np.array([rand()%4>0 for _ in range(n)]).reshape(rows,cols)
 background_supported=np.array([rand()%3>0 for _ in range(n)]).reshape(rows,cols)
 base=dict(score=score,signed_scores=signed,supported=supported,metadata=dict(block=32))
 if mode>=1:base['legacy_score']=legacy
 if mode>=2:base.update(ghost_score=ghost,ghost_supported=ghost_supported,ela_score=legacy)
 if mode>=3:base.update(background_score=background,background_supported=background_supported)
 expected=[]
 for threshold,minimum in [(2.,1),(2.,3),(4.1,4)]:
  result=ns['segment'](base,threshold,minimum);expected.append(dict(threshold=threshold,minimum=minimum,labels=result['labels'],regions=result['metadata']['regions']))
 cases.append(dict(seed=seed,rows=rows,cols=cols,mode=mode,coherent=ns['coherent_scores'](signed,supported),expected=expected))
aggregations=[]
for block,dy,dx,q in [(16,0,0,7),(24,3,5,7),(32,7,7,71),(48,1,2,3)]:
 mr,mc=11,13;rows,cols=6,7;maps=((np.arange(mr*mc*q)%103)*.001).reshape(mr,mc,q)
 curves,valid=ns['aggregate'](maps,block,(rows,cols),dx,dy)
 aggregations.append(dict(mapRows=mr,mapCols=mc,rows=rows,cols=cols,block=block,dx=dx,dy=dy,qualities=q,curves=curves,valid=valid))
(root/'tests/data/ela-cell-native.json').write_text(json.dumps(clean(dict(opencv=cv.__version__,sources=sources,cases=cases,aggregations=aggregations)),separators=(',',':'))+'\n')
