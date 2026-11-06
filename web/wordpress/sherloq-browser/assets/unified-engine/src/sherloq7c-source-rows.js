import "../../runtime-context.js?v=0.31.0";
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

// The current native16 importer retains ownership until all row reads finish.
// It is never substituted with the display RGB8 path for a 16-bit Original.
export function native16SourceRows(source,{onProgress}={}){
 const {width,height,data}=source;
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&data instanceof Uint16Array&&data.length===width*height*3,'Native RGB16 source required.');
 return{width,height,async readRows(top,rows,target,{signal}={}){
  requireValue(Number.isSafeInteger(top)&&Number.isSafeInteger(rows)&&top>=0&&rows>0&&top<=height-rows&&target instanceof Uint16Array&&target.length===rows*width*3,'Invalid native RGB16 row request.');
  for(let y=0;y<rows;y+=32){await controlCheckpoint(signal);const count=Math.min(32,rows-y);target.set(data.subarray((top+y)*width*3,(top+y+count)*width*3),y*width*3);}
  checkAbort(signal);onProgress?.({phase:'sherloq-source16',fraction:(top+rows)/height});
 }};
}

// A computed presentation is identified separately from its Original.
// RGB8 promotion is allowed here and for an originally 8-bit source only.
export function presentationSourceRows(surface,{onProgress}={}){
 const {width,height,format='rgb8'}=surface.descriptor,native=format==='rgb16';
 requireValue(['rgb8','rgb16'].includes(format),'RGB8 or native RGB16 presentation required.');
 const maxPixels=Math.floor((native?4:64)*1024**2/(native?6:3)),columns=Math.min(width,maxPixels),rowsPerWindow=Math.max(1,Math.floor(maxPixels/columns));
 return{width,height,async readRows(top,rows,target,{signal}={}){
  requireValue(Number.isSafeInteger(top)&&Number.isSafeInteger(rows)&&top>=0&&rows>0&&top<=height-rows&&target instanceof Uint16Array&&target.length===rows*width*3,'Invalid presentation RGB16 row request.');
  for(let y=0;y<rows;y+=rowsPerWindow){
   const count=Math.min(rowsPerWindow,rows-y);
   for(let x=0;x<width;x+=columns){
    await controlCheckpoint(signal);const w=Math.min(columns,width-x),part=await surface.readWindow({x,y:top+y,width:w,height:count},{signal});
    try{
     const data=part.pixels.data;requireValue(native?data instanceof Uint16Array:data instanceof Uint8Array,'Presentation depth changed during row read.');
     requireValue(data.length===count*w*3,'Presentation row extent changed.');
     for(let row=0;row<count;row++){
      const at=((y+row)*width+x)*3,start=row*w*3;
      if(native)target.set(data.subarray(start,start+w*3),at);else for(let i=0;i<w*3;i++)target[at+i]=data[start+i]*257;
     }
    }finally{await part.release();}
   }
  }
  checkAbort(signal);onProgress?.({phase:'sherloq-proxy16',fraction:(top+rows)/height});
 }};
}
