// Interpolated tile AHE / CLAHE on native HSV rows. Histogram domains are
// source-image coordinates, independent of the output worker's 128px tiles.
// Conventions: OpenCV clahe.cpp (4.12), REFLECT_101 padding, float32 tables
// and interpolation, nearest-even uint8 conversion. No contrast clipping in AHE.
const f=Math.fround;
const byte=value=>{const n=Math.floor(value),fraction=value-n;return Math.max(0,Math.min(255,fraction<.5?n:fraction>.5?n+1:n%2?n+1:n));};
export function reflect101(index,length){if(length===1)return 0;const period=2*(length-1),x=((index%period)+period)%period;return Math.min(x,period-x);}
export function createAdaptiveHistogram(width,height,tiles,clipLimit=0){
 if(![width,height,tiles].every(Number.isSafeInteger)||width<1||height<1||tiles<2||tiles>16||!Number.isFinite(clipLimit)||clipLimit<0)throw Error('Invalid adaptive histogram geometry');
 const padding=width%tiles!==0||height%tiles!==0,pw=padding?width+tiles-width%tiles:width,ph=padding?height+tiles-height%tiles:height,tw=pw/tiles,th=ph/tiles,area=tw*th;
 const hist=new Uint32Array(tiles*tiles*256);let tables;
 function addRows(bytes,rows,y){
  if(bytes.length!==width*rows*3||y<0||y+rows>ph)throw Error('Invalid adaptive histogram rows');
  for(let row=0;row<rows;row++){const tileY=Math.floor((y+row)/th);for(let x=0;x<pw;x++)hist[(tileY*tiles+Math.floor(x/tw))*256+bytes[(row*width+reflect101(x,width))*3+2]]++;}
 }
 function build(){
  tables=new Uint8Array(hist.length);const scale=f(255/area),limit=clipLimit>0?Math.max(1,Math.floor(clipLimit*area/256)):0;
  for(let tile=0;tile<tiles*tiles;tile++){
   const bins=hist.slice(tile*256,(tile+1)*256);if(bins.reduce((a,b)=>a+b,0)!==area)throw Error('Incomplete adaptive histogram');
   if(limit){let clipped=0;for(let i=0;i<256;i++)if(bins[i]>limit){clipped+=bins[i]-limit;bins[i]=limit;}const batch=Math.floor(clipped/256);let residual=clipped-batch*256;for(let i=0;i<256;i++)bins[i]+=batch;if(residual){const step=Math.max(1,Math.floor(256/residual));for(let i=0;i<256&&residual;i+=step,residual--)bins[i]++;}}
   let sum=0;for(let i=0;i<256;i++){sum+=bins[i];tables[tile*256+i]=byte(f(sum*scale));}
  }return tables;
 }
 function mapRows(bytes,rows,y){
  if(!tables)throw Error('Adaptive histogram is not ready');
  const data=new Uint8Array(bytes),ix=f(1/tw),iy=f(1/th),xs=[];
  for(let x=0;x<width;x++){const position=f(x*ix-.5),left=Math.floor(position),a=f(position-left);xs.push([Math.max(left,0)*256,Math.min(left+1,tiles-1)*256,a,f(1-a)]);}
  for(let row=0;row<rows;row++){
   const position=f((y+row)*iy-.5),top=Math.floor(position),b=f(position-top),ib=f(1-b),upperRow=Math.max(top,0)*tiles*256,lowerRow=Math.min(top+1,tiles-1)*tiles*256;
   for(let x=0;x<width;x++){const offset=(row*width+x)*3+2,v=bytes[offset],[left,right,a,ia]=xs[x],upper=f(tables[upperRow+left+v]*ia+f(tables[upperRow+right+v]*a)),lower=f(tables[lowerRow+left+v]*ia+f(tables[lowerRow+right+v]*a));data[offset]=byte(f(upper*ib+f(lower*b)));}
  }return data;
 }
 return {pw,ph,tiles,area,hist,addRows,build,mapRows};
}
