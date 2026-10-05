import {Budget} from '../../src/cache.js';
import {SiftPool} from '../../src/sift-paged.js';
import {siftG2nnMatch} from '../../src/sift-g2nn.js';
import {groupSiftContinuations,siftContinuationDependencyRadius} from '../../src/sift-continuations.js';
const MiB=1024**2,ensure=(value,message)=>{if(!value)throw Error(message??'SIFT oracle assertion failed');},equal=(actual,expected)=>ensure(actual===expected,`${actual} !== ${expected}`);
export async function continuationFixture(create,wasm,layers,w,h){
 const module=await create({wasmBinary:wasm,print(){},printErr(){}}),width=Math.ceil(w/2),height=Math.ceil(h/2),p=module._malloc(width*height),gray=Uint8Array.from({length:width*height},(_,i)=>{const x=i%width,y=i/width|0;return ((x*13+y*23)^((x>>3)*47+(y>>3)*29))&255;});module.HEAPU8.set(gray,p);equal(module._m3_sift_initial(p,width,height),1);const base=new Float32Array(w*h),initial=module._m3_sift_initial_data()/4;for(let y=0;y<h;y++)base.set(module.HEAPF32.subarray(initial+y*width*2,initial+y*width*2+w),y*w);module._m3_sift_release();module._free(p);
 const input=module._malloc(base.byteLength);module.HEAPF32.set(base,input/4);equal(module._m3_sift_build(input,w,h,layers),1);module._m3_sift_force_continuation(1);ensure(module._m3_sift_detect(0,0,w,h,0,0,w,h,0,.001)>=0);const n=module._m3_sift_escape_count(),seedPointer=module._m3_sift_escapes()/4,all=module.HEAP32.slice(seedPointer,seedPointer+n*6);ensure(n>64,'Fixture must exercise many real extrema');module._m3_sift_release();module._free(input);
 const lengths=[];for(let step=1;step<layers+3;step++)lengths.push(module._m3_sift_kernel(layers,step));const radius=siftContinuationDependencyRadius(lengths,layers);ensure(radius.total<=radius.halo,'Canonical halo does not contain full Gaussian plus orientation dependency');
 const seeds=Array.from({length:64},(_,i)=>{const at=Math.floor(i*(n-1)/63)*6;return {id:i,state:[all[at],all[at+1],all[at+2],0]};});
 // Cover global border handling and both sides of canonical cell boundaries,
 // explicitly using every layer at each location, including non-extremum
 // candidates that exercise Newton rejection and continuation paths.
 const anchors=[[5,5],[w-6,5],[5,h-6],[w-6,h-6],[255,255],[256,256],[255,256],[256,255],[127,256],[w-6,256],[256,5],[256,h-6]];
 for(const [x,y] of anchors)for(let layer=1;layer<=layers;layer++)seeds.push({id:seeds.length,state:[x,y,layer,0]});
 return {base,w,h,seeds,radius};
}

export async function continuationRun(input,{layers,wasm,canonical,backend='cpu',reuseInput=false}){
  const budget=new Budget(768*MiB),owner={profile:{maxWorkers:3},workers:new Set()},pool=new SiftPool(owner,{budget,heap:96*MiB,cost:()=>160*MiB,wasm,layers,contrast:.001,provider:backend,backend}),outputs=new Array(input.seeds.length),windowAllocations=[];const register=budget.registerBacking.bind(budget);budget.registerBacking=(kind,bytes,options)=>{if(options?.label==='sift-input-window')windowAllocations.push(bytes);return register(kind,bytes,options);};let pending=input.seeds,rounds=0,escapes=0;
  try{await pool.open(3);while(pending.length){ensure(rounds++<8,'A continuation made no useful Newton progress');const again=[],groups=canonical?groupSiftContinuations(pending,input.w,input.h,{canonical:true}):pending.map((seed,index)=>({...groupSiftContinuations([seed],input.w,input.h)[0],indices:[index]}));
   await pool.run(groups,async(group,{allocateInput})=>{const {x0,y0,x1,y1}=group,width=x1-x0,height=y1-y0,pixels=reuseInput?allocateInput(Float32Array,width*height):new Float32Array(width*height);for(let y=0;y<height;y++)pixels.set(input.base.subarray((y+y0)*input.w+x0,(y+y0)*input.w+x1),y*width);return {kind:canonical?'refine-batch':'refine',cacheKey:[layers,x0,y0,x1,y1].join(':'),input:pixels,width,height,x0,y0,globalWidth:input.w,globalHeight:input.h,octave:0,...(canonical?{states:Int32Array.from(group.states.flat())}:{state:group.states[0]})};},async(result,group)=>{
    for(let i=0;i<group.indices.length;i++){const seed=pending[group.indices[i]],status=canonical?result.statuses[i]:result.status,state=Array.from(canonical?result.states.subarray(i*4,i*4+4):result.state),points=canonical?result.points.subarray(result.offsets[i],result.offsets[i+1]):result.points;if(status===1){escapes++;again.push({id:seed.id,state});}else outputs[seed.id]={status,state,bits:Array.from(new Uint32Array(points.buffer,points.byteOffset,points.length))};}
   });pending=again.sort((a,b)=>a.id-b.id);
  }
  const builds=pool.metrics.pyramidBuilds,hits=pool.metrics.pyramidCacheHits;
  // Compare the original native selection/ranking and G2NN result as well as
  // per-seed output. The input is assembled in seed order; it is never sorted
  // by this oracle to disguise missing or reordered orientations.
  const packed=new Float32Array(Uint32Array.from(outputs.flatMap(value=>value.bits)).buffer);let selected,descriptors;
  await pool.run([0],async()=>({kind:'select',points:packed,width:Math.ceil(input.w/2),height:Math.ceil(input.h/2),regions:[],excluded:[],limit:100,family:'SIFT-G2NN',scale:1,zoneCount:1,independentZone:null}),async value=>{selected={points:value.points.slice(),descriptorPoints:value.descriptorPoints.slice(),members:value.members.slice(),totalFeatures:value.totalFeatures};});
  await pool.run([0],async(_,{allocateInput})=>{const pixels=reuseInput?allocateInput(Float32Array,input.base.length):input.base.slice();if(reuseInput)pixels.set(input.base);return {kind:'describe',input:pixels,width:input.w,height:input.h,x0:0,y0:0,points:selected.descriptorPoints};},async value=>{descriptors=value.descriptors.slice();});
  const allocations=[],matches=await siftG2nnMatch({...selected,descriptors,zoneCount:1,radius:10000,minimum:0,ratio:1},{reserveMemory:bytes=>{const release=budget.reserve(bytes);allocations.push(release);return release;},backend:'cpu'});for(const release of allocations)release();
  return {canonical,outputs,builds,hits,windowAllocations,executions:pool.metrics.executions,radius:input.radius,rounds,escapes,ranking:{points:Array.from(selected.points),members:Array.from(selected.members),descriptors:Array.from(new Uint32Array(descriptors.buffer)),pairs:Array.from(matches.pairs),pairSearchRegions:Array.from(matches.pairSearchRegions),totalFeatures:selected.totalFeatures}};
  }finally{pool.close();equal(budget.total(),0);for(const domain of Object.values(budget.resourceSnapshot().domains))equal(domain.reservedBytes,0);}
}
