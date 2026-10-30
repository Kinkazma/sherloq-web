// Development-only benchmark. No product calibration or stored profile.
import makeModule from '../../.build/cloning-features-native-orb.mjs';
import {cloningGeometry} from '../../src/cloning-post.js';
import {CloningGroupPool} from '../../src/cloning-group-pool.js';
import {Budget} from '../../src/cache.js';
const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)],ensure=(v,m)=>{if(!v)throw Error(m);};
const equal=(a,b)=>{ensure(a.length===b.length,'Result length');for(let i=0;i<a.length;i++)ensure(a[i]===b[i],'Result value '+i);};
const base='/.build/cloning-study/',read=async(file,Type=Uint8Array)=>new Type(await(await fetch(base+file)).arrayBuffer());
export async function cloningKernelBenchmark(){
  const started=performance.now(),m=await makeModule(),moduleLoadMs=performance.now()-started,reference=await(await fetch(base+'api-reference.json')).json(),images=await(await fetch(base+'reference.json')).json();
  const report={schema:1,scope:'Isolated development benchmark, three alternating useful samples. Preparation/copies inside timed kernel. Module load separate, first sample retained. No runtime calibration. Memory estimates are not RSS.',moduleLoadMs,matching:[],geometry:[],parallel:[]};
  for(const name of ['shapes','large-clone','large-checker']){
    const image=images.images.find(x=>x.name===name);if(!image)continue;
    const native=image.results.find(x=>x.algorithm===1&&x.mask==='all'),descriptor=await read(native.descriptors),count=descriptor.length/32,at=m._malloc(descriptor.length||1);m.HEAPU8.set(descriptor,at);
    try{for(const radius of [51,89.25,255]){
      const samples=[];let expected;
      for(let trial=0;trial<3;trial++)for(const kind of trial%2?['direct','bf-sort']:['bf-sort','direct']){
        const match=kind==='direct'?m._features_match_direct:m._features_match,t=performance.now(),parts=[];
        for(let start=0;start<count;start+=64){const n=match(at,count,32,radius,start,Math.min(64,count-start));ensure(n>=0,'Hamming failure');parts.push(m.HEAPF64.slice(m._features_matches()/8,m._features_matches()/8+n*3));}
        const length=parts.reduce((sum,p)=>sum+p.length,0),result=new Float64Array(length);let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}
        const elapsedMs=performance.now()-t;expected??=result;equal(result,expected);samples.push({trial,kind,elapsedMs});
      }
      const bf=median(samples.filter(x=>x.kind==='bf-sort').map(x=>x.elapsedMs)),direct=median(samples.filter(x=>x.kind==='direct').map(x=>x.elapsedMs));report.matching.push({name,count,radius,matches:expected.length/3,samples,bfMedianMs:bf,directMedianMs:direct,speedup:bf>0&&direct>0?bf/direct:null});
    }}finally{m._free(at);m._features_release();}
  }
  const chosen=reference.filter(x=>x.mask==='all'&&(x.image==='shapes'||x.image==='large-clone'||x.image==='large-checker')&&x.params.response===90&&x.params.minimum===5&&!x.params.showPoints&&!x.params.hideLines&&[20,35].includes(x.params.matching)&&x.params.distance===15);
  for(const item of chosen){
    const points=await read(item.prefix+'-points.f64',Float64Array),raw=await read(item.prefix+'-raw.f64',Float64Array),image=images.images.find(x=>x.name===item.image),samples=[];let expected;
    for(let trial=0;trial<3;trial++)for(const pairCache of trial%2?['on','off']:['off','on']){
      let admittedBytes=0;const t=performance.now(),result=await cloningGeometry(points,raw,item.params.distance/100*Math.min(image.width,image.height)/2,(x,y)=>m._features_norm(x,y),{pairCache,account:n=>{admittedBytes+=n;}}),elapsedMs=performance.now()-t;
      expected??=result;for(const key of ['matches','lengths','groups'])equal(result[key],expected[key]);samples.push({trial,pairCache,elapsedMs,admittedBytes});
    }
    if(raw.length/3>=1024){
      const parallelSamples=[];
      for(let trial=0;trial<3;trial++)for(const count of trial%2?[navigator.hardwareConcurrency,1]:[1,navigator.hardwareConcurrency]){
        const budget=new Budget(1024**3),pool=count>1?new CloningGroupPool(budget,{maxWorkers:count}):null,releases=[];
        try{
          const t=performance.now(),result=await cloningGeometry(points,raw,item.params.distance/100*Math.min(image.width,image.height)/2,(x,y)=>m._features_norm(x,y),{pairCache:'on',pool,poolMinimum:0,account:n=>{const release=budget.reserve(n);releases.push(release);return release;}}),elapsedMs=performance.now()-t;
          for(const key of ['matches','lengths','groups'])equal(result[key],expected[key]);parallelSamples.push({trial,count,elapsedMs,peakAccountedBytes:budget.peak,metrics:result.metrics});
        }finally{pool?.dispose();for(const release of releases)release();ensure(!budget.active&&!budget.retained,'Grouping benchmark cleanup');}
      }
      const single=median(parallelSamples.filter(x=>x.count===1).map(x=>x.elapsedMs)),parallel=median(parallelSamples.filter(x=>x.count>1).map(x=>x.elapsedMs));report.parallel.push({image:item.image,params:item.params,rawMatches:raw.length/3,samples:parallelSamples,singleMedianMs:single,parallelMedianMs:parallel,speedup:single>0&&parallel>0?single/parallel:null});
    }
    const direct=median(samples.filter(x=>x.pairCache==='off').map(x=>x.elapsedMs)),cached=median(samples.filter(x=>x.pairCache==='on').map(x=>x.elapsedMs));report.geometry.push({image:item.image,params:item.params,rawMatches:raw.length/3,groups:expected.lengths.length,groupIndices:expected.groups.length,samples,directMedianMs:direct,cachedMedianMs:cached,speedup:direct>0&&cached>0?direct/cached:null});
  }
  const bytes=await(await fetch('/.build/cloning-features-native-orb.wasm')).arrayBuffer();report.prototypeSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  return report;
}
