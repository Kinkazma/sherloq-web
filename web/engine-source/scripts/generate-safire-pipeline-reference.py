from pathlib import Path
import sys,json,numpy as np,torch,cv2
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));torch.set_num_threads(2);cv2.setNumThreads(2)
from gui.sherloq_app.core.safire import load,predict
out=root/'.build/m3';image=np.fromfile(out/'sparse-positive-rgb.bin',np.uint8).reshape(176,448,3)[:,:,::-1].copy();model=load('cpu');cache={};cases=[]
for i,params in enumerate([dict(side=4,groups=3),dict(side=4,binary=True),dict(side=4,kind='dbscan',eps=.2,minimum=1)]):
 r=predict(image,model,cache=cache,**params);files={}
 for name,value in r.items():
  if isinstance(value,np.ndarray):
   file=f'safire-pipeline-{i}-{name}.bin';value.tofile(out/file);files[name]=dict(file=file,shape=list(value.shape),dtype=str(value.dtype))
 cases.append(dict(params=params,files=files,metadata=r['metadata']));print(r['metadata'],flush=True)
(out/'safire-pipeline-reference.json').write_text(json.dumps(dict(width=448,height=176,imageFile='sparse-positive-rgb.bin',cases=cases),separators=(',',':')))
