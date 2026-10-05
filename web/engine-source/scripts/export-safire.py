"""SAFIRE real SAM/adaptor encoder and prompt decoder, native fixed 1024 grid.
Model binaries stay external. This developer export never runs in the UI.
"""
from pathlib import Path
import sys,json,hashlib,argparse
import torch,numpy as np
root=Path(__file__).resolve().parents[1];p=argparse.ArgumentParser();p.add_argument('--native-root',type=Path,default=root.parent);p.add_argument('--decoder-only',action='store_true');p.add_argument('--bounded',action='store_true');a=p.parse_args();sys.path.insert(0,str(a.native_root/'source'));torch.set_num_threads(2)
from gui.sherloq_app.core.safire import load
import onnx
out=root/'.build/m3/learned';out.mkdir(exist_ok=True,parents=True);weight=a.native_root/'models/external/safire.pth';identity=next(r for r in json.loads((weight.parent/'manifest.json').read_text()) if r['file']==weight.name);assert hashlib.sha256(weight.read_bytes()).hexdigest()==identity['sha256'];model=load('cpu')
# ONNX DFT preserves SAFIRE's frequency branch. Mask is the native central
# 512x512 square, unshifted; fftshift over batch/channel cancels because this
# mask is identical for every channel. Keep both forward/inverse normalizations.
original_fft=model.image_encoder.fft_and_ifft
class SafireFFT(torch.autograd.Function):
 @staticmethod
 def forward(ctx,x):return original_fft(x)
 @staticmethod
 def symbolic(g,x):
  constant=lambda value:g.op('Constant',value_t=value)
  z=g.op('Unsqueeze',x,constant(torch.tensor([4],dtype=torch.int64)))
  z=g.op('DFT',z,axis_i=2,inverse_i=0,onesided_i=0);z=g.op('DFT',z,axis_i=3,inverse_i=0,onesided_i=0)
  z=g.op('Div',z,constant(torch.tensor(1048576.,dtype=torch.float32)))
  mask=torch.zeros(1024,1024);mask[256:768,256:768]=1;mask=1-torch.fft.ifftshift(mask)
  z=g.op('Mul',z,constant(mask[None,None,:,:,None]))
  z=g.op('DFT',z,axis_i=3,inverse_i=1,onesided_i=0);z=g.op('DFT',z,axis_i=2,inverse_i=1,onesided_i=0)
  z=g.op('Mul',z,constant(torch.tensor(1048576.,dtype=torch.float32)))
  return g.op('Abs',g.op('Gather',z,constant(torch.tensor(0,dtype=torch.int64)),axis_i=4)).setType(x.type())
import types
model.image_encoder.fft_and_ifft=types.MethodType(lambda self,x:SafireFFT.apply(x),model.image_encoder)
class Encoder(torch.nn.Module):
 def __init__(self):super().__init__();self.encoder=model.image_encoder;self.register_buffer('mean',model.pixel_mean);self.register_buffer('std',model.pixel_std)
 def forward(self,image):return self.encoder(((image-self.mean)/self.std).float())
# Explicit broadcast replaces ONNX export's incorrect boolean advanced-index
# lowering. Native tensor values are checked for both prompt batch sizes.
def embed_points(self,points,labels,pad):
 points=points+.5
 if pad:
  points=torch.cat((points,torch.zeros((points.shape[0],1,2),device=points.device)),1)
  labels=torch.cat((labels,-torch.ones((labels.shape[0],1),device=labels.device)),1)
 encoded=self.pe_layer.forward_with_coords(points,self.input_image_size)
 encoded=torch.where((labels==-1)[...,None],self.not_a_point_embed.weight,encoded)
 encoded=torch.where((labels==0)[...,None],encoded+self.point_embeddings[0].weight,encoded)
 return torch.where((labels==1)[...,None],encoded+self.point_embeddings[1].weight,encoded)
original_embed=model.prompt_encoder._embed_points
with torch.inference_mode():
 for batch in [1,4]:
  pts=torch.arange(batch*2,dtype=torch.float32).reshape(batch,1,2);labs=torch.ones(batch,1,dtype=torch.int32)
  assert torch.equal(original_embed(pts,labs,True),embed_points(model.prompt_encoder,pts,labs,True))
model.prompt_encoder._embed_points=types.MethodType(embed_points,model.prompt_encoder)
class Decoder(torch.nn.Module):
 def __init__(self):super().__init__();self.prompt=model.prompt_encoder;self.decoder=model.mask_decoder
 def forward(self,features,points):
  labels=torch.ones_like(points[:,:,0],dtype=torch.int32);sparse,dense=self.prompt(points=(points,labels),boxes=None,masks=None)
  return self.decoder(image_embeddings=features,image_pe=self.prompt.get_dense_pe(),sparse_prompt_embeddings=sparse,dense_prompt_embeddings=dense,multimask_output=False)
graphs=json.loads((out/'safire-reference.json').read_text())['graphs'] if a.decoder_only else {}
original_attentions=[]
if a.bounded:
 from m3_bounded_sam import install
 original_attentions=install(model.image_encoder)
with torch.inference_mode():
 image=torch.zeros(1,3,1024,1024);features=torch.zeros(1,256,64,64);points=torch.tensor([[[128.,128.]],[[768.,768.]]])
 for name,net,inputs,names,outputs,axes in [('encoder',Encoder().eval(),(image,),['image'],['features'],{}),('decoder',Decoder().eval(),(features,points),['features','points'],['lowMasks','confidence'],{'points':{0:'prompts'},'lowMasks':{0:'prompts'},'confidence':{0:'prompts'}})]:
  if a.decoder_only and name=='encoder':continue
  path=out/f'safire-{name}{"-bounded" if a.bounded and name=="encoder" else ""}.onnx';print('Exporting '+name,flush=True);torch.onnx.export(net,inputs,path,input_names=names,output_names=outputs,dynamic_axes=axes,opset_version=19,dynamo=False,external_data=False);onnx.checker.check_model(onnx.load(path));graphs[name]=dict(file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest());print(json.dumps(graphs[name]),flush=True)
 for attention,forward in original_attentions:attention.forward=forward
 # One native image and two real prompt sets are sufficient to check graph wiring.
 y,x=np.mgrid[:1024,:1024];rgb=np.stack([(x*7+y*11)%256,(x*3+y*13)%256,(x*17+y*5)%256],2).astype(np.uint8);image=torch.from_numpy(rgb.transpose(2,0,1).copy()).float()[None];features=torch.from_numpy(np.fromfile(out/'safire-features.f32',np.float32).reshape(1,256,64,64)) if a.decoder_only else Encoder()(image);files={}
 for name,t in [('image',image),('features',features)]:
  file=f'safire-{name}.f32';t.numpy().tofile(out/file);files[name]=dict(file=file,shape=list(t.shape))
 cases=[]
 for side in [1,4]:
  coords=torch.tensor([[[128.,128.]],[[384.,128.]],[[640.,640.]],[[896.,896.]]])[:side];masks,confidence=Decoder()(features,coords);items={}
  for name,t in [('points',coords),('lowMasks',masks),('confidence',confidence)]:
   file=f'safire-prompts-{side}-{name}.f32';t.numpy().tofile(out/file);items[name]=dict(file=file,shape=list(t.shape))
  cases.append(dict(prompts=side,files=items))
report=dict(schema=1,torch=torch.__version__,weightSha256=identity['sha256'],graphs=graphs,files=files,cases=cases);(out/('safire-bounded-reference.json' if a.bounded else 'safire-reference.json')).write_text(json.dumps(report,separators=(',',':'))+'\n');print('SAFIRE export and native records complete',flush=True)
