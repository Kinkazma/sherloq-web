from pathlib import Path
import argparse,sys,json
import numpy as np
import cv2 as cv
p=argparse.ArgumentParser();p.add_argument('--native-gui',type=Path,required=True);args=p.parse_args();sys.dont_write_bytecode=True;sys.path[:0]=[str(args.native_gui),str(args.native_gui.parent)]
from sherloq_app.core.copy_detail import detail_image,corroborate
out=Path(__file__).resolve().parents[1]/'.build/dense-detail-reference';out.mkdir(parents=True,exist_ok=True);cases=[]
for w,h in [(37,41),(91,80)]:
 yy,xx=np.mgrid[:h,:w];rgb=np.stack([(xx*19+yy*7)%256,(xx*3+yy*29)%256,(xx*11+yy*11)%256],axis=-1).astype(np.uint8);detail=detail_image(rgb[:,:,::-1].copy());rgb.tofile(out/f'{w}-rgb.u8');detail.tofile(out/f'{w}-detail.f32')
 x=np.array([[4.1,8.2,9.5,10.01,13.99,21.31],[5,8,14,25,1,-.25]],np.float32);y=np.array([[5.2,9.1,10.1,11.25,17.9,21.33],[5,8,14,25,1,0]],np.float32);cv.remap(detail,x,y,cv.INTER_LINEAR,borderMode=cv.BORDER_CONSTANT).tofile(out/f'{w}-remap.f32');cases.append(dict(width=w,height=h,x=x.tolist(),y=y.tolist()))
points=np.zeros((80,7),np.float32);points[:,:2]=np.array([(8+i*3,8+j*4) for j in range(8) for i in range(10)],np.float32)
points.tofile(out/'points.f32');scores=[]
for name,matrix,ids in [('identity',[[1,0,0],[0,1,0],[0,0,1]],list(range(80))),('translated',[[1,0,25.5],[0,1,9.25],[0,0,1]],list(range(80))),('reflection',[[-1,0,75],[0,1,3.75],[0,0,1]],list(range(80))),('scale',[[1.25,0,12],[0,1.25,2],[0,0,1]],list(range(80))),('too-few',[[1,0,0],[0,1,0],[0,0,1]],list(range(5)))]:
 model=dict(matrix=matrix,source_point_indices=ids);scores.append(dict(name=name,model=model,expected=corroborate(detail,points,model)))
(out/'scores.json').write_text(json.dumps(scores)+'\n')
(out/'manifest.json').write_text(json.dumps(cases)+'\n')

from sherloq_app.core.sift_frames import transformed_groups
transforms=[]
for mirror in (False,True):
 for angle in (0,15,15.00001,74.99999,75,90,105,180,270,345):
  for scale in (1.,1.25,1.15,1.150001):
   rad=np.deg2rad(angle);a=np.array([[np.cos(rad),-np.sin(rad)],[np.sin(rad),np.cos(rad)]])*scale
   if mirror:a=a@np.diag([-1.,1.])
   matrix=np.eye(3);matrix[:2,:2]=a
   for target in (8,10):
    model=dict(matrix=matrix.tolist());groups,models=transformed_groups((np.array([0]),),(model,),8,target,mirror)
    transforms.append(dict(matrix=model['matrix'],source=8,target=target,mirror=mirror,accepted=bool(len(groups))))
(out/'transforms.json').write_text(json.dumps(transforms)+'\n')
positives=[];rng=np.random.default_rng(921)
for kind in ('translation','reflection'):
 rgb=rng.integers(0,256,(60,100,3),dtype=np.uint8);rgb[:,50:]=rgb[:,:50] if kind=='translation' else rgb[:,:50][:,::-1]
 values=detail_image(rgb[:,:,::-1].copy());rgb.tofile(out/f'{kind}-rgb.u8');values.tofile(out/f'{kind}-detail.f32')
 model=dict(matrix=[[1,0,50],[0,1,0],[0,0,1]] if kind=='translation' else [[-1,0,99],[0,1,0],[0,0,1]],source_point_indices=list(range(80)))
 positives.append(dict(kind=kind,width=100,height=60,model=model,expected=corroborate(values,points,model)))
(out/'positives.json').write_text(json.dumps(positives)+'\n')
