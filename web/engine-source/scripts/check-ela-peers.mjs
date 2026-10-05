import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../.build/ela-peers/',import.meta.url),{default:create}=await import(new URL('../vendor/ela-peers/peers.js',import.meta.url));const m=await create({wasmBinary:await readFile(new URL('../vendor/ela-peers/peers.wasm',import.meta.url))});
const results=[];
for(const item of JSON.parse(await readFile(new URL('reference.json',base)))){
 const points=Float64Array.from(item.points),query=Float64Array.from(item.query),count=query.length/6,pa=m._malloc(points.byteLength),qa=m._malloc(query.byteLength),da=m._malloc(count*item.k*8),ia=m._malloc(count*item.k*4);m.HEAPF64.set(points,pa/8);m.HEAPF64.set(query,qa/8);let tree;
 try{tree=m._ela_peers_create(pa,item.n,6);if(!tree||!m._ela_peers_query(tree,qa,count,item.k,da,ia))throw Error('KD call failed');const indices=m.HEAP32.slice(ia/4,ia/4+count*item.k),distances=m.HEAPF64.slice(da/8,da/8+count*item.k);let changed=0,error=0;for(let i=0;i<indices.length;i++){changed+=Number(indices[i]!==item.indices[i]);error=Math.max(error,Math.abs(distances[i]-item.distances[i]));}results.push({n:item.n,mode:item.mode,indicesChanged:changed,maxDistanceError:error});}
 finally{m._ela_peers_release(tree);for(const ptr of [pa,qa,da,ia])m._free(ptr);}
}
await writeFile(new URL('../docs/ela-peers-ckdtree-proof.json',import.meta.url),JSON.stringify(results,null,2)+'\n');console.log(results);
