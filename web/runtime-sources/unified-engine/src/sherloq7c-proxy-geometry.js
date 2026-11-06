import "../../runtime-context.js?v=0.31.0";
// Output coordinates belong to the selected raster, never the Original grid.
export function proxyGeometry(width,height,maxSide=512){
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||![256,512,1024,2048,'native'].includes(maxSide))throw new TypeError('Invalid proxy geometry');
 const scale=maxSide==='native'?1:Math.min(1,maxSide/Math.max(width,height));
 const outputWidth=Math.max(1,Math.round(width*scale)),outputHeight=Math.max(1,Math.round(height*scale));
 return Object.freeze({originalWidth:width,originalHeight:height,width:outputWidth,height:outputHeight,maxSide,
  reduced:outputWidth!==width||outputHeight!==height,upsampled:false,
  toOriginal:Object.freeze({x:width/outputWidth,y:height/outputHeight}),
  toOutput:Object.freeze({x:outputWidth/width,y:outputHeight/height}),
  coordinateDomain:'selected-output-resolution',pixelIdentity:scale===1?'native':'resampled; no one-to-one Original pixel claim'});
}
export function proxyRectToOriginal(rect,geometry){
 const{x,y,width,height}=rect,g=geometry;
 if(![x,y,width,height].every(Number.isSafeInteger)||x<0||y<0||width<1||height<1||x+width>g.width||y+height>g.height)throw new TypeError('Proxy rectangle outside output');
 const left=Math.floor(x*g.toOriginal.x),top=Math.floor(y*g.toOriginal.y),right=Math.min(g.originalWidth,Math.ceil((x+width)*g.toOriginal.x)),bottom=Math.min(g.originalHeight,Math.ceil((y+height)*g.toOriginal.y));
 return Object.freeze({x:left,y:top,width:right-left,height:bottom-top,mapping:'covering source footprint; not identical pixels'});
}
