let serial=0;
// One bounded frame per viewport. Repeated movement replaces the next request;
// it never queues a screenful of obsolete tiles behind the current calculation.
export function displayViewport(width,height,{left,top,right,bottom},scale=1,maximumPixels=8*1024**2){
 if(![left,top,right,bottom,scale].every(Number.isFinite)||scale<=0||left>=right||top>=bottom||left>=width||top>=height||right<=0||bottom<=0)return null;
 let step=Math.max(1,Math.floor(1/scale)),tile;
 do{const x=Math.max(0,Math.floor(left/step-1)*step),y=Math.max(0,Math.floor(top/step-1)*step),w=Math.min(width,Math.ceil(right/step+1)*step)-x,h=Math.min(height,Math.ceil(bottom/step+1)*step)-y;tile={x,y,w,h,step};if(Math.ceil(w/step)*Math.ceil(h/step)<=maximumPixels)break;step++;}while(true);
 return tile;
}
export function createRemoteSurface(display,cache,request,changed,onError=()=>{}){
 const {width,height}=display,prefix='remote-'+(++serial)+':',key=prefix+'frame',children=new Set();
 let closed=false,pending=null,wanted=null,frame=null,failed=null;
 const identity=t=>t?[t.x,t.y,t.w,t.h,t.step].join(':'):'';
 function available(tile){const canvas=frame&&cache.get(key);return canvas&&frame.step===tile.step&&frame.x<=tile.x&&frame.y<=tile.y&&frame.x+frame.w>=tile.x+tile.w&&frame.y+frame.h>=tile.y+tile.h?canvas:null;}
 function pump(){
  if(closed||pending||!wanted||available(wanted)||failed===identity(wanted))return;
  const tile=wanted,id=identity(tile);pending=id;
  Promise.resolve().then(()=>request('read-display',{display,tile})).then(({pixels})=>{
   if(closed||identity(wanted)!==id)return;
   if(pixels.width!==Math.ceil(tile.w/tile.step)||pixels.height!==Math.ceil(tile.h/tile.step)||pixels.data.length!==pixels.width*pixels.height*3)throw Error('Invalid display frame.');
   const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;
   const context=canvas.getContext('2d'),image=context.createImageData(pixels.width,pixels.height);
   for(let a=0,b=0;a<pixels.data.length;a+=3,b+=4){image.data[b]=pixels.data[a];image.data[b+1]=pixels.data[a+1];image.data[b+2]=pixels.data[a+2];image.data[b+3]=255;}
   context.putImageData(image,0,0);cache.put(key,canvas);frame=tile;failed=null;changed();
  }).catch(error=>{if(!closed&&identity(wanted)===id){failed=id;onError(error);}}).finally(()=>{pending=null;pump();});
 }
 const surface={width,height,byteLength:0,display,
  fork(onChange=changed){const child=createRemoteSurface(display,cache,request,onChange,onError);children.add(child);const close=child.close;child.close=()=>{children.delete(child);close();};return child;},
  async readPixels(rect){return (await request('read-window',{display,rect})).pixels;},
  async readDisplayPixels({x,y,width:w,height:h}){return (await request('read-display',{display,tile:{x,y,w,h,step:1}})).pixels;},
  freeze(){
   // Transfer the last bounded viewport, never copy a complete image. No stale
   // worker requests or exports are possible through this presentation handle.
   const canvas=frame&&cache.take(key);if(!canvas)return null;const saved={...frame};let refs=1;
   const retain=()=>{let released=false;return {width,height,previewOnly:true,prepare:()=>!released,
    draw(ctx){if(released||!canvas.width)return;ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();ctx.drawImage(canvas,saved.x,saved.y,canvas.width*saved.step,canvas.height*saved.step);ctx.restore();},
    fork(){if(released)return null;refs++;return retain();},
    close(){if(released)return;released=true;if(!--refs)canvas.width=canvas.height=0;}
   };};return retain();
  },
  prepare(bounds,scale){if(closed)return false;wanted=displayViewport(width,height,bounds,scale,Math.min(8*1024**2,Math.floor(cache.limit/8)));if(!wanted)return true;const ready=!!available(wanted);if(!ready)pump();return ready;},
  draw(ctx,bounds,scale){surface.prepare(bounds,scale);const canvas=frame&&cache.get(key);if(!canvas||closed)return;
   ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();ctx.drawImage(canvas,frame.x,frame.y,canvas.width*frame.step,canvas.height*frame.step);ctx.restore();
  },
  close(){closed=true;wanted=null;for(const child of [...children])child.close();cache.release(prefix);}
 };
 return surface;
}
