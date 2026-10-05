from pathlib import Path
import json,sys,numpy as np,torch,cv2
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));torch.set_num_threads(2);cv2.setNumThreads(2)
from gui.sherloq_app.core.learned_copy import extract_lightglue
out=root/'.build/m3/learned';records=[]
y,x=np.mgrid[:192,:512];small=np.stack([(x*7+y*11)%256,(x*3+y*13)%256,(x*17+y*5)%256],2).astype(np.uint8);image=np.concatenate([small,small],axis=1);image.tofile(out/'aliked-extract-rgb.bin');regions=(((0,0),(1023,0),(1023,191),(0,191)),);excluded=(((0,0),(130,0),(130,45),(0,45)),)
for kind in ['aliked-n16','aliked-n16rot']:
 points,desc,members,total=extract_lightglue(image[:,:,::-1].copy(),1000,regions,True,kind,excluded=excluded);files={}
 for name,array in [('points',points),('descriptors',desc),('members',members)]:
  file=kind+'-extract-'+name+'.bin';array.tofile(out/file);files[name]=dict(file=file,shape=list(array.shape),dtype=str(array.dtype))
 records.append(dict(kind=kind,totalFeatures=total,files=files));print(kind,len(points),total,flush=True)
(out/'aliked-extract-reference.json').write_text(json.dumps(dict(width=1024,height=192,imageFile='aliked-extract-rgb.bin',regions=regions,excluded=excluded,cases=records))+'\n')
