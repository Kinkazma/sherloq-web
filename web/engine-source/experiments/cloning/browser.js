// Offline browser qualification of the prototype, not a product adapter.
import makeModule from '../../.build/cloning-features-native-orb.mjs';
import {cluster,commands,std32} from './post.js';
export async function cloningStudyBrowser() {
  const base='/.build/cloning-study/',m=await makeModule();
  const matchBatch=m._features_match_direct;
  const json=async name=>{const r=await fetch(base+name);if(!r.ok)throw Error('Fixture '+name);return r.json();};
  const read=async(name,Type=Uint8Array)=>{const r=await fetch(base+name);if(!r.ok)throw Error('Fixture '+name);return new Type(await r.arrayBuffer());};
  const allocate=data=>{const p=m._malloc(Math.max(1,data.byteLength));if(!p)throw Error('Study allocation');m.HEAPU8.set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength),p);return p;};
  const equal=(a,b,name)=>{if(a.length!==b.length)throw Error(name+' length '+a.length+'/'+b.length);for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error(name+' value '+i+': '+a[i]+'/'+b[i]);};
  const fields=()=>{const n=m._features_select(currentResponse);if(n<0)throw Error('Select');return {n,points:m.HEAPF64.slice(m._features_points()/8,m._features_points()/8+n*7),desc:m._features_descriptors()};};
  const reference=await json('reference.json'),primitive=await json('primitives-reference.json'),matchReference=await json('matches-reference.json'),pipelines=await json('pipeline-reference.json');
  let detectorCases=0,selectionCases=0,matchingCases=0,pipelineCases=0,currentResponse=100;
  const detect=async(image,expected)=>{const source=allocate(await read(image.gray)),mask=expected.maskFile?allocate(await read(expected.maskFile)):0;try{return m._features_detect(source,mask,image.width,image.height,1);}finally{m._free(source);if(mask)m._free(mask);}};
  for(const image of reference.images)for(const expected of image.results.filter(x=>x.algorithm===1)){
    const count=await detect(image,expected);if(count!==expected.count)throw Error('Detection count '+image.name);
    equal(m.HEAPF64.subarray(m._features_points()/8,m._features_points()/8+count*7),await read(expected.points,Float64Array),'Detected points');
    equal(m.HEAPU8.subarray(m._features_descriptors(),m._features_descriptors()+count*32),await read(expected.descriptors),'Descriptors');
    detectorCases++;m._features_release();
  }
  for(const expected of matchReference.selection){
    const image=reference.images.find(x=>x.name===expected.image),native=image.results.find(x=>x.algorithm===1&&x.mask===expected.mask);
    await detect(image,native);currentResponse=expected.response;const actual=fields();
    if(actual.n!==expected.selected.length)throw Error('Selected count');
    const points=await read(native.points,Float64Array),desc=await read(native.descriptors);
    equal(actual.points,Float64Array.from(expected.selected.flatMap(i=>Array.from(points.subarray(i*7,i*7+7)))),'Selected points');
    equal(m.HEAPU8.subarray(actual.desc,actual.desc+actual.n*32),Uint8Array.from(expected.selected.flatMap(i=>Array.from(desc.subarray(i*32,i*32+32)))),'Selected descriptors');
    selectionCases++;m._features_release();
  }
  const match=(descriptor,count,stride,radius)=>{
    const values=[];for(let start=0;start<count;start+=64){const n=matchBatch(descriptor,count,stride,radius,start,Math.min(64,count-start));if(n<0)throw Error('Matching');const at=m._features_matches()/8;for(let i=0;i<n*3;i++)values.push(m.HEAPF64[at+i]);}return Float64Array.from(values);
  };
  for(const expected of matchReference.matching){
    const source=allocate(await read(expected.file));try{equal(match(source,expected.count,expected.stride,expected.radius),await read(expected.matches,Float64Array),'Ordered matching');}finally{m._free(source);m._features_release();}matchingCases++;
  }
  const norm=await read('norm-primitives.f64',Float64Array);
  for(let i=0;i<norm.length;i+=3)if(m._features_norm(norm[i],norm[i+1])!==norm[i+2])throw Error('Scalar norm');
  for(const expected of primitive.stats)if(std32(await read(expected.file,Float32Array))!==expected.std)throw Error('Angle std '+expected.file);
  for(const expected of primitive.geometry){const g=cluster(Float64Array.from(expected.points),Float64Array.from(expected.matches),expected.distance,(x,y)=>m._features_norm(x,y));equal(g.matches,expected.filtered,'Boundary filtered');equal(g.lengths,expected.lengths,'Boundary lengths');equal(g.groups,expected.groups,'Boundary groups');}
  const stats=[];
  for(const record of pipelines){
    const image=reference.images.find(x=>x.name===record.image),native=image.results.find(x=>x.algorithm===1&&x.mask===record.mask),p=record.params;
    const total=await detect(image,native);currentResponse=p.response;const {n:count,points,desc}=fields(),raw=match(desc,count,32,p.matching/100*255);
    const g=cluster(points,raw,p.distance/100*Math.min(image.width,image.height)/2,(x,y)=>m._features_norm(x,y)),drawing=commands(points,g,p),std=std32(drawing.angles);
    const rgb=allocate(await read(image.rgb)),anglePointer=allocate(drawing.angles),commandPointer=allocate(drawing.commands),pointPointer=allocate(points);
    try{
      const regions=std===null?0:std<.1?1:m._features_count(anglePointer,drawing.angles.length);
      if(!m._features_render(rgb,image.width,image.height,pointPointer,count,commandPointer,drawing.commands.length/8,p.showPoints,p.hideLines))throw Error('Render');
      const actual={total,filtered:count,matches:g.matches.length/3,clusters:g.lengths.filter(x=>x>=p.minimum).length,regions};
      for(const [key,value] of Object.entries(actual))if(value!==record.stats[key])throw Error('Pipeline '+record.prefix+' '+key);
      if(std!==record.std)throw Error('Pipeline std');
      equal(points,await read(record.prefix+'-points.f64',Float64Array),'Pipeline points');equal(raw,await read(record.prefix+'-raw.f64',Float64Array),'Pipeline raw');equal(g.matches,await read(record.prefix+'-filtered.f64',Float64Array),'Pipeline filtered');equal(g.lengths,await read(record.prefix+'-lengths.u32',Uint32Array),'Pipeline lengths');equal(g.groups,await read(record.prefix+'-groups.u32',Uint32Array),'Pipeline groups');equal(drawing.angles,await read(record.prefix+'-angles.f32',Float32Array),'Pipeline angles');equal(m.HEAPU8.subarray(m._features_output(),m._features_output()+image.width*image.height*3),await read(record.prefix+'.rgb'),'Pipeline RGB');
      stats.push({image:image.name,mask:record.mask,params:p,...actual});pipelineCases++;
    }finally{for(const pointer of [rgb,anglePointer,commandPointer,pointPointer])m._free(pointer);m._features_release();}
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  const wasm=await(await fetch('/.build/cloning-features-native-orb.wasm')).arrayBuffer();
  const binarySha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',wasm)),v=>v.toString(16).padStart(2,'0')).join('');
  return {status:'exact on declared synthetic prototype corpus; no product activation',matchingKernel:'direct-popcnt with pinned native equal-distance order',binarySha256,nativeSourceSha256:reference.sourceSha256,detectorCases,selectionCases,matchingCases,normCases:norm.length/3,stdCases:primitive.stats.length,boundaryCases:primitive.geometry.length,pipelineCases,heapFallbacks:m._features_heap_fallbacks(),heapCapacityBytes:m.HEAPU8.byteLength,stats};
}
