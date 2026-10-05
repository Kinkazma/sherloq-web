import fs from 'node:fs/promises';
import makeModule from '../.build/cloning-features-native-orb.mjs';
import {cluster,std32} from '../experiments/cloning/post.js';
const base=new URL('../.build/cloning-study/',import.meta.url),m=await makeModule();
const read=async(file,Type)=>{const b=await fs.readFile(new URL(file,base));return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const ref=JSON.parse(await fs.readFile(new URL('primitives-reference.json',base))),data=await read('norm-primitives.f64',Float64Array);
let normDifferences=0,maxNormError=0;
for(let i=0;i<data.length;i+=3){const n=m._features_norm(data[i],data[i+1]);normDifferences+=n!==data[i+2];maxNormError=Math.max(maxNormError,Math.abs(n-data[i+2]));}
const stats=[];for(const r of ref.stats){const value=std32(await read(r.file,Float32Array));stats.push({...r,actual:value,exact:value===r.std});}
const geometry=[];for(const r of ref.geometry){const v=cluster(Float64Array.from(r.points),Float64Array.from(r.matches),r.distance,(x,y)=>m._features_norm(x,y));geometry.push({exact:['matches','lengths','groups'].every(k=>{const expected=r[k==='matches'?'filtered':k];return v[k].length===expected.length&&v[k].every((n,i)=>n===expected[i]);})});}
const result={normDifferences,maxNormError,stats,geometry};await fs.writeFile(new URL('primitives-results.json',base),JSON.stringify(result,null,2)+'\n');
console.log({normDifferences,maxNormError,stdDifferences:stats.filter(x=>!x.exact),geometryDifferences:geometry.filter(x=>!x.exact).length});
