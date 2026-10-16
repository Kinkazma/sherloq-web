/** Hash-pinned official Comprint in bounded WASM heaps; staged global statistics. */
let python,pending,identity,chunkedLoaded=false;
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
async function verified(url,expected,text=false){const r=await fetch(url);if(!r.ok)throw Error(`Comprint asset HTTP ${r.status}`);const b=new Uint8Array(await r.arrayBuffer());if(await sha(b)!==expected)throw Error('Comprint asset identity mismatch');return text?new TextDecoder().decode(b):b;}
self.onmessage=async({data})=>{
 if(data.command==='execute'){if(pending?.id===data.id){const resume=pending.resume;pending=null;resume();}return;}
 const {id,operation}=data;
 try{
  const current=JSON.stringify([data.runtimeURL,data.factoryURL,data.factorySha256,data.archiveSha256,data.kernelSha256,data.chunkedSha256,data.heapBytes,data.role]);
  if(identity&&identity!==current)throw Error('Cached Comprint worker identity changed');
  let loadSeconds=0;
  if(!python){
   const start=performance.now();globalThis.__sherloqPythonMemoryPages=data.heapBytes/65536;
   await verified(data.factoryURL,data.factorySha256);await import(data.factoryURL);
   const {loadPyodide}=await import(new URL('pyodide.mjs',data.runtimeURL));
   self.postMessage({id,progress:{phase:'comprint-runtime',role:data.role}});
   python=await loadPyodide({indexURL:data.runtimeURL,stdout:()=>{},stderr:()=>{}});
   await python.loadPackage(data.role==='fit'?['numpy','scipy']:['numpy','scipy','scikit-image'],{checkIntegrity:true});
   python.unpackArchive(await verified(data.archiveURL,data.archiveSha256),'zip',{extractDir:'/home/pyodide'});
   await python.runPythonAsync(await verified(data.kernelURL,data.kernelSha256,true));
   identity=current;loadSeconds=(performance.now()-start)/1000;
  }
  if(operation.endsWith('_chunked')&&!chunkedLoaded){await python.runPythonAsync(await verified(data.chunkedURL,data.chunkedSha256,true));chunkedLoaded=true;}
  await new Promise(resume=>{pending={id,resume};self.postMessage({id,executionReady:true,heapBytes:python._module.HEAPU8.buffer.byteLength});});
  const start=performance.now();python.globals.set('incoming',data.inputs);python.globals.set('operation',operation);
  if(operation==='release_state')python.runPython("STATE.clear()\nimport gc\ngc.collect()\noutputs={}\nmetadata={'releasedPythonState':True,'workerClosing':True}");
  else python.runPython("arrays={name:np.asarray(value['data']).reshape(value['dims']) for name,value in incoming.to_py().items()}\noutputs,metadata=(execute_comprint_chunked if operation.endswith('_chunked') else execute_comprint)(operation,arrays)");
  const k=python.runPython('list(outputs.keys())'),keys=k.toJs();k.destroy();const outputs={},transfers=[];
  for(const key of keys){python.globals.set('output_key',key);const d=python.runPython('list(outputs[output_key].shape)'),dims=d.toJs();d.destroy();const v=python.runPython('np.ascontiguousarray(outputs[output_key]).ravel()');try{const values=v.toJs().slice();outputs[key]={data:values,dims};transfers.push(values.buffer);}finally{v.destroy();}}
  python.runPython('import json');const metadata=JSON.parse(python.runPython('json.dumps(metadata,allow_nan=False)'));
  metadata.runtime={pyodide:'0.26.4',role:data.role,heapBytes:python._module.HEAPU8.buffer.byteLength,maximumHeapBytes:data.heapBytes,maximumEnforced:true,pythonInstalledOnUserComputer:false,remoteInference:false};metadata.operation=operation;metadata.workerSeconds=(performance.now()-start)/1000;metadata.runtimeLoadSeconds=loadSeconds;
  self.postMessage({id,outputs,metadata},transfers);
  if(operation==='release_state')self.close();
 }catch(error){self.postMessage({id,error:{code:'COMPRINT_STATISTICS',message:String(error.message??error),operation}});}
 finally{if(python)try{python.runPython("for _key in ('incoming','arrays','outputs','metadata','operation','output_key'):\n globals().pop(_key,None)");}catch{/* retain original error */}}
};
