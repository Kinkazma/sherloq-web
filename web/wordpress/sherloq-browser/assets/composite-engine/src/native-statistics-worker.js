let python;
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
self.onmessage=async({data})=>{
 try{
  if(!python){
   globalThis.__sherloqPythonMemoryPages=data.memoryMaximumBytes/65536;
   const {loadPyodide}=await import(data.runtime.url+'pyodide.mjs');
   self.postMessage({phase:'statistics-load'});
   python=await loadPyodide({indexURL:data.runtime.url,stdout:()=>{},stderr:()=>{}});
   await python.loadPackage(['numpy','scipy','opencv-python','pillow'],{checkIntegrity:true});
   const archive=new Uint8Array(await(await fetch(data.runtime.url+'noiseprint-statistics.zip')).arrayBuffer());
   if(await sha(archive)!==data.runtime.sourceSha256)throw Error('Statistics source identity mismatch');
   python.unpackArchive(archive,'zip',{extractDir:'/home/pyodide'});
   self.reportProgress=(phase,completed,total)=>self.postMessage({phase,completed,total});
   await python.runPythonAsync(await(await fetch(new URL('../native/composite-runtime.py',import.meta.url))).text());
   await python.runPythonAsync(await(await fetch(new URL('../native/composite-stream-runtime.py',import.meta.url))).text());
   await python.runPythonAsync(await(await fetch(new URL('../native/composite-banked-runtime.py',import.meta.url))).text());
  }
  python.globals.set('incoming',data.inputs);python.globals.set('operation',data.operation);
  python.runPython(`
from js import reportProgress
arrays = {name: np.asarray(value['data']).reshape(value['dims']) for name,value in incoming.to_py().items()}
outputs = composite_banked(operation[5:], arrays, reportProgress) if operation.startswith('bank:') else composite_stream(operation[7:], arrays, reportProgress) if operation.startswith('stream:') else composite_run(operation, arrays, reportProgress)
`);
  const names=python.runPython('list(outputs.keys())');let keys;
  try{keys=names.toJs();}finally{names.destroy();}
  const result={},transfers=[];let bytes=0;
  for(const name of keys){
   python.globals.set('output_key',name);
   const dimsProxy=python.runPython('list(outputs[output_key].shape)');let dims;try{dims=dimsProxy.toJs();}finally{dimsProxy.destroy();}
   const proxy=python.runPython("np.ascontiguousarray(outputs[output_key].astype(np.uint8) if outputs[output_key].dtype==bool else outputs[output_key]).ravel()");
   try{const values=proxy.toJs().slice();bytes+=values.byteLength;if(bytes>data.outputBytes)throw Error('Statistics output exceeded admission');result[name]={data:values,dims};transfers.push(values.buffer);}finally{proxy.destroy();}
  }
  const heapBytes=python._module.HEAPU8.buffer.byteLength;
  self.postMessage({result,heapBytes,statisticsPolicy:python.runPython('STATISTICS_POLICY')},transfers);
 }catch(error){self.postMessage({error:{code:/identity/.test(String(error))?'MODEL_IDENTITY':/out of memory|MemoryError/i.test(String(error))?'MEMORY_ALLOCATION':'STATISTICS_EXECUTION',message:String(error)}});}
 finally{if(python)python.runPython("for _name in ('incoming','arrays','outputs','operation','output_key'):\n globals().pop(_name,None)");}
};
