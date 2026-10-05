// Development only. Uses actual SPAM rows and the shipped Pyodide libraries.
self.onmessage=async({data})=>{try{
 globalThis.__sherloqPythonMemoryPages=16384;
 const {loadPyodide}=await import(data.base+'pyodide.mjs'),p=await loadPyodide({indexURL:data.base,stdout:()=>{},stderr:()=>{}});await p.loadPackage(['numpy','scipy']);
 p.globals.set('inputRows',data.values);p.globals.set('rowCount',data.rows);
 const result=p.runPython(`
import numpy as np,time,json
from scipy.linalg.blas import dsyrk, dgemm
base=np.asarray(inputRows.to_py()).reshape(-1,512)
a=np.tile(base,(int(np.ceil(rowCount/len(base))),1))[:rowCount].astype(np.float64)
a-=a.mean(axis=0)
results={};reference=None
for name in ['matmul','syrk','dgemm']:
 t=time.perf_counter()
 if name=='matmul':out=a.T@a
 elif name=='dgemm':out=dgemm(1.,a,a,trans_a=1)
 else:
  upper=dsyrk(1.,a,trans=1,lower=0)
  out=np.triu(upper)+np.triu(upper,1).T
 seconds=time.perf_counter()-t
 if reference is None:reference=out.copy()
 results[name+str(len(results))]={'seconds':seconds,'maxError':float(np.max(np.abs(out-reference))),'meanError':float(np.mean(np.abs(out-reference)))}
json.dumps(results)
`);self.postMessage({records:JSON.parse(result),heap:p._module.HEAPU8.byteLength});
}catch(e){self.postMessage({error:String(e)});}};
