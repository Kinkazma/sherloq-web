// Presentation only. Full RGB8 pixels remain the analysis/export reference.
const MiB=1024**2;
export class TileCache {
 constructor(limit=32*MiB){if(!Number.isSafeInteger(limit)||limit<MiB)throw new Error('Invalid tile budget');this.limit=limit;this.bytes=0;this.entries=new Map();}
 get(key){const v=this.entries.get(key);if(v){this.entries.delete(key);this.entries.set(key,v);}return v?.canvas;}
 take(key){const v=this.entries.get(key);if(!v)return null;this.entries.delete(key);this.bytes-=v.bytes;return v.canvas;}
 put(key,canvas){this.drop(key);const bytes=canvas.width*canvas.height*4;while(this.bytes+bytes>this.limit&&this.entries.size)this.drop(this.entries.keys().next().value);if(bytes>this.limit)throw new Error('Display tile exceeds budget');this.entries.set(key,{canvas,bytes});this.bytes+=bytes;}
 drop(key){const v=this.entries.get(key);if(!v)return;this.bytes-=v.bytes;v.canvas.width=v.canvas.height=0;this.entries.delete(key);}
 release(prefix){for(const key of this.entries.keys())if(key.startsWith(prefix))this.drop(key);}
}
let sequence=0;
export function visibleTiles(width,height,{left,top,right,bottom},scale=1,tileSize=256){
 if(![left,top,right,bottom,scale].every(Number.isFinite)||scale<=0||left>=right||top>=bottom||left>=width||top>=height||right<=0||bottom<=0)return[];
 const level=Math.max(0,Math.min(30,Math.floor(-Math.log2(scale)))),step=2**level,span=tileSize*step;
 const x0=Math.max(0,Math.floor(left/span)*span),y0=Math.max(0,Math.floor(top/span)*span);
 const out=[];for(let y=y0;y<Math.min(height,bottom);y+=span)for(let x=x0;x<Math.min(width,right);x+=span){const w=Math.min(span,width-x),h=Math.min(span,height-y);out.push({x,y,w,h,step,width:Math.ceil(w/step),height:Math.ceil(h/step),level});}return out;
}
export function sampleTile(pixels,tile,target){
 const {data,width}=pixels;let j=0;
 for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){
  const i=((tile.y+y*tile.step)*width+tile.x+x*tile.step)*3;
  target[j++]=data[i];target[j++]=data[i+1];target[j++]=data[i+2];target[j++]=255;
 }
}
export function createTiledSurface(pixels,cache){
 const {width,height,data}=pixels;if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!(data instanceof Uint8Array)||data.byteLength!==width*height*3)throw new Error('Invalid RGB8 surface');
 const prefix=`surface-${++sequence}:`;let source=pixels;
 return{width,height,get pixels(){if(!source)throw new Error('Surface released');return source;},get byteLength(){return source?.data.byteLength||0;},
  async readPixels({x,y,width:w,height:h}){
   if(!source)throw new Error('Surface released');
   if(![x,y,w,h].every(Number.isSafeInteger)||x<0||y<0||w<1||h<1||x+w>width||y+h>height)throw new Error('Invalid image window');
   const data=new Uint8Array(w*h*3);for(let row=0;row<h;row++)data.set(source.data.subarray(((y+row)*width+x)*3,((y+row)*width+x+w)*3),row*w*3);
   return{width:w,height:h,format:'rgb8',data};
  },
  draw(ctx,bounds,scale){if(!source)return;for(const tile of visibleTiles(width,height,bounds,scale)){
   // One sampled texel of overlap prevents transparent seams at fractional zoom.
   const x=Math.max(0,tile.x-tile.step),y=Math.max(0,tile.y-tile.step),w=Math.min(width,tile.x+tile.w+tile.step)-x,h=Math.min(height,tile.y+tile.h+tile.step)-y;
   const padded={...tile,x,y,w,h,width:Math.ceil(w/tile.step),height:Math.ceil(h/tile.step)};
   const key=prefix+tile.level+':'+tile.x+':'+tile.y;let canvas=cache.get(key);
   if(!canvas){canvas=document.createElement('canvas');canvas.width=padded.width;canvas.height=padded.height;const c=canvas.getContext('2d'),im=c.createImageData(padded.width,padded.height);sampleTile(source,padded,im.data);c.putImageData(im,0,0);cache.put(key,canvas);}
   ctx.drawImage(canvas,x,y,w,h);
  }},
  close(){source=null;cache.release(prefix);}
 };
}
