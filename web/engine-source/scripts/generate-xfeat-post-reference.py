from pathlib import Path
import json,numpy as np,torch,torch.nn.functional as F
root=Path(__file__).resolve().parents[1];out=root/'.build/m3/learned';torch.set_num_threads(2);records=[]
for index,(h,w) in enumerate([(96,128),(64,12000)]):
 rng=np.random.default_rng(742+index);heat=torch.from_numpy(rng.random((1,1,h,w),dtype=np.float32));rel=torch.from_numpy(rng.random((1,1,h//8,w//8),dtype=np.float32));dense=F.normalize(torch.from_numpy(rng.random((1,64,h//8,w//8),dtype=np.float32)),dim=1)
 positions=torch.nonzero(((heat==F.max_pool2d(heat,5,1,2))&(heat>.05))[0,0])[:,[1,0]];positions=positions[torch.any(positions!=0,dim=1)]
 grid=(2.*(positions/torch.tensor([w-1,h-1]))-1.)[None,:,None,:];scores=(F.grid_sample(heat,grid,mode='nearest',align_corners=False)*F.grid_sample(rel,grid,mode='bilinear',align_corners=False))[0,0,:,0];valid=scores>0;positions=positions[valid];scores=scores[valid];order=torch.argsort(-scores)[:100];positions=positions[order];scores=scores[order]
 grid=(2.*(positions/torch.tensor([w-1,h-1]))-1.)[None,:,None,:];desc=F.normalize(F.grid_sample(dense,grid,mode='bicubic',align_corners=False)[0,:, :,0].T,dim=-1)
 files={}
 for name,value in [('heat',heat[0,0]),('reliability',rel[0,0]),('dense',dense[0].permute(1,2,0)),('points',positions),('scores',scores),('descriptors',desc)]:
  filename=f'xfeat-post-{index}-{name}.bin';value.numpy().astype(np.float32).tofile(out/filename);files[name]=filename
 records.append(dict(width=w,height=h,files=files))
for n in [100,17001]:
 scores=torch.arange(n,dtype=torch.float32)%4;order=torch.argsort(-scores);np.stack([np.arange(n),np.zeros(n),scores.numpy()],1).astype(np.float32).tofile(out/f'xfeat-sort-{n}.bin');order.numpy().astype(np.int32).tofile(out/f'xfeat-sort-{n}-order.bin')
(out/'xfeat-post-reference.json').write_text(json.dumps(records))
