import "../../runtime-context.js?v=0.14.5";
import {jpegCodec} from './jpeg.js';import {jpegBlockError} from './jpeg-block-error.js';
import {describeEnergy} from './energy-primitives.js';
import {createElaCellDescriber} from './ela-cell-describe.js';
import {Budget} from './cache.js';
let image,mode='quality',block,describer;
self.onmessage=async({data})=>{
 try{
  if(data.image){image=data.image;mode=data.mode??'quality';block=data.block;describer?.dispose();describer=mode==='cells'?createElaCellDescriber({budget:new Budget(data.workerBytes)}):null;postMessage({ready:true});return;}
  const values=[];
  for(const quality of data.qualities){
   if(mode==='cells'){const decoded=await jpegCodec.recompress(image,quality),result=await describer.describe(image,decoded,block);try{const {release,...value}=result;values.push([quality,value]);}finally{result.release();}}
   else if(mode==='energy'){const decoded=await jpegCodec.recompress(image,quality);values.push([quality,(await describeEnergy(image,decoded)).energy]);}
   else if(mode==='ghost')values.push([quality,await jpegBlockError(image,quality)]);
   else{const result=await jpegCodec.recompressGray(image,quality);let sum=0;for(let i=0;i<image.data.length;i++)sum+=Math.abs(image.data[i]-result.data[i]);values.push([quality,sum*(1/image.data.length)]);}
   postMessage({progress:1});
  }
  const transfer=mode==='cells'?values.flatMap(x=>Object.values(x[1]).filter(ArrayBuffer.isView).map(value=>value.buffer)):values.filter(x=>ArrayBuffer.isView(x[1])).map(x=>x[1].buffer);postMessage({values,heap:jpegCodec.memoryBytes()},transfer);
 }catch(error){postMessage({error:error.code??'WORKER_FAILED'});}
};
