import "../../runtime-context.js?v=0.14.5";
import {jpegCodec} from './jpeg.js';import {checkpoint} from './errors.js';import {numpySum} from './numpy-sum.js';
export async function jpegBlockError(image,quality,hooks={},codec=jpegCodec){
 // libjpeg clamps native quality 0 to the same table as 1; retain the requested label.
 const decoded=await codec.recompress(image,Math.max(1,quality),hooks),cols=Math.floor(image.width/16),rows=Math.floor(image.height/16),out=new Float64Array(cols*rows),terms=new Float64Array(256);
 for(let by=0;by<rows;by++){if(by%32===0)await checkpoint(hooks.signal);for(let bx=0;bx<cols;bx++){
  let j=0;for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=((by*16+y)*image.width+bx*16+x)*3;let sum=0;for(let c=0;c<3;c++){const delta=image.data[i+c]-decoded.data[i+c];sum+=delta*delta;}terms[j++]=sum/3;}
  out[by*cols+bx]=numpySum(terms)/256;
 }}return out;
}
