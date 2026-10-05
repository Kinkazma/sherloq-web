import {allocateTypedArray} from './allocation.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {serializeEngineError} from './errors.js';
import {createDenseSiftStreamMath} from './dense-sift-stream-math.js';
import {denseGray} from './dense-math.js';
let pending;
installWorkerMessageProtocol(self,async p=>{try{
 const output=(Type,length)=>p.output?new Type(p.output.buffer,p.output.byteOffset,length):allocateTypedArray(Type,length,{label:'sift-'+p.stage+'-output'});
 let result;
 if(p.stage==='transpose'){
  const input=new Uint32Array(p.values.buffer,p.values.byteOffset,p.values.length),values=output(Uint32Array,input.length);
  for(let x=0;x<p.width;x++)for(let y=0;y<p.height;y++)values.set(input.subarray((x*p.height+y)*8,(x*p.height+y+1)*8),(y*p.width+x)*8);
  result={values:new Float32Array(values.buffer,values.byteOffset,values.length),heapBytes:0};
 }else{
  const math=await(pending??=createDenseSiftStreamMath());
  if(p.stage==='gradients'){
   // The grayscale view is consumed by the native stage before the same output
   // bank receives the packed gradients. No extra full gradient copy escapes.
   const gray=denseGray(p.rgb,p.output?output(Float32Array,p.rgb.length/3):undefined),values=output(Float32Array,p.coreWidth*p.coreHeight*8),left=p.mirror?p.width-p.x-p.coreWidth:p.x;
   const g=math.gradients(gray,p.width,p.height,p.patch,p.mirror,native=>{for(let x=0;x<p.coreWidth;x++)for(let y=0;y<p.coreHeight;y++)for(let b=0;b<8;b++)values[(x*p.coreHeight+y)*8+b]=native[(b*p.height+p.y+y)*p.width+left+x];});
   result={values,weights:g.weights};
  }else if(p.stage==='columns'){
   const {length,axes}=p,input=output(Float32Array,p.values.length);
   for(let a=0;a<axes;a++)for(let i=0;i<length;i++)for(let b=0;b<8;b++)input[(i*axes+a)*8+b]=p.values[(a*length+i)*8+b];
   // The native kernel has staged input before returning its borrowed output;
   // overwrite the transferred input bank, then return that exact bank by ACK.
   math.columns(input,axes*8,length,p.patch,filtered=>{for(let a=0;a<axes;a++)for(let i=0;i<length;i++)for(let b=0;b<8;b++)p.values[(a*length+i)*8+b]=filtered[(i*axes+a)*8+b];});
   result={values:p.values};
  }else if(p.stage==='factors')result=math.factors(p.values,p.width,p.height,p.patch,p.weights,p.quarter,p.fullBounds,p.output);
  else throw Error('Unknown SIFT stream stage');
  result.heapBytes=math.heapBytes;
 }
 if(p.output){result.reusedInput=p.rgb??p.values;result.reusedOutput=p.output;}
 self.postMessage({result},[...new Set(Object.values(result).filter(ArrayBuffer.isView).map(v=>v.buffer))]);
 }catch(error){self.postMessage({error:serializeEngineError(error,'NUMERIC_RANGE')});}},{label:'dense-sift-stream-worker.js',onFailure:error=>self.postMessage({error:serializeEngineError(error)})});
