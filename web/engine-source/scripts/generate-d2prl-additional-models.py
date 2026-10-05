"""Additional native model references: verified local weights, no training/download.
Generated original files and activations remain private build inputs, never delivery.
"""
from pathlib import Path
import sys,json,hashlib,time,argparse
import numpy as np
import cv2 as cv
import torch
from torchvision import transforms as T
import torch.utils.model_zoo
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import load,postprocess
parser=argparse.ArgumentParser();parser.add_argument('--case',choices=['jpeg','flat'],required=True);args=parser.parse_args();out=root/'.build/d2prl-additional'/args.case;out.mkdir(parents=True,exist_ok=True)
def denied(*a,**k):raise RuntimeError('Offline reference prohibits downloads')
torch.hub.download_url_to_file=denied;torch.utils.model_zoo.load_url=denied;torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0'
loaded=load('cpu');model=loaded['model'];base=root/'.build/d2prl-model';foundation=json.loads((base/'reference.json').read_text());union=json.loads((root/'.build/d2prl-union/reference.json').read_text());handles=[];dlf_values={};unet_values=[];dedicated=[]
def save(name,value):
 a=value.detach().contiguous().numpy() if isinstance(value,torch.Tensor) else np.ascontiguousarray(value);b=a.tobytes();file=name+'.bin';(out/file).write_bytes(b);return dict(file=file,shape=list(a.shape),dtype=str(a.dtype),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
if args.case=='jpeg':
 encoded=np.fromfile(root/'.build/d2prl-source/source.jpg',np.uint8);rgb=cv.cvtColor(cv.imdecode(encoded,cv.IMREAD_COLOR),cv.COLOR_BGR2RGB)
else:
 rgb=np.zeros((381,513,3),np.uint8);ok,encoded=cv.imencode('.png',cv.cvtColor(rgb,cv.COLOR_RGB2BGR));assert ok
image=T.Resize((448,448))(T.ToTensor()(rgb))[None];ref=dict(schema=1,scope='Additional generated source '+args.case+', native CPU448/40/seed22. Numerical reference only.',torch=torch.__version__,referenceThreads=8,weights=foundation['weights'],original=save('original',encoded),source=save('source-rgb',rgb),input=save('rgb448',image),features=[],patchmatch=[])
handles.append(model.patchmatch.register_forward_pre_hook(lambda m,a:ref.update(features=[save('native-feature-'+str(i),v) for i,v in enumerate(a)])))
handles.append(model.patchmatch.register_forward_hook(lambda m,a,r:ref.update(patchmatch=[save('native-patchmatch-'+str(i),v) for i,v in enumerate(r)])))
for k in [7,9,11]:
 def dlfhook(m,a,r,k=k):dlf_values.setdefault(k,[]).append(r.detach().clone())
 handles.append(getattr(model,'DLFerror'+str(k)).register_forward_hook(dlfhook))
for i,layer in enumerate(model.last_mask):
 if isinstance(layer,torch.nn.Conv2d):
  def convhook(m,a,r,i=i):
   entry=next(e for e in union['records'] if e['name']=='union-'+str(i));entry['input']=save(entry['name']+'-input',a[0]);entry['output']=save(entry['name']+'-output',r)
  handles.append(layer.register_forward_hook(convhook))
 elif isinstance(layer,torch.nn.BatchNorm2d):
  def bnhook(m,a,r,i=i):
   entry=next(e for e in union['batchnorm'] if e['name']=='union-'+str(i-1));entry.update(input=save(entry['name']+'-bn-input',a[0]),output=save(entry['name']+'-bn-output',r),relu=save(entry['name']+'-relu',torch.relu(r)))
  handles.append(layer.register_forward_hook(bnhook))
handles.append(model.last_mask.register_forward_hook(lambda m,a,r:dedicated.append((a[0].detach().clone(),r.detach().clone()))));handles.append(model.unet.register_forward_hook(lambda m,a,r:unet_values.append(r.detach().clone())))
count=[0]
def progress(*a):
 count[0]+=1
 if count[0]%20==0:print(args.case,'CNN evaluator',count[0],flush=True)
handles.append(model.patchmatch.evaluate_CNN.register_forward_hook(progress));started=time.monotonic()
with torch.random.fork_rng(devices=[]),torch.inference_mode():
 torch.set_rng_state(loaded['rng_state']);raw=model(image);ref['raw']=[save('native-raw-'+str(i),v) for i,v in enumerate(raw)]
 xc,u=dedicated[0];v=unet_values[0];overlap=torch.sum(u*v);threshold=torch.sum(v)*.5;union.update(input=save('union-input',xc),sigmoid=save('union-sigmoid',u),unet=save('union-unet',v),overlap=float(overlap),threshold=float(threshold),combineMaximum=bool(overlap>threshold));assert torch.equal(raw[0],torch.maximum(u,v) if union['combineMaximum'] else u)
 dlf=[]
 for kind in ['error','score']:
  for k in [7,9,11]:
   assert len(dlf_values[k])==2
   for name,value in zip(['zm','cnn'],dlf_values[k]):dlf.append(save('native-'+kind+str(k)+'_'+name,value if kind=='error' else 2*torch.sigmoid(1/(value+1e-10))-1))
 masks=[];raw_array=np.stack([v[0,0].numpy() for v in raw])
 for minimum in [0,17,500,5000]:masks.append(dict(minimum=minimum,**save('native-masks-'+str(minimum),np.stack(postprocess(raw_array,minimum)).astype(np.float32))))
for h in handles:h.remove()
ref['nativeElapsedSeconds']=time.monotonic()-started
for name,value in [('reference',ref),('union-reference',union),('dlf-reference',dict(expected=dlf)),('masks-reference',dict(records=masks))]:(out/(name+'.json')).write_text(json.dumps(value,indent=2)+'\n')
print(json.dumps(dict(case=args.case,nativeSeconds=ref['nativeElapsedSeconds'],overlap=union['overlap'],threshold=union['threshold'],combineMaximum=union['combineMaximum'])),flush=True)
