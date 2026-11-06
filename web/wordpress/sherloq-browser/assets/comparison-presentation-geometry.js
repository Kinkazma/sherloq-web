// Viewport geometry only: native Original descriptors, pixels and export sizes
// remain untouched. Separate axis factors preserve the rounded output borders.
export function comparisonPresentationGeometry(original,reference,{zoom,offset,width,height}){
 if(!original||!reference||![original.width,original.height,reference.width,reference.height,width,height,zoom].every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(offset?.x)||!Number.isFinite(offset?.y))return null;
 const x=reference.width/original.width,y=reference.height/original.height;
 return {x,y,samplingScale:zoom*Math.max(x,y),bounds:{left:-offset.x/(zoom*x),top:-offset.y/(zoom*y),right:(width-offset.x)/(zoom*x),bottom:(height-offset.y)/(zoom*y)}};
}

// Project Original-space contours onto the actual selected SHERLOQ raster.
// Capture dimensions with the frame: another source must not move an old view.
export function sourceRegionPresentationGeometry(frame,presentation){
 const original=presentation?.sourceDimensions;
 if(!presentation?.sherloqOutput||!frame||!original||![frame.width,frame.height,original.width,original.height].every(n=>Number.isSafeInteger(n)&&n>0))return null;
 return{x:frame.width/original.width,y:frame.height/original.height};
}
