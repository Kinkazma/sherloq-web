// Private diagnostic of the pinned Tesseract 2a9c1 LSTM equations (Apache-2.0).
// No production import. Native weight/table fixtures stay in the private chantier.
const f=Math.fround;
export function replayNativeLstm({ni,ns,na,steps,clip},{input,ci,gi,gf,go,tanh,logistic,rowEnds}){
 if(![ni,ns,na,steps].every(Number.isSafeInteger)||ni<1||ns<4||ns>512||na!==ni+ns||steps<1||steps>4096||input.length!==ni*steps||rowEnds.length!==steps||!rowEnds.every(v=>v===0||v===1)||![ci,gi,gf,go].every(v=>v.length===ns*(na+1))||tanh.length!==4096||logistic.length!==4096)throw Error('Invalid native LSTM fixture');
 const source=new Float32Array(na),hidden=new Float32Array(ns),state=new Float32Array(ns),out=new Float32Array(steps*ns),weights=[ci,gi,gf,go],gate=new Float32Array(4*ns);
 function lookup(value,table,isLogistic){const negative=value<0,x=f(Math.abs(value)*256),i=Math.trunc(x);let y=1;if(i<4095)y=f(table[i]+f(f(table[i+1]-table[i])*f(x-i)));return negative?(isLogistic?f(1-y):-y):y;}
 function dot(w,base){let a=f(source[0]*w[base]),b=f(source[1]*w[base+1]),c=f(source[2]*w[base+2]),d=f(source[3]*w[base+3]),k=4;for(;k+3<na;k+=4){a=f(a+f(source[k]*w[base+k]));b=f(b+f(source[k+1]*w[base+k+1]));c=f(c+f(source[k+2]*w[base+k+2]));d=f(d+f(source[k+3]*w[base+k+3]));}let sum=f(f(a+b)+f(c+d));for(;k<na;k++)sum=f(sum+f(source[k]*w[base+k]));return f(sum+w[base+na]);}
 for(let t=0;t<steps;t++){
  source.set(input.subarray(t*ni,(t+1)*ni));source.set(hidden,ni);
  for(let g=0;g<4;g++)for(let n=0;n<ns;n++)gate[g*ns+n]=lookup(dot(weights[g],n*(na+1)),g===0?tanh:logistic,g!==0);
  for(let n=0;n<ns;n++){state[n]=Math.max(-clip,Math.min(clip,f(f(state[n]*gate[2*ns+n])+f(gate[n]*gate[ns+n]))));hidden[n]=f(lookup(state[n],tanh,false)*gate[3*ns+n]);out[t*ns+n]=hidden[n];}
  if(rowEnds[t]){state.fill(0);hidden.fill(0);}
 }
 return out;
}
export function transposeNativeWeights({ns,na},arrays){const out=new Float32Array(4*ns*(na+1));for(const[g,key]of['ci','gi','gf','go'].entries())for(let k=0;k<=na;k++)for(let n=0;n<ns;n++)out[(g*(na+1)+k)*ns+n]=arrays[key][n*(na+1)+k];return out;}
export function nativeLstmWgsl({ni,ns,na,steps,clip},workgroupSize=128){
 if(![ni,ns,na,steps].every(Number.isSafeInteger)||na!==ni+ns||ni<1||ns<4||ns>512||na>1024||steps<1||steps>4096||![64,128,256].includes(workgroupSize)||clip!==100)throw Error('Unsupported private LSTM shape');
 return String.raw`
const NI:u32=${ni}u;const NS:u32=${ns}u;const NA:u32=${na}u;const STEPS:u32=${steps}u;
@group(0) @binding(0) var<storage,read> input:array<f32>;
@group(0) @binding(1) var<storage,read> weights:array<f32>;
@group(0) @binding(2) var<storage,read> tables:array<f32>;
@group(0) @binding(3) var<storage,read> rowEnds:array<i32>;
@group(0) @binding(4) var<storage,read_write> output:array<f32>;
var<workgroup> source:array<f32,${na}>;
var<workgroup> hidden:array<f32,${ns}>;
var<workgroup> state:array<f32,${ns}>;
var<workgroup> gates:array<f32,${4*ns}>;
fn add(a:f32,b:f32)->f32{return fma(1.0,a,b);}
fn lookup(value:f32,isLogistic:bool)->f32{
 let negative=value<0.0;let x=abs(value)*256.0;var y=1.0;
 if(x<4095.0){let index=u32(x);let base=select(0u,4096u,isLogistic);let lo=tables[base+index];let hi=tables[base+index+1u];let delta=fma(-1.0,lo,hi);let fraction=fma(-1.0,f32(index),x);y=add(lo,delta*fraction);}
 if(negative){if(isLogistic){return fma(-1.0,y,1.0);}return -y;}return y;
}

fn weight(g:u32,k:u32,n:u32)->f32{return weights[(g*(NA+1u)+k)*NS+n];}
fn dot(g:u32,n:u32)->f32{
 var sum=vec4<f32>(source[0]*weight(g,0u,n),source[1]*weight(g,1u,n),source[2]*weight(g,2u,n),source[3]*weight(g,3u,n));var k=4u;
 loop{if(k+3u>=NA){break;}let product=vec4<f32>(source[k]*weight(g,k,n),source[k+1u]*weight(g,k+1u,n),source[k+2u]*weight(g,k+2u,n),source[k+3u]*weight(g,k+3u,n));sum=fma(vec4<f32>(1.0),sum,product);k+=4u;}
 var value=add(add(sum.x,sum.y),add(sum.z,sum.w));loop{if(k>=NA){break;}value=add(value,source[k]*weight(g,k,n));k++;}return add(value,weight(g,NA,n));
}
@compute @workgroup_size(${workgroupSize}) fn main(@builtin(local_invocation_index) tid:u32){
 for(var n=tid;n<NS;n+=${workgroupSize}u){hidden[n]=0.0;state[n]=0.0;}
 workgroupBarrier();
 for(var t=0u;t<STEPS;t++){
  for(var k=tid;k<NI;k+=${workgroupSize}u){source[k]=input[t*NI+k];}
  for(var n=tid;n<NS;n+=${workgroupSize}u){source[NI+n]=hidden[n];}
  workgroupBarrier();
  for(var flat=tid;flat<4u*NS;flat+=${workgroupSize}u){let g=flat/NS;let n=flat%NS;gates[flat]=lookup(dot(g,n),g!=0u);}
  workgroupBarrier();
  for(var n=tid;n<NS;n+=${workgroupSize}u){let remembered=state[n]*gates[2u*NS+n];let written=gates[n]*gates[NS+n];let cell=clamp(add(remembered,written),-100.0,100.0);let result=lookup(cell,false)*gates[3u*NS+n];output[t*NS+n]=result;state[n]=select(cell,0.0,rowEnds[t]!=0);hidden[n]=select(result,0.0,rowEnds[t]!=0);}
  workgroupBarrier();
 }
}`;
}

