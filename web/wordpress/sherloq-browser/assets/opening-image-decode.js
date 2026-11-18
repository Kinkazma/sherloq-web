// Presentation-only browser decode. Encoded source bytes stay with Original.
// desiredWidth/desiredHeight are best effort in WebCodecs; only the owned
// preview bitmap is bounded here, not an opaque browser codec's internal heap.
const cancelled=()=>Object.assign(Error('Opening preview cancelled.'),{code:'CANCELLED'});
const check=signal=>{if(signal?.aborted)throw cancelled();};
const mime={jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',ico:'image/x-icon'};
export function openingPreviewShape(dimensions,{maximumWidth=4096,maximumHeight=4096,maximumPixels=4*1024**2}={}){
 if(!dimensions||![dimensions.width,dimensions.height].every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isSafeInteger(dimensions.width*dimensions.height))return null;
 if(![maximumWidth,maximumHeight,maximumPixels].every(n=>Number.isSafeInteger(n)&&n>0))return null;
 const swapped=dimensions.orientation>=5&&dimensions.orientation<=8,width=swapped?dimensions.height:dimensions.width,height=swapped?dimensions.width:dimensions.height;
 const scale=Math.min(1,maximumWidth/width,maximumHeight/height,Math.sqrt(maximumPixels/(width*height)));
 return{width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale)),sourceWidth:width,sourceHeight:height};
}
export async function decodeBrowserOpeningPreview(file,{dimensions,shape,signal,imageDecoderClass=globalThis.ImageDecoder,imageBitmapFactory=globalThis.createImageBitmap}={}){
 check(signal);const type=mime[dimensions?.format];if(!type||!shape)return null;
 // The bitmap route below explicitly applies EXIF orientation. VideoFrame
 // orientation behavior is codec-dependent, so only orientation1 uses it.
 if(dimensions.orientation===1&&typeof imageDecoderClass==='function'&&typeof imageDecoderClass.isTypeSupported==='function'&&typeof file?.stream==='function'){
  let decoder=null,frame=null,retained=false,abort=null,decoderClosed=false;const closeDecoder=()=>{if(decoder&&!decoderClosed){decoderClosed=true;decoder.close();}};
  try{
   if(await imageDecoderClass.isTypeSupported(type)){
    check(signal);decoder=new imageDecoderClass({type,data:file.stream(),desiredWidth:shape.width,desiredHeight:shape.height,colorSpaceConversion:'default',preferAnimation:false});
    abort=()=>{try{closeDecoder();}catch{}};signal?.addEventListener('abort',abort,{once:true});check(signal);
    const decoded=await decoder.decode({frameIndex:0,completeFramesOnly:true});frame=decoded?.image;check(signal);
    if(frame){retained=true;let closed=false;return{image:frame,decoder:'browser-image-decoder',decodedWidth:frame.displayWidth??frame.codedWidth,decodedHeight:frame.displayHeight??frame.codedHeight,dispose(){if(closed)return;closed=true;signal?.removeEventListener('abort',abort);try{frame.close();}finally{closeDecoder();}}};}
   }
  }catch(error){if(signal?.aborted)throw cancelled();}
  finally{if(!retained){signal?.removeEventListener('abort',abort);try{frame?.close();}finally{closeDecoder();}}}
 }
 check(signal);if(typeof imageBitmapFactory!=='function')return null;
 const bitmap=await imageBitmapFactory(file,{resizeWidth:shape.width,resizeHeight:shape.height,resizeQuality:'high',imageOrientation:'from-image',colorSpaceConversion:'default',premultiplyAlpha:'default'});
 if(signal?.aborted){bitmap?.close?.();throw cancelled();}
 if(!bitmap)return null;let closed=false;return{image:bitmap,decoder:'browser-image-bitmap',decodedWidth:bitmap.width,decodedHeight:bitmap.height,dispose(){if(closed)return;closed=true;bitmap.close?.();}};
}
