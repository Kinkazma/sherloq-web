from pathlib import Path
import sys,json,faulthandler
import numpy as np
import cv2 as cv
faulthandler.dump_traceback_later(120,exit=True)
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.noiseprint.noiseprint import genNoiseprint,configSess
from gui.noiseprint.post_em import getSpamFromNoiseprint,EMgu_img
from gui.noiseprint.noiseprint_blind import genMappUint8
configSess.device_count['GPU']=0
from skimage import data
rgb=data.astronaut();h,w=rgb.shape[:2]
gray=cv.cvtColor(rgb,cv.COLOR_RGB2GRAY).astype(np.float32)/255
noise=genNoiseprint(gray,95);print('Native residual',flush=True)
spam,valid,r0,r1,imgsize=getSpamFromNoiseprint(noise,gray);print('Valid',valid.sum(),flush=True)
mapp,other=EMgu_img(spam,valid,extFeat=range(32),seed=0,maxIter=100,replicates=10,outliersNlogl=42,workers=1)
raster=genMappUint8(mapp,valid,r0,r1,imgsize);out=root/'.build/composite-natural';out.mkdir(exist_ok=True);files={}
for name,value in dict(rgb=rgb,noise=noise,map=mapp,valid=valid.astype(np.uint8),raster=raster,map_rgb=cv.cvtColor(cv.applyColorMap(raster,cv.COLORMAP_JET),cv.COLOR_BGR2RGB)).items():
 file='chain-'+name+'.bin';value.tofile(out/file);files[name]=dict(file=file,dtype=str(value.dtype),shape=list(value.shape))
(out/'chain-reference.json').write_text(json.dumps(dict(width=w,height=h,quality=95,files=files),separators=(',',':'))+'\n');faulthandler.cancel_dump_traceback_later()
