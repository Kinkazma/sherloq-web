import "../../runtime-context.js?v=0.30.0";
import {yoloLetterboxShape} from './forgeryscope-yolo.js';
/** This is the unchanged native 640/32 shape admission, not another resize.
 * Other invalid inputs and all execution failures still propagate. */
export function forgeryscopeNativeYoloAvailability(width,height,{stage,bounds,originalBounds,...identity}={}){
 try{yoloLetterboxShape(width,height);return null;}
 catch(error){
  if(error.code!=='INVALID_INPUT'||error.message!=='Image aspect ratio yields an empty YOLO resize.')throw error;
  return {code:'NATIVE_CONTEXT_NOT_EVALUABLE',status:'not-evaluable',stage,reason:'native-yolo-empty-resize',width,height,pixels:width*height,bounds:[...bounds],originalBounds:[...originalBounds],...identity};
 }
}
