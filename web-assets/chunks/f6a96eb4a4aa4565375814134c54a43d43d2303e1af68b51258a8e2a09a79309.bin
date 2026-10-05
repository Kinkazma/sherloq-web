import "../../runtime-context.js?v=0.14.5";
import {createDenseRegions} from './dense-regions.js';
let pending;
self.onmessage=async({data:p})=>{try{const math=await(pending??=createDenseRegions()),result=math.allowed({width:p.width,height:p.height,data:p.rgb},p.settings),values=new Uint8Array(p.coreWidth*p.coreHeight);for(let y=0;y<p.coreHeight;y++)values.set(result.mask.subarray((p.y+y)*result.width+p.x,(p.y+y)*result.width+p.x+p.coreWidth),y*p.coreWidth);self.postMessage({result:{values,heapBytes:math.heapBytes}},[values.buffer]);}catch(e){self.postMessage({error:{code:e.code??'NUMERIC_RANGE',message:e.message}});}};
