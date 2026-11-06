import test from 'node:test';import assert from 'node:assert/strict';
import {gradientParams} from '../src/gradient-parameters.js';
import {grayInput,derivativeBlock} from '../src/gradient-field-math.js';
import {createEngine} from '../src/index.js';

const width=29,height=25,data=Uint8Array.from({length:width*height*3},(_,i)=>(i*73+(i>>>3)*19)%256),pixels={width,height,format:'rgb8',data};
function oracle(p,M){
 const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4,L=Float64Array.from({length:width*height},(_,i)=>{
  const[r,g,b]=data.subarray(3*i,3*i+3);return p.luma==='bt601'?Math.floor((299*r+587*g+114*b)/1000)/255:.2126*linear(r/255)+.7152*linear(g/255)+.0722*linear(b/255);
 }),edge=(i,n)=>{if(i>=0&&i<n)return i;if(p.border==='omit')return-1;if(p.border==='nearest')return Math.max(0,Math.min(n-1,i));let j=i%(2*n);if(j<0)j+=2*n;return j<n?j:2*n-1-j;},out=new Float64Array(width*height*2);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x;if(!M[i])continue;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const xx=edge(x+dx*p.sampleStep,width),yy=edge(y+dy*p.sampleStep,height);if(xx<0||yy<0||!M[yy*width+xx])continue;
   const delta=L[yy*width+xx]-L[i],weight=dx&&dy?4:7;out[2*i]+=delta*dx*weight/(30*p.sampleStep);out[2*i+1]+=delta*dy*weight/(30*p.sampleStep);
  }
 }return{L,out};
}
for(const luma of['bt601','linear709'])for(const border of['reflect','nearest','omit'])test('extended Krawetz honors shared '+luma+'/'+border+' and spatial sampling',()=>{
 const p=gradientParams({method:'krawetz',view:'angle',luma,border,sampleStep:2}),M=new Uint8Array(width*height).fill(1);M[7*width+8]=0;
 const expected=oracle(p,M),prepared=grayInput(data,M,p),actual=derivativeBlock(prepared.L,M,width,height,p);
 for(let i=0;i<M.length;i++)if(M[i])assert(Math.abs(prepared.L[i]-expected.L[i])<1e-14);
 for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected.out[i])<1e-14,'independent weighted differences at '+i);
 const changed=derivativeBlock(prepared.L,M,width,height,{...p,sampleStep:3});assert.notDeepEqual(actual,changed);
});

for(const view of['native','angle','coherence'])test('each '+view+' uses the selected operator and isolates its cached field',async()=>{
 const engine=createEngine({memoryBudgetBytes:192*1024**2,cpuKernel:'auto'}),answers=new Map();
 try{
  await engine.load({id:'input',bytes:Uint8Array.of(1,2,3),pixels});
  for(const method of['sobel','scharr','krawetz','sobel']){
   const params=gradientParams({method,view,intensity:0,luma:'linear709',border:'nearest',sampleStep:2}),result=await engine.run({id:'operator-'+method,imageId:'input',operation:'detail.gradient',params,backend:'cpu'});
   assert.equal(result.metrics.gradientMethod,method);assert.equal(result.metrics.gradientView,view);
   const actual=(await engine.readPixels({surfaceId:result.surface.id,revision:result.surface.revision})).pixels.data;
   if(answers.has(method)){assert.deepEqual(actual,answers.get(method));assert.equal(result.metrics.analysisCacheHit,true);}else answers.set(method,actual);
   await engine.releaseSurface(result.surface.id);
  }
  for(const[a,b]of[['sobel','scharr'],['sobel','krawetz'],['scharr','krawetz']])assert.notDeepEqual(answers.get(a),answers.get(b),a+'/'+b);
 }finally{await engine.dispose();assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(engine.capabilities().memory.retainedBytes,0);}
});
