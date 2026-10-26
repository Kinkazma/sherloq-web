import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort} from './errors.js';
import {renderResearch} from './research-render.js';

/** Presentation uses Original outside the evaluated native cores. It never
 * manufactures a suspicion there, and never executes a model. */
export async function renderCfaStrictWindow(image,result,mode,rect,{budget,signal,onProgress}={}) {
 const d=result.data;requireValue([0,1,2].includes(mode),'Unknown research display.');
 requireValue(rect&&['x','y','width','height'].every(k=>Number.isSafeInteger(rect[k]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=d.width&&rect.y+rect.height<=d.height,'Invalid CFA display window.');
 checkAbort(signal);const outputLease=budget.reserve(rect.width*rect.height*3);let window,committed=false;
 try {
  const [ox,oy]=d.metadata.sourceRegionOrigin;
  window=await (image.presentationSurface??image.surface).readWindow({...rect,x:rect.x+ox,y:rect.y+oy},{signal});checkAbort(signal);
  requireValue(window.pixels?.format==='rgb8'&&window.pixels.width===rect.width&&window.pixels.height===rect.height&&window.pixels.data instanceof Uint8Array&&window.pixels.data.length===rect.width*rect.height*3,'CFA presentation source returned another grid.');
  const data=window.pixels.data.slice();
  for(const f of d.metadata.fragments) {
   if(!f.count)continue;checkAbort(signal);
   const x=Math.max(rect.x,f.rect.x+4),y=Math.max(rect.y,f.rect.y+4),right=Math.min(rect.x+rect.width,f.rect.x+4+f.validShape[1]),bottom=Math.min(rect.y+rect.height,f.rect.y+4+f.validShape[0]);
   if(right<=x||bottom<=y)continue;
   const width=right-x,height=bottom-y,release=budget.reserve(width*height*3+(f.cellOffsets?f.count*5:0));let rendered;
   try {
    const pixels=new Uint8Array(width*height*3);
    for(let row=0;row<height;row++)pixels.set(window.pixels.data.subarray(((y-rect.y+row)*rect.width+x-rect.x)*3,((y-rect.y+row)*rect.width+x-rect.x+width)*3),row*width*3);
    const local={suspicion:f.cellOffsets?Float32Array.from(f.cellOffsets,i=>d.suspicion[i]):d.suspicion.subarray(f.offset,f.offset+f.count),local_grid:f.cellOffsets?Uint8Array.from(f.cellOffsets,i=>d.local_grid[i]):d.local_grid.subarray(f.offset,f.offset+f.count),metadata:{method:'adaptive_cfa',block:d.metadata.block,origin:[4,4],valid_shape:f.validShape}};
    rendered=await renderResearch({width,height,data:pixels},local,mode,{budget,signal,onProgress,origin:[x-f.rect.x,y-f.rect.y]});
    for(let row=0;row<height;row++)data.set(rendered.data.subarray(row*width*3,(row+1)*width*3),((y-rect.y+row)*rect.width+x-rect.x)*3);
   }finally{rendered?.release();release();}
  }
  checkAbort(signal);let closed=false;committed=true;return{width:rect.width,height:rect.height,format:'rgb8',data,origin:[rect.x,rect.y],release(){if(closed)return;closed=true;outputLease();}};
 }finally{window?.release();if(!committed)outputLease();}
}
