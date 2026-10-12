#!/usr/bin/env python3
"""Export native SuperPoint dense heads plus global NMS/TopK/sampling.

The upstream research-only checkout/official checkpoint must be supplied by the
caller. No weights, image, source substitute or training are bundled here.
The split preserves the scientific operations; a stride8/48px halo bounds the
CNN activation while global postprocessing preserves cross-window neighbours.
"""
from pathlib import Path
import argparse,hashlib,json,sys
import torch
import torch.nn.functional as F
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('native_source',type=Path,help='Pinned source directory containing sgmodels/superpoint.py and official weights')
parser.add_argument('output_directory',type=Path)
parser.add_argument('--python-dependencies',type=Path)
args=parser.parse_args();args.output_directory.mkdir(parents=True,exist_ok=True)
sys.path[:0]=[str(args.native_source.resolve())]+([str(args.python_dependencies.resolve())]if args.python_dependencies else [])
from sgmodels.superpoint import SuperPoint
import onnx

class Dense(torch.nn.Module):
 def __init__(self,net):
  super().__init__()
  for name in ['conv1a','conv1b','conv2a','conv2b','conv3a','conv3b','conv4a','conv4b','convPa','convPb','convDa','convDb']:setattr(self,name,getattr(net,name))
 def forward(self,image:torch.Tensor):
  x=F.relu(self.conv1a(image));x=F.max_pool2d(F.relu(self.conv1b(x)),2,2)
  x=F.relu(self.conv2a(x));x=F.max_pool2d(F.relu(self.conv2b(x)),2,2)
  x=F.relu(self.conv3a(x));x=F.max_pool2d(F.relu(self.conv3b(x)),2,2)
  x=F.relu(self.conv4a(x));x=F.relu(self.conv4b(x))
  scores=F.softmax(self.convPb(F.relu(self.convPa(x))),1)[:,:-1]
  h,w=scores.shape[2],scores.shape[3]
  scores=scores.permute(0,2,3,1).reshape(1,h,w,8,8).permute(0,1,3,2,4).reshape(1,1,h*8,w*8)
  descriptors=F.normalize(self.convDb(F.relu(self.convDa(x))),p=2.,dim=1)
  return scores,descriptors

class Post(torch.nn.Module):
 def forward(self,scores:torch.Tensor,descriptors:torch.Tensor):
  h,w=descriptors.shape[2],descriptors.shape[3]
  max_mask=scores==F.max_pool2d(scores,9,1,4);zeros=torch.zeros_like(scores)
  for _ in range(2):
   supp_mask=F.max_pool2d(max_mask.float(),9,1,4)>0;supp_scores=torch.where(supp_mask,zeros,scores)
   new_max_mask=supp_scores==F.max_pool2d(supp_scores,9,1,4);max_mask=max_mask|(new_max_mask&(~supp_mask))
  scores=torch.where(max_mask,scores,zeros).reshape(h*8,w*8)
  keypoints=torch.nonzero(scores>0).reshape(-1,2)
  selected_scores=scores.reshape(-1).index_select(0,keypoints[:,0]*(w*8)+keypoints[:,1])
  keep=(keypoints[:,0]>=4)&(keypoints[:,0]<h*8-4)&(keypoints[:,1]>=4)&(keypoints[:,1]<w*8-4)
  indices=torch.nonzero(keep).reshape(-1);keypoints=keypoints.index_select(0,indices);selected_scores=selected_scores.index_select(0,indices)
  if keypoints.shape[0]>2048:
   selected_scores,indices=torch.topk(selected_scores,2048,dim=0);keypoints=keypoints.index_select(0,indices)
  keypoints=keypoints.reshape(-1,2).flip([1]).float()
  if keypoints.shape[0]==0:sampled=descriptors.reshape(1,256,-1)[0,:,:0]
  else:
   gx=(keypoints[:,0]-3.5)/(w*8-4.5)*2-1;gy=(keypoints[:,1]-3.5)/(h*8-4.5)*2-1
   grid=torch.stack((gx,gy),1).reshape(1,1,-1,2)
   sampled=F.normalize(F.grid_sample(descriptors,grid,mode='bilinear',padding_mode='zeros',align_corners=True).reshape(1,256,-1),p=2.,dim=1)[0]
  return keypoints[None],selected_scores[None],sampled[None]

torch.set_grad_enabled(False)
native=SuperPoint({'nms_radius':4,'keypoint_threshold':0.,'max_keypoints':2048}).eval()
dense=torch.jit.script(Dense(native).eval());post=torch.jit.script(Post().eval())
image=torch.zeros((1,1,512,512),dtype=torch.float32)
record={'schema':1,'sourceCommit':'ef7b4a00d0c5742a63b187d898979259c2aead40','sourceParameters':{'nmsRadius':4,'threshold':0,'maxKeypoints':2048,'border':4,'stride':8,'receptiveField':84,'halo':48},'models':[]}
for name,model,inputs,ins,outs,axes in [
 ('superpoint-dense.onnx',dense,(image,),['image'],['dense_scores','dense_descriptors'],{'image':{2:'height',3:'width'},'dense_scores':{2:'scoreHeight',3:'scoreWidth'},'dense_descriptors':{2:'coarseHeight',3:'coarseWidth'}}),
 ('superpoint-post.onnx',post,dense(image),['dense_scores','dense_descriptors'],['keypoints','scores','descriptors'],{'dense_scores':{2:'scoreHeight',3:'scoreWidth'},'dense_descriptors':{2:'coarseHeight',3:'coarseWidth'},'keypoints':{1:'count'},'scores':{1:'count'},'descriptors':{2:'count'}})]:
 path=args.output_directory/name
 torch.onnx.export(model,inputs,path,input_names=ins,output_names=outs,dynamic_axes=axes,opset_version=18,dynamo=False,do_constant_folding=False,external_data=False)
 onnx.checker.check_model(onnx.load(path),full_check=True)
 record['models'].append({'file':name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(args.output_directory/'superpoint-window-models.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
