import {Budget} from '../src/cache.js';
import {createBoundedRoles} from '../experiments/d2prl/roles-bounded.js';
import {loadRoleModel} from '../experiments/d2prl/role-model.js';
import {readVerifiedModelAsset} from '../experiments/d2prl/model.js';
import {isWasmTensorView} from '../src/wasm-tensor-arena.js';
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
self.onmessage=async({data})=>{let session,model,outputs;const feeds={},events=[];try{
 const runtime=await import('../vendor/d2prl/factory.mjs'),ort=await import('../vendor/d2prl/ort.wasm.min.mjs');ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths={mjs:new URL('../vendor/d2prl/factory.mjs',import.meta.url).href,wasm:new URL('../vendor/d2prl/ort-wasm-simd-threaded.wasm',import.meta.url).href};
 const role=data.role,url=new URL('/private-model/'+role.modelFile,location.origin).href;
 const input={};const n=448**2;for(const name of ['rgb','x_cor','y_cor','x_cor2','y_cor2','union']){const values=new Float32Array((name==='rgb'?3:1)*n);for(let i=0;i<values.length;i++)values[i]=name==='rgb'?(i%29)/32:name==='union'?1:name.startsWith('x_')?i%448:Math.floor(i/448);input[name]=values;}
 if(data.owned==='bounded-worker'){
  const budget=new Budget(1024**3),stage=createBoundedRoles({budget,model:role,modelUrl:url,ortUrl:new URL('../vendor/d2prl/ort.wasm.min.mjs',import.meta.url).href,wasmPath:new URL('../vendor/d2prl/',import.meta.url).href,runtime:{runtimeId:'ort130-wasm-512mib',memoryMaximumBytes:512*1024**2},runtimeFactoryUrl:new URL('../vendor/d2prl/factory.mjs',import.meta.url).href});let value,ledger;
  try{value=await stage.run({rgb:input.rgb,coordinates:{zm:{x:input.x_cor,y:input.y_cor},cnn:{x:input.x_cor2,y:input.y_cor2}},union:input.union},{onInference(){ledger=budget.resourceSnapshot().domains.wasm.materializedBytes;}});const hashes=await Promise.all([hash(value.target),hash(value.source)]),stats=value.parameterLoading,heapBytes=value.heapBytes;value.release();value=null;stage.dispose();ensure(ledger>=role.modelBytes+16*1024**2&&stats.observedHeapBytes===heapBytes,'Missing child heap or parameter ledger');ensure(budget.total()===0&&budget.resourceSnapshot().domains.wasm.materializedBytes===0,'Parent ledger did not settle');self.postMessage({result:{owned:data.owned,hashes,heapBytes,stats,ledgerBytes:ledger,finalModelBackings:0,finalBytes:budget.total()}});return;}finally{value?.release();stage.dispose();}
 }
 model=data.owned?await loadRoleModel({modelUrl:url,modelBytes:role.modelBytes,modelSha256:role.modelSha256,onBacking:event=>events.push(event)}):{data:await readVerifiedModelAsset(url,{bytes:role.modelBytes,sha256:role.modelSha256}),release(){}};
 if(data.owned)ensure(isWasmTensorView(model.data)&&model.data.byteLength===role.modelBytes&&model.data.buffer.byteLength>role.modelBytes,'Owned ONNX extent');
 session=await ort.InferenceSession.create(model.data,{executionProviders:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false});
 for(const[name,values]of Object.entries(input))feeds[name]=new ort.Tensor('float32',values,[1,name==='rgb'?3:1,448,448]);
 outputs=await session.run(feeds);const hashes=await Promise.all([hash(outputs.target.data),hash(outputs.source.data)]),heapBytes=runtime.heapBytes(),stats=model.stats;
 for(const value of Object.values(feeds))value.dispose();for(const value of Object.values(outputs))value.dispose();outputs=null;await session.release();session=null;model.release();model=null;
 const live=new Set();for(const event of events){if(event.action==='allocate')live.add(event.id);else live.delete(event.id);}ensure(live.size===0,'Outstanding role model backing');self.postMessage({result:{owned:data.owned,hashes,heapBytes,stats,finalModelBackings:live.size}});
 }catch(error){self.postMessage({error:{message:error.message,stack:error.stack,code:error.code}});}finally{for(const value of Object.values(outputs??{}))value.dispose();await session?.release();model?.release();}};
