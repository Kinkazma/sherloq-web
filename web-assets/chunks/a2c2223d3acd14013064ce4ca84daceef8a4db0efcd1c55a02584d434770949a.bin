import {copyTypedArray} from './allocation.js';
import {ForgeryscopePreparation} from './forgeryscope-preparation.js';
import {jpegHeader,orientRgb} from './image-headers.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
export class CatnetPreparation extends ForgeryscopePreparation {
 constructor(budget,factory){super(budget,factory,{resourceOwner:'catnet'});}
 async companion(image,{signal}={}){
  const capacity=image.width*image.height*24+65536,release=this.budget.reserve(capacity);
  try{
   const data=await this.admitted(image.data.byteLength+capacity*3,(m,a)=>{
    const ip=a(image.data.byteLength,image.data,'HEAPU8'),op=a(capacity),length=m._catnet_companion(ip,image.width,image.height,op,capacity);
    if(length<0)throw new EngineError('PREPARATION_FAILED','CAT-Net companion JPEG encoding failed.');return copyTypedArray(m.HEAPU8.subarray(op,op+length),{label:'catnet-preparation-output'});
   },signal);return {data,release};
  }catch(e){release();throw e;}
 }
 async prepare(bytes,{image,signal,compactDct=false}={}){
  const header=jpegHeader(bytes),width=header.sourceWidth,height=header.sourceHeight,pw=Math.ceil(width/8)*8,ph=Math.ceil(height/8)*8,n=pw*ph;
  const release=this.budget.reserve(n*(compactDct?13:96)+256);let scratch;
  try{
   scratch=this.budget.reserve(width*height*6+n*2+bytes.length);
   const extracted=await this.admitted(bytes.length+width*height*3+n*8+256,(m,a)=>{
    const ip=a(bytes.length,bytes,'HEAPU8'),cp=a(n*2),tp=a(256),rp=a(width*height*3);
    if(!m._catnet_coeff(ip,bytes.length,cp,tp,width,height)||!m._catnet_decode(ip,bytes.length,rp,width,height))throw new EngineError('PREPARATION_FAILED','CAT-Net requires stored grayscale/RGB JPEG coefficients.');
    return {rgb:copyTypedArray(m.HEAPU8.subarray(rp,rp+width*height*3),{label:'catnet-preparation-output'}),coeff:copyTypedArray(m.HEAP16.subarray(cp/2,cp/2+n),{label:'catnet-preparation-output'}),table:copyTypedArray(m.HEAPF32.subarray(tp/4,tp/4+64),{label:'catnet-preparation-output'})};
   },signal);
   if(image){
    const oriented=await orientRgb({width,height,format:'rgb8',data:extracted.rgb},header.orientation,{signal});
    requireValue(oriented.width===image.width&&oriented.height===image.height&&oriented.data.length===image.data.length&&oriented.data.every((v,i)=>v===image.data[i]),'The JPEG no longer matches the opened image. Reload it before analysis.');
   }
   const input=new Float32Array(n*(compactDct?3:24)),codes=compactDct?new Uint8Array(n):null;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)input[c*n+y*pw+x]=Math.fround((extracted.rgb[(y*width+x)*3+c]-127.5)/127.5);
   // Padding RGB=127.5 normalizes to zero; DCT contains actual stored edge blocks.
   for(let i=0;i<n;i++){const code=Math.min(20,Math.abs(extracted.coeff[i]));if(codes)codes[i]=code;else input[(3+code)*n+i]=1;}
   checkAbort(signal);return {image:{data:input,dims:[1,compactDct?3:24,ph,pw]},...(codes?{dct_codes:{data:codes,dims:[1,1,ph,pw],type:'uint8'}}:{}),table:{data:extracted.table,dims:[1,1,8,8]},metadata:{source_shape:[height,width],padded_shape:[ph,pw],orientation:header.orientation},release};
  }catch(e){release();throw e;}finally{scratch?.();}
 }
}
