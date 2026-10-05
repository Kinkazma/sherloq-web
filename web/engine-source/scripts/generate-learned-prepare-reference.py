from pathlib import Path
import sys,json,numpy as np,torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));torch.set_num_threads(2)
from gui.sherloq_app.vendor.lightglue.utils import ImagePreprocessor
out=root/'.build/m3/learned';records=[]
for i,(h,w) in enumerate([(64,96),(131,97),(1031,1537),(1024,1024)]):
 rgb=np.random.default_rng(17+i).integers(0,256,(h,w,3),np.uint8);image=torch.from_numpy(rgb.transpose(2,0,1).copy()).float()[None]/255
 resized,scales=ImagePreprocessor(resize=1024)(image);inp=f'prepare-{i}-rgb.bin';output=f'prepare-{i}-result.f32';rgb.tofile(out/inp);resized.numpy().tofile(out/output);records.append(dict(id=i,width=w,height=h,input=inp,output=output,shape=list(resized.shape),scales=scales.tolist()))
# Native unstable sort is required only above 20,000 candidates. Exercise its
# tie order separately, without manufacturing a network output qualification.
h,w=450,500;scores=torch.tensor(np.random.default_rng(71).integers(21,30,(h,w)),dtype=torch.float32)/100;nms=scores.clone();nms[:2]=0;nms[-2:]=0;nms[:,:2]=0;nms[:,-2:]=0
ids=(nms.flatten()>.2).nonzero()[:,0];ids=ids[scores.flatten()[ids].sort(descending=True)[1][:20000]];scores.numpy().tofile(out/'prepare-sort.f32');ids.numpy().astype(np.int32).tofile(out/'prepare-sort.i32')
(out/'prepare-reference.json').write_text(json.dumps(dict(cases=records,sort=dict(width=w,height=h,score='prepare-sort.f32',indices='prepare-sort.i32')))+'\n')
