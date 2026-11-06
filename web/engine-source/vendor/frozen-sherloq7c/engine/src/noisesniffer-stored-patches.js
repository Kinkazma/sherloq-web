import {checkAbort,controlCheckpoint} from './errors.js';
import {numpySum} from './numpy-sum.js';
// Sparse selected blocks use original RGB byte pages. The logical surface's
// orientation is inverted exactly; no thumbnail or local noise estimate is used.
export function noisesnifferStoredPatches(image,w,{signal}={}){
 if(!image.store)return null;const {sourceWidth:sw,sourceHeight:sh,orientation:o}=image.surface.descriptor,pages=new Map(),size=32768,capacity=128,block=new Float64Array(w*w),squares=new Float64Array(w*w);let last=performance.now();
 const byte=async(x,y,c)=>{let sx=x,sy=y;switch(o){case 2:sx=sw-1-x;break;case 3:sx=sw-1-x;sy=sh-1-y;break;case 4:sy=sh-1-y;break;case 5:sx=y;sy=x;break;case 6:sx=y;sy=sh-1-x;break;case 7:sx=sw-1-y;sy=sh-1-x;break;case 8:sx=sw-1-y;sy=x;break;}const offset=(sy*sw+sx)*3+c,id=Math.floor(offset/size);let page=pages.get(id);if(!page){page=new Uint8Array(Math.min(size,image.store.byteLength-id*size));await image.store.readInto(page,id*size);if(pages.size===capacity)pages.delete(pages.keys().next().value);}else pages.delete(id);pages.set(id,page);return page[offset%size];};
 return {async std(ids,cols,c){const result=new Float64Array(ids.length),order=Uint32Array.from({length:ids.length},(_,i)=>i);order.sort((a,b)=>ids[a]-ids[b]);for(const i of order){checkAbort(signal);if(performance.now()-last>=20){await controlCheckpoint(signal);last=performance.now();}const x=ids[i]%cols,y=Math.floor(ids[i]/cols);for(let dy=0;dy<w;dy++)for(let dx=0;dx<w;dx++)block[dy*w+dx]=await byte(x+dx,y+dy,c);const mean=numpySum(block)/block.length;for(let j=0;j<block.length;j++){const d=block[j]-mean;squares[j]=d*d;}result[i]=Math.sqrt(numpySum(squares)/squares.length);}return result;},clear(){pages.clear();}};
}
