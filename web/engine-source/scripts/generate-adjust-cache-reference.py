"""Changed threshold/inversion views from existing public adjustment prefixes."""
from pathlib import Path
import hashlib,json,sys
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.adjust import AdjustEngine
cv2.setNumThreads(1);source=json.loads((root/'.build/adjust-large-reference.json').read_text())['sources'][1];image=cv2.imread(str(root/source['file']));cases=[]
fields=['brightness','saturation','hue','gamma','shadows','highlights','sweep','width','sharpen','threshold','equalize','invert']
for index in [0,1]:
 for threshold,invert in [(127,False),(0,True),(255,True)]:
  params={**source['cases'][index]['params'],'threshold':threshold,'invert':invert};out=AdjustEngine(image,megabytes=32)._compute(tuple(params[k]for k in fields));digest=hashlib.sha256()
  for y in range(0,source['height'],64):digest.update(np.ascontiguousarray(out[y:y+64,:,::-1]).tobytes())
  cases.append(dict(prefixCase=index,params=params,sha256=digest.hexdigest()));del out
p='source/gui/sherloq_app/core/adjust.py';record=dict(schema=1,reference='Original complete native AdjustEngine views, changed thresholds/inversion with identical preprocessing.',nativeSource={p:hashlib.sha256((root.parent/p).read_bytes()).hexdigest()},source={k:source[k]for k in ['file','width','height','originalSha256']},cases=cases)
(root/'.build/adjust-cache-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(views=len(cases))))
