import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {packDenseCorrespondences} from '../src/dense-correspondences.js';import {Budget} from '../src/cache.js';
const root=new URL('../.build/dense-correspondences-reference/',import.meta.url),read=async(file,T)=>{const b=await fs.readFile(new URL(file,root));return new T(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));},proof=[];
for(const c of JSON.parse(await fs.readFile(new URL('manifest.json',root)))){
 const fields=[];for(const [i,field]of c.fields.entries()){const arrays={};for(const [key,T]of Object.entries({targets:Int32Array,distancesSquared:Float32Array,allowed:Uint8Array,selected:Uint8Array,displayRows:Int32Array}))arrays[key]=await read(field.files[key],T);fields.push({...field,...arrays,context:{origin:field.origin,pairSearchRegion:c.compare?-1:i},pass:{id:0,method:c.method,patch:5},comparisons:BigInt(field.comparisons)});}
 const budget=new Budget(32*1024**2),packed=await packDenseCorrespondences({fields,params:{regions:c.regions,compare:c.compare,compact:!!c.guides.length,guides:c.guides,threshold:.3},distancePolicy:{gap:c.gap}},c,{budget}),actual=packed.passes[0];
 for(const [key,T]of Object.entries({points:Float32Array,pairs:Float64Array,members:Uint8Array}))assert.deepEqual(actual[key],await read(c.expected[key].file,T),c.method+'/'+c.name+'/'+key);
 assert.equal(actual.denseCount,c.denseCount);assert.equal(actual.consistentCount,c.consistentCount);packed.release();assert.equal(budget.total(),0);proof.push({method:c.method,name:c.name,points:actual.points.length/7,pairs:actual.pairs.length/4,exact:true});
}
await fs.writeFile(new URL('../docs/dense-correspondences-native-proof.json',import.meta.url),JSON.stringify({status:'passed',cases:proof},null,2)+'\n');console.log(JSON.stringify(proof));
