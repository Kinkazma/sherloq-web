"""Native microscopy/mirror and real complete public Auto references."""
from pathlib import Path
import os,sys,json,hashlib
import numpy as np,torch,cv2
root=Path(__file__).resolve().parents[1];out=root/'.build/forgeryscope';config=out/'yolo-config';(config/'Ultralytics').mkdir(parents=True,exist_ok=True);os.environ.update(YOLO_CONFIG_DIR=str(config),YOLO_AUTOINSTALL='false',YOLO_OFFLINE='true');sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.forgeryscope_adapter import load,predict
torch.set_num_threads(2);loaded=load('cpu')
texture=np.random.default_rng(173).integers(0,256,(96,128,3),dtype=np.uint8);rgb=np.full((116,296,3),210,np.uint8);rgb[10:106,10:138]=texture;rgb[10:106,158:286]=texture[:,::-1];panels=[('Microscopy',1.,10,10,138,106),('Microscopy',1.,158,10,286,106)]
path=root.parent/'third_party/research/clone_detectors/02_forgeryscope/examples/sample_data/kaggle_test_img_45.png';auto=cv2.imread(str(path))[:,:,::-1].copy();cases=[]
for ident,profile,image,manual in [('microscopy','Forgeryscope microscopie',rgb,panels),('auto','Forgeryscope Auto',auto,None)]:
 result=predict(image[:,:,::-1].copy(),loaded,profile,panels=manual);filename='positive-'+ident+'.rgb';image.tofile(out/filename);fields={}
 for name,values in result.items():
  if name=='metadata':continue
  file=f'positive-{ident}-{name}.'+('f32' if values.dtype==np.float32 else 'u8');values.tofile(out/file);fields[name]=dict(file=file,shape=list(values.shape),dtype=str(values.dtype))
 cases.append(dict(id=ident,profile=profile,file=filename,width=image.shape[1],height=image.shape[0],panels=manual,fields=fields,metadata=result['metadata']));print(ident,result['metadata']['status'],len(result['metadata']['panels']),len(result['metadata']['comparisons']),int(result['mask'].sum()),flush=True)
(out/'positive-reference.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),cases=cases),separators=(',',':'))+'\n')
