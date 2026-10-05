import "../../runtime-context.js?v=0.14.5";
import {adjustLocalRows,adjustTileHistogram} from './adjust-math.js';
export async function adjustStage({image,params,start,rows,y,pw,ph},hooks={}){
 let at=performance.now();const bytes=await adjustLocalRows(image,params,start,rows,hooks),localMs=performance.now()-at;at=performance.now();const histogram=params.equalize>=2?await adjustTileHistogram(bytes,image.width,rows,y,pw,ph,hooks):null;return{bytes,histogram,localMs,histogramMs:performance.now()-at};
}
