"""Actual torch-kmeans defaults: eight initializations, CPU, seed123, dot score.
The fixed 4096-point lattice makes the sixteen random initial indices constants;
the assignments, stopping test and best restart remain input dependent.
"""
from pathlib import Path
import torch,numpy as np,json,hashlib
from torch_kmeans import KMeans
from torch_kmeans.utils.distances import CosineSimilarity
import onnx
torch.set_num_threads(2);out=Path(__file__).resolve().parents[1]/'.build/m3/learned'
class FocalCluster(torch.nn.Module):
 def __init__(self):
  super().__init__();gen=torch.Generator(device='cpu').manual_seed(123);self.register_buffer('initial',torch.multinomial(torch.full((8,4096),1/4096),2,replacement=False,generator=gen));self.register_buffer('range',torch.arange(2)[None,None,:,None])
 def assign(self,x:torch.Tensor,centres:torch.Tensor):
  # Preserve native elementwise dot (CosineSimilarity.pairwise_distance),
  # including unnormalized cluster centres.
  return (1-(x[:,None,:,None,:]*centres[:,:,None,:,:]).sum(4)).argmin(3)
 def forward(self,x:torch.Tensor):
  centres=x[:,self.initial,:]
  for i in range(100):
   old=centres;labels=self.assign(x,centres);membership=(labels[:,:,None,:]==self.range).to(x.dtype)
   membership=membership/torch.linalg.vector_norm(membership,1.,dim=3,keepdim=True).clamp_min(1e-12)
   centres=torch.matmul(membership,x[:,None,:,:].expand(1,8,4096,288))
   shift=torch.linalg.vector_norm(centres-old,2.,dim=3).mean(2)
   if bool((shift<1e-4).all()):break
  labels=self.assign(x,centres);assigned=centres.gather(2,labels[:,:,:,None].expand(1,8,4096,288))
  distance=torch.linalg.vector_norm(x[:,None,:,:]-assigned,2.,dim=3).square();distance=torch.where(distance==float('inf'),torch.zeros_like(distance),distance)
  inertia=distance.sum(2);best=inertia.argmin(1);chosen=labels[0,best[0]]
  if bool(chosen.sum()>(1-chosen).sum()):chosen=1-chosen
  return chosen,centres,inertia
net=torch.jit.script(FocalCluster().eval());records=[]
with torch.inference_mode():
 for name in ['native','synthetic']:
  if name=='native':
   if not (out/'focal-combined.bin').exists():continue
   x=torch.from_numpy(np.fromfile(out/'focal-combined.bin',np.float32).reshape(1,4096,288))
  else:
   rng=np.random.default_rng(703);values=rng.normal(0,.1,(1,4096,288)).astype(np.float32);values[:,2048:,:144]+=2;x=torch.from_numpy(values)
  native=KMeans(verbose=False,n_clusters=2,distance=CosineSimilarity,seed=123)(x=x,k=2).labels[0];native=1-native if native.sum()>(1-native).sum() else native
  actual,centres,inertia=net(x);assert torch.equal(actual,native),(name,int((actual!=native).sum()));file=f'focal-cluster-{name}.bin';x.numpy().tofile(out/file);labels=f'focal-cluster-{name}-labels.bin';native.to(torch.uint8).numpy().tofile(out/labels);records.append(dict(file=file,labels=labels))
 path=out/'focal-cluster.onnx';torch.onnx.export(net,(x,),path,input_names=['features'],output_names=['labels','centres','inertia'],opset_version=19,dynamo=False,external_data=False);onnx.checker.check_model(onnx.load(path))
report=dict(file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),initialIndices=net.initial.tolist(),cases=records);(out/'focal-cluster-reference.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print(json.dumps(report),flush=True)

reference=out/"focal-reference.json"
if reference.exists():
 pinned=json.loads(reference.read_text());pinned["graphs"]["cluster"]={k:report[k] for k in ["file","bytes","sha256"]}
 (out.parents[2]/"src/focal-assets.js").write_text("export const FOCAL_MODEL=Object.freeze("+json.dumps(dict(weights=pinned["weights"],graphs=pinned["graphs"]),separators=(",",":"))+");\n")
