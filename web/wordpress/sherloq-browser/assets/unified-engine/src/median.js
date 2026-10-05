import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {validatePixels} from './ela.js';
import {parameters,gray,roundEven} from './pixel-utils.js';
import {MEDIAN_FORMATS,MEDIAN_HEAP_LIMIT,medianBlockFeatures} from './median-features.js';

export function medianParams(input={}){
 const p=parameters(input,{modelId:'',variance:5,threshold:.4,showScore:false,speckle:true},{variance:[0,100]},{},['showScore','speckle']);
 requireValue(typeof p.modelId==='string'&&p.modelId.length<=128&&!p.modelId.includes('\0'),'Invalid median model id.');
 requireValue(typeof p.threshold==='number'&&Number.isFinite(p.threshold)&&p.threshold>=0&&p.threshold<=1,'Median threshold must be in [0,1].');return p;
}
export function medianGeometry(width,height){
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&Number.isSafeInteger(width*height*3),'Invalid median image dimensions.');
 const blockColumns=Math.floor(width/64)+1,blockRows=Math.floor(height/64)+1;
 return {width: blockColumns+1,height:blockRows+1,blockColumns,blockRows,blockSize:64,imageWidth:width,imageHeight:height,padding:'constant-black; always one extra block boundary',border:'one additional zero grid row and column',origin:[0,0]};
}
export const medianReferences=p=>{requireValue(p.modelId.length>0,'Select a locally loaded median model.');return [p.modelId];};
export function medianAdmission(image){
 const g=medianGeometry(image.width,image.height);
 // WASM has a hard16MiB ceiling. Include retained grids, render/copy and bounded
 // feature batches, plus the defensive full-resolution RGB result.
 return MEDIAN_HEAP_LIMIT+1024**2+g.width*g.height*128+image.width*image.height*9+image.width*6;
}
export function medianGrayBlock(image,index,geometry,output=new Uint8Array(4096)){
 output.fill(0);const y0=Math.floor(index/geometry.blockColumns)*64,x0=index%geometry.blockColumns*64;
 for(let y=0;y<Math.min(64,image.height-y0);y++)for(let x=0;x<Math.min(64,image.width-x0);x++){
  const i=((y0+y)*image.width+x0+x)*3;output[y*64+x]=gray(image.data[i],image.data[i+1],image.data[i+2]);
 }return output;
}

// No padded full-image allocation: all native blocks, including all-black ones,
// are extracted unchanged. At most 32 feature rows coexist with a prediction.
export async function medianAnalyze(image,model,{signal,onProgress,batchSize=32,extractBatch,readBlocks,fast=true}={}){
 if(readBlocks===undefined)validatePixels(image);else requireValue(typeof readBlocks==='function','Invalid median block reader.');
 requireValue(Object.hasOwn(MEDIAN_FORMATS,model?.metadata?.features)&&typeof model.predict==='function','A compiled median model is required.');
 requireValue(Number.isInteger(batchSize)&&batchSize>=1&&batchSize<=32,'Invalid median batch size.');
 const geometry=medianGeometry(image.width,image.height),{blockColumns,blockRows,width,height}=geometry,count=blockColumns*blockRows,features=model.metadata.features;
 const probabilities=new Float32Array(width*height),variances=new Float64Array(width*height),margins=new Float32Array(width*height),block=new Uint8Array(4096);let featureMs=0,predictMs=0;
 for(let start=0;start<count;start+=batchSize){
  await controlCheckpoint(signal);const length=Math.min(batchSize,count-start),featureStart=performance.now();let values,variance;
  const blocks=readBlocks?await readBlocks(start,length,geometry,{signal}):null;
  if(readBlocks)requireValue(blocks instanceof Uint8Array&&blocks.length===length*4096,'Invalid median block batch.');
  if(extractBatch){const batch=blocks??new Uint8Array(length*4096);if(!blocks)for(let i=0;i<length;i++)medianGrayBlock(image,start+i,geometry,batch.subarray(i*4096,(i+1)*4096));({features:values,variances:variance}=await extractBatch(batch,features,{signal}));}
  else{values=new Float64Array(length*features);variance=new Float64Array(length);for(let offset=0;offset<length;offset++){
   const result=await medianBlockFeatures(blocks?blocks.subarray(offset*4096,(offset+1)*4096):medianGrayBlock(image,start+offset,geometry,block),features,{signal,fast});values.set(result.features,offset*features);variance[offset]=result.variance;
  }}
  featureMs+=performance.now()-featureStart;const predictStart=performance.now();
  const prediction=await model.predict(values,{signal});
  try{for(let offset=0;offset<length;offset++){const index=start+offset,target=Math.floor(index/blockColumns)*width+index%blockColumns;probabilities[target]=prediction.scores[offset];margins[target]=prediction.margins[offset];variances[target]=variance[offset];}}
  finally{prediction.release();}
  predictMs+=performance.now()-predictStart;
  onProgress?.((start+length)/count);checkAbort(signal);
 }
 return {geometry,probabilities,variances,margins,runtime:{featureMs,predictMs}};
}

