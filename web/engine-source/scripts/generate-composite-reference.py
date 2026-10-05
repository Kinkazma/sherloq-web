from pathlib import Path
import sys,json
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source/gui'))
from noiseprint.post_em import getSpamFromNoiseprint,EMgu_img
from noiseprint.noiseprint_blind import genMappUint8
import cv2 as cv
out=root/'.build/composite';out.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(493);h,w=384,416
noise=rng.normal(0,1,(h,w)).astype(np.float32);noise[:,w//2:]*=1.5
gray=rng.uniform(.1,.9,(h,w)).astype(np.float32)
spam,valid,r0,r1,imgsize=getSpamFromNoiseprint(noise,gray)
print('Features',spam.shape,'valid',int(valid.sum()),flush=True)
mapp,other=EMgu_img(spam,valid,extFeat=range(32),seed=0,maxIter=100,replicates=10,outliersNlogl=42,workers=1)
raster=genMappUint8(mapp,valid,r0,r1,imgsize)
arrays=dict(noise=noise,gray=gray,spam=spam,valid=valid,range0=r0,range1=r1,map=mapp,raster=raster,map_rgb=cv.cvtColor(cv.applyColorMap(raster,cv.COLORMAP_JET),cv.COLOR_BGR2RGB),**other)
files={}
for name,value in arrays.items():
 value=np.asarray(value);value=value.astype(np.uint8) if value.dtype==bool else value
 path=out/(name+'.bin');value.tofile(path);files[name]=dict(file=path.name,shape=list(value.shape),dtype=str(value.dtype))
(out/'reference.json').write_text(json.dumps(dict(width=w,height=h,files=files),separators=(',',':'))+'\n');print('done',flush=True)
