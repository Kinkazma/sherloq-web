from pathlib import Path
import ctypes as ct,numpy as np,hashlib,json
ROOT=Path(__file__).resolve().parents[2];lib=ct.CDLL(str(ROOT/'native/runtime/libsherloq_zero.dylib'));fn=lib.rgb2luminance;dp=ct.POINTER(ct.c_double);fn.argtypes=[dp,dp,ct.c_int,ct.c_int,ct.c_int]
g,b=np.indices((256,256));source=np.empty((3,256,256),np.float64);source[1]=g;source[2]=b;out=np.empty((256,256),np.float64);digest=hashlib.sha256()
for r in range(256):
 source[0].fill(r);fn(source.ctypes.data_as(dp),out.ctypes.data_as(dp),256,256,3);assert np.array_equal(out,out.astype(np.uint8));digest.update(out.astype(np.uint8).tobytes())
(ROOT/'web-engine/fixtures/zero-luminance-reference.json').write_text(json.dumps(dict(schema=1,colors=256**3,order='R outer, G middle, B inner; native float64 integral output encoded uint8',sha256=digest.hexdigest()),indent=2)+'\n');print(digest.hexdigest())
