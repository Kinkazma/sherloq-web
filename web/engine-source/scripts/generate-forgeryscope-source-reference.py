"""Actual original JPEG and native Auto reference; optionally create 96MP source.

The large fixture scales the public positive figure into a full 12000x8000
source, retaining its distant repeated panels and a seeded textured margin.
"""
from pathlib import Path
import os,sys,json,hashlib,argparse
import numpy as np,cv2,torch
p=argparse.ArgumentParser();p.add_argument('--large',action='store_true');p.add_argument('--rich-copies',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'.build/forgeryscope-source';out.mkdir(exist_ok=True,parents=True)
config=out/'yolo-config';(config/'Ultralytics').mkdir(parents=True,exist_ok=True);os.environ.update(YOLO_CONFIG_DIR=str(config),YOLO_AUTOINSTALL='false',YOLO_OFFLINE='true');sys.path.insert(0,str(root.parent/'source'))
path=root.parent/'third_party/research/clone_detectors/02_forgeryscope/examples/sample_data/kaggle_test_img_45.png';bgr=cv2.imread(str(path))
if a.large:
 h,w=bgr.shape[:2];width=round(w*8000/h);canvas=np.random.default_rng(2047).integers(0,256,(8000,12000,3),dtype=np.uint8);canvas[:,:width]=cv2.resize(bgr,(width,8000),interpolation=cv2.INTER_CUBIC);bgr=canvas
if a.rich_copies:
 assert a.large
 texture=bgr[1610:1990,1710:4360].astype(np.int16);grain=np.random.default_rng(2751).integers(-12,13,(380,2650,1),dtype=np.int16);texture=np.clip(texture+grain,0,255).astype(np.uint8);bgr[1610:1990,1710:4360]=texture;bgr[7360:7740,1710:4360]=texture
file=out/('source-96mp-rich.jpg' if a.rich_copies else 'source-96mp.jpg' if a.large else 'source.jpg');assert cv2.imwrite(str(file),bgr,[cv2.IMWRITE_JPEG_QUALITY,100]);bgr=cv2.imread(str(file));meta=dict(file=file.name,width=bgr.shape[1],height=bgr.shape[0],sha256=hashlib.sha256(file.read_bytes()).hexdigest(),source='public Forgeryscope kaggle_test_img_45.png; native whole-source Auto with distant repeated panels')
if a.rich_copies:meta.update(copiedRegions=[[1710,1610,2650,380],[1710,7360,2650,380]],grainSeed=2751,grainRange=[-12,12])
if not a.large:
 from gui.sherloq_app.core.forgeryscope_adapter import load,predict
 torch.set_num_threads(2);result=predict(bgr,load('cpu'),'Forgeryscope Auto');fields={}
 for name,values in result.items():
  if name=='metadata':continue
  target=out/(name+('.f32' if values.dtype==np.float32 else '.u8'));values.tofile(target);fields[name]=dict(file=target.name,dtype=str(values.dtype),shape=list(values.shape))
 meta.update(fields=fields,metadata=result['metadata'])
(out/('reference-96mp-rich.json' if a.rich_copies else 'reference-96mp.json' if a.large else 'reference.json')).write_text(json.dumps(meta,separators=(',',':'))+'\n');print(json.dumps({k:v for k,v in meta.items() if k not in ['fields','metadata']}))
