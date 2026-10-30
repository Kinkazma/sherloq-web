import "../../runtime-context.js?v=0.30.0";
import {checkAbort,createCooperator,requireValue,EngineError} from './errors.js';
import {numpySum} from './numpy-sum.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// The same native np.std arithmetic as the full-memory selector, in its
// original per-bin order. Equal-row overlapping supports may share a read:
// their union is a rectangle containing admitted observations exclusively.
export function noisesnifferScientificPatches(image,w,{signal}={}){
 requireValue(typeof image.readScientificPatch==='function'&&[3,5,7,8].includes(w),'A strict native patch reader is required.');
 const pending=new Set(),active=new Set(),cooperate=createCooperator(signal);let closed=false,retiring;
 const alive=()=>{checkAbort(signal);if(closed)throw new EngineError('DISPOSED','Scientific patch reader closed.');};
 async function retire(frame){await frame.release?.();pending.delete(frame);}
 const api={
  async std(ids,cols,c){
   alive();
   requireValue(ids instanceof Uint32Array&&Number.isSafeInteger(cols)&&cols>0&&Number.isSafeInteger(c)&&c>=0&&c<3,'Invalid native patch selection.');
   let finish;const done=new Promise(resolve=>finish=resolve);active.add(done);try{
   const result=new Float64Array(ids.length),order=Uint32Array.from({length:ids.length},(_,i)=>i);order.sort((a,b)=>ids[a]-ids[b]);
   const block=new Float64Array(w*w),squares=new Float64Array(w*w);
   for(let at=0;at<order.length;){
    await cooperate();alive();const y=Math.floor(ids[order[at]]/cols),left=ids[order[at]]%cols;let right=left+w,end=at+1;
    while(end<order.length){const id=ids[order[end]],x=id%cols;if(Math.floor(id/cols)!==y||x>right||Math.max(right,x+w)-left>Math.floor(65536/w))break;right=Math.max(right,x+w);end++;}
    const rect={x:left,y,width:right-left,height:w},frame=await image.readScientificPatch(rect,{signal});pending.add(frame);let primary;
    try{
     alive();const pixels=frame.pixels;requireValue(pixels?.format==='rgb8'&&pixels.width===rect.width&&pixels.height===w&&pixels.data instanceof Uint8Array&&pixels.data.length===rect.width*w*3,'Native patch source returned another RGB grid.');
     for(let k=at;k<end;k++){await cooperate();const i=order[k],x=ids[i]%cols-left;for(let dy=0;dy<w;dy++)for(let dx=0;dx<w;dx++)block[dy*w+dx]=pixels.data[(dy*rect.width+x+dx)*3+c];const mean=numpySum(block)/block.length;for(let j=0;j<block.length;j++){const d=block[j]-mean;squares[j]=d*d;}result[i]=Math.sqrt(numpySum(squares)/squares.length);}
    }catch(error){primary=error;throw error;}finally{await retireCompositeOwners([()=>retire(frame)],primary?{primary}:{});}
    at=end;
   }
   alive();return result;}finally{active.delete(done);finish();}
  },
  flush(){checkAbort(signal);},
  dispose(){if(retiring)return retiring;closed=true;return retiring=(async()=>{await Promise.all(active);await retireCompositeOwners([...pending].map(frame=>()=>retire(frame)));})().finally(()=>{retiring=null;});}
 };
 api.clear=api.dispose;return api;
}
