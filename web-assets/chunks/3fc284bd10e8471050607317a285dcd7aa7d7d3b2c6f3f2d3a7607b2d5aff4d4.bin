import "../../runtime-context.js?v=0.30.0";
import {parameters,rgbPixels} from './pixel-utils.js';
import {createCooperator,checkAbort} from './errors.js';

// Yield after useful work rather than imposing a timer on every short band.
// Keep the native progress cadence and observe cancellation from its callbacks.
async function rankRows(height,hooks,callback){
 const cooperate=createCooperator(hooks.signal);
 for(let y=0;y<height;y++){
  if(y%32===0)await cooperate();
  callback(y);if((y+1)%32===0||y===height-1)hooks.onProgress?.((y+1)/height);
  checkAbort(hooks.signal);
 }
}
export const statsParams=(p={})=>parameters(p,{mode:'min',inclusive:false},{},{mode:['min','avg','max']},['inclusive']);
const RANK_TABLES=[[[1,0,2,0,0,2,0,0,2,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,3,3,3],[1,1,2,0,0,2,0,0,2,1,0,0,0,1,0,0,0,2,1,0,0,1,0,0,3,3,3]],[[2,0,1,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,1,0,2],[2,1,1,0,0,1,0,0,3,2,0,0,0,1,0,0,0,2,3,0,0,1,0,0,1,1,2]],[[3,3,3,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,2,0,0,2,0,0,2,0,1],[3,3,3,0,0,1,0,0,1,2,0,0,0,1,0,0,0,1,2,0,0,2,0,0,2,1,1]]].map(pair=>pair.map(values=>Uint8Array.from(values)));
export async function pixelStats(image,p,hooks={}){
 const out=new Uint8Array(image.data.length),src=image.data,table=RANK_TABLES[p.mode==='min'?0:p.mode==='max'?2:1][p.inclusive?1:0];
 await rankRows(image.height,hooks,y=>{
  for(let i=y*image.width*3,end=i+image.width*3;i<end;i+=3){
   // Relative channel order has 27 keys. The fixed native tables keep
   // inclusive ties ordered red, green, blue without repeating three tests.
   const r=src[i],g=src[i+1],b=src[i+2],key=(r>g)+(r>=g)+3*((r>b)+(r>=b))+9*((g>b)+(g>=b)),selected=table[key];
   if(selected)out[i+selected-1]=255;
  }
 });
 return {pixels:rgbPixels(image,out),semantics:'Channel rank; inclusive ties prefer red, then green, then blue.'};
}
