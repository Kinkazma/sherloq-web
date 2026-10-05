export function noisesnifferLargeInput({width,height,seed}){
 const data=new Uint8Array(width*height*3);let state=seed;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){
  state=(Math.imul(1664525,state)+1013904223)>>>0;
  data[(y*width+x)*3+c]=x>=Math.floor(width*2/5)&&x<Math.floor(width/2)&&y>=Math.floor(height*2/5)&&y<Math.floor(height/2)?124+(state>>>16)%7:70+(state>>>16)%117;
 }
 return {width,height,format:'rgb8',data};
}
