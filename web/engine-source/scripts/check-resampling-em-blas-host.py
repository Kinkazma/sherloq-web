"""Development only: compare the portable scalar implementation with the native EM oracle."""
import ctypes as C,numpy as np,json
from pathlib import Path
root=Path(__file__).resolve().parents[1];base=root/'.build/resampling-em';ref=json.loads((base/'reference.json').read_text());lib=C.CDLL(str(root/'.build/em-portable.dylib'))
lib.em_create.argtypes=[np.ctypeslib.ndpointer(dtype=np.float64),C.c_int,C.c_int,C.c_int];lib.em_create.restype=C.c_void_p
for name in ['step','iterations','destroy','weights']:getattr(lib,'em_'+name).argtypes=[C.c_void_p]
lib.em_weights.restype=C.POINTER(C.c_double)
records=[]
for item in ref['images']:
 image=np.fromfile(base/item['file'],dtype='<f8');h,w=item['shape']
 for expected in item['results']:
  size=expected['size'];handle=lib.em_create(image,w,h,size);row=dict(name=item['name'],size=size,nativeError=expected.get('error'));status=-1
  if handle:
   status=lib.em_step(handle)
   while status==1:status=lib.em_step(handle)
   row['iterations']=lib.em_iterations(handle)
   if status>0 and 'file' in expected:
    values=np.ctypeslib.as_array(lib.em_weights(handle),shape=((h-size+1)*(w-size+1),));target=np.fromfile(base/expected['file'],dtype='<f8');row.update(different=int(np.count_nonzero(values!=target)),maxError=float(np.max(np.abs(values-target))),iterationMatch=row['iterations']==expected['iterations'])
   lib.em_destroy(handle)
  row['status']=status;records.append(row)
  if (status<0)!=bool(row['nativeError']) or row.get('different',0) or row.get('iterationMatch')==False:print(row,flush=True)
assert len(records)==190
assert all((r['status']<0)==bool(r['nativeError']) and r.get('different',0)==0 and r.get('iterationMatch',True) for r in records), 'Native EM arithmetic diverged'
(base/'blas-portable-host.json').write_text(json.dumps(records,indent=2)+'\n');print('cases',len(records))
