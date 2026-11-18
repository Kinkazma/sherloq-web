import "../../runtime-context.js?v=0.33.2";
import {requireValue} from './errors.js';

export const NATIVE16_ECHO_SHAPES=Object.freeze(['identity','rectangle','native-regions','membership']);
export const NATIVE16_ECHO_UNITS=Object.freeze({
 source:'real UInt16 coded RGB channel values,0..65535',
 radius:'radius in the current calculation grid; sampled proxies project it explicitly',
 rawSmall:'radii1..4: exact Int32 absolute Laplacian, Float64 global normalization',
 rawLarge:'radii5..15: existing ordered Float32/FMA Laplacian and normalization',
 normalization:'one global min/max per channel over the admitted population',
 output:'diagnostic RGB8, existing contrast256 LUT and optional BT601 gray'
});

export function native16EchoParametersAdmitted(params={},shape='identity'){
 if(!NATIVE16_ECHO_SHAPES.includes(shape)||!params||typeof params!=='object'||Array.isArray(params))return false;
 if(!Object.keys(params).every(key=>['radius','contrast','grayscale','equalization'].includes(key)))return false;
 const radius=params.radius??2,contrast=params.contrast??85,gray=params.grayscale??false;
 return Number.isInteger(radius)&&radius>=1&&radius<=15&&Number.isInteger(contrast)&&contrast>=0&&contrast<=100&&typeof gray==='boolean';
}

export function native16EchoParams(params={}){
 requireValue(native16EchoParametersAdmitted(params),'Invalid native Echo parameters.');
 return{radius:params.radius??2,contrast:params.contrast??85,grayscale:params.grayscale??false};
}

export function native16EchoRegionRequested(task,original,shape){
 return task?.operation==='detail.echo'&&shape!=='identity'&&native16EchoParametersAdmitted(task.params,shape)
  &&(task.workingDepth??original?.workingDepth??16)===16&&original?.nativeSurface?.descriptor?.format==='rgb16';
}
