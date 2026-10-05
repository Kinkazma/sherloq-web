import "../../runtime-context.js?v=0.14.5";
import {mappedTiffKernel} from './tiff-mapped.js';
self.onmessage=async({data:{bytes,plan,grayscale}})=>{try{
 const result=await mappedTiffKernel(bytes,plan,{grayscale,onProgress:progress=>self.postMessage({progress})});self.postMessage(result,[result.pixels.data.buffer]);
 }catch(error){self.postMessage({failure:{code:error.code??'INVALID_INPUT',message:error.code?error.message:'TIFF mapped decoding failed.'}});}};
