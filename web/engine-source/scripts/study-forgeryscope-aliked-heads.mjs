import {study} from './m2-browser-study.mjs';
await study('forgeryscope-aliked-heads',async provider=>{
  const {environment,compare}=await import('/experiments/forgeryscope/study-runtime.js');
  const {ort,tensor,session}=await environment(provider);
  const base='/.build/forgeryscope/';
  const ref=await(await fetch(base+'aliked-heads-reference.json')).json();
  const denseRef=await(await fetch(base+'aliked-blot-dense-reference.json')).json();
  const wasm=await(await import(base+'prepare.mjs')).default();
  const records=[],sessions={};
  const report={provider,graphs:ref.graphs,runtime:ort.env.versions,records};
  try{
    for(const [name,g] of Object.entries({...ref.graphs,dense:denseRef}))sessions[name]=await session(base,g);
    for(const c of ref.cases)for(const composed of [false,true]){
      const owned=[];
      const keep=x=>{owned.push(...Object.values(x));return x;};
      try{
        const source=keep({image:await tensor(base,c.files.input)});
        const dense=composed?keep(await sessions.dense.run(source)):keep({features:await tensor(base,c.files.features),scores:await tensor(base,c.files.scores)});
        const {nms,mean}=keep(await sessions.detect.run({scores:dense.scores}));
        const n=dense.scores.data.length,ptrs=[];
        let indices;
        try{
          const alloc=n=>{const p=wasm._malloc(n);if(!p)throw Error('allocation');ptrs.push(p);return p;};
          const sp=alloc(n*4),np=alloc(n*4),ip=alloc(512*4);
          wasm.HEAPF32.set(dense.scores.data,sp/4);wasm.HEAPF32.set(nms.data,np/4);
          const count=wasm._fg_aliked_select(sp,np,dense.scores.dims[3],dense.scores.dims[2],mean.data[0],ip);
          if(count<0)throw Error('select');
          indices=new ort.Tensor('int64',BigInt64Array.from(wasm.HEAP32.subarray(ip/4,ip/4+count),BigInt),[count]);
          owned.push(indices);
        }finally{for(const p of ptrs)wasm._free(p);}
        const local=keep(await sessions.localize.run({scores:dense.scores,indices}));
        const described=keep(await sessions.describe.run({features:dense.features,keypoints:local.keypoints}));
        const record={case:c.id,composed};
        for(const [name,actual] of Object.entries({indices,...local,...described})){
          const expected=await tensor(base,c.files[name],name==='indices'?'int64':'float32');owned.push(expected);
          record[name]=compare(actual.data,expected.data);
          if(name==='indices'){
            const a=new Set(actual.data),b=new Set(expected.data);
            record.indices.missing=[...b].filter(x=>!a.has(x)).map(Number);
            record.indices.extra=[...a].filter(x=>!b.has(x)).map(Number);
          }
        }
        records.push(record);
      }finally{for(const t of owned)t.dispose();}
    }
  }catch(error){report.error=String(error);}finally{for(const s of Object.values(sessions))await s.release();}
  report.passed=!report.error&&records.every(r=>r.indices.differences===0&&['keypoints','confidence','dispersion','descriptors','offset'].every(k=>r[k].maxError<=1e-4));
  return report;
});
