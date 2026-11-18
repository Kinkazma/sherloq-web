import {Budget} from '../src/cache.js';
import {wavelets} from '../src/wavelets.js';
import {waveletStreamMath} from '../src/wavelet-stream-math.js';
import {WaveletReconstructionGpu} from '../src/wavelet-reconstruction-gpu.js';
import {waveletResidentReconstruction} from '../src/wavelet-resident-reconstruction-gpu.js';
import {waveletGpuBanks} from '../src/wavelet-gpu-banks.js';
import {roundEven} from '../src/pixel-utils.js';

/** Full output comparisons, including every pixel and byte. The GPU computes
 * the complete native final stencil; ambiguous display boundaries are repaired
 * with the independently checked binary64 selected-pixel implementation. */
export async function waveletGpuNative16Qualification({names=wavelets,depths=[8,16],modes=['soft','hard','garrote','greater','less']}={}){
 const math=await waveletStreamMath(),budget=new Budget(256*1024**2),gpu=new WaveletReconstructionGpu(budget,{maxWorkers:1}),cases=[];
 try{for(const name of names){const filter=math.info(name,256,256).filterLength,width=Math.max(31,filter/2),height=Math.max(29,filter/2),count=width*height,bank=waveletGpuBanks[name],l1=Math.max(...bank.slice(2).map(row=>row.reduce((sum,v)=>sum+Math.abs(v),0)));
  for(const depth of depths)for(const mode of modes){const magnitude=depth===16?60000:250,bands=Array.from({length:4},(_,k)=>Float64Array.from({length:count},(_,i)=>Math.sin(i*1.7+k*3.1)*magnitude+(i%5)*1e-12)),maxima=bands.map(values=>values.reduce((maximum,v)=>Math.max(maximum,Math.abs(v)),0)),amplitude=Math.max(...maxima),errorBound=Math.max(2**-30,amplitude*filter*filter*l1*l1*2**-37);
   for(let k=1;k<4;k++)math.threshold(bands[k],maxima[k],31,mode);
   const [a,h,v,d]=bands,lo=math.up(a,v,width,height,name,1),hi=math.up(h,d,width,height,name,1),full=math.up(lo.values,hi.values,lo.width,lo.height,name,0),targetWidth=full.width-1,targetHeight=full.height-1,expected=new Uint8Array(targetWidth*targetHeight*3);let actual,ambiguous=0;
   for(let y=0;y<targetHeight;y++)for(let x=0;x<targetWidth;x++){const value=depth===16?roundEven((full.values[y*full.width+x]&65535)/257):full.values[y*full.width+x]&255,at=(y*targetWidth+x)*3;expected[at]=expected[at+1]=expected[at+2]=value;}
   const used=await waveletResidentReconstruction(gpu,a,h,v,d,width,height,name,{targetWidth,targetHeight,inputDepth:depth,errorBound,required:true,consume:(bytes,indices)=>{ambiguous=indices.length;const corrected=math.finalPixels(a,h,v,d,width,height,name,indices,targetWidth);for(let i=0;i<indices.length;i++){const value=depth===16?roundEven((corrected[i]&65535)/257):corrected[i]&255,at=indices[i]*3;bytes[at]=bytes[at+1]=bytes[at+2]=value;}actual=bytes;}});
   if(!used||actual.length!==expected.length)throw Error('GPU output absent '+name+'/'+mode+'/'+depth);
   for(let i=0;i<expected.length;i++)if(actual[i]!==expected[i])throw Error(`Full native GPU mismatch ${name}/${mode}/${depth} byte${i}: ${actual[i]} vs ${expected[i]}`);
   cases.push({wavelet:name,mode,depth,pixels:targetWidth*targetHeight,ambiguous});
  }
 }
 const before=budget.total(),controller=new AbortController(),queue=gpu.device.queue,ownSubmit=Object.getOwnPropertyDescriptor(queue,'submit'),submit=queue.submit;let published=false,cancelled=false;
 Object.defineProperty(queue,'submit',{configurable:true,value(commands){submit.call(queue,commands);controller.abort();}});
 try{const values=Float64Array.from({length:31*29},(_,i)=>i%251);await waveletResidentReconstruction(gpu,values,values,values,values,31,29,'db2',{targetWidth:59,targetHeight:55,inputDepth:16,errorBound:1e-4,signal:controller.signal,required:true,consume(){published=true;}});}catch(error){if(error.code!=='CANCELLED')throw error;cancelled=true;}
 finally{if(ownSubmit)Object.defineProperty(queue,'submit',ownSubmit);else delete queue.submit;}
 if(!cancelled||published||gpu.active||gpu.pending.size||budget.total()!==before)throw Error('GPU cancellation did not acknowledge all transaction owners');
 return {status:'passed',cases,cancellation:'submitted GPU work retired without publishing; complete transaction credits refunded after queue acknowledgement',metrics:{...gpu.metrics}};
 }finally{await gpu.dispose();if(budget.total()!==0)throw Error('GPU qualification owners survive: '+budget.total());}
}

