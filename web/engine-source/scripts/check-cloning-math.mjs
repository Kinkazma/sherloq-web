// Verify the bounded primitive ABI against all independent native stage files.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cloningDetect,cloningSelect,cloningMatches,cloningNormFunction,cloningRenderer,cloningRegionCount,cloningHeapBytes} from '../src/cloning-math.js';
import {cluster,commands,std32} from '../experiments/cloning/post.js';
const algorithm=process.argv.includes('--akaze')?'AKAZE':'ORB';
const base=new URL(algorithm==='AKAZE'?'../.build/akaze-pipeline-study/':'../.build/cloning-study/',import.meta.url);
const read=async(file,Type=Uint8Array)=>{const b=await fs.readFile(new URL(file,base));return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const ref=JSON.parse(await fs.readFile(new URL('reference.json',base))),cases=JSON.parse(await fs.readFile(new URL(algorithm==='AKAZE'?'api-reference.json':'pipeline-reference.json',base)));
const exact=(a,b,label)=>{if(a.length!==b.length)throw Error(label+' length');for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error(label+' '+i);};
const norm=await cloningNormFunction(),records=[],detectedCache=new Map();
const wasmSha256=createHash('sha256').update(await fs.readFile(new URL('../vendor/cloning/cloning.wasm',import.meta.url))).digest('hex');
for(const r of cases){
  if(r.error){records.push({...r,status:'native-refusal-needs-product-check'});continue;}
  const image=ref.images.find(x=>x.name===r.image),maskCase=image.results.find(x=>x.algorithm===1&&x.mask===r.mask),p=r.params;
  const pixels={width:image.width,height:image.height,format:'rgb8',data:await read(image.rgb)},key=r.image+'/'+r.mask;
  if(!detectedCache.has(key))detectedCache.set(key,await cloningDetect(await read(image.gray),maskCase.maskFile?(await read(maskCase.maskFile)).map(value=>algorithm==='AKAZE'?(value>0?1:0):value):null,image.width,image.height,{algorithm}));
  const detected=detectedCache.get(key),selected=await cloningSelect(detected,p.response),raw=await cloningMatches(selected.descriptors,p.matching/100*255,{descriptorSize:selected.descriptorSize}),geometry=cluster(selected.points,raw,p.distance/100*Math.min(image.width,image.height)/2,norm),drawing=commands(selected.points,geometry,p),std=std32(drawing.angles);
  const regions=std===null?0:std<.1?1:await cloningRegionCount(drawing.angles),stats={total:detected.total,filtered:selected.points.length/7,matches:geometry.matches.length/3,clusters:geometry.lengths.filter(n=>n>=p.minimum).length,regions};
  for(const [key,value]of Object.entries(stats))if(value!==r.stats[key])throw Error(r.prefix+' '+key);
  if(std!==r.std)throw Error(r.prefix+' std');
  exact(selected.points,await read(r.prefix+'-points.f64',Float64Array),'points');exact(raw,await read(r.prefix+'-raw.f64',Float64Array),'raw');exact(geometry.matches,await read(r.prefix+'-filtered.f64',Float64Array),'filtered');exact(geometry.lengths,await read(r.prefix+'-lengths.u32',Uint32Array),'lengths');exact(geometry.groups,await read(r.prefix+'-groups.u32',Uint32Array),'groups');exact(drawing.angles,await read(r.prefix+'-angles.f32',Float32Array),'angles');
  const renderer=await cloningRenderer(pixels);
  try{
    if(p.showPoints)for(let i=0;i<selected.points.length;i+=512*7)await renderer.points(selected.points.subarray(i,i+512*7));
    for(let i=0;i<drawing.commands.length;i+=128*8)await renderer.matches(drawing.commands.subarray(i,i+128*8),p.hideLines);
    exact(renderer.pixels(),await read(r.prefix+'.rgb'),'pixels');
  }finally{renderer.dispose();}
  records.push({prefix:r.prefix,image:r.image,mask:r.mask,params:p,stats});console.log(r.prefix,r.image);
}
await fs.writeFile(new URL('math-results.json',base),JSON.stringify({status:'exact primitive ABI; not a product qualification',algorithm,wasmSha256,nativeSourceSha256:ref.sourceSha256,heapCapacityBytes:cloningHeapBytes(),records},null,2)+'\n');
