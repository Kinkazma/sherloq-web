import{checkAbort,requireValue,EngineError}from'./errors.js';
import{retireCompositeOwners}from'./composite-owner-release.js';
/** Copies admitted rows, awaits the real source ACK, then lends an independent
 * synchronous row buffer to the existing native preparer. No old request signal
 * is captured. The view itself remains owned by its caller for failed-ACK retry. */
export function createMgcfdnContextRows(view,context,{budget}={}){
 requireValue(view?.domain&&view.readWindow&&context?.rect&&budget?.reserve,'Native MGCFDN context rows require their view and budget.');const domain=view.domain,r=context.rect;requireValue(view.includesRectangle(r),'MGCFDN rows cannot include excluded source pixels.');let closed=false,active=0,finished=Promise.resolve(),finish,disposePromise;const lifetime=new AbortController(),held=new Set(),pending=new Set();
 const api={width:r.width,height:r.height,async readRows(y,rows,{signal}={}){
  requireValue(!closed&&view.domain===domain&&Number.isSafeInteger(y)&&Number.isSafeInteger(rows)&&y>=0&&rows>0&&y+rows<=r.height,'MGCFDN preparation row window.');const max=view.maxReadPixels;requireValue(Number.isSafeInteger(max)&&max>0,'Bounded native MGCFDN source windows required.');signal=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;checkAbort(signal);const free=budget.reserve(r.width*rows*3+256);if(active++===0)finished=new Promise(resolve=>finish=resolve);let window,returned=false,failed=false,primary;
  try{
   const data=new Uint8Array(r.width*rows*3),columns=Math.min(r.width,max),bandRows=Math.max(1,Math.floor(max/columns));
   for(let sy=0;sy<rows;sy+=bandRows)for(let x=0;x<r.width;x+=columns){
    const width=Math.min(columns,r.width-x),height=Math.min(bandRows,rows-sy);checkAbort(signal);if(closed)throw new EngineError('CANCELLED','MGCFDN row source retired.');
    window=await view.readWindow({x:r.x+x,y:r.y+y+sy,width,height},{signal});pending.add(window);checkAbort(signal);
    requireValue(window.pixels?.format==='rgb8'&&window.pixels.width===width&&window.pixels.height===height&&(window.pixels.data instanceof Uint8Array||window.pixels.data instanceof Uint8ClampedArray)&&window.pixels.data.length===width*height*3,'MGCFDN source returned another row population.');
    for(let row=0;row<height;row++)data.set(window.pixels.data.subarray(row*width*3,(row+1)*width*3),((sy+row)*r.width+x)*3);
    await window.release();pending.delete(window);window=null;checkAbort(signal);
   }
   if(closed)throw new EngineError('CANCELLED','MGCFDN row source retired.');let done=false;const loan={pixels:{width:r.width,height:rows,format:'rgb8',data},release(){if(done)return;done=true;held.delete(loan);free();}};held.add(loan);returned=true;return loan;
  }catch(error){failed=true;primary=error;throw error;}finally{try{if(window)await retireCompositeOwners([async()=>{await window.release();pending.delete(window);}],failed?{primary}:{});}finally{if(!returned)free();if(--active===0)finish();}}
 },dispose(){if(disposePromise)return disposePromise;closed=true;lifetime.abort();disposePromise=(async()=>{await finished;await retireCompositeOwners([...pending].map(window=>async()=>{await window.release();pending.delete(window);}).concat([...held].map(loan=>()=>loan.release())));})().catch(error=>{disposePromise=null;throw error;});return disposePromise;}};return api;
}
