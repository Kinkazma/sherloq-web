import "../../runtime-context.js?v=0.25.0";
import {EngineError,requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {contrastParams} from './contrast.js';
import {contrastRows,contrastCells,CONTRAST_HEAP_BYTES,contrastHeapBytes} from './contrast-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
const reflect=(i,n)=>{while(i<0||i>=n)i=i<0?-i:2*n-i-2;return i;};
// The pinned kernel computes independent block indicators. Its centre block
// and one-pixel real halo are complete; unused neighbouring scratch blocks
// cannot influence that returned indicator. No hole-filled map is analysed.
export async function sourceRegionContrastCell(view,domain,{x,y,block:b},{budget,signal,scratchFill=0}={}){
 requireValue([32,64,128,256].includes(b)&&Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&x>=0&&y>=0&&x%b===0&&y%b===0&&Number.isInteger(scratchFill)&&scratchFill>=0&&scratchFill<=255,'A native aligned contrast cell and byte scratch value are required.');
 const width=domain.width,height=domain.height,pw=width+b-width%b,ph=height+b-height%b,xs=Array.from({length:b+2},(_,i)=>reflect(x+i-1,pw)),ys=Array.from({length:b+2},(_,i)=>reflect(y+i-1,ph)),realX=xs.filter(v=>v<width),realY=ys.filter(v=>v<height);let lease,staging;
 if(!realX.length||!realY.length)return{values:new Float32Array(3),read:false};const x0=Math.min(...realX),y0=Math.min(...realY),rect={x:x0,y:y0,width:Math.max(...realX)-x0+1,height:Math.max(...realY)-y0+1};if(!view.includesRectangle(rect))return null;
 try{staging=budget.reserve(3*b*(b+2)*3+128);lease=await view.readWindow(rect,{signal});const rgb=new Uint8Array(3*b*(b+2)*3).fill(scratchFill),cooperate=createCooperator(signal);for(let yy=0;yy<b+2;yy++){if((yy&31)===0)await cooperate();for(let xx=0;xx<b+2;xx++){const at=(yy*3*b+b-1+xx)*3,sx=xs[xx],sy=ys[yy];if(sx<width&&sy<height){const source=((sy-y0)*rect.width+sx-x0)*3;rgb.set(lease.pixels.data.subarray(source,source+3),at);}else rgb.fill(0,at,at+3);}}const result=await contrastRows({width:3*b,height:b+2,format:'rgb8',data:rgb},1,b,b,{signal});checkAbort(signal);return{values:result.subarray(3,6).slice(),read:true};}finally{lease?.release();staging?.();}
}


export {sourceRegionFragmentedContrast as sourceRegionContrast} from './source-region-fragmented-contrast.js';
