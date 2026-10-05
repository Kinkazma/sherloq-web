"""Native SIFT profile references and its exact RootSIFT normalization graph."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));out=root/'.build/forgeryscope'
from gui.sherloq_app.vendor.lightglue.sift import SIFT,sift_to_rootsift
from gui.sherloq_app.vendor.lightglue.utils import numpy_image_to_torch
from kornia.color import rgb_to_grayscale
import onnx
torch.set_num_threads(2)
model=SIFT().eval()
class Root(torch.nn.Module):
    def forward(self,x):return sift_to_rootsift(x)
path=out/'rootsift.onnx'
torch.onnx.export(Root(),(torch.ones(12,128),),path,input_names=['descriptors'],output_names=['normalized'],dynamic_axes={'descriptors':{0:'n'},'normalized':{0:'n'}},opset_version=19,dynamo=False,external_data=False)
onnx.checker.check_model(onnx.load(path))
cases=[]
for index,(h,w) in enumerate([(96,128),(137,171)]):
    rgb=np.random.default_rng(73+index).integers(0,256,(h,w,3),dtype=np.uint8)
    if index:rgb=np.ascontiguousarray(rgb[:,::-1])
    x=numpy_image_to_torch(rgb);features=model.extract(x,resize=None)
    gray=(rgb_to_grayscale(x)*255).numpy().astype(np.uint8)[0]
    rgb.tofile(out/f'sift-{index}.rgb');gray.tofile(out/f'sift-{index}.gray')
    files={}
    for name,value in features.items():
        file=f'sift-{index}-{name}.f32';value.numpy().astype('<f4').tofile(out/file);files[name]=dict(file=file,shape=list(value.shape))
    cases.append(dict(id=index,width=w,height=h,rgb=f'sift-{index}.rgb',gray=f'sift-{index}.gray',files=files))
report=dict(schema=1,file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),cases=cases)
(out/'rootsift-reference.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print([(c['id'],c['files']['keypoints']['shape']) for c in cases])
