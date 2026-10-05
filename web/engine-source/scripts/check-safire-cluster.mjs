import {readFile,writeFile} from 'node:fs/promises';import create from '../vendor/research-post/post.js';
const base=new URL('../.build/m3/learned/',import.meta.url),ref=JSON.parse(await readFile(new URL('safire-cluster-reference.json',base))),m=await create({wasmMemory:new WebAssembly.Memory({initial:256,maximum:32768})}),features=m._malloc(1024*256*4),labels=m._malloc(1024*4),report={initialCases:0,initialExact:true,cases:[]};
try{
 for(const [n,expected] of Object.entries(ref.initial)){m._safire_initial(+n,Math.min(+n,16),labels);report.initialExact&&=expected.every((v,i)=>v===m.HEAP32[labels/4+i]);report.initialCases++;}
 for(const c of ref.cases){const bytes=await readFile(new URL(c.file,base));m.HEAPU8.set(bytes,features);const iterationsOrClusters=c.kind==='kmeans'?m._safire_kmeans(features,c.count,c.groups,labels):m._safire_dbscan(features,c.count,c.eps,c.minimum,labels);let differences=0;for(let i=0;i<c.count;i++)differences+=m.HEAP32[labels/4+i]!==c.labels[i];report.cases.push({...c,labels:undefined,iterationsOrClusters,differences});}
 report.exact=report.initialExact&&report.cases.every(c=>!c.differences);await writeFile(new URL('../docs/m3-safire-cluster-proof.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{m._free(features);m._free(labels);}
