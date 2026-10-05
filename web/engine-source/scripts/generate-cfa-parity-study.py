"""Excluded local CFA conversion study; all resulting model bytes stay in .build.

Requires unchanged native source, torch2.8.0, onnx1.19.0 and local checkpoints.
No training. An executable ONNX graph is not a qualified browser detector.
"""
from pathlib import Path
import sys,json,hashlib,collections
import numpy as np, torch, onnx
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core import adaptive_cfa
from gui.sherloq_app.vendor.adaptive_cfa.structure import FullNet
OUT=ROOT/'web-engine/.build/cfa-study';OUT.mkdir(exist_ok=True)
torch.set_num_threads(2)
class Wrapped(torch.nn.Module):
 def __init__(self,model,block):super().__init__();self.model=model;self.block=block
 def forward(self,x):return self.model(x,self.block)
manifest=json.loads((ROOT/'models/external/manifest.json').read_text());known={x['file']:x for x in manifest};records=[]
pinned={'pretrained.pt':'992dade71b8682a617f63e5a92e46292cd34e391f8b46dd050ce4c0f86e7745d','adapted_to_j95_database.pt':'4705e72f88c8c770cbfa763ae6c6866f316249ced456e2b8d1d1e91a273fafd2','adapted_to_nojpeg_database.pt':'5cf541e11c0d6b06f860b9021f2e1ac144929cccbf0e0f1a634680c60c232bd3'}
assert torch.__version__.split('+')[0]=='2.8.0' and onnx.__version__=='1.19.0'
y,x=np.mgrid[:137,:169];rng=np.random.default_rng(240001)
images=[('flat',np.full((40,40,3),127,np.uint8)),('zero',np.zeros((40,40,3),np.uint8)),('white',np.full((40,40,3),255,np.uint8)),('noise-small',rng.integers(0,256,(40,40,3),dtype=np.uint8)),('noise',rng.integers(0,256,(73,105,3),dtype=np.uint8)),('noise-odd',rng.integers(0,256,(137,169,3),dtype=np.uint8)),('gradient',np.stack([(x+y)%256,x%256,y%256],axis=2).astype(np.uint8)),('checker',np.repeat((((x+y)%2)*255)[:,:,None],3,axis=2).astype(np.uint8)),('smooth',np.stack([100+x//16,120+y//16,140+(x+y)//32],axis=2).astype(np.uint8))]
for variant,name in adaptive_cfa.WEIGHTS.items():
 path=ROOT/'models/external'/name;weight_sha=hashlib.sha256(path.read_bytes()).hexdigest();assert weight_sha==known[name]['sha256']==pinned[name]
 model=adaptive_cfa.load(variant,'cpu');target=OUT/(Path(name).stem+'-b32.onnx');wrapped=Wrapped(model,32).eval()
 torch.onnx.export(wrapped,(torch.zeros(1,3,72,104),),target,input_names=['rgb'],output_names=['log_probabilities'],opset_version=18,dynamo=False,external_data=False,dynamic_axes={'rgb':{2:'height',3:'width'},'log_probabilities':{2:'rows',3:'cols'}})
 graph=onnx.load(target);onnx.checker.check_model(graph);rows=[]
 for label,rgb in images:
  native=adaptive_cfa.predict(rgb[:,:,::-1].copy(),model,block=32,tile=512);ny,nx=native['local_grid'].shape;crop=rgb[:ny*32+8,:nx*32+8];input_f32=(crop.astype(np.float64)/255).transpose(2,0,1).astype(np.float32)[None].copy()
  with torch.inference_mode():log=model(torch.from_numpy(input_f32),32).numpy()
  file=label+'.f32';input_f32.astype('<f4').tofile(OUT/file)
  rows.append(dict(label=label,inputFile=file,inputShape=list(input_f32.shape),shape=list(log.shape),log=log.flatten().tolist(),probabilities=native['probabilities'].flatten().tolist(),grids=native['grids'].flatten().tolist(),local=native['local_grid'].flatten().tolist(),suspicion=native['suspicion'].flatten().tolist(),metadata=native['metadata']))
 record=dict(variant=variant,checkpointSha256=weight_sha,onnxFile=target.name,onnxBytes=target.stat().st_size,onnxSha256=hashlib.sha256(target.read_bytes()).hexdigest(),operators=dict(collections.Counter(n.op_type for n in graph.graph.node)),cases=rows);records.append(record);print(variant,target.stat().st_size,len(rows),flush=True)
(OUT/'reference.json').write_text(json.dumps(dict(torch=torch.__version__,numpy=np.__version__,onnx=onnx.__version__,nativeSources={name:hashlib.sha256((ROOT/'source'/name).read_bytes()).hexdigest() for name in ['gui/sherloq_app/core/adaptive_cfa.py','gui/sherloq_app/vendor/adaptive_cfa/structure.py']},models=records),indent=2)+'\n')
