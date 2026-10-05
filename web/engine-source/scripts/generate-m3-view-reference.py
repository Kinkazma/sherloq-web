from pathlib import Path
import sys,json
import numpy as np,cv2
from PIL import Image
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));out=root/'.build/m3'
from gui.sherloq_app.ui.research_panel import display
from gui.sherloq_app.tools.various.safire import display as safire_display
rng=np.random.default_rng(742);image=rng.integers(0,256,(97,131,3),dtype=np.uint8);image[:,:,::-1].copy().tofile(out/'research-view-image.bin');records=[]
for method in ['focal','adaifl','safire']:
 size=1024 if method=='safire' else 64;values=rng.random((size,size),dtype=np.float32);values.flat[:6]=[0,1,.5,1/510,3/510,5/510];mask=(values>.5).astype(np.uint8);labels=rng.integers(0,7,(size,size),dtype=np.uint8);meta=dict(method=method,native_shape=[size,size],sources=7,binary=False);r=dict(map=values,mask=mask,source_labels=labels,metadata=meta);prefix='research-view-'+method
 for key in ['map','mask','source_labels']:r[key].tofile(out/f'{prefix}-{key}.bin')
 for mode in range(3 if method!='focal' else 2):
  rgb=(safire_display if method=='safire' else display)((image,r,mode))[:,:,::-1].copy();file=f'{prefix}-{mode}.rgb';rgb.tofile(out/file);records.append(dict(method=method,prefix=prefix,metadata=meta,mode=['overlay','map','confidence' if method=='safire' else 'mask'][mode],file=file))
(out/'research-view-reference.json').write_text(json.dumps(dict(width=131,height=97,cases=records)))
prepares=[]
for w,h in [(1,29),(1537,1031),(1024,1024),(17,4097)]:
 rgb=rng.integers(0,256,(h,w,3),dtype=np.uint8);prefix=f'adaifl-prepare-{w}-{h}';rgb.tofile(out/f'{prefix}-rgb.bin');resized=np.asarray(Image.fromarray(rgb).resize((1024,1024),Image.Resampling.BILINEAR));(resized.transpose(2,0,1).astype(np.float32)/np.float32(255)).tofile(out/f'{prefix}-expected.bin');prepares.append(dict(width=w,height=h,prefix=prefix))
(out/'adaifl-prepare-reference.json').write_text(json.dumps(prepares))
