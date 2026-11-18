import {bindPlotCamera,createPlotCamera} from './scatter-view.js?v=0.33.2';
import {watchCanvas2D} from './canvas-context-recovery.js?v=0.33.2';

// The ordinary image viewer's financed remote surface and complete-frame cache.
// PCA contributes only a second camera and canvas, never another pixel cache.
export function createPcaRasterView({document,parent,display,createDisplaySurface,getNavigationMode,notify=()=>{},initialPresentation}={}){
 if(typeof createDisplaySurface!=='function')return null;
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d'),camera=createPlotCamera();
 canvas.className='pca-raster-canvas';canvas.tabIndex=0;canvas.setAttribute('aria-label','Image PCA · déplacer et zoomer');parent.append(canvas);
 let disposed=false,frame=null,lastGeometry=null,requestedGeometry=null,surface;
 function draw(){
  frame=null;if(disposed)return;
  const width=parent.clientWidth,height=parent.clientHeight;if(!width||!height)return;
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
  if(!surface.prepare(bounds,scale*dpr))return;
  if(canvas.width!==Math.round(width*dpr))canvas.width=Math.round(width*dpr);
  if(canvas.height!==Math.round(height*dpr))canvas.height=Math.round(height*dpr);
  if(graphics.lost||context.isContextLost?.())return;
  context.setTransform(dpr,0,0,dpr,0,0);context.fillStyle='#17181a';context.fillRect(0,0,width,height);
  context.save();try{context.translate(left,top);context.scale(scale,scale);context.imageSmoothingEnabled=scale*dpr<3;surface.draw(context,bounds,scale*dpr);}finally{context.restore();}
  lastGeometry={...requestedGeometry};
 }
 function requestDraw(){if(!disposed&&frame===null)frame=requestAnimationFrame(draw);}
 const graphics=watchCanvas2D(canvas,{onRestored:requestDraw});
 try{surface=createDisplaySurface(display,requestDraw,error=>{if(!disposed&&error?.code!=='CANCELLED')notify(error.message);});if(!surface?.prepare||!surface?.draw||!surface?.close)throw Error('The shared PCA display surface is unavailable.');}
 catch(error){graphics.dispose();canvas.remove();canvas.width=canvas.height=1;throw error;}
 function fit(){initialPresentation=null;Object.assign(camera,createPlotCamera());requestDraw();}
 const navigation=bindPlotCamera(canvas,{camera,style:()=>({kind:'2d'}),changed:requestDraw,reset:fit,snap:fit,getNavigationMode});
 const resize=new ResizeObserver(requestDraw);resize.observe(parent);requestDraw();
 return {redraw:requestDraw,fit,setInitialPresentation(value){initialPresentation=value;requestDraw();},get camera(){return {...camera};},get geometry(){return lastGeometry&&{...lastGeometry};},get requestedGeometry(){return requestedGeometry&&{...requestedGeometry};},dispose(){if(disposed)return;disposed=true;navigation.dispose();resize.disconnect();graphics.dispose();surface.close();if(frame!==null)cancelAnimationFrame(frame);canvas.remove();canvas.width=canvas.height=1;}};
}
