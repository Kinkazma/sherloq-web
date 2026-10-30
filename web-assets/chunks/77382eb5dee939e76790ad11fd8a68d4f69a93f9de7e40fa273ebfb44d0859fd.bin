import {requireValue} from '../../src/errors.js';
export const D2PRL_INPUT_SIDES=Object.freeze([448,896,1344,1792]);
export function d2prlInputSide(value=448){requireValue(Number.isInteger(value)&&D2PRL_INPUT_SIDES.includes(value),'D2PRL input side must be448,896,1344 or1792');return value;}
export function d2prlSpatialConfig(value=448){
 const inputSide=d2prlInputSide(value),factor=inputSide/448;
 return Object.freeze({schema:'sherloq.d2prl-spatial-configuration/1',inputSide,factor,experimental:factor!==1,baseInputSide:448,featureSides:Object.freeze([Math.floor(inputSide/.75),inputSide,Math.floor(inputSide/1.5)]),roleSide:inputSide/8,shape:Object.freeze([1,3,inputSide,inputSide]),learnedWeights:'Original pinned checkpoint; spatial dimensions derived separately'});
}
