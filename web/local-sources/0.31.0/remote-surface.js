let serial=0;
// One immutable, bounded provisional frame. It uses native logical coordinates
// but never asks a worker for pixels after a newer preview has replaced them.
export function createPreviewSurface(pixels,{document=globalThis.document,background,backgroundOrigin=[0,0]}={}){
 const {width:sampleWidth,height:sampleHeight,logicalWidth:width,logicalHeight:height,format,data,preview}=pixels??{};
 if(preview!==true||format!=='rgb8'||![sampleWidth,sampleHeight].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=2048)||![width,height].every(v=>Number.isSafeInteger(v)&&v>=1)||sampleWidth>width||sampleHeight>height||!(data instanceof Uint8Array)||data.length!==sampleWidth*sampleHeight*3)throw Object.assign(Error('Invalid bounded preview surface.'),{code:'INVALID_INPUT'});
 const membership=pixels.membership;if(membership!==undefined&&(!(membership instanceof Uint8Array)||membership.length!==sampleWidth*sampleHeight||membership.some(v=>v!==0&&v!==1)))throw Object.assign(Error('Invalid bounded preview membership.'),{code:'INVALID_INPUT'});
 if(background&&(!Array.isArray(backgroundOrigin)||backgroundOrigin.length!==2||!backgroundOrigin.every(v=>Number.isSafeInteger(v)&&v>=0)||backgroundOrigin[0]+width>background.width||backgroundOrigin[1]+height>background.height||typeof background.fork!=='function'))throw Object.assign(Error('Invalid Original preview underlay.'),{code:'INVALID_INPUT'});
 const underlay=background?.fork();if(background&&!underlay)throw Object.assign(Error('Original preview underlay is no longer available.'),{code:'PREVIEW_UNAVAILABLE'});
 let canvas;try{canvas=document.createElement('canvas');canvas.width=sampleWidth;canvas.height=sampleHeight;const ctx=canvas.getContext('2d'),image=ctx.createImageData(sampleWidth,sampleHeight);for(let a=0,b=0;a<data.length;a+=3,b+=4){image.data[b]=data[a];image.data[b+1]=data[a+1];image.data[b+2]=data[a+2];image.data[b+3]=membership?255*membership[a/3]:255;}ctx.putImageData(image,0,0);}
 catch(error){if(canvas)canvas.width=canvas.height=0;try{underlay?.close();}catch{}throw error;}
 let references=0;
 const unavailable=async()=>{throw Object.assign(Error('A provisional frame cannot provide native pixels or exports.'),{code:'PREVIEW_NOT_EXPORTABLE'});};
 const sourceBounds=b=>b?{left:b.left+backgroundOrigin[0],top:b.top+backgroundOrigin[1],right:b.right+backgroundOrigin[0],bottom:b.bottom+backgroundOrigin[1]}:{left:backgroundOrigin[0],top:backgroundOrigin[1],right:backgroundOrigin[0]+width,bottom:backgroundOrigin[1]+height};
 function retain(){references++;let released=false,closing;return{width,height,previewOnly:true,
  get byteLength(){return released?0:sampleWidth*sampleHeight*4;},
  prepare:(bounds,scale)=>!released&&underlay?.prepare?.(sourceBounds(bounds),scale)!==false,
  draw(ctx,bounds,scale){if(released)return;ctx.save();try{ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();if(underlay){ctx.save();try{ctx.translate(-backgroundOrigin[0],-backgroundOrigin[1]);underlay.draw(ctx,sourceBounds(bounds),scale);}finally{ctx.restore();}}ctx.drawImage(canvas,0,0,width,height);}finally{ctx.restore();}},
  readPixels:unavailable,readDisplayPixels:unavailable,
  fork(){return released?null:retain();},freeze(){return released?null:retain();},
  close(){if(released)return;if(closing)return closing;const finish=()=>{released=true;if(!--references)canvas.width=canvas.height=0;};if(references>1){finish();return;}const ack=underlay?.close();if(ack?.then){closing=Promise.resolve(ack).then(finish,error=>{closing=null;throw error;});return closing;}finish();}
 };}
 return retain();
}
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
 const previewStep=Number.isSafeInteger(display.previewStep)&&display.previewStep>1?display.previewStep:1;
 let closed=false,pending=null,wanted=null,frame=null,failed=null,readEpoch=0,suspended=false;const suspendedChildren=new Map();
 const identity=t=>t?[t.x,t.y,t.w,t.h,t.step].join(':'):'';
 function available(tile){const canvas=frame&&cache.get(key);return canvas&&frame.step===tile.step&&frame.x<=tile.x&&frame.y<=tile.y&&frame.x+frame.w>=tile.x+tile.w&&frame.y+frame.h>=tile.y+tile.h?canvas:null;}
 function pump(){
  if(closed||suspended||pending||!wanted||available(wanted)||failed===identity(wanted))return;
  const tile=wanted,id=identity(tile),epoch=readEpoch,isCurrent=()=>!closed&&!suspended&&readEpoch===epoch&&identity(wanted)===id;pending=id;
  Promise.resolve().then(()=>request('read-display',{display,tile},{isCurrent})).then(({pixels})=>{
   if(!isCurrent())return;
   if(pixels.width!==Math.ceil(tile.w/tile.step)||pixels.height!==Math.ceil(tile.h/tile.step)||pixels.data.length!==pixels.width*pixels.height*3)throw Error('Invalid display frame.');
   const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;
   const context=canvas.getContext('2d'),image=context.createImageData(pixels.width,pixels.height);
   for(let a=0,b=0;a<pixels.data.length;a+=3,b+=4){image.data[b]=pixels.data[a];image.data[b+1]=pixels.data[a+1];image.data[b+2]=pixels.data[a+2];image.data[b+3]=255;}
   context.putImageData(image,0,0);cache.put(key,canvas,()=>{if(closed)return;frame=null;failed=null;changed();});frame=tile;failed=null;changed();
  }).catch(error=>{if(isCurrent()){failed=id;onError(error);}}).finally(()=>{pending=null;pump();});
 }
 const surface={width,height,byteLength:0,display,
  fork(onChange=changed){const child=createRemoteSurface(display,cache,request,onChange,onError);children.add(child);if(suspended)suspendedChildren.set(child,child.suspendDisplayReads());const close=child.close;child.close=()=>{children.delete(child);suspendedChildren.get(child)?.discard();suspendedChildren.delete(child);close();};return child;},
  // Invalidate only display work. Existing pixels and native export routes survive.
  suspendDisplayReads(){
   suspended=true;const epoch=++readEpoch;for(const ticket of suspendedChildren.values())ticket.discard();suspendedChildren.clear();for(const child of children)suspendedChildren.set(child,child.suspendDisplayReads());let active=true;
   return{resume(){if(!active)return;active=false;if(closed||epoch!==readEpoch)return;suspended=false;for(const ticket of suspendedChildren.values())ticket.resume();suspendedChildren.clear();changed();pump();},discard(){if(!active)return;active=false;if(epoch!==readEpoch)return;for(const ticket of suspendedChildren.values())ticket.discard();suspendedChildren.clear();}};
  },
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
  prepare(bounds,scale){if(closed)return false;wanted=displayViewport(width,height,bounds,Math.min(scale,1/previewStep),Math.min(8*1024**2,Math.floor(cache.limit/8)));if(!wanted)return true;const ready=!!available(wanted);if(!ready)pump();return ready;},
  draw(ctx,bounds,scale){surface.prepare(bounds,scale);const canvas=frame&&cache.get(key);if(!canvas||closed)return;
   ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();ctx.drawImage(canvas,frame.x,frame.y,canvas.width*frame.step,canvas.height*frame.step);ctx.restore();
  },
  close(){closed=true;readEpoch++;wanted=null;for(const child of [...children])child.close();suspendedChildren.clear();cache.release(prefix);}
 };
 return surface;
}
