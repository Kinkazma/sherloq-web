"""Export the complete native TruFor multimodal model and native output maps."""
from pathlib import Path
import argparse,sys,json,hashlib
import numpy as np
import torch
p=argparse.ArgumentParser();p.add_argument('--native-root',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--unfused',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/('.build/trufor-unfused' if a.unfused else '.build/trufor');out.mkdir(parents=True,exist_ok=True)
native=a.native_root/'source/gui/TruFor_main/test_docker';sys.path.insert(0,str(native/'src'))
from config import _C
from models.cmx.builder_np_conf import myEncoderDecoder
import onnx
torch.set_num_threads(2)
cfg=_C.clone();cfg.merge_from_file(str(native/'src/trufor.yaml'));cfg.freeze()
weight=native/'weights/trufor-state.pt';checkpoint=torch.load(weight,map_location='cpu',weights_only=True)
model=myEncoderDecoder(cfg=cfg);model.load_state_dict(checkpoint['state_dict'],strict=True);del checkpoint
model.eval()
class Network(torch.nn.Module):
    def __init__(self):super().__init__();self.model=model
    def forward(self,rgb):
        pred,conf,det,npp=self.model(rgb)
        return torch.softmax(pred[0],dim=0)[1],torch.sigmoid(conf[0,0]),torch.sigmoid(det),npp[0,0]
net=Network().eval();path=out/'trufor.onnx'
with torch.inference_mode():
    torch.onnx.export(net,(torch.zeros(1,3,64,96),),path,input_names=['rgb'],output_names=['map','confidence','score','noiseprint_pp'],opset_version=19,dynamo=False,external_data=False,do_constant_folding=not a.unfused,
        dynamic_axes={'rgb':{2:'h',3:'w'},'map':{0:'h',1:'w'},'confidence':{0:'h',1:'w'},'noiseprint_pp':{0:'h',1:'w'}})
onnx.checker.check_model(onnx.load(path));cases=[]
for index,(h,w) in enumerate([(29,35),(64,96),(97,65)]):
    y,x=np.mgrid[:h,:w];rgb=np.stack([(x*7+y*11)%256,(x*3+y*13)%256,(x*17+y*5)%256],axis=2).astype(np.uint8)
    inp=torch.tensor(rgb.transpose(2,0,1).copy(),dtype=torch.float32)[None]/256.
    with torch.inference_mode():outputs=net(inp)
    files={}
    rgb.tofile(out/f'trufor-{index}.rgb')
    for name,t in zip(['rgb','map','confidence','score','noiseprint_pp'],[inp,*outputs]):
        file=f'trufor-{index}-{name}.f32';t.numpy().astype('<f4').tofile(out/file);files[name]=dict(file=file,shape=list(t.shape))
    cases.append(dict(id=index,width=w,height=h,file=f'trufor-{index}.rgb',files=files))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record=dict(schema=1,graphOptimizationLevel='disabled' if a.unfused else 'all',checkpointSha256=sha(weight),sourceSha256=sha(native/'src/models/cmx/builder_np_conf.py'),file=path.name,bytes=path.stat().st_size,sha256=sha(path),torch=torch.__version__,cases=cases)
(out/'reference.json').write_text(json.dumps(record,separators=(',',':'))+'\n');print({k:v for k,v in record.items() if k!='cases'},flush=True)
