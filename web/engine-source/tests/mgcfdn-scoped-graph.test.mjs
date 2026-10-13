import test from 'node:test';import assert from 'node:assert/strict';
import {onnxNode,onnxInput,onnxInitializer,readOnnxGraph} from '../src/onnx-scoped-graph.js';
import {scopeMgcfdnOnnx,prepareMgcfdnScientificScope,mgcfdnGridSide} from '../src/mgcfdn-scoped-graph.js';
import {Budget} from '../src/cache.js';
import * as ort from '../vendor/d2prl/ort.wasm.min.mjs';
const P='/network/multi_granularity_consistency_module/',S='sherloq_scientific_mgcf/',out=s=>P+s+'_output_0';
const join=parts=>{const b=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){b.set(p,at);at+=p.length;}return b;},vi=n=>{const b=[];do{const c=n%128;n=Math.floor(n/128);b.push(c+(n?128:0));}while(n);return Uint8Array.from(b);},field=(n,b)=>join([vi(n*8+2),vi(b.length),b]);
function fixture(){
 const side=16,n=256,nodes=[],constants=[],add=(name,op,inputs,attrs=[])=>{const outputs=name==='TopK'?[out(name),P+'TopK_output_1']:[out(name)];nodes.push(onnxNode({name:P+name,opType:op,inputs,outputs,attributes:attrs}));return outputs[0];},ints=(name,values)=>{constants.push(onnxInitializer(name,7,[values.length],BigInt64Array.from(values,BigInt)));return name;};
 const grid=ints('grid',[1,n,side,side]),flat=ints('flat',[1,n,n]),context=ints('context',[1,256,n]),k=ints('k',[40]);
 constants.push(onnxInitializer('alpha',1,[],Float32Array.of(1.75)),onnxInitializer('epsilon',1,[],Float32Array.of(1e-8)),onnxInitializer('axes',7,[1],BigInt64Array.of(1n)));
 const gaussian=Float32Array.from({length:n*n},(_,i)=>{const y=Math.floor(i/n),x=i%n,dy=Math.floor(y/side)-Math.floor(x/side),dx=y%side-x%side;return Math.fround(1-Math.exp(-(dx*dx+dy*dy)/(2*(side*.05)**2)));});constants.push(onnxInitializer('gaussian',1,[1,n,side,side],gaussian));
 add('Reshape','Identity',['p']);add('Reshape_1','Identity',['q']);add('MatMul','MatMul',[out('Reshape'),out('Reshape_1')]);add('Reshape_2','Reshape',[out('MatMul'),grid]);for(const name of ['Shape_1','Shape_2','Shape_3','Shape_4'])add(name,'Shape',[out('Reshape_2')]);
 add('Cast_1','Identity',['gaussian']);add('Mul_3','Mul',[out('Cast_1'),out('Reshape_2')]);add('Reshape_5','Reshape',[out('Mul_3'),flat]);add('Mul_4','Mul',[out('Reshape_5'),'alpha']);add('Softmax','Softmax',[out('Mul_4')],[{name:'axis',type:'INT',value:-1}]);add('Softmax_1','Softmax',[out('Mul_4')],[{name:'axis',type:'INT',value:-2}]);add('Mul_5','Mul',[out('Softmax'),out('Softmax_1')]);add('Reshape_6','Identity',[out('Mul_5')]);add('Reshape_7','Reshape',[out('Reshape_6'),grid]);add('Reshape_8','Identity',[k]);add('TopK','TopK',[out('Reshape_7'),out('Reshape_8')],[{name:'axis',type:'INT',value:-3}]);add('ReduceSum','ReduceSum',[out('Reshape_7'),'axes'],[{name:'keepdims',type:'INT',value:1}]);add('Add','Add',[out('ReduceSum'),'epsilon']);add('Div_3','Div',[out('Reshape_7'),out('Add')]);add('Reshape_9','Reshape',['f3',context]);add('Reshape_10','Reshape',[out('Div_3'),flat]);add('MatMul_1','MatMul',[out('Reshape_9'),out('Reshape_10')]);
 const inputs=[onnxInput('p',1,[1,n,640]),onnxInput('q',1,[1,640,n]),onnxInput('f3',1,[1,256,side,side])],outputs=[onnxInput(out('TopK'),1,[1,40,side,side]),onnxInput(out('MatMul_1'),1,[1,256,n])];
 return {gaussian,bytes:join([Uint8Array.of(8,8),field(7,join([...nodes.map(v=>field(1,v)),...constants.map(v=>field(5,v)),...inputs.map(v=>field(11,v)),...outputs.map(v=>field(12,v))])),field(8,Uint8Array.of(16,13))])};
}
const data=()=>({p:Float32Array.from({length:256*640},(_,i)=>Math.fround(Math.sin(i*.031)*.02)),q:Float32Array.from({length:640*256},(_,i)=>Math.fround(Math.cos(i*.023)*.03)),f3:Float32Array.from({length:256*256},(_,i)=>Math.fround(Math.sin(i*.071)*.25))});
async function run(bytes,values,indices){
 const session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false}),feeds={p:new ort.Tensor('float32',values.p,[1,256,640]),q:new ort.Tensor('float32',values.q,[1,640,256]),f3:new ort.Tensor('float32',values.f3,[1,256,16,16])};let outputs;
 if(indices)feeds[S+'indices']=new ort.Tensor('int64',indices,[indices.length]);
 try{outputs=await session.run(feeds);return {topk:outputs[out('TopK')].data.slice(),context:outputs[out('MatMul_1')].data.slice()};}finally{for(const v of [...Object.values(feeds),...Object.values(outputs??{})])v.dispose();await session.release();}
}
ort.env.logLevel='error';ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths={mjs:new URL('../vendor/d2prl/factory.mjs',import.meta.url).href,wasm:new URL('../vendor/d2prl/ort-wasm-simd-threaded.wasm',import.meta.url).href};
test('MGCF graph preserves original bytes/learned fields, gathers before both correlations, and scatters only O(M) query indices',()=>{
 const {bytes}=fixture(),original=bytes.slice(),before=readOnnxGraph(bytes),result=scopeMgcfdnOnnx(bytes,{side:16,count:83}),after=readOnnxGraph(result.bytes);assert.deepEqual(bytes,original);assert.equal(result.metadata.pairIndexAllocation,0);assert.equal(result.metadata.queryIndexElements,'scopeCount');assert.deepEqual(scopeMgcfdnOnnx(bytes,{side:16,count:7}).bytes,result.bytes);
 for(const old of before.initializers)assert.deepEqual(after.initializers.find(v=>v.name===old.name).raw,old.raw);
 assert.equal(after.nodes.filter(v=>v.opType==='ScatterND').length,2);assert(after.nodes.filter(v=>v.opType==='ScatterND').every(v=>v.inputs[1]===S+'query_indices'));
 assert(after.nodes.filter(v=>v.opType==='MatMul').every(v=>v.inputs.some(i=>i.startsWith(S))));assert.equal(after.nodes.some(v=>v.outputs.includes(out('MatMul'))),false);
 assert.throws(()=>scopeMgcfdnOnnx(bytes,{side:16,count:256}),{code:'INVALID_INPUT'});assert.throws(()=>scopeMgcfdnOnnx(result.bytes,{side:16,count:83}),{code:'INVALID_INPUT'});
});
test('real pinned ORT operators ignore every excluded source/target feature before TopK and attention, including M below original K',async()=>{
 const {bytes}=fixture(),values=data();
 for(const count of [83,7]){const indices=BigInt64Array.from({length:count},(_,i)=>BigInt(i*3)),admitted=new Set(Array.from(indices,Number)),patched=scopeMgcfdnOnnx(bytes,{side:16,count}),original=data(),expected=await run(patched.bytes,values,indices);
  for(let i=0;i<256;i++)if(!admitted.has(i)){for(let c=0;c<640;c++){original.p[i*640+c]=1000;original.q[c*256+i]=-2000;}for(let c=0;c<256;c++)original.f3[c*256+i]=3000;}
  const actual=await run(patched.bytes,original,indices);assert.deepEqual(actual,expected,'Excluded latent features reached a native matching operator');
  assert(expected.topk.every(Number.isFinite)&&expected.context.every(Number.isFinite));for(let i=0;i<256;i++)for(let c=0;c<40;c++)if(!admitted.has(i)||c>=count)assert.equal(expected.topk[c*256+i],0);for(let i=0;i<256;i++)if(!admitted.has(i))for(let c=0;c<256;c++)assert.equal(expected.context[c*256+i],0);
 }
});
test('scoped matrix outputs agree with an independent admitted-domain Gaussian/dual-softmax/TopK/attention oracle',async()=>{
 const {bytes,gaussian}=fixture(),values=data(),indices=BigInt64Array.from({length:41},(_,i)=>BigInt(i*5)),actual=await run(scopeMgcfdnOnnx(bytes,{side:16,count:41}).bytes,values,indices),m=indices.length,dots=new Float32Array(m*m),left=new Float32Array(m*m),right=new Float32Array(m*m),consistency=new Float32Array(m*m);let maximum=0;
 for(let a=0;a<m;a++)for(let b=0;b<m;b++){const i=Number(indices[a]),j=Number(indices[b]);let dot=0;for(let c=0;c<640;c++)dot=Math.fround(dot+Math.fround(values.p[i*640+c]*values.q[c*256+j]));dots[a*m+b]=Math.fround(Math.fround(dot*gaussian[i*256+j])*1.75);}
 for(let a=0;a<m;a++){const soft=(target)=>{let max=-Infinity,sum=0;for(let b=0;b<m;b++)max=Math.max(max,dots[target?b*m+a:a*m+b]);for(let b=0;b<m;b++)sum+=Math.exp(dots[target?b*m+a:a*m+b]-max);for(let b=0;b<m;b++)(target?right:left)[target?b*m+a:a*m+b]=Math.fround(Math.exp(dots[target?b*m+a:a*m+b]-max)/sum);};soft(false);soft(true);}
 for(let i=0;i<m*m;i++)consistency[i]=Math.fround(left[i]*right[i]);
 for(let query=0;query<m;query++){const j=Number(indices[query]),sorted=Array.from({length:m},(_,a)=>consistency[a*m+query]).sort((a,b)=>b-a);for(let c=0;c<40;c++)maximum=Math.max(maximum,Math.abs(actual.topk[c*256+j]-sorted[c]));let mass=0;for(let a=0;a<m;a++)mass=Math.fround(mass+consistency[a*m+query]);mass=Math.fround(mass+Math.fround(1e-8));for(let c=0;c<256;c++){let v=0;for(let a=0;a<m;a++)v=Math.fround(v+Math.fround(values.f3[c*256+Number(indices[a])]*Math.fround(consistency[a*m+query]/mass)));maximum=Math.max(maximum,Math.abs(actual.context[c*256+j]-v));}}
 assert(maximum<1e-6,'Admitted-domain oracle error: '+maximum);
});
test('empty domain is refused before model/CNN work; full-domain hooks preserve the original model route and free budget',async()=>{
 const sha='a'.repeat(64),s={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',status:'ready',sourceSha256:sha,width:256,height:256,fingerprint:'b'.repeat(64),regions:[{x0:0,y0:0,x1:256,y1:256}],excluded:[]},context={scope:s,width:256,height:256,sourceSha256:sha,bounds:[0,0,256,256]},budget=new Budget(1024**2),model={id:'mgcfdn-8b99302269be',variant:'MGCFDN'};
 assert.equal(mgcfdnGridSide(model),40);assert.equal(mgcfdnGridSide({id:'mgcfdn-16-81',variant:'MGCFDN 16×16'}),16);assert.equal(await prepareMgcfdnScientificScope(undefined),null);
 const d=await prepareMgcfdnScientificScope(context,{model,budget});assert.equal(d.partial,false);assert.equal(d.metadata.bypassOriginal,true);assert.equal(d.count,1600);d.release();assert.equal(budget.total(),0);
 s.excluded=[[[0,0],[256,0],[256,256],[0,256]]];await assert.rejects(prepareMgcfdnScientificScope(context,{model,budget}),{code:'NEURAL_SCOPE_BELOW_GRID'});assert.equal(budget.total(),0);
});
