import {createFrequencyGpuExperiment} from './frequency-gpu.js';
import {cvFrequencyBase,cvFrequencyMask,cvFrequencyView} from '../src/opencv.js';
const json=async name=>(await fetch('/fixtures/'+name)).json();
const bytes=async name=>new Uint8Array(await(await fetch('/fixtures/'+name)).arrayBuffer());
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
export async function frequencyGpuCheck(){
 const gpu=await createFrequencyGpuExperiment(),report={schema:1,experimental:true,initMs:gpu.initMs,adapter:gpu.adapter,masks:[],views:[],mismatches:[]},refs=await json('frequency-mask-reference.json');
 try{for(const filename of ['frequency-large-reference.json','frequency-reference.json']){const ref=await json(filename);for(const f of ref.cases){
  const base=await cvFrequencyBase({width:f.width,height:f.height,data:await bytes(f.file)}),mref=refs.cases.find(x=>x.name===f.name),expectedMasks=await bytes(mref.file),cache=new Map();
  for(const e of f.expected){const p=e.params,key=[p.split,p.smooth].join('/');let mask=cache.get(key);
   if(!mask){const t=performance.now(),input=await cvFrequencyMask(base.width,base.height,p.split,p.smooth),weights=await cvFrequencyMask(base.width,base.height,p.split,p.smooth,1),preparationMs=performance.now()-t,r=await gpu.run(input,base.width,base.height,weights);mask=r.data;cache.set(key,mask);
    const rm=mref.masks.find(x=>x.split===p.split&&x.smooth===p.smooth),native=new Float32Array(expectedMasks.buffer,expectedMasks.byteOffset+rm.offset,rm.length/4);let maximum=0;for(const x of mask)maximum=Math.max(maximum,x);let maxAbs=0,differing=0,zeroDecisionDifferences=0,sumSquares=0;for(let i=0;i<mask.length;i++){const value=Math.fround(mask[i]/maximum),delta=Math.abs(value-native[i]);maxAbs=Math.max(maxAbs,delta);sumSquares+=delta*delta;differing+=value!==native[i];zeroDecisionDifferences+=(value===0)!==(native[i]===0);}
    const s={fixture:f.name,split:p.split,smooth:p.smooth,pixels:mask.length,exact:differing===0,differing,maxAbs,rmse:Math.sqrt(sumSquares/mask.length),zeroDecisionDifferences,preparationMs,...r.metrics};report.masks.push(s);console.log('GPU mask',JSON.stringify(s));
   }
   const t=performance.now(),r=await cvFrequencyView(base,f.width,f.height,Object.values(p),{preparedMask:mask}),cpuReconstructionMs=performance.now()-t,actual=await Promise.all(r.frames.slice(0,4).map(x=>hash(x.data))),s={fixture:f.name,params:p,images:actual.map((x,i)=>x===e.sha256[i]),zeroExact:r.zeroPercent===e.zeroPercent,cpuReconstructionMs};report.views.push(s);if(!s.images.every(Boolean)||!s.zeroExact)report.mismatches.push(s);
  }
 }}return report;}finally{gpu.dispose();}
}
