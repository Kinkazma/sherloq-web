import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {validateRgbRows} from './rgb-row-source.js';
import {gray} from './pixel-utils.js';

export function validateTextImage(image){
 requireValue(image?.format==='rgb8'&&Number.isSafeInteger(image.width)&&image.width>0&&Number.isSafeInteger(image.height)&&image.height>0&&(typeof image.readWindow==='function'||typeof image.readRows==='function'||image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3),'OCR requires original RGB8 pixels or bounded windows.');
}

// Visit the original pixel rectangle in bounded strips. Contiguous inputs are
// borrowed; surface windows own and release their source-budget reservations.
export async function visitTextPixels(image,[x,y,r,b],visit,{signal}={}){
 validateTextImage(image);requireValue([x,y,r,b].every(Number.isSafeInteger)&&x>=0&&y>=0&&r<=image.width&&b<=image.height&&r>x&&b>y,'Invalid text pixel rectangle.');
 const width=r-x,height=b-y,windowed=typeof image.readWindow==='function',stride=windowed?width:image.width,step=Math.max(1,Math.min(32,Math.floor(1024**2/(stride*3)))),cooperate=createCooperator(signal);
 for(let top=0;top<height;top+=step){
  await cooperate();const rows=Math.min(step,height-top);let lease;
  try{
   let data,left=x;
   if(windowed){lease=await image.readWindow({x,y:y+top,width,height:rows},{signal});data=validateRgbRows(lease,width,rows);left=0;}
   else if(typeof image.readRows==='function'){lease=await image.readRows(y+top,rows,{signal});data=validateRgbRows(lease,image.width,rows);}
   else data=image.data.subarray((y+top)*image.width*3,(y+top+rows)*image.width*3);
   checkAbort(signal);await visit(data,{top,rows,stride,left,width});
  }finally{lease?.release();}
 }
 checkAbort(signal);
}

export async function textTilePgm(image,tile,{signal}={}){
 validateTextImage(image);const [x,y,r,b]=tile,width=r-x,height=b-y;
 requireValue([x,y,r,b].every(Number.isSafeInteger)&&width>0&&height>0&&x>=0&&y>=0&&r<=image.width&&b<=image.height,'Invalid OCR tile.');
 const header=new TextEncoder().encode(`P5\n${width} ${height}\n255\n`),pgm=new Uint8Array(header.length+width*height);pgm.set(header);
 await visitTextPixels(image,tile,(rgb,{top,rows,stride,left})=>{for(let yy=0;yy<rows;yy++)for(let xx=0;xx<width;xx++){const at=(yy*stride+left+xx)*3;pgm[header.length+(top+yy)*width+xx]=gray(rgb[at],rgb[at+1],rgb[at+2]);}},{signal});
 return pgm;
}
