import {Budget} from '../src/cache.js';
import {createWasmTensorArena,isWasmTensorView} from '../src/wasm-tensor-arena.js';
import {createFeatureMath} from '../experiments/d2prl/feature-math.js';
import {createNeuralMath} from '../experiments/d2prl/neural-math.js';
import {createConvolutionCpu} from '../experiments/d2prl/convolution-cpu.js';
import {createConvolutionGeneralGpu} from '../experiments/d2prl/convolution-general-gpu.js';
import {createUnetGraph} from '../experiments/d2prl/unet-graph.js';
import {createD2prlRecovery} from '../experiments/d2prl/recovery.js';
import featureFactory from '../vendor/d2prl/feature-math.js';
import neuralFactory from '../vendor/d2prl/neural-math.js';
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const hash=async view=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',view)),n=>n.toString(16).padStart(2,'0')).join('');
const modelUrl=new URL('../vendor/d2prl/convolution.js',import.meta.url).href;
async function affine(){
 const budget=new Budget(1024**3),arena=createWasmTensorArena({budget}),math=await createFeatureMath(featureFactory,{budget,arena});let input,result;const original=Float32Array.prototype.slice;
 try{const n=448**2,channels=128;input=arena.allocate(Float32Array,channels*n);for(let i=0;i<input.data.length;i++)input.data[i]=(i%67-31)/16;
  const params=new Float32Array(4*channels);params.fill(3,channels,2*channels);params.fill(.5,2*channels,3*channels);params.fill(.125,3*channels);
  Float32Array.prototype.slice=()=>{throw Error('Ordinary output copy forbidden');};result=await math.run('affine',{input:input.data,channels,height:448,width:448,params,epsilon:1});Float32Array.prototype.slice=original;
  ensure(result.data.byteLength===102760448&&isWasmTensorView(result.data),'Real failing extent is not in the owned Wasm arena');for(let i=0;i<result.data.length;i++)ensure(Object.is(result.data[i],Math.max(Math.fround(Math.fround(input.data[i]*.25)+.125),0)),'Native affine differs at '+i);
  const sha256=await hash(result.data),held=result.data,second=await math.run('half',{input:result.data});ensure(held.byteLength===102760448,'Later heap growth detached a published tensor');second.release();input.release();input=null;math.dispose();arena.dispose();ensure(await hash(result.data)===sha256,'Engine disposal changed held output');const heldBytes=budget.total();result.release();result=null;ensure(budget.total()===0,'Affine ownership leak');return{bytes:102760448,sha256,allValuesExact:true,heldBytes,finalBytes:budget.total()};
 }finally{Float32Array.prototype.slice=original;result?.release();input?.release();math.dispose();arena.dispose();}
}
async function branched(copy){
 const budget=new Budget(1024**3),arena=createWasmTensorArena({budget}),native=await createNeuralMath(neuralFactory,{budget,arena}),cpu=createConvolutionCpu({budget,arena,moduleUrl:modelUrl,maxWorkers:2});let input,result;
 const wrap=engine=>({async run(...args){const value=await engine.run(...args);if(!copy)return value;const data=value.data.slice(),shape=value.shape;value.release();return{data,shape,release(){}};}});
 const attr={dilations:[1,1],pads:[0,0,0,0],strides:[1,1],group:1},parameters={w0:{dtype:'float32',shape:[1,3,1,1],bytes:12},w1:{dtype:'float32',shape:[1,2,1,1],bytes:8}},graph={schema:1,status:'unqualified-experimental-graph',input:'rgb',inputShape:[1,3,448,448],output:'out',parameters,nodes:[
 {op:'Conv',inputs:['rgb','w0'],outputs:['x'],attributes:attr},{op:'Relu',inputs:['x'],outputs:['a'],attributes:{}},{op:'Mul',inputs:['a','a'],outputs:['b'],attributes:{}},{op:'Add',inputs:['a','b'],outputs:['c'],attributes:{}},{op:'Concat',inputs:['a','c'],outputs:['cat'],attributes:{axis:1}},{op:'Conv',inputs:['cat','w1'],outputs:['z'],attributes:attr},{op:'Sigmoid',inputs:['z'],outputs:['out'],attributes:{}}]};
 const engine=createUnetGraph({arena,graph,budget,math:wrap(native),convolution:wrap(cpu),layouts:{records:[]},loadParameter:async name=>name==='w0'?Float32Array.of(1,0,0):Float32Array.of(.5,.25)});
 try{input=arena.allocate(Float32Array,3*448**2);for(let i=0;i<input.data.length;i++)input.data[i]=(i%37-18)/32;result=await engine.run(input.data);const sha256=await hash(result.data),stats=arena.snapshot();result.release();result=null;input.release();input=null;cpu.dispose();native.dispose();arena.dispose();ensure(budget.total()===0,'Branch ownership leak');return{sha256,stats,finalBytes:budget.total()};}finally{result?.release();input?.release();cpu.dispose();native.dispose();arena.dispose();}
}
async function faults(){
 const budget=new Budget(256*1024**2),events=[];let memoryCalls=0,computes=0,capture;
 const arena=createWasmTensorArena({budget,memoryFactory:desc=>{if(++memoryCalls<=2)throw new RangeError('WebAssembly.Memory(): could not allocate memory');return new WebAssembly.Memory(desc);}}),operation=createD2prlRecovery({budget,reclaim:async()=>1,onRecovery:e=>events.push(e)});
 const factory=async()=>{const module=await featureFactory();const native=module._d2prl_magnitude;module._d2prl_magnitude=(...args)=>{computes++;return native(...args);};capture=module;return module;},math=await createFeatureMath(factory,{budget,arena,operation});let result;
 try{result=await math.run('magnitude',{input:Float32Array.of(3,0),imag:Float32Array.of(4,1)});ensure(result.data[0]===5&&result.data[1]===1&&computes===1&&memoryCalls===3,'Useful native work repeated after export refusal');result.release();result=null;
  const before=budget.total(),controller=new AbortController(),native=capture._d2prl_magnitude;capture._d2prl_magnitude=(...args)=>{const value=native(...args);controller.abort();return value;};let cancelled=false;try{result=await math.run('magnitude',{input:Float32Array.of(3,0),imag:Float32Array.of(4,1)},{signal:controller.signal});}catch(e){cancelled=e.code==='CANCELLED';}ensure(cancelled&&budget.total()===before,'Cancelled operation leaked an unpublished output');math.dispose();arena.dispose();ensure(budget.total()===0,'Recovery cleanup leak');return{refusals:events.length,computesBeforeCancellation:computes-1,cancelled,finalBytes:budget.total()};}finally{result?.release();math.dispose();arena.dispose();}
}
async function gpuChain(){
 const budget=new Budget(256*1024**2),arena=createWasmTensorArena({budget}),math=await createFeatureMath(featureFactory,{budget,arena});let gpu,a,b,c;
 try{try{gpu=await createConvolutionGeneralGpu({budget});}catch(e){if(e.code==='GPU_UNAVAILABLE')return{status:'unavailable',reason:e.message};throw e;}
  const input=Float32Array.from({length:3*32**2},(_,i)=>(i%13-5)/32),params=Float32Array.from([0,0,0,3,3,3,.5,.5,.5,.125,.125,.125]);a=await math.run('affine',{input,channels:3,height:32,width:32,params,epsilon:1});b=await gpu.run({input:a.data,weights:Float32Array.of(1,0,0),bias:Float32Array.of(0),channels:3,height:32,width:32,outChannels:1,kernel:1});c=await math.run('affine',{input:b.data,channels:1,height:32,width:32,params:Float32Array.of(0,3,.5,.125),epsilon:1});for(let i=0;i<c.data.length;i++)ensure(c.data[i]===Math.fround(Math.fround(a.data[i]*.25)+.125),'GPU/Wasm chain mismatch');return{status:'passed',sha256:await hash(c.data)};
 }finally{c?.release();b?.release();a?.release();gpu?.dispose();math.dispose();arena.dispose();ensure(budget.total()===0,'GPU chain ownership leak');}
}
self.onmessage=async()=>{try{const report={affine:await affine(),faults:await faults(),branchReference:await branched(true),branchOwned:await branched(false),gpuChain:await gpuChain()};ensure(report.branchReference.sha256===report.branchOwned.sha256,'Branched graph changed exact native output');self.postMessage({result:{status:'passed',...report}});}catch(e){self.postMessage({error:{message:e.message,stack:e.stack,code:e.code}});}};
