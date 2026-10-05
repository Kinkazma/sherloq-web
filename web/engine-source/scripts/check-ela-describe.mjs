import {readFile,writeFile} from 'node:fs/promises';
import {createElaPeerScorer} from '../src/ela-peer-scores.js';
import {Budget} from '../src/cache.js';
import {coherentCellScores} from '../src/ela-cell-tools.js';
const prepared=new Map();
const base=new URL('../.build/ela-describe/',import.meta.url),{default:create}=await import(new URL('../vendor/ela-describe/describe.js',import.meta.url)),m=await create({wasmBinary:await readFile(new URL('../vendor/ela-describe/describe.wasm',import.meta.url))}),results=[];
for(const c of JSON.parse(await readFile(new URL('reference.json',base)))){
 const source=await readFile(new URL(c.source,base)),compressed=await readFile(new URL(c.compressed,base)),cols=Math.floor(c.width/c.block),rows=Math.floor(c.height/c.block),actual={content:[],profiles:[],usable:[],background:[]};
 for(let row=0;row<rows;row++){const y=row*c.block,lo=Math.max(0,y-8),hi=Math.min(c.height,y+c.block+8),a=source.subarray(lo*c.width*3,hi*c.width*3),b=compressed.subarray(lo*c.width*3,hi*c.width*3);const pa=m._malloc(a.length),pb=m._malloc(b.length),pc=m._malloc(cols*6*4),pp=m._malloc(cols*5*4),pu=m._malloc(cols),pg=m._malloc(cols*3*4);
 try{m.HEAPU8.set(a,pa);m.HEAPU8.set(b,pb);if(!m._ela_describe_row(pa,pb,c.width,hi-lo,y-lo,c.block,c.height,lo,pc,pp,pu,pg))throw Error('Describe failed');for(const [name,p,size] of [['content',pc,6],['profiles',pp,5],['background',pg,3]])actual[name].push(...m.HEAPF32.slice(p/4,p/4+cols*size));actual.usable.push(...m.HEAPU8.slice(pu,pu+cols));}finally{for(const p of [pa,pb,pc,pp,pu,pg])m._free(p);}
 }
 prepared.set(c.compressed+'/'+c.block,actual);
 const error={};for(const name of ['content','profiles','usable','background']){const expected=c[name].flat().map(Number);let changed=0,max=0;for(let i=0;i<expected.length;i++){changed+=Number(actual[name][i]!==expected[i]);max=Math.max(max,Math.abs(actual[name][i]-expected[i]));}error[name]={changed,max};}results.push({source:c.source,compressed:c.compressed,block:c.block,error});
}
await writeFile(new URL('proof.json',base),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));

const budget=new Budget(128*1024**2),scorer=createElaPeerScorer({budget,wasmBinary:await readFile(new URL('../vendor/ela-peers/peers.wasm',import.meta.url))}),scoreResults=[];
try{for(const c of JSON.parse(await readFile(new URL('groups.json',base)))){
 const cells=[70,75,80].map(q=>prepared.get(c.source.replace('.rgb','-'+q+'.rgb')+'/'+c.block)),n=c.rows*c.cols,content=Float32Array.from(cells[2].content),supported=Uint8Array.from(cells[2].usable),profiles=new Float32Array(n*15),background=new Float32Array(n*9);
 for(let i=0;i<n;i++)for(let q=0;q<3;q++){profiles.set(cells[q].profiles.slice(i*5,i*5+5),i*15+q*5);background.set(cells[q].background.slice(i*3,i*3+3),i*9+q*3);}
 const legacy=await scorer.score({...c,content,supported,profiles}),support=Uint8Array.from(legacy.peer_count,v=>v>=16),bg=await scorer.score({...c,kind:'background',content,supported:support,profiles:background}),coherent=await coherentCellScores({...c,supported:support,signed_scores:legacy.signed_scores}),score=Float32Array.from({length:n},(_,i)=>Math.max([...legacy.quality_scores.subarray(i*3,i*3+3)].sort((a,b)=>a-b)[1],coherent[i])),mask=Uint8Array.from(score,(v,i)=>support[i]&&Math.max(v,bg.background_score[i])>=2);
 try{const actual={quality_scores:legacy.quality_scores,signed_scores:legacy.signed_scores,peer_count:legacy.peer_count,coherent_score:coherent,score,mask,...Object.fromEntries(Object.keys(c.background).map(key=>[key,bg[key]]))},expected={...c,...c.background},error={};for(const [name,data]of Object.entries(actual)){const ref=expected[name].flat(4).map(Number);let changed=0,max=0;for(let i=0;i<ref.length;i++){changed+=Number(data[i]!==ref[i]);max=Math.max(max,Math.abs(data[i]-ref[i]));}error[name]={changed,max};}scoreResults.push({source:c.source,block:c.block,supported:support.reduce((a,b)=>a+b,0),selected:mask.reduce((a,b)=>a+b,0),error});}finally{legacy.release();bg.release();}
}}finally{scorer.dispose();}
await writeFile(new URL('scores-proof.json',base),JSON.stringify(scoreResults,null,2)+'\n');console.log(JSON.stringify(scoreResults));
