import {requireValue,checkAbort} from './errors.js';
// Exact circular phase on oriented full-resolution rows, with no full RGB roll.
export function rolledRgbSurface(surface,x,y,budget){
 const descriptor=surface.descriptor,{width,height}=descriptor;requireValue(Number.isInteger(x)&&x>=0&&x<=7&&Number.isInteger(y)&&y>=0&&y<=7&&width>=16&&height>=16,'Invalid Ghost circular phase.');
 if(x===0&&y===0)return surface;
 return {descriptor,async readWindowInto(rect,target,options={}){
  const {signal,rollScratch}=options,length=width*rect.height*3;
  requireValue(rect.x===0&&rect.width===width&&Number.isInteger(rect.y)&&rect.y>=0&&Number.isInteger(rect.height)&&rect.height>0&&rect.y+rect.height<=height&&target instanceof Uint8Array&&target.byteLength>=length,'Circular phase requires complete valid rows.');
  requireValue(rollScratch instanceof Uint8Array&&rollScratch.byteLength>=width*3&&(rollScratch.buffer!==target.buffer||rollScratch.byteOffset+rollScratch.byteLength<=target.byteOffset||target.byteOffset+length<=rollScratch.byteOffset),'Circular phase scratch overlaps its output or is too small.');
  checkAbort(signal);let completed=0,start=(rect.y-y+height)%height;
  while(completed<rect.height){const count=Math.min(rect.height-completed,height-start),destination=target.subarray(completed*width*3,(completed+count)*width*3),sourceRect={x:0,y:start,width,height:count};
   if(surface.readWindowInto)await surface.readWindowInto(sourceRect,destination,options);
   else{const part=await surface.readWindow(sourceRect,options);try{destination.set(part.pixels.data);}finally{part.release();}}
   if(x)for(let row=0;row<count;row++){const output=destination.subarray(row*width*3,(row+1)*width*3),scratch=rollScratch.subarray(0,width*3);scratch.set(output);output.set(scratch.subarray((width-x)*3));output.set(scratch.subarray(0,(width-x)*3),x*3);}
   completed+=count;start=0;checkAbort(signal);
  }
  return {pixels:{width,height:rect.height,format:'rgb8',data:target.subarray(0,length)},release(){}};
 },async readWindow(rect,{signal}={}){
  requireValue(rect.x===0&&rect.width===width&&Number.isInteger(rect.y)&&rect.y>=0&&Number.isInteger(rect.height)&&rect.height>0&&rect.y+rect.height<=height,'Circular phase requires complete valid rows.');checkAbort(signal);const length=width*rect.height*3,release=budget.reserve(length);try{const data=new Uint8Array(length);let target=0,start=(rect.y-y+height)%height;
   while(target<rect.height){const count=Math.min(rect.height-target,height-start),part=await surface.readWindow({x:0,y:start,width,height:count},{signal});try{for(let row=0;row<count;row++){const input=part.pixels.data.subarray(row*width*3,(row+1)*width*3),offset=(target+row)*width*3;data.set(input.subarray((width-x)*3),offset);data.set(input.subarray(0,(width-x)*3),offset+x*3);}}finally{part.release();}target+=count;start=0;checkAbort(signal);}
   return {pixels:{width,height:rect.height,format:'rgb8',data},release};
  }catch(error){release();throw error;}
 }};
}