// Same recurrence, spread across independent neuron groups. Each ordered GPU
// dispatch is one native timestep; all weight/table/state storage stays resident.
export function nativeLstmStepWgsl(shape,neuronsPerGroup=32){
 if(neuronsPerGroup!==32)throw Error('Only the qualified diagnostic geometry is prepared');
 const {ni,ns}=shape;let source=nativeLstmWgsl(shape,128);
 source=source.replace('var<workgroup> hidden:array<f32,'+ns+'>;','@group(0) @binding(5) var<storage,read_write> cells:array<f32>;');
 source=source.replace('var<workgroup> state:array<f32,'+ns+'>;','@group(0) @binding(6) var<uniform> step:vec4<u32>;');
 source=source.replace('var<workgroup> gates:array<f32,'+(4*ns)+'>;','var<workgroup> gates:array<f32,128>;');
 source=source.slice(0,source.indexOf('@compute'))+String.raw`
@compute @workgroup_size(128) fn main(@builtin(local_invocation_index) tid:u32,@builtin(workgroup_id) group:vec3<u32>){
 let t=step.x;
 for(var k=tid;k<NI;k+=128u){source[k]=input[t*NI+k];}
 for(var n=tid;n<NS;n+=128u){var previous=0.0;if(t>0u){if(rowEnds[t-1u]==0){previous=output[(t-1u)*NS+n];}}source[NI+n]=previous;}
 workgroupBarrier();
 let gate=tid/32u;let local=tid%32u;let n=group.x*32u+local;
 var value=0.0;if(n<NS){value=lookup(dot(gate,n),gate!=0u);}gates[tid]=value;
 workgroupBarrier();
 if(tid<32u&&n<NS){var previousCell=0.0;if(t>0u){if(rowEnds[t-1u]==0){previousCell=cells[n];}}let remembered=previousCell*gates[64u+local];let written=gates[local]*gates[32u+local];let cell=clamp(add(remembered,written),-100.0,100.0);cells[n]=cell;output[t*NS+n]=lookup(cell,false)*gates[96u+local];}
}`;
 return source;
}
