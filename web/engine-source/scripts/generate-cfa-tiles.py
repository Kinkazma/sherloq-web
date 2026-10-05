from pathlib import Path
import sys,json,torch,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.adaptive_cfa import load,predict,WEIGHTS
out=root/'.build/cfa-m2';torch.set_num_threads(2);records=[]
rgb=np.random.default_rng(706).integers(0,256,(89,105,3),dtype=np.uint8);rgb.tofile(out/'tile-input.rgb')
for variant in WEIGHTS:
 m=load(variant,'cpu')
 for block,tile in [(8,64),(16,32),(64,512)]:
  result=predict(rgb[:,:,::-1].copy(),m,block=block,tile=tile);records.append(dict(variant=variant,block=block,tile=tile,width=105,height=89,file='tile-input.rgb',outputs={k:dict(values=v.ravel().tolist(),shape=list(v.shape)) for k,v in result.items() if k!='metadata'},metadata=result['metadata']))
(out/'tiles-reference.json').write_text(json.dumps(dict(cases=records),separators=(',',':'))+'\n')
