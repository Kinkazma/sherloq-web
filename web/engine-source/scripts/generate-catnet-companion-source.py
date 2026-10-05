from pathlib import Path
import sys,json
import numpy as np,cv2,torch
from torch.nn import functional as F
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core import catnet
out=root/'.build/catnet-companion-source';out.mkdir(exist_ok=True)
old=json.loads((root/'.build/catnet/companion-reference.json').read_text());rgb=np.fromfile(root/'.build/catnet/companion-source.rgb',np.uint8).reshape(old['height'],old['width'],3)
cv2.imwrite(str(out/'source.png'),rgb[:,:,::-1]);image,table,meta=catnet.prepare(root/'.build/catnet/companion-q100.jpg');torch.set_num_threads(2);model=catnet.load('cpu').eval();model.memory_bounded=False
with torch.inference_mode():native=model(image,table).softmax(1)[:,1:2];full=F.interpolate(native,size=image.shape[-2:],mode='bilinear',align_corners=False)
files={}
for name,t in [('native_map',native),('padded_map',full)]:
 p=out/(name+'.f32');t.numpy().astype('<f4').tofile(p);files[name]=dict(file=p.name,dims=list(t.shape))
(out/'reference.json').write_text(json.dumps(dict(metadata=meta,files=files,source=old['source']),separators=(',',':'))+'\n')
