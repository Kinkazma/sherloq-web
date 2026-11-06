import {allocateOwnedTypedArray} from './allocation.js';
import {createRgbRowRetirement} from './rgb-row-retirement.js';
import {prepareAlikedRows} from './aliked-rows.js';
import {requireValue,checkAbort} from './errors.js';
/** Literal admitted RGB bridge. Refused upstream release ACKs stay reachable
 * through owner.dispose(), which the caller captures synchronously. */
export function createAlikedStrictRows(view,rect,{budget,signal,onOwner}={}){
 requireValue(view?.includesRectangle?.(rect)&&typeof view.readWindow==='function'&&Number.isSafeInteger(view.maxReadPixels)&&view.maxReadPixels>0&&budget?.reserve&&typeof onOwner==='function','ALIKED literal RGB rows require an admitted window and a synchronous retirement owner sink.');
 const loans=createRgbRowRetirement(),pending=new Set(),buffers=new Set(),borrowers=new Set(),controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;let closed=false,retirement;
 const owner={dispose(){closed=true;controller.abort();if(retirement)return retirement;const task=(async()=>{await Promise.allSettled([...pending]);await loans.dispose();await Promise.all([...borrowers]);requireValue(buffers.size===0,'ALIKED strict RGB borrower acknowledgment is incomplete.');})();retirement=task;void task.catch(()=>{if(retirement===task)retirement=null;});return task;},get liveLoans(){return loans.hasLiveRows;}};onOwner(owner);
 return{format:'rgb8',width:rect.width,height:rect.height,
  readRows(y,count,{signal:readSignal}={}){
   const current=readSignal?AbortSignal.any([combined,readSignal]):combined;
   const task=(async()=>{requireValue(!closed&&Number.isSafeInteger(y)&&Number.isSafeInteger(count)&&y>=0&&count>0&&y+count<=rect.height,'ALIKED strict row range changed.');checkAbort(current);const out=allocateOwnedTypedArray(Uint8Array,rect.width*count*3,{budget,owner:'aliked-strict-RGB-row'});buffers.add(out);let returned=false;
    try{const columns=Math.min(rect.width,view.maxReadPixels),rows=Math.max(1,Math.floor(view.maxReadPixels/columns));for(let yy=0;yy<count;yy+=rows)for(let x=0;x<rect.width;x+=columns){checkAbort(current);const width=Math.min(columns,rect.width-x),height=Math.min(rows,count-yy),window={x:rect.x+x,y:rect.y+y+yy,width,height};requireValue(view.includesRectangle(window),'ALIKED RGB support crossed forbidden pixels.');const lease=loans.hold(await view.readWindow(window,{signal:current}));let failed=false,primary;
      try{checkAbort(current);requireValue(lease?.pixels?.format==='rgb8'&&lease.pixels.width===width&&lease.pixels.height===height&&lease.pixels.data instanceof Uint8Array&&lease.pixels.data.length===width*height*3,'ALIKED RGB loan changed.');for(let row=0;row<height;row++)out.data.set(lease.pixels.data.subarray(row*width*3,(row+1)*width*3),((yy+row)*rect.width+x)*3);}catch(error){failed=true;primary=error;}
      try{await loans.release(lease);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;
     }checkAbort(current);let released=false,ack;const borrowed=new Promise(resolve=>ack=resolve);borrowers.add(borrowed);returned=true;return{pixels:{format:'rgb8',width:rect.width,height:count,data:out.data},release(){if(released)return;released=true;out.release();buffers.delete(out);borrowers.delete(borrowed);ack();}};
    }finally{if(!returned){out.release();buffers.delete(out);}}
   })();pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task;
  },owner
 };
}
/** No graph inference. The existing selected-aspect/Gaussian/bilinear native rows
 * preparer is used unchanged. onOwner captures bridge and preparer owners
 * before construction can await; callers retain them through cleanup ACKs. */
export function prepareAlikedStrictContext(view,context,{budget,signal,onProgress,wasmBinary,onOwner,inputSide=1024}={}){
 requireValue(context?.nativeInputEvaluable&&typeof onOwner==='function','Native ALIKED input dimensions and synchronous owner capture are required.');
 const rows=createAlikedStrictRows(view,context.rect,{budget,signal,onOwner});return prepareAlikedRows(rows,{budget,signal,onProgress,wasmBinary,onOwner,inputSide});
}
