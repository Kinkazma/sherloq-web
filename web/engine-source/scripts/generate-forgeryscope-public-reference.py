"""Native public-profile cases; outputs and copied reference inputs stay local."""
from pathlib import Path
import os,sys,json
import numpy as np
import torch
import cv2
root=Path(__file__).resolve().parents[1];out=root/'.build/forgeryscope'
config=out/'yolo-config';(config/'Ultralytics').mkdir(parents=True,exist_ok=True)
os.environ['YOLO_CONFIG_DIR']=str(config);os.environ['YOLO_AUTOINSTALL']='false';os.environ['YOLO_OFFLINE']='true'
sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.forgeryscope_adapter import load,predict
torch.set_num_threads(2)
loaded=load('cpu')
texture=np.random.default_rng(73).integers(0,256,(96,128,3),dtype=np.uint8)
composite=np.full((116,260,3),210,np.uint8)
composite[10:106,10:110]=texture[:,:100]
composite[10:106,150:250]=texture[:,28:]
panels=[('Blots',1.,10,10,110,106),('Blots',1.,150,10,250,106)]
sample=cv2.imread(str(root.parent/'third_party/research/clone_detectors/02_forgeryscope/examples/sample_data/wblot_sample.png'))[:,:,::-1].copy()
duplicate=composite.copy();duplicate[10:106,150:250]=texture[:,:100]
lane_pair=np.full((89,1324,3),255,np.uint8);lane_pair[:,:652]=sample;lane_pair[:,672:]=sample
lane_panels=[('Blots',1.,0,0,652,89),('Blots',1.,672,0,1324,89)]
cases=[]
for ident,profile,rgb,manual in [('duplicate','Forgeryscope blots complets',duplicate,panels),('overlap','Forgeryscope chevauchements',composite,panels),('auto','Forgeryscope Auto',sample,None),('lanes','Forgeryscope pistes',lane_pair,lane_panels)]:
    result=predict(rgb[:,:,::-1].copy(),loaded,profile,panels=manual)
    filename='public-'+ident+'.rgb';rgb.tofile(out/filename)
    fields={}
    for name,values in result.items():
        if name=='metadata':continue
        file=f'public-{ident}-{name}.'+('f32' if values.dtype==np.float32 else 'u8');values.tofile(out/file)
        fields[name]=dict(file=file,shape=list(values.shape),dtype=str(values.dtype))
    cases.append(dict(id=ident,profile=profile,file=filename,width=rgb.shape[1],height=rgb.shape[0],panels=manual,fields=fields,metadata=result['metadata']))
    print(ident,result['metadata']['status'],{k:int(np.count_nonzero(v)) for k,v in result.items() if k!='metadata'},flush=True)
(out/'public-reference.json').write_text(json.dumps(dict(cases=cases),separators=(',',':'))+'\n')
