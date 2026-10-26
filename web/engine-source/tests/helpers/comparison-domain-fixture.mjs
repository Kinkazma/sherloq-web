import {Budget} from '../../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../../src/source-region-geometry.js';
import {contiguousSurface} from '../../src/image-sources.js';
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function comparisonFixture({width=64,height=48,rectangles=[[3,5,27,29],[35,7,59,31]],exclusions=[],firstData,secondData,budgetBytes=768*1024**2,poison=0}={}) {
 const first=firstData??Uint8Array.from({length:width*height*3},(_,i)=>(i*37+(i>>3)*7)%256),second=secondData??Uint8Array.from(first,(v,i)=>(v+(i%13===0?17:0))%256),budget=new Budget(budgetBytes);
 const hash=await sha(first),referenceHash=await sha(second),state=await createOriginalSourceRegionsState({sourceSha256:hash,width,height});
 for(const r of rectangles)await state.add('acquisition',{x0:r[0],y0:r[1],x1:r[2],y1:r[3]});for(const r of exclusions)await state.add('exclusion',{x0:r[0],y0:r[1],x1:r[2],y1:r[3]});
 const domain=await compileOriginalSourceRegions(state.snapshot());let reads=0;
 const image=(data,sha256)=>{const surface=contiguousSurface({width,height,data},budget),read=surface.readWindow;return{sha256,surface:{...surface,async readWindow(...args){reads++;return read(...args);}}};};
 return{width,height,first,second,original:image(first,hash),reference:image(second,referenceHash),domain,budget,get reads(){return reads;},selected(data){const values=[];for(let y=0;y<domain.height;y++)for(const[x,right]of domain.rowIntervals(y))for(let i=x;i<right;i++){const at=((y+domain.origin[1])*width+i+domain.origin[0])*3;values.push(data[at],data[at+1],data[at+2]);}return Uint8Array.from(values);}};
}
