import {readFile,writeFile} from 'node:fs/promises';
import create from '../.build/m3/sift-extract/sift-extract.js';
const base=new URL('../.build/m3/',import.meta.url),reference=JSON.parse(await readFile(new URL('sift-extract.json',base))),m=await create();
const results=[];
for(const c of reference.cases){
 const bytes=await readFile(new URL(c.name+'.bgr',base)),p=m._malloc(bytes.length);m.HEAPU8.set(bytes,p);
 const n=m._sift_extract(p,0,c.width,c.height,c.limit),points=m.HEAPF32.slice(m._sift_points()/4,m._sift_points()/4+n*7),desc=m.HEAPF32.slice(m._sift_descriptors()/4,m._sift_descriptors()/4+n*128);
 // Buffers have byte offsets; use explicit byte views for oracle reads.
 const get=async name=>{const b=await readFile(new URL(name,base));return new Float32Array(b.buffer,b.byteOffset,b.length/4);};
 const ep=await get(c.name+'.points'),ed=await get(c.name+'.desc');
 let pm=0,dm=0,maxPoint=0;const fields=new Array(7).fill(0),descriptorExamples=[];for(let i=0;i<Math.min(ep.length,points.length);i++){if(points[i]!==ep[i]){pm++;fields[i%7]++;}maxPoint=Math.max(maxPoint,Math.abs(points[i]-ep[i]));}for(let i=0;i<Math.min(ed.length,desc.length);i++)if(desc[i]!==ed[i]){dm++;if(descriptorExamples.length<8)descriptorExamples.push([i,ed[i],desc[i]]);}
 const ee=await readFile(new URL(c.name+'.enlarged',base));let pre=0;for(let i=0;i<ee.length;i++)if(ee[i]!==m.HEAPU8[m._sift_prepared()+i])pre++;
 const grayDiff=[];for(const [stage,name] of [[0,'gray'],[1,'normalized']]){const expected=await readFile(new URL(c.name+'.'+name,base));let differences=0;for(let i=0;i<expected.length;i++)if(expected[i]!==m.HEAPU8[m._sift_gray(stage)+i])differences++;grayDiff.push(differences);}
 results.push({name:c.name,grayDifferences:grayDiff,preprocessingDifferences:pre,n,expected:c.count,pointDifferences:pm,fields,maxPoint,descriptorDifferences:dm,descriptorExamples});
 m._sift_release();m._free(p);
}
await writeFile(new URL('sift-extract-results.json',base),JSON.stringify(results,null,2)+'\n');console.log(results);
