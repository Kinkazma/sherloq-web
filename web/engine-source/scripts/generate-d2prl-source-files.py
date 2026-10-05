"""Lossless synthetic source files and native decoded/prepared companion data."""
from pathlib import Path
import json,hashlib
import numpy as np
import cv2 as cv
import torch
from torchvision import transforms as T
root=Path(__file__).resolve().parents[1];base=root/'.build/d2prl-model';out=root/'.build/d2prl-source';out.mkdir(exist_ok=True);ref=json.loads((base/'reference.json').read_text());rgb=np.fromfile(base/ref['source']['file'],np.uint8).reshape(ref['source']['shape']);rows=[]
def save(name,a):
 data=a.tobytes();(out/name).write_bytes(data);return dict(file=name,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
for ext,params in [('png',[]),('tiff',[cv.IMWRITE_TIFF_COMPRESSION,1]),('jpg',[cv.IMWRITE_JPEG_QUALITY,95])]:
 ok,encoded=cv.imencode('.'+ext,cv.cvtColor(rgb,cv.COLOR_RGB2BGR),params);assert ok;decoded=cv.cvtColor(cv.imdecode(encoded,cv.IMREAD_COLOR),cv.COLOR_BGR2RGB);prepared=T.Resize((448,448))(T.ToTensor()(decoded))[None].numpy();rows.append(dict(name=ext,original=save('source.'+ext,encoded),pixels=save(ext+'-rgb.bin',decoded),prepared=save(ext+'-prepared.bin',prepared),matchesFirstModelSource=bool(np.array_equal(decoded,rgb))))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Synthetic PNG/TIFF/JPEG original bytes to native RGB8 and native448preparation; no Canvas input',opencv=cv.__version__,torch=torch.__version__,records=rows),indent=2)+'\n');print('Generated',len(rows),'encoded synthetic sources')
