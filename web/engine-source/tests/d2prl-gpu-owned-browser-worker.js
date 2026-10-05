import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {createConvolutionGeneralGpu} from '../experiments/d2prl/convolution-general-gpu.js';
import {createConvolutionCpu} from '../experiments/d2prl/convolution-cpu.js';
import {createFeatureMath} from '../experiments/d2prl/feature-math.js';
import factory from '../vendor/d2prl/feature-math.js';
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),value=>value.toString(16).padStart(2,'0')).join('');
self.onmessage=async()=>{let gpu,cpu,math,expected,actual,halfExpected,halfActual,large;const originalSlice=Float32Array.prototype.slice;try{
 if(!navigator.gpu){self.postMessage({result:{status:'unavailable',reason:'WebGPU unavailable; CPU route unchanged'}});return;}
 const budget=new Budget(768*1024**2),input={input:Float32Array.from({length:3*32*32},(_,i)=>(i%19-9)/32),weights:Float32Array.from({length:4*3*9},(_,i)=>(i%7-3)/64),bias:new Float32Array(4),channels:3,height:32,width:32,outChannels:4,kernel:3,padding:1};
 cpu=createConvolutionCpu({budget,moduleUrl:new URL('../vendor/d2prl/convolution.js',import.meta.url).href,maxWorkers:1});expected=await cpu.run(input);cpu.dispose();cpu=null;
 const nativeHash=await hash(expected.data);gpu=await createConvolutionGeneralGpu({budget});
 let slices=0;Float32Array.prototype.slice=function(...args){slices++;throw new RangeError('Array buffer allocation failed');};
 actual=await gpu.run(input);const gpuHash=await hash(actual.data);ensure(nativeHash===gpuHash,'Native CPU / mapped GPU mismatch');ensure(slices===0,'GPU attempted an output backing copy');Float32Array.prototype.slice=originalSlice;
 math=await createFeatureMath(()=>factory(),{budget});halfExpected=await math.run('half',{input:expected.data});halfActual=await math.run('half',{input:actual.data});const halfHash=await hash(halfActual.data);ensure(halfHash===await hash(halfExpected.data),'Mapped GPU input changed native helper output');halfExpected.release();halfExpected=null;halfActual.release();halfActual=null;math.dispose();math=null;expected.release();expected=null;actual.release();actual=null;
 const side=448,n=side**2,channels=64,largeInput={input:Float32Array.from({length:n},(_,i)=>(i%17)/32),weights:Float32Array.from({length:channels},(_,i)=>(i%4+1)/4),bias:new Float32Array(channels),channels:1,height:side,width:side,outChannels:channels,kernel:1};
 Float32Array.prototype.slice=function(...args){slices++;throw new RangeError('Array buffer allocation failed');};large=await gpu.run(largeInput);Float32Array.prototype.slice=originalSlice;
 ensure(large.data.byteLength===51380224,'The real failing output extent was not exercised');ensure(slices===0,'Large GPU output was copied');
 for(let c=0;c<channels;c++)for(let i=0;i<n;i++)ensure(large.data[c*n+i]===Math.fround(largeInput.input[i]*largeInput.weights[c]),'Large output changed arithmetic');
 const largeHash=await hash(large.data),heldBytes=budget.total();ensure(getExecutionScheduler(budget).snapshot().running===0,'GPU lane held by owned output');gpu.dispose();gpu=null;ensure(large.data.byteLength===51380224,'Disposing the engine detached its owned output');ensure(await hash(large.data)===largeHash,'Owned output changed after engine disposal');const reservedAfterDispose=budget.total();ensure(reservedAfterDispose===2*51380224,'Staging and host-view reservation missing');large.release();large.release();ensure(large.data.byteLength===0,'release did not detach the mapping');large=null;ensure(budget.total()===0,'Leaked owned output budget');
 self.postMessage({result:{status:'passed',nativeHash,gpuHash,halfHash,largeOutput:{bytes:51380224,sha256:largeHash,all12845056ValuesExact:true,sliceCalls:slices,reservedAfterDispose},heldBytes,budgetFinal:budget.total(),deviceDisposalPreservesOwnedOutput:true}});
}catch(error){if(error.code==='GPU_UNAVAILABLE')self.postMessage({result:{status:'unavailable',reason:error.message}});else self.postMessage({error:{message:error.message,code:error.code,stack:error.stack}});}finally{Float32Array.prototype.slice=originalSlice;for(const result of[halfExpected,halfActual,expected,actual,large])result?.release();math?.dispose();cpu?.dispose();gpu?.dispose();}};
