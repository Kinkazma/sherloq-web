import {Budget} from '../../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../../src/source-region-geometry.js';
import {createRitaAnalyzer} from '../../src/rita-analyzer.js';
import {createRitaStrictAnalyzer} from '../../src/rita-strict-analyzer.js';
import {checkAbort,requireValue} from '../../src/errors.js';

// Controlled graph output, actual native RITA source preparation, FP32 stores,
// autoregression, EOS selection and four-field generation. No model is loaded.
export function controlledRitaNative(budget,{onNetwork,onResultRelease}={}){
 const calls=[],tensors=new Set(),segments={stages:[{},{},{},{}],assets:{},checkpointSha256:'a'.repeat(64)};
 function tensor(channels,height,width,values){
  const release=budget.reserve(values.byteLength);let closed=false;const value={channels,height,width,length:values.length,byteLength:values.byteLength,storage:'controlled-graph-lossless-float32',
   async readRows(top,rows,{signal}={}){checkAbort(signal);requireValue(!closed,'Controlled logits retired.');const n=rows*width,lease=budget.reserve(channels*n*4),data=new Float32Array(channels*n);for(let c=0;c<channels;c++)data.set(values.subarray((c*height+top)*width,(c*height+top+rows)*width),c*n);return{data,dims:[1,channels,rows,width],release:lease};},
   async readInto(out,offset=0,{signal}={}){checkAbort(signal);requireValue(!closed,'Controlled logits retired.');out.set(values.subarray(offset,offset+out.length));return out;},
   async readBytes(out,offset=0,{signal}={}){checkAbort(signal);requireValue(!closed,'Controlled logits retired.');out.set(new Uint8Array(values.buffer,values.byteOffset+offset,out.length));return out;},
   async dispose(){if(closed)return;closed=true;release();tensors.delete(value);}
  };tensors.add(value);return value;
 }
 const network=async(rgb,feedback,iteration,hooks)=>{
  checkAbort(hooks.signal);const source=await rgb.readRows(0,1,{signal:hooks.signal}),prior=await feedback.readRows(0,1,{signal:hooks.signal});let signature;
  try{signature=Math.abs(Math.round(source.data[0]*101))%2;calls.push({iteration,signature,firstNormalized:source.data[0],feedback:Array.from(prior.data.slice(0,4)),width:rgb.width,height:rgb.height});await onNetwork?.({rgb,feedback,iteration,hooks,calls});}finally{source.release();prior.release();}
  checkAbort(hooks.signal);const n=rgb.width*rgb.height,values=new Float32Array(4*n).fill(-2);
  for(let y=0;y<rgb.height;y++)for(let x=0;x<rgb.width;x++){const label=iteration===2?2:iteration===1&&x===0?2:signature;values[label*n+y*rgb.width+x]=3;}
  const logits=tensor(4,rgb.height,rgb.width,values);return{logits,executions:[{provider:'controlled-no-neural-graph',iteration}],async release(){await onResultRelease?.({logits,iteration});await logits.dispose();}};
 };
 const api=createRitaAnalyzer({segments,budget,network,createPool:()=>({cpuOnly:true,clear(){},dispose(){}})});return{api,calls,tensors};
}

export async function ritaStrictFixture({width=23,height=17,rectangles=[[2,3,8,10],[12,4,20,15]],exclusions=[[4,5,5,6]],poison=0,onNetwork,onRead,onResultRelease,budgetBytes=64*1024**2}={}){
 const budget=new Budget(budgetBytes),rgb=new Uint8Array(width*height*3),placeholder='b'.repeat(64),stateFor=async sha=>{const s=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});for(const b of rectangles)await s.add('acquisition',{x0:b[0],y0:b[1],x1:b[2],y1:b[3]});for(const b of exclusions)await s.add('exclusion',{x0:b[0],y0:b[1],x1:b[2],y1:b[3]});return s;};
 let state=await stateFor(placeholder),domain=await compileOriginalSourceRegions(state.snapshot());for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)rgb[(y*width+x)*3+c]=domain.contains(x-domain.origin[0],y-domain.origin[1])?(x*31+y*17+c*71)%256:poison;
 const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',rgb))].map(n=>n.toString(16).padStart(2,'0')).join('');state=await stateFor(sha);domain=await compileOriginalSourceRegions(state.snapshot());const reads=[],windows=new Set();
 const surface={descriptor:{id:'original/'+sha,revision:1,width,height,format:'rgb8'},async readWindow(rect,{signal}={}){
  checkAbort(signal);for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++)requireValue(domain.contains(x-domain.origin[0],y-domain.origin[1]),'An excluded Original pixel entered RITA input.');
  await onRead?.(rect);const data=new Uint8Array(rect.width*rect.height*3),lease=budget.reserve(data.byteLength);for(let y=0;y<rect.height;y++)data.set(rgb.subarray(((rect.y+y)*width+rect.x)*3,((rect.y+y)*width+rect.x+rect.width)*3),y*rect.width*3);reads.push({...rect});const window={pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release(){if(windows.delete(window))lease();}};windows.add(window);return window;
 }};
 const image={width,height,segmented:true,sha256:sha,surface},native=controlledRitaNative(budget,{onNetwork,onResultRelease}),api=createRitaStrictAnalyzer({budget,analyzer:native.api});return{api,native,image,rgb,state,domain,budget,reads,windows,run(options={}){return api.analyze(image,{}, {sourceRegionDomain:domain.descriptor,backend:'cpu',...options});},async close(){await api.dispose();}};
}
