import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import factory from '../.build/d2prl-neural-math/neural-math.js';
const root=new URL('../',import.meta.url),base=new URL('.build/d2prl-point-reduction/',root),hash=b=>createHash('sha256').update(b).digest('hex'),reference=JSON.parse(await readFile(new URL('reference.json',base))),module=await factory(),records=[];
const read=async e=>{const b=await readFile(new URL(e.file,base));if(hash(b)!==e.sha256)throw Error('Fixture identity');return b;};
for(const row of reference.records){
 const pointers=[];const allocate=bytes=>{const p=module._malloc(bytes);if(p)pointers.push(p);if(!p)throw Error('Allocation');return p;};
 try{
  const data=await Promise.all([row.input,row.weights,row.bias,row.output].map(read)),inputs=data.slice(0,3).map(b=>{const p=allocate(b.byteLength);module.HEAPU8.set(b,p);return p;}),op=allocate(row.output.bytes),expected=new Float32Array(data[3].buffer,data[3].byteOffset,data[3].byteLength/4),eb=new Uint32Array(expected.buffer,expected.byteOffset,expected.length),candidates=[];
  for(const mode of [1,2]){
   if(mode===2&&row.channels%32){candidates.push({mode,unsupported:true,different:expected.length,maxAbs:0,nonfinite:0});continue;}
   if(module._d2prl_pointconv_probe(...inputs,row.channels,row.outChannels,mode,0,op)!==1)throw Error('Point reduction rejected');
   const actual=module.HEAPF32.slice(op/4,op/4+expected.length),bits=new Uint32Array(actual.buffer);let different=0,maxAbs=0,nonfinite=0;
   for(let i=0;i<actual.length;i++){different+=bits[i]!==eb[i];maxAbs=Math.max(maxAbs,Math.abs(actual[i]-expected[i]));nonfinite+=!Number.isFinite(actual[i]);}
   candidates.push({mode,different,maxAbs,nonfinite});
  }
  records.push({name:row.name,channels:row.channels,outChannels:row.outChannels,elements:expected.length,candidates});
 }finally{pointers.forEach(p=>module._free(p));}
}
const geometries=new Map();for(const row of records){const key=row.channels+'/'+row.outChannels;if(!geometries.has(key))geometries.set(key,{channels:row.channels,outChannels:row.outChannels,scores:[{mode:1,different:0,maxAbs:0},{mode:2,different:0,maxAbs:0}]});const entry=geometries.get(key);for(const c of row.candidates){entry.scores[c.mode-1].different+=c.different;entry.scores[c.mode-1].maxAbs=Math.max(entry.scores[c.mode-1].maxAbs,c.maxAbs);}}
const layout=[...geometries.values()].map(g=>{g.scores.sort((a,b)=>a.different-b.different||a.maxAbs-b.maxAbs);return{...g,mode:g.scores[0].mode,exactOnIndependentCorpus:g.scores[0].different===0};});
const proof={schema:1,status:'experimental-candidate-comparison',scope:reference.scope,records,layout,node:process.version,build:JSON.parse(await readFile(new URL('.build/d2prl-neural-math/build.json',root)))};
await writeFile(new URL('docs/d2prl-point-reduction-candidates-node-proof.json',root),JSON.stringify(proof,null,2)+'\n');
await writeFile(new URL('fixtures/d2prl/point-reduction-layout.json',root),JSON.stringify({schema:1,status:'experimental-candidate',scope:'Offline independent numerical corpus selection, not runtime calibration or native equivalence; composed model still requires score and mask qualification',referenceSha256:hash(await readFile(new URL('reference.json',base))),records:layout},null,2)+'\n');
console.log(JSON.stringify(layout));