// Specialized OpenCV 4.11 INTER_LINEAR uint8 enlargement at the native factor64.
// Fixed 11-bit coefficients and separate vertical truncations are significant.
// Compute only the requested crop; no enlarged padded intermediate is necessary.
export async function medianEnlargeRows(grid,geometry,{signal,start=0,rows=geometry.imageHeight-start}={}){
 const {width:gw,height:gh,imageWidth:w,imageHeight:h}=geometry;
 requireValue(Number.isSafeInteger(start)&&Number.isSafeInteger(rows)&&start>=0&&rows>0&&start<=h-rows,'Invalid median render rows.');
 const output=new Uint8Array(w*rows*3),left=new Uint32Array(w),weight=new Uint16Array(w);
 for(let x=0;x<w;x++){const position=Math.fround((x+.5)/64-.5),base=Math.floor(position);left[x]=Math.max(0,Math.min(gw-1,base));weight[x]=base<0||base>=gw-1?0:(position-base)*2048;}
 for(let y=start;y<start+rows;y++){
  if((y-start)%32===0)await controlCheckpoint(signal);
  const position=Math.fround((y+.5)/64-.5),base=Math.floor(position),wy=(position-base)*2048,top=Math.max(0,Math.min(gh-1,base))*gw*3,bottom=Math.max(0,Math.min(gh-1,base+1))*gw*3;
  for(let x=0;x<w;x++){const a=left[x]*3,b=Math.min(gw-1,left[x]+1)*3,wx=weight[x];for(let c=0;c<3;c++){
   const s0=(grid[top+a+c]*(2048-wx)+grid[top+b+c]*wx)>>4,s1=(grid[bottom+a+c]*(2048-wx)+grid[bottom+b+c]*wx)>>4;
   output[((y-start)*w+x)*3+c]=(((s0*(2048-wy))>>16)+((s1*wy)>>16)+2)>>2;
  }}
 }checkAbort(signal);return output;
}
export const medianEnlarge=(grid,geometry,options)=>medianEnlargeRows(grid,geometry,options);

export async function medianGrid(analysis,input={}, {signal}={}){
 const p=medianParams(input),{geometry,probabilities,variances}=analysis,{width,height}=geometry,n=width*height;
 requireValue(probabilities instanceof Float32Array&&variances instanceof Float64Array&&probabilities.length===n&&variances.length===n,'Invalid median score grid.');
 const filtered=new Float32Array(n),valid=new Uint8Array(n),decisions=new Uint8Array(n),rgb=new Uint8Array(n*3),neighbors=new Float32Array(9);let sum=0,count=0;
 // NumPy compares a float32 array with a scalar converted to float32.
 const threshold=Math.fround(p.threshold);
 for(let y=0;y<height;y++){
  if(y%32===0)await controlCheckpoint(signal);
  for(let x=0;x<width;x++){
   const i=y*width+x;requireValue(Number.isFinite(probabilities[i])&&probabilities[i]>=0&&probabilities[i]<=1&&Number.isFinite(variances[i])&&variances[i]>=0,'Non-finite or out-of-range median grid.');
   if(p.speckle){let k=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)neighbors[k++]=probabilities[Math.max(0,Math.min(height-1,y+dy))*width+Math.max(0,Math.min(width-1,x+dx))];neighbors.sort();filtered[i]=neighbors[4];}else filtered[i]=probabilities[i];
   const accepted=variances[i]>=p.variance,positive=filtered[i]>=threshold;valid[i]=Number(accepted);decisions[i]=accepted?positive?2:1:0;
   if(accepted){sum+=filtered[i];count++;}
   if(p.showScore){const value=accepted?roundEven(Math.fround(filtered[i]*255)):0;rgb.fill(value,i*3,i*3+3);}
   else {rgb[i*3]=accepted&&positive?255:0;rgb[i*3+1]=accepted&&!positive?255:0;rgb[i*3+2]=accepted?0:255;}
  }
 }
 checkAbort(signal);return {rgb,filtered,valid,decisions,mean:count?sum/count:0,validBlocks:count};
}
export async function medianRender(analysis,input={},hooks={}){
 const {rgb,...result}=await medianGrid(analysis,input,hooks),geometry=analysis.geometry;
 return {...result,pixels:{width:geometry.imageWidth,height:geometry.imageHeight,format:'rgb8',data:await medianEnlarge(rgb,geometry,hooks)}};
}

export async function medianData(image,p,hooks,{references,medianPool,cpuKernel}={}){
 const model=references?.[0]?.model;requireValue(model,'A loaded median model is required.');
 const analysis=medianPool?await medianPool.run(image,model,hooks):await medianAnalyze(image,model,{...hooks,fast:cpuKernel!=='reference'}),runtime=analysis.runtime;delete analysis.runtime;
 return {data:analysis,engineMetrics:{workers:1,kernel:cpuKernel==='reference'?'cpu-pinned-median-reference':'cpu-pinned-median-guarded',...runtime},semantics:'Median-filter model evidence on native64×64 blocks. Scores are model outputs, not calibrated probabilities of forgery; invalid low-variance blocks are distinct from negative detections.'};
}
export async function medianView(result,p,hooks){
 const rendered=await medianRender(result.data,p,hooks);
 result.pixels=rendered.pixels;
 result.data={...result.data,filtered:rendered.filtered,mean:rendered.mean,validBlocks:rendered.validBlocks};
 const {width,height}=result.data.geometry;
 result.masks={valid:{width,height,format:'mask8',data:rendered.valid,range:[0,1],semantics:'One native grid cell per64×64 block;1 means variance >= minimum, including historical padding.'},decisions:{width,height,format:'mask8',data:rendered.decisions,range:[0,2],semantics:'Grid decisions:0 invalid,1 below threshold,2 at or above threshold. The interpolated RGB view is not a pixel segmentation mask.'}};
 result.layers=[{id:'median-view',kind:'rgb',origin:[0,0],range:[0,255]}];
}
