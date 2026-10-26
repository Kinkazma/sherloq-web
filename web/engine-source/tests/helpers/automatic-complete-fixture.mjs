import assert from 'node:assert/strict';
import {Budget} from '../../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../../src/source-region-geometry.js';
export const poly=(x,y,r,b)=>[[x,y],[r,y],[r,b],[x,b]];
export async function fixture({width=192,height=96,hole=[80,0,88,96],poison=0}={}){
 const budget=new Budget(1024**3),sha='a'.repeat(64),state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});
 await state.add('acquisition',{bounds:[0,0,width,height]});if(hole)await state.add('exclusion',{bounds:hole});
 const domain=await compileOriginalSourceRegions(state.snapshot()),reads=[];
 const source={sha256:sha,descriptor:{id:'actual-original',revision:1,width,height,format:'rgb8'},async readWindow(rect,{signal}={}){
  assert.ok(!signal?.aborted);for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++)assert.ok(domain.containsOriginal(x,y),'An excluded RGB observation was read before a native branch');
  reads.push({...rect});const release=budget.reserve(rect.width*rect.height*3),data=Uint8Array.from({length:rect.width*rect.height*3},(_,i)=>{const x=rect.x+Math.floor(i/3)%rect.width,y=rect.y+Math.floor(i/3/rect.width);return domain.containsOriginal(x,y)?(x*13+y*7+i%3*41)%256:poison;});
  return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release};
 }};
 const acquisition={x0:0,y0:0,x1:width,y1:height,polygon:poly(0,0,width,height)},scope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',sourceSha256:sha,width,height,status:'ready',fingerprint:'complete-fixture',regions:[acquisition],searchRegions:[acquisition],excluded:hole?[poly(...hole)]:[],text:{status:'complete'},individual:{schema:'sherloq.individual-scientific-scope/1',originalPixelsPreserved:true,geometricRectangles:[{kind:'acquisition',...acquisition},...(hole?[{kind:'exclusion',x0:hole[0],y0:hole[1],x1:hole[2],y1:hole[3],polygon:poly(...hole)}]:[])]}};
 const image={sha256:sha,surface:source,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin]};
 const task={id:'complete',imageId:'image',operation:'analysis.complete',backend:'cpu',params:{selection:{regions:[acquisition.polygon],envelope:acquisition.polygon,disabled:[]},scientificScope:scope}};
 return{budget,domain,image,source,scope,task,reads};
}
