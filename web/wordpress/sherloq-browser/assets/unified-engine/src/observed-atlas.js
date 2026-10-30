import "../../runtime-context.js?v=0.30.0";
import {checkAbort,controlCheckpoint,requireValue} from './errors.js';
import {gray} from './pixel-utils.js';
import {sourceRegionLocalSupport} from './source-region-local-support.js';
const reflect=(x,n)=>{if(n===1)return 0;const period=2*n-2;let v=x%period;if(v<0)v+=period;return v<n?v:period-v;};

// target and centres are prepaid by the provider. The source loan is adopted
// immediately on return, before any checkpoint or filling, and retired by that
// same transaction before it reuses this scratch for the following core.
export async function prepareObservedNlmAtlasInto(view,domain,core,{target,centres,signal,cooperate,adoptSource,reserve}={}){
 const radius=13,side=27,atlasWidth=core.width*side;
 requireValue(core.observedBoundary&&core.height===1&&Number.isSafeInteger(core.width)&&core.width>0&&target instanceof Uint8Array&&target.length===atlasWidth*side*3&&centres instanceof Uint8Array&&centres.length===core.width*3&&typeof adoptSource==='function'&&typeof reserve==='function','Prepaid observed NLM atlas and source adopter required');
 checkAbort(signal);const support=sourceRegionLocalSupport(domain,core,radius),lease=await view.readMaskedWindow(support,{signal,reserve,adoptSource});adoptSource(lease);checkAbort(signal);
 const{data,membership}=lease.pixels,observed=(x,y)=>membership[(y-support.y)*support.width+x-support.x]===1,yieldUseful=cooperate??(()=>controlCheckpoint(signal));
 for(let i=0;i<core.width;i++){
  if((i&15)===0)await yieldUseful();checkAbort(signal);const x=core.x+i,y=core.y;requireValue(observed(x,y),'A separation centre is absent from its domain.');const centre=((y-support.y)*support.width+x-support.x)*3;for(let c=0;c<3;c++)centres[i*3+c]=data[centre+c];
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   let sx=reflect(x+dx,domain.width),sy=reflect(y+dy,domain.height);if(!observed(sx,sy)){sx=reflect(x-dx,domain.width);sy=reflect(y-dy,domain.height);if(!observed(sx,sy)){sx=x;sy=y;}}
   const at=((sy-support.y)*support.width+sx-support.x)*3,out=((dy+radius)*atlasWidth+i*side+dx+radius)*3;target[out]=data[at];target[out+1]=data[at+1];target[out+2]=data[at+2];
  }
 }
 return{width:atlasWidth,height:side,format:'rgb8',data:target};
}

// In-place core view into the still-funded CPU result. The caller copies it
// before releasing the shared loan and preserves the existing histogram order.
export function renderObservedNlmBatchCore(result,index,p){
 const entry=result?.atlasEntries?.[index];requireValue(entry&&result.bytes instanceof Uint8Array&&result.originalRgb instanceof Uint8Array&&result.bytes.length===result.originalRgb.length,'Owned NLM batch result required');
 const offset=entry.prefixWidth/27*3,length=entry.points*3;requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset+length<=result.bytes.length,'NLM core scatter bounds');const bytes=result.bytes.subarray(offset,offset+length);
 if(!p.denoised)for(let i=0;i<entry.points;i++){const at=offset+i*3,g=p.grayscale?gray(result.originalRgb[at],result.originalRgb[at+1],result.originalRgb[at+2]):0;for(let c=0;c<3;c++)bytes[i*3+c]=Math.abs((p.grayscale?g:result.originalRgb[at+c])-bytes[i*3+c]);}
 return bytes;
}
