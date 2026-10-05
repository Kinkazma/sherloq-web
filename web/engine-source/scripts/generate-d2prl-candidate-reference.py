"""Native candidate transformations on generated offsets; no model/weights/images."""
from pathlib import Path
import sys,json,struct,hashlib,gzip
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import runtime
runtime()
from sherloq_clone_models.d2prl.deep_PM import PatchMatch
assert torch.__version__.split('+')[0]=='2.8.0'
torch.set_num_threads(8)
out=root/'fixtures/d2prl';private=root/'.build/d2prl-candidates';private.mkdir(exist_ok=True)
def state():
 b=torch.get_rng_state().numpy().tobytes();_,left,seeded,nxt=struct.unpack_from('<QiiQ',b);assert seeded==1
 return dict(state=list(struct.unpack_from('<624Q',b,24)),left=left,next=nxt)
payload=bytearray();records=[];rng=np.random.default_rng(290031)
def save(name,tensor):
 a=tensor.numpy().astype('<f4',copy=False);data=a.tobytes();file=name+'.bin';(private/file).write_bytes(data)
 return dict(file=file,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
for side in [2,3,17,32,65,127,448]:
 for pattern in ['noise','boundaries','tiny']:
  model=PatchMatch(40,50,side,1).eval();n=side*side;shape=(1,1,side,side)
  if pattern=='noise':a=rng.uniform(-3*side,3*side,(2,*shape)).astype(np.float32)
  else:
   choices=np.array([0.,-0.,side,-side,2*side,-2*side,3.,4.,5.,-5.,np.nextafter(np.float32(5),np.float32(0)),np.nextafter(np.float32(5),np.float32(6)),.5,-.5] if pattern=='boundaries' else [0.,-0.,2**-149,-2**-149,2**-126,-2**-126,2**-25,-2**-25,2**-20,-2**-20],np.float32)
   a=choices[np.arange(2*n)%len(choices)].reshape(2,*shape)
  pair=tuple(torch.from_numpy(v.copy()) for v in a);name=f'{side}-{pattern}';data=a.tobytes();offset=len(payload);payload.extend(data)
  row=dict(name=name,side=side,pattern=pattern,input=dict(offset=offset,bytes=len(data),sha256=hashlib.sha256(data).hexdigest()),operations=[])
  def record(operation,fn,random=False):
   if random:torch.manual_seed(22)
   initial=state() if random else None
   with torch.inference_mode():values=fn()
   item=dict(operation=operation,outputs=[save(name+'-'+operation+'-'+str(i),t) for i,t in enumerate(values)])
   if random:item.update(initial=initial,final=state())
   row['operations'].append(item)
  bounds=model.random_search_window(*pair)
  record('bounds',lambda:bounds)
  record('random',lambda:model.random_sample(*bounds,*pair),True)
  record('wrap',lambda:model.fix_out_of_coordinate(*pair))
  record('propagate',lambda:model.propagation(*pair))
  record('propagateWrap',lambda:model.fix_out_of_coordinate(*model.propagation(*pair)))
  record('nonlocal',lambda:model.non_local(*pair,25),True)
  record('initial',lambda:tuple(base+side*torch.rand(shape) for base in [model.min_offset_x,model.min_offset_y,model.min_offset_x,model.min_offset_y]),True)
  records.append(row);print(name,flush=True)
compressed=gzip.compress(payload,mtime=0);(out/'candidates.bin.gz').write_bytes(compressed)
report=dict(schema=1,scope='Native candidate transformations, not complete PatchMatch/model/final detections',torch=torch.__version__,threads=8,nativeSha256=hashlib.sha256((root.parent/'integration/clone_detectors/sherloq_clone_models/d2prl/deep_PM.py').read_bytes()).hexdigest(),payload=dict(file='candidates.bin.gz',bytes=len(payload),sha256=hashlib.sha256(payload).hexdigest(),compressedBytes=len(compressed),compressedSha256=hashlib.sha256(compressed).hexdigest()),records=records)
(out/'candidates.json').write_text(json.dumps(report,indent=2)+'\n');print('Completed',len(records),'cases')
