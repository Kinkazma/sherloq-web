from pathlib import Path
import ast,os,json,hashlib
import numpy as np
import cv2 as cv
from scipy.spatial import cKDTree
from scipy.ndimage import median_filter
core=Path(os.environ['SHERLOQ_NATIVE_CORE']);root=Path(__file__).resolve().parents[1];out=root/'.build/ela-describe';out.mkdir(parents=True,exist_ok=True)
ns=dict(np=np,cv=cv,check=lambda cancel:None,cKDTree=cKDTree,median_filter=median_filter,MAXIMUM_CONTENT_DISTANCE=.4,LOG_FLOOR=.1,DEFAULT_THRESHOLD=2,DEFAULT_MINIMUM_CELLS=3,PROFILE_NAMES=['luminance','chroma_red','chroma_blue','grain_1px','grain_2px'])
class Imports(ast.NodeTransformer):
 def visit_ImportFrom(self,node):return None
for filename,names in [('ela_background.py',['mid_profile','score_background']),('ela_biomes.py',['tiles','describe','peer_scores','coherent_scores','segment'])]:
 tree=ast.parse((core/filename).read_text());body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];module=Imports().visit(ast.Module(body=body,type_ignores=[]));exec(compile(module,filename,'exec'),ns)
ns['TRIM']=(.1,.9)
images=[cv.imread(str(root/'tests/data/recompression-2.png'))]
rng=np.random.default_rng(824);small=rng.integers(10,245,(36,60,3),dtype=np.uint8);images.append(cv.resize(small,(480,288),interpolation=cv.INTER_LINEAR))
images.append(images[1][:277,:473].copy())
cv.imwrite(str(root/'tests/data/ela-content.png'),images[1])
cases=[]
for index,image in enumerate(images):
 h,w=image.shape[:2];source=f'image-{index}.rgb';(out/source).write_bytes(image[:,:,::-1].tobytes())
 for q in [70,75,80]:
  compressed=cv.imdecode(cv.imencode('.jpg',image,[cv.IMWRITE_JPEG_QUALITY,q])[1],cv.IMREAD_COLOR);name=f'image-{index}-{q}.rgb';(out/name).write_bytes(compressed[:,:,::-1].tobytes())
  for block in [16,32,40]:
   content,profiles,usable,background=ns['describe'](image,compressed,block,lambda:False,background=True)
   cases.append(dict(source=source,compressed=name,width=w,height=h,block=block,content=content.tolist(),profiles=profiles.tolist(),usable=usable.tolist(),background=background.tolist()))
(out/'reference.json').write_text(json.dumps(cases))

groups=[]
for index,image in enumerate(images):
 for block in [16,32,40]:
  selected=[c for c in cases if c['source']==f'image-{index}.rgb' and c['block']==block]
  rows,cols=image.shape[0]//block,image.shape[1]//block
  content=np.array(selected[-1]['content'],np.float32);usable=np.array(selected[-1]['usable'],bool)
  profiles=np.stack([np.array(c['profiles'],np.float32) for c in selected],axis=1)
  bg=np.stack([np.array(c['background'],np.float32) for c in selected],axis=1).reshape(rows,cols,3,3)
  scores,signed,counts=ns['peer_scores'](content,profiles,usable,(rows,cols),lambda:False)
  supported=(counts>=16).reshape(rows,cols);signed=signed.reshape(rows,cols,3,5)
  coherent=ns['coherent_scores'](signed,supported);score=np.maximum(np.median(scores,axis=1).reshape(rows,cols),coherent)
  background=ns['score_background'](content.reshape(rows,cols,6),bg,supported)
  combined=np.maximum(score,background['background_score'])
  base=dict(score=combined,legacy_score=np.median(scores,axis=1).reshape(rows,cols),signed_scores=signed,supported=supported,metadata=dict(block=block),**background)
  segments=[]
  for threshold,minimum in [(1,1),(2,3),(4,3)]:
   result=ns['segment'](base,threshold,minimum);segments.append(dict(threshold=threshold,minimum=minimum,labels=result['labels'].tolist(),regions=result['metadata']['regions']))
  groups.append(dict(segments=segments,source=f'image-{index}.rgb',block=block,rows=rows,cols=cols,quality_scores=scores.tolist(),signed_scores=signed.tolist(),peer_count=counts.tolist(),coherent_score=coherent.tolist(),score=score.tolist(),mask=((combined>=2)&supported).tolist(),background={k:v.tolist() for k,v in background.items()}))
(out/'groups.json').write_text(json.dumps(groups))

(root/'tests/data/ela-describe-native.json').write_text(json.dumps(dict(sources={name:hashlib.sha256((core/name).read_bytes()).hexdigest() for name in ['ela_biomes.py','ela_background.py']},cases=cases,groups=groups),separators=(',',':'))+'\n')
