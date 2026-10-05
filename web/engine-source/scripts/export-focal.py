"""Strict FOCAL ViT-L/HRNet export, streamed ViT stages for browser memory."""
from pathlib import Path
import sys,json,hashlib,argparse,gc
import torch,numpy as np,cv2
root=Path(__file__).resolve().parents[1];p=argparse.ArgumentParser();p.add_argument('--native-root',type=Path,default=root.parent);a=p.parse_args();sys.path.insert(0,str(a.native_root/'source'));torch.set_num_threads(2);cv2.setNumThreads(2)
from gui.sherloq_app.core.focal import load
from m3_bounded_sam import install
import onnx
out=root/'.build/m3/learned';out.mkdir(exist_ok=True,parents=True);manifest=json.loads((a.native_root/'models/external/manifest.json').read_text());weights={}
for name in ['FOCAL_ViT_weights.pth','FOCAL_HRNet_weights.pth']:
 identity=next(r for r in manifest if r['file']==name);h=hashlib.sha256()
 with (a.native_root/'models/external'/name).open('rb') as f:
  for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
 assert h.hexdigest()==identity['sha256'];weights[name]=identity['sha256']
models=load('cpu');encoder=models[0].net.image_encoder;graphs={}
class Embedding(torch.nn.Module):
 def __init__(self):super().__init__();self.patch=encoder.patch_embed;self.position=encoder.pos_embed
 def forward(self,image):return self.patch(image)+self.position
class Fusion(torch.nn.Module):
 def forward(self,vit,hr):
  return torch.cat([torch.nn.functional.normalize(vit.permute(0,2,3,1),dim=3),torch.nn.functional.normalize(torch.nn.functional.interpolate(hr,(64,64)).permute(0,2,3,1),dim=3)],3).flatten(1,2)
class Neck(torch.nn.Module):
 def __init__(self):super().__init__();self.neck=encoder.neck
 def forward(self,tokens):return self.neck(tokens.permute(0,3,1,2))
with torch.inference_mode():
 rgb=np.fromfile(root/'.build/m3/sparse-positive-rgb.bin',np.uint8).reshape(176,448,3);pixels=(cv2.resize(rgb,(1024,1024)).astype(float)/255).astype(np.float32);image=torch.from_numpy(pixels.transpose(2,0,1).copy())[None]
 image.numpy().tofile(out/'focal-input.bin');print('Native ViT-L useful reference',flush=True);vit=models[0](image);vit.numpy().tofile(out/'focal-vit-features.bin');print('Native HRNet useful reference',flush=True);hr=models[1](image);hr.numpy().tofile(out/'focal-hrnet-features.bin')
 combined=torch.cat([torch.nn.functional.normalize(vit.permute(0,2,3,1),dim=3),torch.nn.functional.normalize(torch.nn.functional.interpolate(hr,vit.shape[-2:]).permute(0,2,3,1),dim=3)],3).flatten(1,2)
 combined.numpy().tofile(out/'focal-combined.bin')
 from torch_kmeans import KMeans
 from torch_kmeans.utils.distances import CosineSimilarity
 labels=KMeans(verbose=False,n_clusters=2,distance=CosineSimilarity,seed=123)(x=combined,k=2).labels[0];labels=1-labels if labels.sum()>(1-labels).sum() else labels;labels.to(torch.uint8).numpy().tofile(out/'focal-labels.bin')
 install(encoder)
 stages=[('embedding',Embedding(),image,'image')]+[(f'block-{i:02}',block,torch.zeros(1,64,64,1024),'tokens') for i,block in enumerate(encoder.blocks)]+[('neck',Neck(),torch.zeros(1,64,64,1024),'tokens'),('hrnet',models[1],image,'image'),('fusion',Fusion(),(vit,hr),['vit','hrnet'])]
 for name,net,example,input_name in stages:
  path=out/f'focal-{name}.onnx';print('Export '+name,flush=True);torch.onnx.export(net.eval(),example,path,input_names=input_name if isinstance(input_name,list) else [input_name],output_names=['output'],opset_version=19,dynamo=False,external_data=False);graph=onnx.load(path);onnx.checker.check_model(graph);del graph;graphs[name]=dict(file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest());gc.collect()
report=dict(schema=1,weights=weights,graphs=graphs,inputShape=list(image.shape),vitShape=list(vit.shape),hrnetShape=list(hr.shape),featuresShape=list(combined.shape),torch=torch.__version__);(out/'focal-reference.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print('FOCAL export complete',flush=True)

# Cluster export is independent; regenerate the distribution identity once both exist.
cluster_report=out/"focal-cluster-reference.json"
if cluster_report.exists():
 cluster=json.loads(cluster_report.read_text());pins={**graphs,"cluster":{k:cluster[k] for k in ["file","bytes","sha256"]}}
 (root/"src/focal-assets.js").write_text("export const FOCAL_MODEL=Object.freeze("+json.dumps(dict(weights=weights,graphs=pins),separators=(",",":"))+");\n")
