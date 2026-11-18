import {bindPlotCamera,createPlotCamera} from './scatter-view.js?v=0.33.2';
import {watchCanvas2D} from './canvas-context-recovery.js?v=0.33.2';

// The ordinary image viewer's financed remote surface and complete-frame cache.
// PCA contributes only a second camera and canvas, never another pixel cache.
export function createPcaRasterView({document,parent,display,createDisplaySurface,getNavigationMode,notify=()=>{},initialPresentation}={}){
 if(typeof createDisplaySurface!=='function')return null;
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d'),camera=createPlotCamera();
 canvas.className='pca-raster-canvas';canvas.tabIndex=0;canvas.setAttribute('aria-label','Image PCA · déplacer et zoomer');parent.append(canvas);
 let disposed=false,frame=null,lastGeometry=null,requestedGeometry=null,active,pending;const retiring=new Set();
 const current=record=>!disposed&&record&&record.isCurrent()===true;
 function retire(record){if(!record)return;retiring.add(record);if(record.retirement)return record.retirement;const acknowledge=value=>{if(value===false||value===0)throw Error('PCA raster retirement was not acknowledged.');retiring.delete(record);};const result=record.surface.close();if(result?.then){const task=Promise.resolve(result).then(acknowledge);record.retirement=task;void task.finally(()=>{if(record.retirement===task)record.retirement=null;}).catch(()=>{});return task;}acknowledge(result);}
 function retireQuietly(record){try{const task=retire(record);if(task?.then)void task.catch(error=>{if(!disposed)notify(error.message);});}catch(error){if(!disposed)notify(error.message);}}
 function makeSurface(value,isCurrent){const record={display:value,isCurrent,surface:null};record.surface=createDisplaySurface(value,()=>{if((active===record||pending===record)&&current(record))requestDraw();},error=>{if((active===record||pending===record)&&current(record)&&error?.code!=='CANCELLED')notify(error.message);});if(!record.surface?.prepare||!record.surface?.draw||!record.surface?.close){record.surface?.close?.();throw Error('The shared PCA display surface is unavailable.');}return record;}
 function draw(){
  frame=null;if(disposed)return;
  const width=parent.clientWidth,height=parent.clientHeight;if(!width||!height)return;
  const record=pending??active;if(!current(record))return;const display=record.display,surface=record.surface;
  const dpr=Math.min(document.defaultView?.devicePixelRatio||1,2);
  if(graphics.lost||context.isContextLost?.()){
   if(canvas.width!==Math.round(width*dpr))canvas.width=Math.round(width*dpr);
   if(canvas.height!==Math.round(height*dpr))canvas.height=Math.round(height*dpr);
   return;
  }
  const fitScale=Math.min(width/display.width,height/display.height)*.95;
  if(initialPresentation){const previous=initialPresentation;initialPresentation=null;if(Number.isFinite(previous.scale)&&previous.scale>0&&previous.width===display.width&&previous.height===display.height){camera.zoom=previous.scale/fitScale;const cx=(previous.viewportWidth/2-previous.offsetX)/previous.scale,cy=(previous.viewportHeight/2-previous.offsetY)/previous.scale;if(Number.isFinite(cx)&&Number.isFinite(cy)){camera.x=(display.width/2-cx)*previous.scale;camera.y=(display.height/2-cy)*previous.scale;}}}
  const scale=fitScale*camera.zoom,left=(width-display.width*scale)/2+camera.x,top=(height-display.height*scale)/2+camera.y;
  requestedGeometry={width,height,dpr,scale,left,top,imageWidth:display.width*scale,imageHeight:display.height*scale};
  const bounds={left:-left/scale,top:-top/scale,right:(width-left)/scale,bottom:(height-top)/scale};
  // Exactly the main viewer contract: no clear, resize or crop reprojection
  // until the shared surface can paint a complete current viewport frame.
  if(!surface.prepare(bounds,scale*dpr)||!current(record)||(pending??active)!==record)return;
  if(canvas.width!==Math.round(width*dpr))canvas.width=Math.round(width*dpr);
  if(canvas.height!==Math.round(height*dpr))canvas.height=Math.round(height*dpr);
  if(graphics.lost||context.isContextLost?.())return;
  context.setTransform(dpr,0,0,dpr,0,0);context.fillStyle='#17181a';context.fillRect(0,0,width,height);
  context.save();try{context.translate(left,top);context.scale(scale,scale);context.imageSmoothingEnabled=scale*dpr<3;surface.draw(context,bounds,scale*dpr);}finally{context.restore();}
  lastGeometry={...requestedGeometry};
  if(pending===record){const previous=active;active=record;pending=null;retireQuietly(previous);}
 }
 function requestDraw(){if(!disposed&&frame===null)frame=requestAnimationFrame(draw);}
 const graphics=watchCanvas2D(canvas,{onRestored:requestDraw});
 try{active=makeSurface(display,()=>true);}
 catch(error){graphics.dispose();canvas.remove();canvas.width=canvas.height=1;throw error;}
 function fit(){initialPresentation=null;Object.assign(camera,createPlotCamera());requestDraw();}
 function setDisplay(value,{isCurrent=()=>true}={}){if(disposed||isCurrent()!==true)return false;if(!value||!Number.isSafeInteger(value.width)||!Number.isSafeInteger(value.height)||value.width<1||value.height<1)throw Error('Invalid PCA raster display.');const record=pending??active;if(record?.display===value){record.isCurrent=isCurrent;requestDraw();return true;}const next=makeSurface(value,isCurrent),obsolete=pending;pending=next;retireQuietly(obsolete);requestDraw();return true;}
 const navigation=bindPlotCamera(canvas,{camera,style:()=>({kind:'2d'}),changed:requestDraw,reset:fit,snap:fit,getNavigationMode});
 const resize=new ResizeObserver(requestDraw);resize.observe(parent);requestDraw();
 return {redraw:requestDraw,fit,setDisplay,setInitialPresentation(value){initialPresentation=value;requestDraw();},get camera(){return {...camera};},get geometry(){return lastGeometry&&{...lastGeometry};},get requestedGeometry(){return requestedGeometry&&{...requestedGeometry};},dispose(){if(!disposed){disposed=true;navigation.dispose();resize.disconnect();graphics.dispose();if(frame!==null)cancelAnimationFrame(frame);canvas.remove();canvas.width=canvas.height=1;if(active)retiring.add(active);if(pending)retiring.add(pending);active=pending=null;}const tasks=[],failures=[];for(const record of [...retiring])try{const task=retire(record);if(task?.then)tasks.push(task);}catch(error){failures.push(error);}if(tasks.length)return Promise.allSettled(tasks).then(results=>{for(const result of results)if(result.status==='rejected')failures.push(result.reason);if(failures.length)throw failures[0];});if(failures.length)throw failures[0];}};
}
