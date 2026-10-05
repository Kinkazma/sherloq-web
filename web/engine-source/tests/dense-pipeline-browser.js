import {DenseCopyEngine} from '../src/dense-copy.js';
import {renderDenseCopy} from '../src/dense-view.js';
import {Budget} from '../src/cache.js';
import {pairedBiomes} from '../.build/m3-geometry/src/copy-biomes.js';
import {verifyCopyGeometry,createGeometryKernel} from '../.build/m3-geometry/src/copy-geometry.js';
import {copyPalette} from '../.build/m3-geometry/src/copy-subbiomes.js';
const assert=(v,m)=>{if(!v)throw new Error(m);};
const read=async(file,T)=>new T(await(await fetch('/.build/dense-pipeline-reference/'+file)).arrayBuffer());
const canonical=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)&&!ArrayBuffer.isView(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const difference=(a,b)=>{if(a.length!==b.length)return {length:[a.length,b.length]};let count=0,max=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i]){count++;max=Math.max(max,Math.abs(a[i]-b[i]));}return {count,max};};
export async function densePipelineBrowserTest(){
 const manifest=await(await fetch('/.build/dense-pipeline-reference/manifest.json')).json(),budget=new Budget(1024*1024**2),cases=[];
 for(const kind of ['translation','reflection']){
  const image={width:74,height:62,data:await read(kind+'.rgb',Uint8Array)},engine=new DenseCopyEngine(image,budget,{geometry:{pairedBiomes,verifyCopyGeometry,createGeometryKernel,copyPalette},profile:{maxWorkers:2}});
  try{for(const c of manifest.filter(c=>c.kind===kind)){
   const r=await engine.analyze({profile:c.profile,patch:4,iterations:2,limit:400,radius:100,minimum:10,threshold:.3,texture:2,tolerance:15,model:'Similarity'});
   const fields={};for(const [key,T]of Object.entries({points:Float32Array,pairs:Float64Array,pair_search_regions:Int32Array,colors:Uint8Array})){if(c.files[key])fields[key]=difference(r[key],await read(c.files[key].file,T));}
   for(const [key,d] of Object.entries(fields))assert(d.count===0,`${kind}/${c.profile}/${key}: ${JSON.stringify(d)}`);
   const modelsEqual=canonical(r.models)===canonical(c.models),basesEqual=canonical(r.bases)===canonical(c.bases);
   assert(modelsEqual,'Native models differ');
   for(const v of c.views){const [low,high,minimum,chosen,circles,lines,points,areas,hidden]=v.style;const view=await renderDenseCopy(image,r,{low,high,minimum,chosen,circles,lines,points,areas,hidden},{budget});try{assert(difference(view.pixels.data,await read(v.file,Uint8Array)).count===0,'Rendered dense pixels differ: '+c.profile);assert(canonical(view.visible)===canonical(v.visible)&&canonical(view.legend)===canonical(v.legend),'Visible selection differs');}finally{view.release();}}
   const groupEqual=JSON.stringify(r.groups.map(g=>Array.from(g)))===JSON.stringify(c.groups);assert(groupEqual&&basesEqual,'Groups or bases differ');assert(r.dense_count===c.dense_count&&r.dense_consistent_count===c.dense_consistent_count,'Dense counts differ');cases.push({modelsEqual,basesEqual,kind,profile:c.profile,groups:r.groups.length,nativeGroups:c.groups.length,groupEqual,fields,denseCount:[r.dense_count,c.dense_count],consistentCount:[r.dense_consistent_count,c.dense_consistent_count],metrics:r.metrics});r.release();
  }
   const params={profile:manifest.filter(c=>c.kind===kind).at(-1).profile,patch:4,iterations:2,limit:400,radius:100,minimum:10,threshold:.3,texture:2,tolerance:15,model:'Similarity'};
   const retained=await engine.analyze(params);assert(retained.metrics.cache.field,'Refilter failed to reuse fields');
   const stop=new AbortController();let aborted=false;try{await engine.analyze(params,{signal:stop.signal,onProgress:p=>{if(p.phase==='dense-geometry')stop.abort();}});}catch(error){aborted=error.code==='CANCELLED'||error.name==='AbortError';}assert(aborted,'Geometry cancellation failed');
   engine.clear();assert(retained.points.length>0&&budget.total()>0,'Result lost its lease on clear');retained.release();retained.release();
  }finally{engine.dispose();}assert(budget.total()===0,'Dense pipeline leaks after source disposal');
 }
 return {status:'native-correspondences-qualified',geometryCommit:'4046116',cases,peakAccountedBytes:budget.peak,remainingBytes:budget.total()};
}
