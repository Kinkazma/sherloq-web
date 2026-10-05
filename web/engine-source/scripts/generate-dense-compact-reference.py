"""Native full SIFT oracle for the budget-triggered compact browser path."""
import argparse, ctypes as ct, hashlib, json
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--library',type=Path,required=True);args=p.parse_args()
out=Path(__file__).resolve().parents[1]/'.build/dense-compact-reference';out.mkdir(parents=True,exist_ok=True)
lib=ct.CDLL(str(args.library));fp=ct.POINTER(ct.c_float);ip=ct.POINTER(ct.c_int);up=ct.POINTER(ct.c_ubyte)
lib.sherloq_dense_features.argtypes=[fp,ct.c_int,ct.c_int,ct.c_int,ct.c_int,ct.c_int,fp,fp,ct.c_char_p]
lib.sherloq_patchmatch_metric.argtypes=[fp,fp,up,ct.c_int,ct.c_int,ct.c_int,ct.c_int,ct.c_float,ct.c_float,ct.c_int,ct.c_uint32,ip,fp,ct.POINTER(ct.c_uint64),ct.c_void_p,ct.c_char_p,ct.c_float,ct.c_float,fp,fp]
def ptr(a,t=ct.c_float):return a.ctypes.data_as(ct.POINTER(t))
def sha(a):return hashlib.sha256(a.tobytes()).hexdigest()
w=h=512;patch=8;target=10;dw=dh=w-3*target
rgb=np.random.default_rng(729).integers(0,256,(h,w,3),dtype=np.uint8);rgb[256:384,256:384]=rgb[32:160,32:160]
gray=rgb.astype(np.float32).sum(2)*np.float32(1/np.sqrt(np.float32(3)));gray.tofile(out/'gray.f32')
error=ct.create_string_buffer(1024);values=[];mask=np.ones((dh,dw),np.uint8)
for bin,mirror in [(patch,False),(target,True)]:
 a=np.empty((h-3*bin,w-3*bin,128),np.float32);b=np.empty_like(a) if mirror else None
 assert lib.sherloq_dense_features(ptr(gray),w,h,1,bin,int(mirror),ptr(a),ptr(b) if mirror else None,error)==0,error.value
 v=b if mirror else a;v/=np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-12)
 offset=3*(target-bin)//2;v=v[offset:offset+dh,offset:offset+dw].copy();del a,b
 src=v.reshape(-1,4,4,8);canonical=np.empty_like(src)
 for start in range(0,len(src),8192):
  block=src[start:start+8192];turns=block.sum((1,2)).reshape(-1,4,2).sum(2).argmax(1)
  for turn in range(4):
   ids=np.flatnonzero(turns==turn);canonical[start+ids]=np.roll(np.rot90(block[ids],turn,axes=(1,2)),-2*turn,axis=3)
 hist=canonical.sum((1,2));total=hist.sum(1);cos=np.array([1,0,-1,0,1,0,-1,0],np.float32);sin=np.array([0,1,0,-1,0,1,0,-1],np.float32)
 aniso=np.sqrt((hist*cos).sum(1)**2+(hist*sin).sum(1)**2);mask&=((total>0)&((total-aniso)>=.1*(total+aniso))).reshape(dh,dw)
 values.append(canonical.reshape(dh,dw,128))
targets=np.empty((dh,dw),np.int32);squared=np.empty((dh,dw),np.float32);count=ct.c_uint64()
assert lib.sherloq_patchmatch_metric(ptr(values[0]),ptr(values[1]),ptr(mask,ct.c_ubyte),dw,dh,128,0,5,80,2,729,ptr(targets,ct.c_int),ptr(squared),ct.byref(count),None,error,0,0,None,None)==0,error.value
proof=dict(width=w,height=h,patch=patch,targetPatch=target,reflection=True,quarterTurn=True,options=dict(minimum=5,radius=80,iterations=2,seed=729),comparisons=str(count.value),sha256=dict(targets=sha(targets),distancesSquared=sha(squared),allowed=sha(mask)),librarySha256=hashlib.sha256(args.library.read_bytes()).hexdigest())
(out/'manifest.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
