import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import makeModule from '../.build/cloning-features-akaze-area.mjs';
import {cluster,commands,std32} from '../experiments/cloning/post.js';
const base = new URL('../.build/akaze-pipeline-study/', import.meta.url);
const reference = JSON.parse(await fs.readFile(new URL('reference.json', base)));
const records = JSON.parse(await fs.readFile(new URL('api-reference.json', base)));
const wasmSha256=createHash('sha256').update(await fs.readFile(new URL('../.build/cloning-features-akaze-area.wasm',import.meta.url))).digest('hex');
const m = await makeModule();
const direct=process.argv.includes('--direct-matches'),match=direct?m._features_match_direct:m._features_match;
const load = file => fs.readFile(new URL(file, base));
const allocate = data => { const p=m._malloc(Math.max(1, data.byteLength)); m.HEAPU8.set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength),p); return p; };
const read = async(file,Type=Float64Array)=>{const b=await load(file);return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const compare=(a,b)=>{let differences=0,maxError=0;for(let i=0;i<Math.max(a.length,b.length);i++){differences+=a[i]!==b[i];maxError=Math.max(maxError,Math.abs(a[i]-b[i]));}return {differences,maxError,length:a.length,nativeLength:b.length};};
const proof=[];
for(const record of records) {
  if(record.error){proof.push({...record,status:'expected-native-refusal-not-checked-by-prototype'});continue;}
  const image=reference.images.find(x=>x.name===record.image),native=image.results.find(x=>x.mask===record.mask),p=record.params;
  const source=allocate(await load(image.gray)),rgb=allocate(await load(image.rgb)),mask=native.maskFile?allocate((await load(native.maskFile)).map(value=>value>0?1:0)):0;
  const total=m._features_detect(source,mask,image.width,image.height,2),count=m._features_select(p.response);
  const points=m.HEAPF64.slice(m._features_points()/8,m._features_points()/8+count*7),desc=m._features_descriptors(),raw=[];
  for(let start=0;start<count;start+=64){const n=match(desc,count,61,p.matching/100*255,start,Math.min(64,count-start));if(n<0)throw Error('matching '+n);const at=m._features_matches()/8;for(let i=0;i<n*3;i++)raw.push(m.HEAPF64[at+i]);}
  const geometry=cluster(points,raw,p.distance/100*Math.min(image.width,image.height)/2,(x,y)=>m._features_norm(x,y));
  const drawing=commands(points,geometry,p),std=std32(drawing.angles);
  const anglePointer=allocate(drawing.angles),commandPointer=allocate(drawing.commands),pointPointer=allocate(points);
  const regions=std===null?0:std<.1?1:m._features_count(anglePointer,drawing.angles.length);
  if(!m._features_render(rgb,image.width,image.height,pointPointer,count,commandPointer,drawing.commands.length/8,p.showPoints,p.hideLines))throw Error('render');
  const output=m.HEAPU8.slice(m._features_output(),m._features_output()+image.width*image.height*3);
  const result={image:record.image,mask:record.mask,params:p,stats:{total,filtered:count,matches:geometry.matches.length/3,clusters:geometry.lengths.filter(n=>n>=p.minimum).length,regions},nativeStats:record.stats,std,nativeStd:record.std,points:compare(points,await read(record.prefix+'-points.f64')),raw:compare(raw,await read(record.prefix+'-raw.f64')),filtered:compare(geometry.matches,await read(record.prefix+'-filtered.f64')),lengths:compare(geometry.lengths,await read(record.prefix+'-lengths.u32',Uint32Array)),groups:compare(geometry.groups,await read(record.prefix+'-groups.u32',Uint32Array)),angles:compare(drawing.angles,await read(record.prefix+'-angles.f32',Float32Array)),pixels:compare(output,await read(record.prefix+'.rgb',Uint8Array))};
  proof.push(result);
  for(const pointer of [source,rgb,mask,anglePointer,commandPointer,pointPointer])if(pointer)m._free(pointer);m._features_release();
  console.log(record.prefix,record.image,JSON.stringify(result.stats),Object.entries(result).filter(([k,v])=>v?.differences).map(([k,v])=>[k,v.differences]));
}
const failures=proof.filter(row=>!row.status&&(JSON.stringify(row.stats)!==JSON.stringify(row.nativeStats)||row.std!==row.nativeStd||Object.values(row).some(value=>value?.differences)));
await fs.writeFile(new URL(direct?'pipeline-direct-results.json':'pipeline-results.json',base),JSON.stringify({wasmSha256,maskNormalization:'positive-to-one',heapFallbacks:m._features_heap_fallbacks(),failures:failures.length,records:proof},null,2)+'\n');
if(failures.length)throw new Error(`${failures.length} AKAZE pipeline comparisons failed.`);
