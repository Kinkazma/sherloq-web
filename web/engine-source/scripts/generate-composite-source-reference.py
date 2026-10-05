from pathlib import Path
import sys,json
import numpy as np
import cv2 as cv
from PIL import Image
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.noiseprint.noiseprint import genNoiseprint,configSess
from gui.noiseprint.post_em import getSpamFromNoiseprint,EMgu_img
from gui.noiseprint.noiseprint_blind import genMappUint8
from gui.sherloq_app.core.splicing import noise_display
configSess.device_count['GPU']=0;configSess.intra_op_parallelism_threads=2;configSess.inter_op_parallelism_threads=1
out=root/'.build/composite-source';out.mkdir(exist_ok=True);h=w=512
rgb=np.fromfile(root/'.build/composite-natural/chain-rgb.bin',dtype=np.uint8).reshape(h,w,3);jpeg=out/'source.jpg';Image.fromarray(rgb).save(jpeg,quality=95,subsampling=0)
rgb=cv.cvtColor(cv.imread(str(jpeg)),cv.COLOR_BGR2RGB);gray=cv.cvtColor(rgb,cv.COLOR_RGB2GRAY).astype(np.float32)/255
noise=genNoiseprint(gray,95);spam,valid,r0,r1,imgsize=getSpamFromNoiseprint(noise,gray);print('Valid',valid.sum(),flush=True)
mapp,other=EMgu_img(spam,valid,extFeat=range(32),seed=0,maxIter=100,replicates=10,outliersNlogl=42,workers=1);raster=genMappUint8(mapp,valid,r0,r1,imgsize);files={}
for name,value in dict(gray=gray,noise=noise,noise_rgb=noise_display(noise)[:,:,::-1],map=mapp,valid=valid.astype(np.uint8),range0=r0,range1=r1,raster=raster,map_rgb=cv.cvtColor(cv.applyColorMap(raster,cv.COLORMAP_JET),cv.COLOR_BGR2RGB),**other).items():
 value=np.asarray(value);file=name+'.bin';value.tofile(out/file);files[name]=dict(file=file,dtype=str(value.dtype),shape=list(value.shape))
(out/'reference.json').write_text(json.dumps(dict(file=jpeg.name,width=w,height=h,quality=95,files=files),indent=2)+'\n')
