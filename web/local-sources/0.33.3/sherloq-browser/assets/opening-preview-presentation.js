// The existing display/loupe surface contract borrows one bounded opening raster. No pixels
// are exposed as scientific input; the immutable bounded raster is borrowed.
export function createOpeningPresentationOwner({getFrame,getDimensions,isCurrent=()=>true,onReleased=()=>{}}={}){
 let closing=false,closed=false,references=0,resolveRetired,retirement;
 const unavailable=async()=>{throw Object.assign(Error('Opening presentation has no scientific pixels or export.'),{code:'PREVIEW_NOT_EXPORTABLE'});};
 function finish(){if(closing&&!references&&!closed){closed=true;onReleased();resolveRetired?.();}}
 function borrow(){
  const frame=getFrame?.(),size=getDimensions?.();if(closing||!isCurrent()||!frame||![size?.width,size?.height].every(n=>Number.isSafeInteger(n)&&n>0))return null;
  references++;let released=false;
  const surface={width:size.width,height:size.height,previewOnly:true,openingPresentation:true,get byteLength(){return 0;},prepare:()=>!released&&!closing&&isCurrent()&&!!getFrame(),draw(context){const raster=getFrame();if(!released&&!closing&&isCurrent()&&raster)context.drawImage(raster,0,0,size.width,size.height);},readPixels:unavailable,readDisplayPixels:unavailable,fork(){return released?null:borrow();},close(){if(released)return;released=true;references--;finish();}};
  return surface;
 }
 return{borrow,get references(){return references;},get closing(){return closing;},retire(){if(retirement)return retirement;closing=true;retirement=new Promise(resolve=>resolveRetired=resolve);finish();return retirement;}};
}
