// Actual TNT checkpoint executor. Only RGB and verified model parameters enter
// this graph; reference activations belong exclusively to development recipes.
import mathFactory from '../../vendor/segmentation/tnt-math.js';
import {createTntLinear} from './tnt-linear.js';
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
const HEAP = 64 * 1024 ** 2, STAGING = 96 * 1024 ** 2;

export function validateTntBackbone(graph) {
  requireValue(graph?.schema === 1 && graph.kind === 'tnt-native-order-v1' && graph.epsilon === 1e-5 && graph.parameters && JSON.stringify(graph.inputShape) === '[1,3,256,256]', 'Pinned TNT backbone');
  const expected = {'patch_embed.proj.weight': [40,3,7,7], 'patch_embed.proj.bias': [40], cls_token: [1,1,640], outer_pos: [1,257,640], inner_pos: [1,16,40]};
  const norm = (name, width) => { expected[name+'.weight'] = [width]; expected[name+'.bias'] = [width]; };
  const linear = (name, ci, co, bias) => { expected[name+'.weight'] = [co,ci]; if (bias) expected[name+'.bias'] = [co]; };
  norm('proj_norm1',640); norm('proj_norm2',640); norm('norm',640); linear('proj',640,640,true);
  for (let i=0;i<12;i++) {
    const name='blocks.'+i;
    for (const side of ['inner','outer']) {
      const width=side==='inner'?40:640, prefix=name+'.'+side;
      norm(prefix+'_norm1',width); norm(prefix+'_norm2',width);
      linear(prefix+'_attn.qk',width,2*width,false); linear(prefix+'_attn.v',width,width,false); linear(prefix+'_attn.proj',width,width,true);
      linear(prefix+'_mlp.fc1',width,4*width,true); linear(prefix+'_mlp.fc2',4*width,width,true);
    }
    norm(name+'.proj_norm1',640); norm(name+'.proj_norm2',640); linear(name+'.proj',640,640,false);
  }
  requireValue(Object.keys(graph.parameters).length === Object.keys(expected).length, 'TNT parameter set');
  for (const [name,shape] of Object.entries(expected)) {
    const spec=graph.parameters[name];
    requireValue(spec?.dtype==='float32' && JSON.stringify(spec.shape)===JSON.stringify(shape) && spec.bytes===shape.reduce((n,v)=>n*v,4) && /^[a-f0-9]{64}$/.test(spec.sha256) && spec.file==='parameters/'+spec.sha256+'.bin', 'TNT parameter identity: '+name);
  }
}