export async function waveletGpuTiledQualification(){
 const {segmentedWavelet}=await import('../src/segmented-wavelet.js'),{contiguousSurface}=await import('../src/image-sources.js'),{createRgb16Bank}=await import('../src/rgb16-surface.js'),width=2051,height=1153,cases=[];
 for(const depth of [8,16]){const budget=new Budget(512*1024**2),Data=depth===16?Uint16Array:Uint8Array,data=Data.from({length:width*height*3},(_,i)=>(i*73+Math.floor(i/7)*19)%(depth===16?65536:256));let bank,surface,cpu,gpu;
  try{if(depth===16){bank=await createRgb16Bank({width,height,budget,sourceDepth:12,storage:'memory',color:{primaries:'srgb',transfer:'srgb'}});await bank.writeBand({y:0,rows:height,data:new Uint8Array(data.buffer)});surface=await bank.seal();}else surface=contiguousSurface({width,height,format:'rgb8',data},budget);
   const image={surface},params={wavelet:'db8',threshold:35},options={budget,profile:{maxWorkers:1}},started=performance.now();cpu=await segmentedWavelet(image,params,{...options,backend:'cpu'});const cpuMs=performance.now()-started,cpuWindow=await cpu.surface.readWindow(),expected=cpuWindow.pixels.data.slice();cpuWindow.release();await cpu.surface.dispose();const gpuStart=performance.now();gpu=await segmentedWavelet(image,params,{...options,cache:cpu.waveletCache,backend:'auto'});const gpuMs=performance.now()-gpuStart;if(gpu.metrics.backend!=='webgpu'||gpu.metrics.gpuReconstructionCalls<6)throw Error('Tiled GPU path was not executed '+depth+' '+JSON.stringify(gpu.metrics));const actual=await gpu.surface.readWindow();try{for(let i=0;i<expected.length;i++)if(expected[i]!==actual.pixels.data[i])throw Error(`Tiled GPU ${depth}-bit byte${i}: ${actual.pixels.data[i]} vs ${expected[i]}`);}finally{actual.release();}
   const original=await surface.readWindow();try{if(original.pixels.data.length!==data.length)throw Error('Original source extent changed');for(let i=0;i<data.length;i++)if(original.pixels.data[i]!==data[i])throw Error('Original source changed '+depth+'/'+i);}finally{original.release();}cases.push({depth,sourceDepth:depth===16?12:8,width,height,cpuMs,gpuMs,metrics:gpu.metrics});
  }finally{await cpu?.surface.dispose();await gpu?.surface.dispose();await cpu?.waveletCache.dispose();if(bank)await bank.dispose();else await surface?.dispose();if(budget.total())throw Error('Tiled qualification owners survive '+depth+': '+budget.total());}
 }
 return {status:'passed',cases};
}
