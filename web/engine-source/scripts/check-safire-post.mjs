import {readFile,writeFile} from 'node:fs/promises';
import create from '../vendor/research-post/post.js';
const base=new URL('../.build/m3/learned/',import.meta.url),read=async(n,T=Float32Array)=>{const b=await readFile(new URL(n,base));return new T(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const m=await create({wasmMemory:new WebAssembly.Memory({initial:256,maximum:32768})}),ref=JSON.parse(await readFile(new URL('safire-post-reference.json',base))),owned=[];
const alloc=n=>{const p=m._malloc(n);if(!p)throw Error('allocation');owned.push(p);return p;},put=a=>{const p=alloc(a.byteLength);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
const diff=(a,b)=>{let differences=0,maximum=0;for(let i=0;i<a.length;i++){differences+=a[i]!==b[i];maximum=Math.max(maximum,Math.abs(a[i]-b[i]));}return {values:a.length,differences,maximum};};
try {
 const features=put(await read('safire-features.f32')),masks=put(await read('safire-prompts-4-lowMasks.f32')),means=alloc(4*256*4),areas=alloc(16),counts=[];
 for(let i=0;i<4;i++)counts.push(m._safire_proposal(features,masks+i*65536*4,means+i*256*4,areas+i*4));
 const report={counts,expectedCounts:ref.counts,means:diff(m.HEAPF32.slice(means/4,means/4+1024),await read('safire-proposal-means.bin')),areas:diff(m.HEAPU32.slice(areas/4,areas/4+4),await read('safire-proposal-areas.bin',Uint32Array)),cases:[]};
 const n=1024*1024,prob=alloc(n*4*4),map=alloc(n*4),labels=alloc(n);
 for(const c of ref.cases){if(m._safire_maps(masks,areas,c.channels,+c.binary,prob,map,labels)!==1)throw Error('maps');report.cases.push({channels:c.channels,binary:c.binary,probabilities:diff(m.HEAPF32.slice(prob/4,prob/4+c.channels*n),await read(c.files.probabilities)),map:diff(m.HEAPF32.slice(map/4,map/4+n),await read(c.files.map)),labels:diff(m.HEAPU8.slice(labels,labels+n),await read(c.files.labels,Uint8Array))});}
 await writeFile(new URL('../docs/m3-safire-post-proof.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{for(const p of owned)m._free(p);}
