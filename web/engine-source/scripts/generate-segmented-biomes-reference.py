"""Full native cell/background/region oracle for M5 segmented public API."""
from pathlib import Path
import sys, json, hashlib, cv2 as cv, numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela_biomes import describe, peer_scores, coherent_scores, segment
from gui.sherloq_app.core.ela_background import score_background
assert cv.__version__=='4.11.0' and np.__version__=='1.26.4';cv.setNumThreads(1)
file='tests/data/tiff-stream/tiles-bigtiff.tiff';image=cv.imread(str(root/file));h,w=image.shape[:2];block=32
while (h//block)*(w//block)>16384:block+=8
rows,cols=h//block,w//block;planes=[]
for q in [70,75,80]:
 decoded=cv.imdecode(cv.imencode('.jpg',image,[cv.IMWRITE_JPEG_QUALITY,q])[1],cv.IMREAD_COLOR)
 planes.append(describe(image,decoded,block,lambda:False,background=True));print(q,flush=True)
content=planes[-1][0];profiles=np.stack([v[1] for v in planes],axis=1)
scores,signed,counts=peer_scores(content,profiles,planes[-1][2],(rows,cols),lambda:False)
supported=(counts>=16).reshape(rows,cols);legacy=np.median(scores,axis=1).reshape(rows,cols);signed=signed.reshape(rows,cols,3,5);coherent=coherent_scores(signed,supported)
base=dict(content=content.reshape(rows,cols,6),profiles=profiles.reshape(rows,cols,3,5),quality_scores=scores.reshape(rows,cols,3),signed_scores=signed,peer_count=counts.reshape(rows,cols),supported=supported,legacy_score=legacy,coherent_score=coherent,score=np.maximum(legacy,coherent),metadata=dict(block=block))
background=score_background(base['content'],np.stack([v[3] for v in planes],axis=1).reshape(rows,cols,3,3),supported)
base={**base,**background,'pre_background_score':base['score'],'score':np.maximum(base['score'],background['background_score'])}
result=segment(base,2,3);base['labels']=result['labels'];payload=bytearray();fields={}
for key,data in base.items():
 if not isinstance(data,np.ndarray):continue
 kind='u1' if data.dtype.kind=='b' else '<i4' if data.dtype.kind in 'iu' else '<f4'
 while len(payload)%4:payload.append(0)
 raw=data.astype(kind).tobytes();fields[key]=dict(offset=len(payload),bytes=len(raw),dtype=kind,sha256=hashlib.sha256(raw).hexdigest());payload.extend(raw)
def clean(value):
 if isinstance(value,np.generic):return value.item()
 if isinstance(value,dict):return {k:clean(v) for k,v in value.items()}
 if isinstance(value,(tuple,list)):return [clean(v) for v in value]
 return value
(root/'tests/data/segmented-biomes-native.bin').write_bytes(payload)
(root/'tests/data/segmented-biomes-native.json').write_text(json.dumps(dict(file=file,width=w,height=h,block=block,rows=rows,cols=cols,params=dict(block=32,quality=0,ghost=False,background=True),fields=fields,regions=clean(result['metadata']['regions']),payloadSha256=hashlib.sha256(payload).hexdigest(),opencv=cv.__version__,numpy=np.__version__),indent=2)+'\n')
