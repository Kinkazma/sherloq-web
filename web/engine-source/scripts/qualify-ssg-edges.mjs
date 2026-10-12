// Real compiled kernel qualification, no substituted contours.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
const dir=process.argv[2],input=process.argv[3],h=+process.argv[4],w=+process.argv[5],prefix=process.argv[6];
const shared=process.env.SSG_SHARED==='1',url=pathToFileURL(path.join(dir,shared?'edges-shared.mjs':'edges.mjs'));
const m=JSON.parse(await fs.readFile(path.join(dir,'forest-manifest.json'))),factory=(await import(url)).default;
const runtime=await factory({maximumHeapBytes:1024**3,wasmMemory:new WebAssembly.Memory({initial:512,maximum:16384,...(shared?{shared:true}:{})}),workerCount:shared?9:1,mainScriptUrlOrBlob:decodeURIComponent(url.pathname)});runtime._ssg_edges_set_team(shared?10:1);const pointers=[];
for(const a of m.arrays){const bytes=new Uint8Array(await fs.readFile(path.join(dir,a.file))),offset=10+new DataView(bytes.buffer,bytes.byteOffset).getUint16(8,true),p=runtime._malloc(a.dataBytes);if(!p)throw new Error('model malloc');runtime.HEAPU8.set(bytes.subarray(offset),p);pointers.push(p);}
if(runtime._ssg_edges_set_model(...pointers,m.nodes,m.arrays.find(x=>x.name==='eBins').shape[0],m.arrays.find(x=>x.name==='eBnds').shape[0]))throw new Error('model setup');
const rgb=new Uint8Array(await fs.readFile(input)),p=runtime._malloc(rgb.length);runtime.HEAPU8.set(rgb,p);const start=performance.now(),n=runtime._ssg_edges_detect(p,h,w,1);if(n<0)throw new Error('native status '+n);
for(const [name,pointer,size] of [['edge',runtime._ssg_edges_output(),n*4],['regular',runtime._ssg_edges_regular(),runtime._ssg_edges_channel_count()*4],['similar',runtime._ssg_edges_similar(),runtime._ssg_edges_channel_count()*4],['leaves',runtime._ssg_edges_leaves(),runtime._ssg_edges_leaf_count()*4]])await fs.writeFile(prefix+'-'+name+'.bin',runtime.HEAPU8.slice(pointer,pointer+size));
console.log(JSON.stringify({stage:'original-structured-forest-sharpen2',wallMs:performance.now()-start,heapBytes:runtime.HEAPU8.length,rows:h,columns:w,outputCount:n,shared}));runtime._ssg_edges_release();for(const p of pointers)runtime._free(p);runtime._free(p);runtime._ssg_edges_shutdown();
