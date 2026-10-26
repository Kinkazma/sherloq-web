// Controlled graph outputs only. The real geometry, FP32 postprocessor and
// renderer are used; this fixture never claims model/weight qualification.
import {Budget} from '../../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../../src/source-region-geometry.js';
import {cfaPostprocess} from '../../src/cfa-postprocess.js';
import {checkAbort} from '../../src/errors.js';
import {createCfaStrictAnalyzer} from '../../src/cfa-strict-analyzer.js';
export async function cfaFixture({rectangles=[[0,0,96,80]],exclusions=[],width=120,height=96,poison=0,budgetBytes=16*1024**2,onAnalyze}={}) {
 const sha='a'.repeat(64),state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});
 for(const b of rectangles)await state.add('acquisition',{x0:b[0],y0:b[1],x1:b[2],y1:b[3]});
 for(const b of exclusions)await state.add('exclusion',{x0:b[0],y0:b[1],x1:b[2],y1:b[3]});
 const domain=await compileOriginalSourceRegions(state.snapshot()),budget=new Budget(budgetBytes),calls=[],held=new Set(),windows=new Set();let disposed=0;
 const image={sha256:sha,surface:{descriptor:{id:'original',revision:1,width,height,format:'rgb8'},async readWindow(rect,{signal}={}){
  checkAbort(signal);if(rect.x<0||rect.y<0||rect.x+rect.width>width||rect.y+rect.height>height)throw Error('source grid');
  const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)for(let c=0;c<3;c++){
   const gx=rect.x+x,gy=rect.y+y,admitted=domain.contains(gx-domain.origin[0],gy-domain.origin[1]);
   data[(y*rect.width+x)*3+c]=admitted?(gx*17+gy*29+c*71)%256:poison;
  }
  const owner={pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release(){windows.delete(owner);}};windows.add(owner);return owner;
 }}};
 const native={async analyze(input,params,hooks){checkAbort(hooks.signal);const dimensions=input.surface.descriptor,nx=Math.floor((dimensions.width-dimensions.width%2-8)/params.block),ny=Math.floor((dimensions.height-dimensions.height%2-8)/params.block),n=nx*ny;
  const window=await input.surface.readWindow({x:0,y:0,width:dimensions.width,height:dimensions.height},hooks);let signature=0;try{for(const v of window.pixels.data)signature=(signature+v)%251;}finally{window.release();}
  calls.push({dimensions:{...dimensions},params:{...params},signature,signal:hooks.signal});await onAnalyze?.({input,params,hooks,index:calls.length});checkAbort(hooks.signal);
  const probabilities=Float32Array.from({length:n*16},(_,i)=>Math.fround(((i*11+signature)%97+1)/100)),post=cfaPostprocess(probabilities,n),release=budget.reserve(n*100+8192);
  const result={data:{width:dimensions.width,height:dimensions.height,probabilities,grids:post.grids,local_grid:post.local,suspicion:post.suspicion,gridShape:[ny,nx],metadata:{method:'adaptive_cfa',block:params.block,origin:[4,4],valid_shape:[ny*params.block,nx*params.block],best_grid:post.best}},provenance:{fixture:'controlled-probabilities',sourceSurfaceIdentity:dimensions.id},metrics:{cache:{result:false}},release(){if(!held.delete(result))return;release();}};held.add(result);return result;
 },clearCache(){},dispose(){disposed++;}};
 const api=createCfaStrictAnalyzer({budget,analyzer:native});
 return{api,native,image,domain,budget,calls,held,windows,get disposed(){return disposed;},async run(params={variant:'Original',block:8,tile:32},options={}){return api.analyze(image,params,{sourceRegionDomain:domain.descriptor,...options});},async close(){await api.dispose();}};
}
