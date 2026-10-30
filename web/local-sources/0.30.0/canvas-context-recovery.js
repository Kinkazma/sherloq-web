// Canvas2D restoration is allowed by leaving contextlost uncancelled.
// Unlike WebGL, preventDefault() would prohibit the browser restoring it.
export function watchCanvas2D(canvas,{onLost=()=>{},onRestored=()=>{}}={}){
 let lost=false,disposed=false,epoch=0;
 const unavailable=()=>{if(disposed)return;lost=true;epoch++;onLost({epoch});};
 const restored=()=>{if(disposed)return;lost=false;onRestored({epoch});};
 canvas.addEventListener?.('contextlost',unavailable);canvas.addEventListener?.('contextrestored',restored);
 return {get lost(){return lost;},get epoch(){return epoch;},dispose(){if(disposed)return;disposed=true;canvas.removeEventListener?.('contextlost',unavailable);canvas.removeEventListener?.('contextrestored',restored);}};
}
