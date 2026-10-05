"""Small deterministic native references, output only to this worktree."""
import argparse, ctypes as ct, hashlib, json
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--library',type=Path,required=True);args=p.parse_args()
out=ROOT/'.build/dense-reference';out.mkdir(parents=True,exist_ok=True)
lib=ct.CDLL(str(args.library));fp=ct.POINTER(ct.c_float);ip=ct.POINTER(ct.c_int);up=ct.POINTER(ct.c_ubyte)
lib.sherloq_dense_features.argtypes=[fp,ct.c_int,ct.c_int,ct.c_int,ct.c_int,ct.c_int,fp,fp,ct.c_char_p]
lib.sherloq_patchmatch_metric.argtypes=[fp,fp,up,ct.c_int,ct.c_int,ct.c_int,ct.c_int,ct.c_float,ct.c_float,ct.c_int,ct.c_uint32,ip,fp,ct.POINTER(ct.c_uint64),ct.c_void_p,ct.c_char_p,ct.c_float,ct.c_float,fp,fp]
def ptr(a,t=ct.c_float):return a.ctypes.data_as(ct.POINTER(t))
def save(name,a):a.tofile(out/name);return name
rng=np.random.default_rng(729);error=ct.create_string_buffer(1024);records=[]
for method,patch in [(0,3),(0,8),(1,3),(1,4),(1,8)]:
 h,w=37,43;rgb=rng.integers(0,256,(h,w,3),dtype=np.uint8);rgb[4:14,25:35]=rgb[4:14,5:15]
 gray=rgb.astype(np.float32).sum(2)*np.float32(1/np.sqrt(np.float32(3)))
 dh,dw=h-3*patch*method,w-3*patch*method;dims=128 if method else 12
 a=np.empty((dh,dw,dims),np.float32);b=np.empty_like(a)
 assert lib.sherloq_dense_features(ptr(gray),w,h,method,patch,1,ptr(a),ptr(b),error)==0,error.value
 stem=f'm{method}-p{patch}';r=dict(stem=stem,method=method,patch=patch,width=w,height=h,dw=dw,dh=dh,dimensions=dims)
 save(stem+'-rgb.u8',rgb);save(stem+'-gray.f32',gray)
 for name,array in [('a',a),('b',b)]:
  save(stem+'-'+name+'-raw.f32',array);array/=np.maximum(np.linalg.norm(array,axis=2,keepdims=True),1e-12);save(stem+'-'+name+'.f32',array)
 if method:
  src=a.reshape(-1,4,4,8);hist=src.sum((1,2));angle=hist.reshape(-1,4,2).sum(2).argmax(1);canonical=np.empty_like(src)
  for turn in range(4):
   ids=np.flatnonzero(angle==turn);canonical[ids]=np.roll(np.rot90(src[ids],turn,axes=(1,2)),-2*turn,axis=3)
  save(stem+'-canonical.f32',canonical)
  hist=canonical.sum((1,2))
  cosine=np.array([1,0,-1,0,1,0,-1,0],np.float32);sine=np.array([0,1,0,-1,0,1,0,-1],np.float32)
  total=hist.sum(1);anisotropy=np.sqrt((hist*cosine).sum(1)**2+(hist*sine).sum(1)**2)
  save(stem+'-diversity.u8',((total>0)&((total-anisotropy)>=.1*(total+anisotropy))).astype(np.uint8))
 r['fields']=[]
 for case in ('search','compare','gap-axes','empty'):
  mask=np.ones((dh,dw),np.uint8);mask[::7,::3]=0
  compare=case in ('compare','gap-axes');gap=(2.,-1.) if case=='gap-axes' else (0.,0.)
  if compare:mask[:,dw//2:]*=2;mask[2:4,2:4]=3
  if case=='empty':mask[:]=0
  axes=(np.arange(dw,dtype=np.float32)*.75,np.arange(dh,dtype=np.float32)*.8) if case=='gap-axes' else None
  targets=np.empty((dh,dw),np.int32);squared=np.empty((dh,dw),np.float32);count=ct.c_uint64()
  assert lib.sherloq_patchmatch_metric(ptr(a),ptr(b),ptr(mask,ct.c_ubyte),dw,dh,dims,int(compare),3,19,3,729,ptr(targets,ct.c_int),ptr(squared),ct.byref(count),None,error,*gap,ptr(axes[0]) if axes else None,ptr(axes[1]) if axes else None)==0,error.value
  prefix=stem+'-'+case
  save(prefix+'-mask.u8',mask);save(prefix+'-targets.i32',targets);save(prefix+'-squared.f32',squared)
  if axes:
   save(prefix+'-x.f32',axes[0]);save(prefix+'-y.f32',axes[1])
  r['fields'].append(dict(case=case,compare=compare,gap=gap,axes=bool(axes),comparisons=count.value))
 records.append(r)
(out/'manifest.json').write_text(json.dumps(dict(librarySha256=hashlib.sha256(args.library.read_bytes()).hexdigest(),cases=records),indent=2)+'\n')
print(json.dumps(dict(cases=len(records),fields=sum(len(r['fields']) for r in records),output=str(out))))
