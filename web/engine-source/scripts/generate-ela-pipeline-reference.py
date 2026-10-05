"""Native cell/Ghost assembly, original synthetic PNGs, bounded one-worker oracle."""
from pathlib import Path
import ast,os,json,hashlib
from concurrent.futures import ThreadPoolExecutor,as_completed
import numpy as np
import cv2 as cv
from scipy.spatial import cKDTree
from scipy.ndimage import median_filter
root=Path(__file__).resolve().parents[1];core=Path(os.environ['SHERLOQ_NATIVE_CORE'])
class Cache:
 def __init__(self,*args):self.values={}
 def reserve(self,*args):pass
 def get(self,key):return self.values.get(key)
 def put(self,key,value):self.values[key]=value;return value
class Cancelled(Exception):pass
class Imports(ast.NodeTransformer):
 def visit_ImportFrom(self,node):return None
ns=dict(np=np,cv=cv,cKDTree=cKDTree,median_filter=median_filter,check=lambda cancel:None,_check=lambda cancel:None,TRIM=(.1,.9),MAXIMUM_CONTENT_DISTANCE=.4,LOG_FLOOR=.1,DEFAULT_THRESHOLD=2,DEFAULT_MINIMUM_CELLS=3,PROFILE_NAMES=['luminance','chroma_red','chroma_blue','grain_1px','grain_2px'],ArrayCache=Cache,ThreadPoolExecutor=lambda **kwargs:ThreadPoolExecutor(max_workers=1),as_completed=as_completed,Cancelled=Cancelled,GhostCancelled=Cancelled)
sources={}
for filename,names in [('ela_background.py',['mid_profile','score_background']),('ela_biomes.py',['tiles','describe','peer_scores','coherent_scores','segment']),('ghost_maps.py',['block_error','GhostEngine']),('ela_ghosts.py',['score_curves','aggregate','GhostBiomeEngine'])]:
 text=(core/filename).read_text();sources[filename]=hashlib.sha256(text.encode()).hexdigest();tree=ast.parse(text);body=[node for node in tree.body if isinstance(node,(ast.FunctionDef,ast.ClassDef)) and node.name in names]
 exec(compile(Imports().visit(ast.Module(body=body,type_ignores=[])),filename,'exec'),ns)
def clean(value):
 if isinstance(value,np.ndarray):return value.tolist()
 if isinstance(value,np.generic):return value.item()
 if isinstance(value,dict):return {k:clean(v) for k,v in value.items()}
 if isinstance(value,(list,tuple)):return [clean(v) for v in value]
 return value
rng=np.random.default_rng(841);tile=cv.resize(rng.integers(70,185,(4,4,3),dtype=np.uint8),(16,16));image=np.tile(tile,(9,9,1))
shifted=np.roll(image,(3,5),axis=(0,1));compressed=cv.imdecode(cv.imencode('.jpg',shifted,[cv.IMWRITE_JPEG_QUALITY,55])[1],cv.IMREAD_COLOR);patch=np.roll(compressed,(-3,-5),axis=(0,1));image[48:96,48:96]=patch[48:96,48:96];cv.imwrite(str(root/'tests/data/ela-small.png'),image)
rows,cols=9,9;planes=[ns['describe'](image,cv.imdecode(cv.imencode('.jpg',image,[cv.IMWRITE_JPEG_QUALITY,q])[1],cv.IMREAD_COLOR),16,lambda:False,background=True) for q in [70,75,80]]
content=planes[2][0];profiles=np.stack([v[1] for v in planes],axis=1);scores,signed,counts=ns['peer_scores'](content,profiles,planes[2][2],(rows,cols),lambda:False)
supported=(counts>=16).reshape(rows,cols);legacy=np.median(scores,axis=1).reshape(rows,cols);signed=signed.reshape(rows,cols,3,5);coherent=ns['coherent_scores'](signed,supported)
base=dict(content=content.reshape(rows,cols,6),profiles=profiles.reshape(rows,cols,3,5),quality_scores=scores.reshape(rows,cols,3),signed_scores=signed,peer_count=counts.reshape(rows,cols),supported=supported,legacy_score=legacy,coherent_score=coherent,score=np.maximum(legacy,coherent),metadata=dict(block=16))
background=ns['score_background'](base['content'],np.stack([v[3] for v in planes],axis=1).reshape(rows,cols,3,3),supported)
engine=ns['GhostBiomeEngine'](image);cases=[]
for ghost,all_grids,bg in [(False,False,False),(False,False,True),(True,False,True),(True,True,True)]:
 result=base.copy()
 if ghost:
  values=engine.compute(base,all_grids);result.update(**values,ela_score=base['score'],score=np.maximum(base['score'],values['ghost_score']))
 if bg:result.update(**background,pre_background_score=result['score'],score=np.maximum(result['score'],background['background_score']))
 segmented=ns['segment'](result,2,3);data={k:v for k,v in result.items() if k!='metadata'};data.update(labels=segmented['labels'],regions=segmented['metadata']['regions'])
 cases.append(dict(params=dict(block=16,quality=75,ghost=ghost,allGrids=all_grids,background=bg),data=data))
(root/'tests/data/ela-pipeline-native.json').write_text(json.dumps(clean(dict(sources=sources,file='ela-small.png',cases=cases)),separators=(',',':'))+'\n')
print('Native complete cell/Ghost reference:',len(cases),'cases')
