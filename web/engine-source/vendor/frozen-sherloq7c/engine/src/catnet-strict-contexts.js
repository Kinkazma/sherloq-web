import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

/** Coordinates of pixel edges, before and after Original EXIF orientation. */
export function catnetRawBoundsToOriginal(bounds,{sourceWidth:w,sourceHeight:h,orientation:o=1}){
 requireValue([w,h].every(v=>Number.isSafeInteger(v)&&v>0)&&Number.isInteger(o)&&o>=1&&o<=8,'Invalid original CAT-Net JPEG geometry.');
 requireValue(Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isSafeInteger)&&bounds[0]>=0&&bounds[1]>=0&&bounds[2]>bounds[0]&&bounds[3]>bounds[1]&&bounds[2]<=w&&bounds[3]<=h,'Invalid raw CAT-Net context bounds.');
 const point=(x,y)=>{switch(o){case 2:return[w-x,y];case 3:return[w-x,h-y];case 4:return[x,h-y];case 5:return[y,x];case 6:return[h-y,x];case 7:return[h-y,w-x];case 8:return[y,w-x];default:return[x,y];}},a=point(bounds[0],bounds[1]),b=point(bounds[2],bounds[3]);
 return[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
}
export function catnetObservedOriginalPixels(domain,bounds){let count=0;for(let y=bounds[1];y<bounds[3];y++)for(const[a,b]of domain.originalRowIntervals(y))count+=Math.max(0,Math.min(b,bounds[2])-Math.max(a,bounds[0]));return count;}
/** Stored luminance coefficients cannot be recomputed from a selected RGB
 * crop. Each scientific context therefore contains complete stored Y blocks
 * whose physical Original support is admitted. Actual image-edge padding is
 * retained, exactly as in the native full-image path. This does not claim a
 * single HRNet inference equivalent to the full original for a fragmented
 * domain, or that a partially selected DCT block was analyzed. */
export async function planCatnetStrictContexts(domain,geometry,{budget,signal}={}){
 const {sourceWidth:w,sourceHeight:h,orientation:o=1}=geometry??{};geometry=Object.freeze({sourceWidth:w,sourceHeight:h,orientation:o});
 catnetRawBoundsToOriginal([0,0,w,h],{sourceWidth:w,sourceHeight:h,orientation:o});
 requireValue(domain&&typeof domain.originalRowIntervals==='function'&&typeof domain.fingerprint==='string'&&domain.sourceWidth===(o>=5?h:w)&&domain.sourceHeight===(o>=5?w:h),'CAT-Net scope does not belong to the original oriented JPEG grid.');
 requireValue(budget&&typeof budget.reserve==='function','CAT-Net context metadata requires explicit memory admission.');
 const columns=Math.ceil(w/8),rowLease=budget.reserve(columns*128+4096),leases=[],contexts=[];let active=new Map(),completeBlocks=0,partialBlocks=0,selectedInPartialBlocks=0,evaluatedPixels=0,steps=0;
 const emit=raw=>{const rawBounds=[raw.x,raw.y,raw.x+raw.width,raw.y+raw.height],bounds=catnetRawBoundsToOriginal(rawBounds,geometry);contexts.push(Object.freeze({index:contexts.length,domainFingerprint:domain.fingerprint,rawBounds:Object.freeze(rawBounds),bounds:Object.freeze(bounds),sourceShape:Object.freeze([raw.height,raw.width]),paddedShape:Object.freeze([Math.ceil(raw.height/8)*8,Math.ceil(raw.width/8)*8]),orientation:o,pixels:raw.width*raw.height}));};
 try{
  for(let y=0;y<h;y+=8){const height=Math.min(8,h-y),runs=[];let begin=null;
   for(let x=0;x<w;x+=8){checkAbort(signal);const width=Math.min(8,w-x),bounds=catnetRawBoundsToOriginal([x,y,x+width,y+height],geometry),observed=catnetObservedOriginalPixels(domain,bounds),whole=observed===width*height;
    if(whole){completeBlocks++;evaluatedPixels+=observed;if(begin===null)begin=x;}else{if(observed){partialBlocks++;selectedInPartialBlocks+=observed;}if(begin!==null){runs.push([begin,x]);begin=null;}}
    if(++steps%128===0)await controlCheckpoint(signal);
   }
   if(begin!==null)runs.push([begin,w]);const next=new Map();
   for(const[x,right]of runs){const key=x+':'+right,prior=active.get(key);if(prior)next.set(key,{...prior,height:prior.height+height});else{leases.push(budget.reserve(4096));next.set(key,{x,y,width:right-x,height});}}
   for(const[key,value]of active)if(!next.has(key))emit(value);active=next;
  }
  for(const value of active.values())emit(value);checkAbort(signal);
  requireValue(evaluatedPixels+selectedInPartialBlocks===domain.countIncluded,'CAT-Net block support differs from the selected Original observations.');
  let released=false;return Object.freeze({contexts:Object.freeze(contexts),selectedPixels:domain.countIncluded,evaluatedPixels,nonEvaluablePixels:selectedInPartialBlocks,completeBlocks,partialBlocks,sourceGeometry:Object.freeze({...geometry}),domainFingerprint:domain.fingerprint,semantics:'Independent native HRNet contexts using unchanged stored Y-DCT categories and quantization table; RGB observations are borrowed from the already decoded Original, not reconstructed from selected coefficients.',nonEvaluableReason:selectedInPartialBlocks?'selected-pixels-share-a-stored-Y-DCT-block-with-unselected-observations':null,release(){if(released)return;released=true;rowLease();for(const lease of leases)lease();}});
 }catch(error){rowLease();for(const lease of leases)lease();throw error;}
}
