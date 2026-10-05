import {createSegmentedBytes} from './segmented-bytes.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

/** Float32 NCHW with batch one, preserving the global channel/row order.
 * No tensor-sized allocation: only explicitly leased windows materialize.
 * The caller selects RAM or the shared temporary session according to its
 * complete live execution plan, including the next operation's workspace.
 */
export async function createNeuralTensor(channels,height,width,{budget,signal,...storageOptions}={}){
 const length=channels*height*width;
 requireValue([channels,height,width].every(x=>Number.isSafeInteger(x)&&x>0)&&Number.isSafeInteger(length*4),'Invalid neural tensor dimensions.');
 const store=await createSegmentedBytes(length*4,{...storageOptions,budget,signal});
 const spatial=height*width;let disposed=false;
 function range(offset,count){if(disposed)throw new EngineError('DISPOSED','Neural tensor disposed.');requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(count)&&offset>=0&&count>0&&offset<=spatial-count,'Invalid tensor spatial range.');}
 const bytes=data=>new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
 return {
  channels,height,width,length,byteLength:length*4,storage:store.storage,dims:[1,channels,height,width],
  async readTokens(offset,count,{signal}={}){
   range(offset,count);checkAbort(signal);const release=budget.reserve(channels*count*4);
   try{await controlCheckpoint(signal);const data=new Float32Array(channels*count);for(let c=0;c<channels;c++){checkAbort(signal);await store.readInto(bytes(data.subarray(c*count,(c+1)*count)),(c*spatial+offset)*4);}checkAbort(signal);return {data,dims:[1,channels,1,count],offset,count,release};}catch(e){release();throw e;}
  },
  async writeTokens(offset,count,data,{signal}={}){
   range(offset,count);requireValue(data instanceof Float32Array&&data.length===channels*count,'Invalid neural tensor payload.');checkAbort(signal);
   await controlCheckpoint(signal);for(let c=0;c<channels;c++){checkAbort(signal);await store.write(bytes(data.subarray(c*count,(c+1)*count)),(c*spatial+offset)*4);}checkAbort(signal);
  },
  async readRows(top,rows,options){requireValue(Number.isSafeInteger(top)&&Number.isSafeInteger(rows)&&top>=0&&rows>0&&top<=height-rows,'Invalid tensor row range.');const window=await this.readTokens(top*width,rows*width,options);window.dims=[1,channels,rows,width];window.top=top;return window;},
  writeRows(top,rows,data,options){requireValue(Number.isSafeInteger(top)&&Number.isSafeInteger(rows)&&top>=0&&rows>0&&top<=height-rows,'Invalid tensor row range.');return this.writeTokens(top*width,rows*width,data,options);},
  async writeWindow({x,y,width:w,height:h},data,{signal}={}){
   range(0,1);requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x<=width-w&&y<=height-h&&data instanceof Float32Array&&data.length===channels*w*h,'Invalid tensor output window.');
   await controlCheckpoint(signal);for(let c=0;c<channels;c++)for(let row=0;row<h;row++){checkAbort(signal);await store.write(bytes(data.subarray((c*h+row)*w,(c*h+row+1)*w)),(c*spatial+(y+row)*width+x)*4);}
  },
  // Numeric result/export readers can address >4 GiB without bitwise truncation.
  async readInto(target,elementOffset=0,{signal}={}){requireValue(!disposed&&target instanceof Float32Array&&Number.isSafeInteger(elementOffset)&&elementOffset>=0&&elementOffset<=length-target.length,'Invalid tensor export range.');checkAbort(signal);await store.readInto(bytes(target),elementOffset*4);checkAbort(signal);return target;},
  async readBytes(target,offset=0,{signal}={}){requireValue(!disposed&&target instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=length*4-target.length,'Invalid tensor byte range.');checkAbort(signal);await store.readInto(target,offset);checkAbort(signal);return target;},
  flush(){return store.flush();},
  async dispose(){if(disposed)return;disposed=true;await store.dispose();}
 };
}

/** Native spatial convolution row plan. Internal boundaries retain all halo
 * pixels and stride alignment; only the original image edges see zero padding.
 */
export function neuralRowPlan(inputHeight,stride,radius,outputRows){
 requireValue([inputHeight,stride,outputRows].every(x=>Number.isSafeInteger(x)&&x>0)&&Number.isSafeInteger(radius)&&radius>=0,'Invalid neural row plan.');
 const height=Math.ceil(inputHeight/stride),plans=[];
 for(let top=0;top<height;top+=outputRows){
  const rows=Math.min(outputRows,height-top),start=Math.max(0,Math.floor((top*stride-radius)/stride)*stride),stop=Math.min(inputHeight,(top+rows-1)*stride+radius+1);
  plans.push({top,rows,start,stop,cropTop:top-start/stride});
 }
 return plans;
}

/** Channel means/maxima over the complete feature bank, never over tiles.
 * Accumulation is float64; graph consumers receive the native float32 inputs.
 * This reorders only a reduction, which must be measured in end-to-end proofs.
 */
export async function neuralChannelStatistics(tensor,{budget,signal,windowBytes=4*1024**2,onProgress}={}){
 requireValue(Number.isSafeInteger(windowBytes)&&windowBytes>=tensor.channels*4,'Invalid reduction window.');
 const release=budget.reserve(tensor.channels*20),sum=new Float64Array(tensor.channels),max=new Float32Array(tensor.channels).fill(-Infinity),count=tensor.height*tensor.width,step=Math.max(1,Math.floor(windowBytes/(tensor.channels*4)));
 try{
  for(let at=0;at<count;at+=step){const n=Math.min(step,count-at),part=await tensor.readTokens(at,n,{signal});try{for(let c=0;c<tensor.channels;c++)for(let i=0;i<n;i++){const v=part.data[c*n+i];requireValue(Number.isFinite(v),'Nonfinite neural feature.');sum[c]+=v;max[c]=Math.max(max[c],v);}}finally{part.release();}onProgress?.({phase:'global-channel-statistics',completed:at+n,total:count});}
  const mean=Float32Array.from(sum,x=>x/count);return {mean,max,release};
 }catch(e){release();throw e;}
}
