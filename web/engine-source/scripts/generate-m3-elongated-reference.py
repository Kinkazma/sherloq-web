"""Native small-area/long-axis oracles; all output stays in own worktree."""
from pathlib import Path
import cv2,numpy as np,json
root=Path(__file__).resolve().parents[1];out=root/'.build/m3/elongated';out.mkdir(exist_ok=True);cv2.setNumThreads(2)
rng=np.random.default_rng(130014);wide=rng.integers(0,256,(64,24000),np.uint8);wide[:,12000:]=wide[:,:12000]
records=[]
for orientation,image in [('wide',wide),('tall',wide.T.copy())]:
 h,w=image.shape;image.tofile(out/(orientation+'.gray'));mask=np.full_like(image,255);mask[:h//2,:w//2]=0;mask.tofile(out/(orientation+'.mask'))
 for name in ['ORB','AKAZE','BRISK']:
  for masked in ([False,True] if name=='AKAZE' else [False]):
   detector={'ORB':cv2.ORB_create,'AKAZE':cv2.AKAZE_create,'BRISK':cv2.BRISK_create}[name]();k,d=detector.detectAndCompute(image,mask if masked else None)
   prefix=orientation+'-'+name+('-masked' if masked else '');points=np.asarray([[p.pt[0],p.pt[1],p.size,p.angle,p.response,p.octave,p.class_id] for p in k],np.float64).reshape(-1,7);points.tofile(out/(prefix+'.points'));d.tofile(out/(prefix+'.desc'))
   records.append(dict(prefix=prefix,orientation=orientation,algorithm=name,width=w,height=h,masked=masked,count=len(k),stride=d.shape[1]));print(prefix,len(k),flush=True)
 detector=cv2.ORB_create(nfeatures=100);k,d=detector.detectAndCompute(image,None);order=sorted(range(len(k)),key=lambda i:(-k[i].response,i))[:100];prefix=orientation+'-CM2-ORB';np.array([[k[i].pt[0],k[i].pt[1],k[i].size,k[i].angle,k[i].response,k[i].octave,k[i].class_id] for i in order],np.float64).tofile(out/(prefix+'.points'));d[order].tofile(out/(prefix+'.desc'));records.append(dict(prefix=prefix,orientation=orientation,algorithm='ORB',cm2=True,width=w,height=h,masked=False,count=len(order),total=len(k),stride=32))
(out/'reference.json').write_text(json.dumps(dict(opencv=cv2.__version__,records=records),indent=2)+'\n')
