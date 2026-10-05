import create from '../vendor/sparse-extract/sparse-extract.js';import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../.build/m3/',import.meta.url),read=async(file,T)=>{const b=await readFile(new URL(file,base));return new T(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));},m=await create(),rgb=await read('sparse-positive-rgb.bin',Uint8Array),bgr=rgb.slice(),mask=new Uint8Array(448*176).fill(255);
for(let i=0;i<rgb.length;i+=3){bgr[i]=rgb[i+2];bgr[i+2]=rgb[i];}for(let y=0;y<=60;y++)mask.fill(0,y*448,y*448+41);
const ip=m._malloc(bgr.length),mp=m._malloc(mask.length);
try{
 m.HEAPU8.set(bgr,ip);m.HEAPU8.set(mask,mp);const n=m._sparse_extract(ip,mp,448,176,300,5),p=m.HEAPF32.slice(m._sparse_points()/4,m._sparse_points()/4+n*7),d=m.HEAPF32.slice(m._sparse_descriptors()/4,m._sparse_descriptors()/4+n*128),ep=await read('sift-glue-extract-points.bin',Float64Array),ed=await read('sift-glue-extract-descriptors.bin',Float32Array),fields=Array.from({length:7},()=>({differences:0,max:0}));
 p.forEach((v,i)=>{fields[i%7].differences+=v!==ep[i];fields[i%7].max=Math.max(fields[i%7].max,Math.abs(v-ep[i]));});let differences=0,max=0;d.forEach((v,i)=>{differences+=v!==ed[i];max=Math.max(max,Math.abs(v-ed[i]));});const report={points:n,expected:ep.length/7,fields,descriptors:{differences,max}};await writeFile(new URL('../docs/m3-sift-glue-extract-proof.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{m._sparse_release();m._free(ip);m._free(mp);}
