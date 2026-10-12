// Development benchmark only. No preflight, warm-up or probes in product code.
import makeModule from '../../.build/cloning-fast.mjs';
import makeBaseline from '../../vendor/cloning/cloning.js';
const ensure=(ok,message)=>{if(!ok)throw Error(message);},median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
const read=async file=>{const response=await fetch('/.build/akaze-expanded-study/'+file);ensure(response.ok,file);return new Uint8Array(await response.arrayBuffer());};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export async function akazeFmaBenchmark(){
  const reference=JSON.parse(new TextDecoder().decode(await read('reference.json'))),t=performance.now(),candidate=await makeModule(),candidateInitializationMs=performance.now()-t,startBaseline=performance.now(),baseline=await makeBaseline(),baselineInitializationMs=performance.now()-startBaseline;
  const cases=[];
  for(const name of ['shapes','noise-320-256','large-noise']){
    const item=reference.images.find(x=>x.name===name),expected=item.results.find(x=>x.algorithm===2&&x.mask==='all'),gray=await read(item.gray),expectedPoints=await hash(await read(expected.points)),expectedDescriptors=await hash(await read(expected.descriptors)),samples=[];
    for(let repeat=0;repeat<3;repeat++)for(const fast of repeat%2?[true,false]:[false,true]){
      const m=fast?candidate:baseline;
      let start=performance.now();const input=m._malloc(gray.length);ensure(input,'Input allocation');m.HEAPU8.set(gray,input);const preparationMs=performance.now()-start;
      start=performance.now();const count=m._cloning_detect_akaze(input,0,item.width,item.height),calculationMs=performance.now()-start;
      ensure(count===expected.count,'Native count');start=performance.now();const points=m.HEAPU8.slice(m._cloning_result(),m._cloning_result()+count*56),descriptors=m.HEAPU8.slice(m._cloning_descriptors(),m._cloning_descriptors()+count*61),readbackMs=performance.now()-start;
      ensure(await hash(points)===expectedPoints&&await hash(descriptors)===expectedDescriptors,'Native values');
      m._cloning_release();m._free(input);samples.push({repeat,fast,preparationMs,calculationMs,readbackMs,heapCapacityBytes:m.HEAPU8.byteLength});
    }
    const softwareMedianMs=median(samples.filter(x=>!x.fast).map(x=>x.calculationMs)),candidateMedianMs=median(samples.filter(x=>x.fast).map(x=>x.calculationMs));
    cases.push({name,width:item.width,height:item.height,count:expected.count,samples,softwareMedianMs,candidateMedianMs,speedup:softwareMedianMs/candidateMedianMs});
  }
  return {schema:1,scope:'Offline arithmetic-only comparison against the unchanged product baseline binary; alternating order, three useful repeats per mode, all first runs retained. Includes staging/readback separately, not decoding, RPC, geometry, rendering or WordPress. No whole-pipeline gain claim.',candidateInitializationMs,baselineInitializationMs,wasmSha256:await hash(await(await fetch('/.build/cloning-fast.wasm')).arrayBuffer()),baselineWasmSha256:await hash(await(await fetch('/vendor/cloning/cloning.wasm')).arrayBuffer()),cases};
}
