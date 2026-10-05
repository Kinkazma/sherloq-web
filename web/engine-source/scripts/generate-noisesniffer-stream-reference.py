"""Own-worktree JPEG oracle for segmented Noisesniffer integration."""
from pathlib import Path
import sys,json,hashlib
sys.dont_write_bytecode=True
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
import numpy as np
from PIL import Image
from gui.sherloq_app.core import noisesniffer as ns
out=root/'.build/noisesniffer-stream';out.mkdir(exist_ok=True)
W=1024;H=1024;rgb=np.empty((H,W,3),np.uint8);state=12929912
for y in range(H):
 for x in range(W):
  for c in range(3):
   state=(1664525*state+1013904223)&0xffffffff
   rgb[y,x,c]=124+((state>>16)%7) if W*2//5<=x<W//2 and H*2//5<=y<H//2 else 70+(state>>16)%117
Image.fromarray(rgb).save(out/'input.jpg',quality=96,subsampling=0)
import cv2
bgr=cv2.imread(str(out/'input.jpg'));rgb=np.ascontiguousarray(bgr[:,:,::-1]);w=8;p=[w,50,20000,.25,.5]
stats=ns.statistics(bgr,w);V,S=ns.select(bgr,w,20000,.25,.5,stats);all,low=ns.counts(bgr.shape,w,50,V,S);mask,regions=ns.regions(bgr.shape,w,50,.5,all,low);distribution=np.ascontiguousarray(ns.distribution(bgr,w,V,S)[:,:,::-1]);overlay=rgb.copy();sel=mask>0;overlay[sel]=(overlay[sel].astype(np.float32)*.55+np.array([255,0,0])*.45).astype(np.uint8)
def digest(a):return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()
ref=dict(width=W,height=H,parameters=p,arrays={k:digest(a) for k,a in [('selected',V.astype('<u4')),('low_noise',S.astype('<u4')),('all_blocks',all),('low_noise_blocks',low),('mask',mask),('distribution',distribution),('overlay',overlay)]},regions=regions,validCount=len(stats[0]),selectedCount=len(V),lowNoiseCount=len(S))
(out/'reference.json').write_text(json.dumps(ref,indent=2)+'\n');print({k:ref[k] for k in ['validCount','selectedCount','lowNoiseCount']})
