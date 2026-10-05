import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkpoint} from './errors.js';
import {parameters,gray} from './pixel-utils.js';
import {waveletDetail,waveletNoise} from './wavelets.js';
import {cvNoiseMap} from './opencv.js';
export const blockingParams=(p={})=>parameters(p,{block:8},{block:[1,100]});
export async function blockingData(image,p,hooks,{bytes,codec}){
 let source,sourceMode;const encoded=(bytes[0]===255&&bytes[1]===216)||(bytes[0]===137&&bytes[1]===80)||(bytes[0]===73&&bytes[1]===73)||(bytes[0]===77&&bytes[1]===77);
 if(encoded){if(!codec.decodeGray)throw new EngineError('CODEC_UNAVAILABLE','Original-file grayscale decoder required.');source=await codec.decodeGray(bytes,hooks);sourceMode='file grayscale';}
 else{const data=new Uint8Array(image.width*image.height);for(let i=0;i<data.length;i++){if(i%65536===0)await checkpoint(hooks.signal);data[i]=gray(image.data[i*3],image.data[i*3+1],image.data[i*3+2]);}source={width:image.width,height:image.height,data};sourceMode='loaded image grayscale';}
 const detail=await waveletDetail(source,hooks);return {detail,data:{width:image.width,height:image.height,sourceMode,sourceDimensions:[source.width,source.height],detailDimensions:[detail.width,detail.height]},semantics:'Native file grayscale when qualified encoded bytes are present, otherwise explicit loaded RGB grayscale; db8 diagonal detail, block median absolute deviation / 0.6745, CV_8U normalization and nearest-neighbor display.'};
}
export async function blockingView(result,p,hooks){
 requireValue(p.block<=Math.min(result.detail.width,result.detail.height),'Block size exceeds native detail dimensions.');const noise=await waveletNoise(result.detail,p.block,hooks);result.pixels=await cvNoiseMap(noise,result.data.width,result.data.height,hooks);delete result.detail;Object.assign(result.data,{block:p.block,rows:noise.height,cols:noise.width,noise:noise.values});return result;
}
