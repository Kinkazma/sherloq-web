"""Native postprocessing oracles, using previously computed useful SAM outputs."""
from pathlib import Path
import numpy as np,torch,json
import torch.nn.functional as F
torch.set_num_threads(2)
root=Path(__file__).resolve().parents[1];out=root/'.build/m3/learned'
features=torch.from_numpy(np.fromfile(out/'safire-features.f32',np.float32).reshape(256,64,64))
low=torch.from_numpy(np.fromfile(out/'safire-prompts-4-lowMasks.f32',np.float32).reshape(4,256,256))
high=F.interpolate(low[:,None],size=(1024,1024),mode='bilinear',align_corners=False)[:,0]
means=[];areas=[];counts=[]
for mask in high:
 selected=mask[::16,::16]>0;counts.append(int(selected.sum()));areas.append(int((mask>0).sum()));means.append(features[:,selected].mean(1))
torch.stack(means).numpy().tofile(out/'safire-proposal-means.bin');np.array(areas,np.uint32).tofile(out/'safire-proposal-areas.bin')
cases=[]
for channels in [1,2,4]:
 logits=high[:channels];prob=logits.softmax(0);labels=prob.argmax(0).to(torch.uint8);front,back=(0,1) if channels==1 or areas[0]<=areas[1] else (1,0)
 for binary in [False,True]:
  result=prob.max(0).values if not binary else logits[front].sigmoid() if channels==1 else (logits[front].sigmoid()+1-logits[back].sigmoid())/2
  # Preserve native parentheses: addition after computing (1 - sigmoid).
  if binary and channels>1:result=(logits[front].sigmoid()+(1-logits[back].sigmoid()))/2
  files={}
  for name,t in [('probabilities',prob),('map',result),('labels',labels)]:
   file=f'safire-post-{channels}-{int(binary)}-{name}.bin';t.numpy().tofile(out/file);files[name]=file
  cases.append(dict(channels=channels,binary=binary,files=files))
(out/'safire-post-reference.json').write_text(json.dumps(dict(counts=counts,areas=areas,cases=cases)))