export async function createTntBackbone({budget, graph, read, maxWorkers=1, backend='cpu'}) {
  requireValue(['cpu','webgpu'].includes(backend),'TNT backend');
  validateTntBackbone(graph); requireValue(budget?.reserve && typeof read==='function', 'TNT parameter reader and shared budget');
  let freeHeap, module, pool, busy=false, disposed=false;
  try { pool=backend==='webgpu'?await (await import('./tnt-linear-gpu.js')).createTntLinearGpu({budget}):createTntLinear({budget,maxWorkers}); freeHeap=budget.reserve(HEAP); module=await mathFactory(); requireValue(module.HEAPU8.length===HEAP,'TNT bounded heap'); }
  catch (error) { pool?.dispose(); freeHeap?.(); throw error; }
  return {
    async run(input, {signal,onProgress}={}) {
      if (busy) throw new EngineError('BUSY','TNT backbone busy');
      requireValue(!disposed && input instanceof Float32Array && input.length===3*256**2 && input.every(Number.isFinite),'Prepared TNT RGB input'); checkAbort(signal); busy=true;
      let staging, release, complete=false, parameterLoadMs=0, attentionMatmulMs=0, workers=0, gpuWriteBytes=0, gpuReadBytes=0, gpuPeakBufferBytes=0, gpuAllocations=0, stamp=performance.now(); const began=stamp, f=Math.fround;
      const checkpoint=async()=>{checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}};
      const param=async name=>{
        checkAbort(signal); const spec=graph.parameters[name],started=performance.now();let bytes;
        try { bytes=await read(spec,{signal}); } finally { parameterLoadMs+=performance.now()-started; }
        checkAbort(signal); requireValue(bytes instanceof Uint8Array && bytes.byteLength===spec.bytes && bytes.byteOffset%4===0,'Verified TNT parameter bytes');
        const values=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);requireValue(values.every(Number.isFinite),'Finite TNT parameters');return values;
      };
      // STAGING admits all live JS tensors, their parameter fetch/hash copies and
      // temporary layout conversions. Per-worker clones/heaps are charged by pool.
      const op=async(arrays,length,run)=>{
        const pointers=[];
        try {
          const put=n=>{const p=module._malloc(n);requireValue(p>0,'TNT math heap admission');pointers.push(p);return p;};
          const inputs=arrays.map(a=>{const p=put(a.byteLength);module.HEAPF32.set(a,p/4);return p;}),out=put(length*4);
          await run(inputs,out);checkAbort(signal);const result=module.HEAPF32.slice(out/4,out/4+length);await checkpoint();return result;
        } finally { pointers.forEach(p=>module._free(p)); }
      };
      const transpose=(x,rows,columns)=>{const y=new Float32Array(x.length);for(let r=0;r<rows;r++)for(let c=0;c<columns;c++)y[c*rows+r]=x[r*columns+c];return y;};
      const linear=async(name,x,ci)=>{
        const spec=graph.parameters[name+'.weight'],co=spec.shape[0],weight=await param(name+'.weight'),hasBias=!!graph.parameters[name+'.bias'],bias=hasBias?await param(name+'.bias'):new Float32Array(co),rows=x.length/ci;
        const result=await pool.run({input:transpose(x,rows,ci),weight,bias,rows,ci,co,hasBias},{signal,onProgress:progress=>onProgress?.({...progress,layer:name})});
        try { workers=Math.max(workers,result.workers);gpuWriteBytes+=result.timings?.gpuWriteBytes??0;gpuReadBytes+=result.timings?.gpuReadBytes??0;gpuPeakBufferBytes=Math.max(gpuPeakBufferBytes,result.gpu?.peakAccountedBytes??0);gpuAllocations+=result.gpu?.allocations??0;return transpose(result.data,co,rows); } finally { result.release(); }
      };
      const norm=async(name,x,width)=>op([x,await param(name+'.weight'),await param(name+'.bias')],x.length,([a,b,c],o)=>module._tnt_norm(a,b,c,x.length/width,width,1e-5,o));
      const gelu=async x=>op([x],x.length,async([a],o)=>{for(let first=0;first<x.length;first+=65536){module._tnt_gelu(a+first*4,Math.min(65536,x.length-first),o+first*4);await checkpoint();}});
      const add=(a,b,offset=0)=>{requireValue(a.length-offset===b.length,'TNT residual shape');const out=a.slice();for(let i=0;i<b.length;i++)out[offset+i]=f(a[offset+i]+b[i]);return out;};
      const matmul=async(a,b,batch,rows,k,n,transposed)=>{
        const began=performance.now();
        try{
          // Offline paired measurements retain the small inner products on CPU;
          // only the two outer products repay GPU layout/transfer costs.
          if(backend==='webgpu'&&batch===10&&rows===257){
            const result=await pool.matmul({a,b,batch,rows,k,n,transposed},{signal,onProgress});
            try{gpuWriteBytes+=result.timings.gpuWriteBytes;gpuReadBytes+=result.timings.gpuReadBytes;gpuPeakBufferBytes=Math.max(gpuPeakBufferBytes,result.gpu.peakAccountedBytes);gpuAllocations+=result.gpu.allocations;return result.data;}finally{result.release();}
          }
          return await op([a,b],batch*rows*n,async([ap,bp],out)=>{
            // Bound uninterrupted CPU work without splitting dot products.
            const group=Math.max(1,Math.floor(1024**2/(rows*k*n)));
            for(let first=0;first<batch;first+=group){const count=Math.min(group,batch-first);module._tnt_matmul(ap+first*rows*k*4,bp+first*k*n*4,count,rows,k,n,Number(transposed),0,out+first*rows*n*4);await checkpoint();}
          });
        }finally{attentionMatmulMs+=performance.now()-began;}
      };
      const attention=async(name,x,batch,n,channels,heads)=>{
        const d=channels/heads,qk=await linear(name+'.qk',x,channels),vLinear=await linear(name+'.v',x,channels),q=new Float32Array(x.length),k=new Float32Array(x.length),v=new Float32Array(x.length);
        for(let b=0;b<batch;b++)for(let h=0;h<heads;h++)for(let t=0;t<n;t++)for(let c=0;c<d;c++){const dst=((b*heads+h)*n+t)*d+c,src=(b*n+t)*channels+h*d+c;q[dst]=qk[(b*n+t)*channels*2+h*d+c];k[dst]=qk[(b*n+t)*channels*2+channels+h*d+c];v[dst]=vLinear[src];}
        const scores=await matmul(q,k,batch*heads,n,d,n,true),scale=f(d**-.5);for(let i=0;i<scores.length;i++)scores[i]=f(scores[i]*scale);
        const probability=await op([scores],scores.length,([a],o)=>module._tnt_softmax(a,batch*heads*n,n,o)),context=await matmul(probability,v,batch*heads,n,n,d,false),y=new Float32Array(x.length);
        for(let b=0;b<batch;b++)for(let h=0;h<heads;h++)for(let t=0;t<n;t++)for(let c=0;c<d;c++)y[(b*n+t)*channels+h*d+c]=context[((b*heads+h)*n+t)*d+c];
        return linear(name+'.proj',y,channels);
      };
      const mlp=async(name,x,c)=>linear(name+'.fc2',await gelu(await linear(name+'.fc1',x,c)),c*4);
      try {
        staging=budget.reserve(STAGING);release=budget.reserve(640*16*16*4);
        let inner=await op([input,await param('patch_embed.proj.weight'),await param('patch_embed.proj.bias')],256*16*40,([a,b,c],o)=>module._tnt_patch(a,b,c,o));
        const innerPos=await param('inner_pos');for(let i=0;i<inner.length;i++)inner[i]=f(inner[i]+innerPos[i%640]);
        let projected=await norm('proj_norm2',await linear('proj',await norm('proj_norm1',inner,640),640),640),outer=new Float32Array(257*640);outer.set(await param('cls_token'));outer.set(projected,640);outer=add(outer,await param('outer_pos'));projected=null;
        for(let i=0;i<12;i++){
          const name='blocks.'+i;
          inner=add(inner,await attention(name+'.inner_attn',await norm(name+'.inner_norm1',inner,40),256,16,40,4));
          inner=add(inner,await mlp(name+'.inner_mlp',await norm(name+'.inner_norm2',inner,40),40));
          outer=add(outer,await norm(name+'.proj_norm2',await linear(name+'.proj',await norm(name+'.proj_norm1',inner,640),640),640),640);
          outer=add(outer,await attention(name+'.outer_attn',await norm(name+'.outer_norm1',outer,640),1,257,640,10));
          outer=add(outer,await mlp(name+'.outer_mlp',await norm(name+'.outer_norm2',outer,640),640));
          onProgress?.({phase:'tnt-backbone',completed:i+1,total:12});await checkpoint();
        }
        const final=await norm('norm',outer,640),data=transpose(final.slice(640),256,640);requireValue(data.every(Number.isFinite),'Finite TNT backbone');checkAbort(signal);complete=true;
        return {data,shape:[1,640,16,16],workers,...(backend==='webgpu'?{gpu:{devices:1,allocations:gpuAllocations,peakAccountedBytes:gpuPeakBufferBytes,accounting:'explicit GPU buffers; excludes driver/compiler residency',errors:[]}}:{}),timings:{parameterLoadMs,attentionMatmulMs,executionMs:performance.now()-began-parameterLoadMs,gpuWriteBytes,gpuReadBytes},release};
      } finally { staging?.(); if(!complete)release?.(); busy=false; }
    },
    dispose(){requireValue(!busy,'TNT backbone busy');if(disposed)return;disposed=true;pool.dispose();module=null;freeHeap();}
  };
}
