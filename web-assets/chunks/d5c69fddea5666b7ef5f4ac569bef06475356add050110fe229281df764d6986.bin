import {jpegCodec} from './jpeg.js';import {jpegBlockError} from './jpeg-block-error.js';
import {describeEnergy} from './energy-primitives.js';
let image,mode='quality';
self.onmessage=async({data})=>{
 try{
  if(data.image){image=data.image;mode=data.mode??'quality';postMessage({ready:true});return;}
  const values=[];
  for(const quality of data.qualities){
   if(mode==='energy'){const decoded=await jpegCodec.recompress(image,quality);values.push([quality,(await describeEnergy(image,decoded)).energy]);}
   else if(mode==='ghost')values.push([quality,await jpegBlockError(image,quality)]);
   else{const result=await jpegCodec.recompressGray(image,quality);let sum=0;for(let i=0;i<image.data.length;i++)sum+=Math.abs(image.data[i]-result.data[i]);values.push([quality,sum*(1/image.data.length)]);}
   postMessage({progress:1});
  }
  const transfer=values.filter(x=>ArrayBuffer.isView(x[1])).map(x=>x[1].buffer);postMessage({values,heap:jpegCodec.memoryBytes()},transfer);
 }catch(error){postMessage({error:error.code??'WORKER_FAILED'});}
};
