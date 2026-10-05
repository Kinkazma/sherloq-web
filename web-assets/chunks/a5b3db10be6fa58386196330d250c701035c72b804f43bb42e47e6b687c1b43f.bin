import "../../runtime-context.js?v=0.14.5";
import {OPENCV_OPERATIONS} from './opencv-operations.js';
import {gradientDerivatives,gradientLengths,gradientRender,gradientLut} from './gradient-math.js';
import {contrastRows} from './contrast-math.js';
export async function pixelStripStage(j){
 if(j.op==='color')return {bytes:(await OPENCV_OPERATIONS['colors.space'].compute({width:j.width,height:j.height,format:'rgb8',data:j.rgb},j.params,{})).pixels.data};
 if(j.op==='gradient-derivatives')return gradientDerivatives({width:j.width,height:j.height,format:'rgb8',data:j.rgb},j.start,j.rows);
 if(j.op==='gradient-lengths')return {limits:await gradientLengths(j.bytes,j.stats,j.invert)};
 if(j.op==='gradient-render')return gradientRender(j.bytes,j.stats,j.params,j.total);
 if(j.op==='gradient-tone')return {bytes:await gradientLut(j.bytes,j.lut)};
 if(j.op==='contrast')return {values:await contrastRows({width:j.width,height:j.height,format:'rgb8',data:j.rgb},j.start,j.rows,j.block)};
 throw Error('Unknown pixel strip stage');
}
