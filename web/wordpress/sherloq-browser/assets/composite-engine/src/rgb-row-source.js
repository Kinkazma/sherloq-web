import {requireValue} from './errors.js';

// Internal read-only preparation input. Coordinates belong to the oriented
// immutable surface; independent model regions remain actual rectangle crops.
export function rgbRowSource(surface,bounds){
 const d=surface?.descriptor;requireValue(d&&typeof surface.readWindow==='function','A qualified RGB surface is required');
 const b=bounds??[0,0,d.width,d.height];
 requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]>=0&&b[1]>=0&&b[2]<=d.width&&b[3]<=d.height&&b[2]>b[0]&&b[3]>b[1],'RGB row-source bounds');
 const [x0,y0,x1,y1]=b,width=x1-x0,height=y1-y0;
 return{width,height,async readRows(y,count,{signal}={}){
  requireValue(Number.isSafeInteger(y)&&Number.isSafeInteger(count)&&y>=0&&count>0&&y+count<=height,'RGB row-source range');
  return surface.readWindow({x:x0,y:y0+y,width,height:count},{signal});
 }};
}

export function validateRgbRows(window,width,height){
 const p=window?.pixels;requireValue(typeof window?.release==='function'&&p?.width===width&&p?.height===height&&p?.format==='rgb8'&&p.data instanceof Uint8Array&&p.data.length===width*height*3,'Qualified tightly packed RGB8 rows required');
 return p.data;
}
