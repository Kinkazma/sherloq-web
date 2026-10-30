import "../../runtime-context.js?v=0.30.0";
// A 256-term NumPy sum recurses into two128-term reductions. Each input e/3
// encounters at most20 positive f64 additions; there is no cancellation and
// no overflow/underflow. Input division and final rational mean add one
// rounding each.64*epsilon*65025 conservatively encloses both reductions.
export const GHOST_NATIVE_MEAN_ERROR=64*Number.EPSILON*65025;
export function ghostPaletteBoundaryCells(means,fractional,qualities,cells){
 if(qualities===1)return new Uint32Array(0);
 const selected=new Uint32Array(cells);let count=0;
 for(let i=0;i<cells;i++){
  let low=Infinity,high=-Infinity,needsNative=false;
  for(let q=0;q<qualities;q++){const at=q*cells+i,value=means[at];low=Math.min(low,value);high=Math.max(high,value);needsNative||=fractional[at]!==0;}
  // Integer e/3 terms sum exactly below2^53 and /256 is exact as well.
  if(!needsNative)continue;
  const range=high-low;
  if(range<=2*GHOST_NATIVE_MEAN_ERROR){selected[count++]=i;continue;}
  const error=(4*GHOST_NATIVE_MEAN_ERROR/(range-2*GHOST_NATIVE_MEAN_ERROR)+8*Number.EPSILON)*256;
  for(let q=0;q<qualities;q++){
   const value=(means[q*cells+i]-low)/range*256;
   const first=Math.max(0,Math.min(255,Math.floor(value-error))),last=Math.max(0,Math.min(255,Math.floor(value+error)));
   if(first!==last){selected[count++]=i;break;}
  }
 }
 return selected.subarray(0,count);
}
// Fancy4:2:0 upsampling reads a one-sample chroma halo. Admit precisely all
// native blocks read by the selected16×16 cells; no cropped codec is invented.
export function ghostCellCodecBlocks(cells,width,height){
 const yCols=Math.ceil(width/8),yRows=Math.ceil(height/8),cCols=Math.ceil(width/16),cRows=Math.ceil(height/16),cols=Math.floor(width/16),yn=yCols*yRows,cn=cCols*cRows,cw=Math.ceil(width/2),ch=Math.ceil(height/2),ids=new Uint32Array(cells.length*22);let count=0;
 for(const cell of cells){const bx=cell%cols,by=Math.floor(cell/cols);for(let y=0;y<2;y++)for(let x=0;x<2;x++)ids[count++]=(by*2+y)*yCols+bx*2+x;
  const x0=Math.floor(Math.max(0,bx*8-1)/8),x1=Math.floor(Math.min(cw-1,bx*8+8)/8),y0=Math.floor(Math.max(0,by*8-1)/8),y1=Math.floor(Math.min(ch-1,by*8+8)/8);
  for(let c=0;c<2;c++)for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)ids[count++]=yn+c*cn+y*cCols+x;
 }
 const populated=ids.subarray(0,count);populated.sort();let unique=0;
 for(let i=0;i<count;i++)if(!i||populated[i]!==populated[i-1])ids[unique++]=populated[i];
 return ids.subarray(0,unique);
}
