import "../../runtime-context.js?v=0.30.0";
import {requireValue} from './errors.js';
/** Original ALIKED model controls. Omitted values preserve the legacy recipe. */
export function alikedNativeParameters({inputSide=1024,detectionThreshold=.2}={}){
 requireValue(inputSide===1024||inputSide===2048,'ALIKED inputSide must be1024or2048.');
 requireValue(detectionThreshold===.2||detectionThreshold===.05,'ALIKED detectionThreshold must be0.2or0.05.');
 return{inputSide,detectionThreshold};
}
