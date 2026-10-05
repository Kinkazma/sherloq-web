"""Exercise decoder row interpolation and native NPP bias blocks at larger dimensions."""
from pathlib import Path
import sys,json,hashlib
import numpy as np,torch
root=Path(__file__).resolve().parents[1];native=root.parent/'source/gui/TruFor_main/test_docker';out=root/'.build/trufor-spatial';out.mkdir(exist_ok=True);sys.path.insert(0,str(native/'src'))
from config import _C
from models.cmx.builder_np_conf import myEncoderDecoder
torch.set_num_threads(2);cfg=_C.clone();cfg.merge_from_file(str(native/'src/trufor.yaml'));cfg.freeze();model=myEncoderDecoder(cfg=cfg);model.load_state_dict(torch.load(native/'weights/trufor-state.pt',map_location='cpu',weights_only=True)['state_dict']);model.eval();cases=[]
for index,(h,w) in enumerate([(128,129),(257,385)]):
 y,x=np.mgrid[:h,:w];rgb=np.stack([(x*7+y*11)%256,(x*3+y*13)%256,(x*17+y*5)%256],axis=2).astype(np.uint8);inp=torch.tensor(rgb.transpose(2,0,1).copy(),dtype=torch.float32)[None]/256.
 with torch.inference_mode():pred,conf,det,npp=model(inp);outputs=[torch.softmax(pred[0],dim=0)[1],torch.sigmoid(conf[0,0]),torch.sigmoid(det),npp[0,0]]
 files={};rgb.tofile(out/f'case-{index}.rgb')
 for name,t in zip(['rgb','map','confidence','score','noiseprint_pp'],[inp,*outputs]):
  file=f'case-{index}-{name}.f32';t.numpy().astype('<f4').tofile(out/file);files[name]=dict(file=file,shape=list(t.shape))
 cases.append(dict(id=index,width=w,height=h,file=f'case-{index}.rgb',files=files));print(h,w,flush=True)
(out/'reference.json').write_text(json.dumps(dict(cases=cases),separators=(',',':'))+'\n')
