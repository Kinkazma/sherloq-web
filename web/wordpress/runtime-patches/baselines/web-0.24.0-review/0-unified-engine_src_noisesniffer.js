// Corrected IPOL Noisesniffer: native core contract, not the original CLI bugs.
import {numpyArgsort} from './numpy-argsort.js';
import {numpySum} from './numpy-sum.js';
import {EngineError,checkAbort,checkpoint,requireValue} from './errors.js';
import {cvNoisesnifferTailFunction,cvNoisesnifferStatistics} from './opencv.js';
import {parameters} from './pixel-utils.js';
export function noisesnifferParams(input={}){
 const p=parameters(input,{blockSize:3,cellSize:100,samplesPerBin:20000,lowFrequencyFraction:.1,lowNoiseFraction:.5,view:'regions'},{cellSize:[10,500],samplesPerBin:[100,200000]},{blockSize:[3,5,7,8],view:['regions','mask','distribution']});
 requireValue(Number.isFinite(p.lowFrequencyFraction)&&p.lowFrequencyFraction>=.01&&p.lowFrequencyFraction<=1,'Invalid lowFrequencyFraction.');
 requireValue(Number.isFinite(p.lowNoiseFraction)&&p.lowNoiseFraction>=.01&&p.lowNoiseFraction<=.99,'Invalid lowNoiseFraction.');return p;
}
export function noisesnifferAdmission(image,p){
 requireValue(Math.min(image.width,image.height)>=p.blockSize,'Noisesniffer block must fit the image.');
 const n=image.width*image.height,working=320*n+64*1024**2;
 if(!Number.isSafeInteger(working)||100*n+64*1024**2>1900*1024**2)throw new EngineError('MEMORY_LIMIT','Noisesniffer exceeds its conservative WASM working limit; no resizing performed.');return working;
}
const bankers=x=>{const f=Math.floor(x),r=x-f;return r===.5?f+f%2:Math.round(x);};
export function selectNoisesniffer(image,w,b,n,m,stats){
 const {valid,means,variance}=stats;
 if(!valid.length)return {selected:new Uint32Array(),low_noise:new Uint32Array()};
 b=Math.floor(valid.length/Math.max(1,bankers(valid.length/b)));const bins=bankers(valid.length/b),V=[],S=[],cols=image.width-w+1,N=stats.width*stats.height;
 const meanValues=new Float64Array(valid.length),block=new Float64Array(w*w),squares=new Float64Array(w*w);
 for(let c=0;c<3;c++){
  for(let i=0;i<valid.length;i++)meanValues[i]=means[valid[i]*3+c];
  const order=numpyArgsort(meanValues),ordered=Uint32Array.from(order,i=>valid[i]);
  for(let bin=0;bin<bins;bin++){
   const ids=ordered.subarray(bin*b,bin===bins-1?valid.length:(bin+1)*b),values=Float32Array.from(ids,i=>variance[c*N+i]);
   const chosen=Uint32Array.from(numpyArgsort(values).subarray(0,Math.trunc(b*n)),i=>ids[i]),std=new Float64Array(chosen.length);
   let flat=0;
   for(let i=0;i<chosen.length;i++){
    const y=Math.floor(chosen[i]/cols),x=chosen[i]%cols;
    for(let dy=0;dy<w;dy++)for(let dx=0;dx<w;dx++)block[dy*w+dx]=image.data[((y+dy)*image.width+x+dx)*3+c];
    const mean=numpySum(block)/block.length;
    for(let j=0;j<block.length;j++){const d=block[j]-mean;squares[j]=d*d;}
    std[i]=Math.sqrt(numpySum(squares)/squares.length);if(std[i]===0)flat++;
   }
   const limit=Math.trunc(b*n*m);
   if(flat<limit){const sorted=numpyArgsort(std);for(let i=0;i<sorted.length;i++){const id=chosen[sorted[i]];V.push(id);if(i<limit)S.push(id);}}
  }
 }
 return {selected:Uint32Array.from(V),low_noise:Uint32Array.from(S)};
}
export function noisesnifferCounts(width,height,w,W,selected,low){
 const gh=Math.floor(height/W)+1,gw=Math.floor(width/W)+1,cols=width-w+1;
 const count=ids=>{const a=new Float64Array(gh*gw);for(const id of ids)a[Math.floor(Math.floor(id/cols)/W)*gw+Math.floor(id%cols/W)]++;return a;};
 return {gridWidth:gw,gridHeight:gh,all_blocks:count(selected),low_noise_blocks:count(low)};
}
export async function noisesnifferRegions(width,height,w,W,m,counts,{signal,tail,materializeMask=true,retainRegion}={}){
 tail??=await cvNoisesnifferTailFunction();const {gridWidth:gw,gridHeight:gh,all_blocks:all,low_noise_blocks:low}=counts,grid=new Uint8Array(gw*gh),regions=[],cache=new Map();let retainedCells=0,nearGrowthBoundaries=0;
 const cached=(K,N)=>{const key=K+':'+N;if(cache.has(key)){const v=cache.get(key);cache.delete(key);cache.set(key,v);return v;}const v=tail(K,N,w,m);if(cache.size>=32768)cache.delete(cache.keys().next().value);cache.set(key,v);return v;};
 for(let y=0;y<gh;y++){
  await checkpoint(signal);
  for(let x=0;x<gw;x++){
   const seed=y*gw+x;if(!(all[seed]>0&&low[seed]/all[seed]-m>0&&grid[seed]===0))continue;
   const cells=[seed],seen=new Set(cells);let N=all[seed],K=low[seed],before=0;
   while(before!==cells.length){before=cells.length;
    for(let i=0;i<cells.length;i++){
     checkAbort(signal);const a=cells[i],ay=Math.floor(a/gw),ax=a%gw;
     for(const [dy,dx] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const by=ay+dy,bx=ax+dx;if(by<0||by>=gh||bx<0||bx>=gw)continue;const b=by*gw+bx;if(seen.has(b))continue;
      const R=cells.length,left=cached(K,N)-Math.log(R),right=Math.log(4)+cached(K+low[b],N+all[b])-Math.log(R+1);
      // Exact equalities are common for small dyadic binomial probabilities.
      // Preserve the strict native comparison and report its measured margin.
      if(Number.isFinite(left)&&Number.isFinite(right)&&Math.abs(left-right)<1e-9)nearGrowthBoundaries++;
      if(left>right){cells.push(b);seen.add(b);N+=all[b];K+=low[b];}
     }
    }
   }
   const R=cells.length,logNfa=Math.log(.5*w*w)+2*Math.log(height*width/(W*W))+Math.log(.316915/R)+R*Math.log(4.062570)+cached(K,N);
   if(Math.abs(logNfa)<1e-9)throw new EngineError('NUMERIC_RANGE','Noisesniffer significance is too close to its numerical decision boundary.');
   if(logNfa<0){retainedCells+=cells.length;if(retainedCells>width*height)throw new EngineError('MEMORY_LIMIT','Noisesniffer overlapping-region output exceeds its memory allowance.');retainRegion?.(cells.length);for(const c of cells)grid[c]=255;regions.push({cells:cells.map(c=>[Math.floor(c/gw),c%gw]),log10_nfa:logNfa/Math.log(10),selected_blocks:K,all_blocks:N});}
  }
 }
 const mask=materializeMask?new Uint8Array(width*height):null;if(mask)for(let y=0;y<height;y++)for(let x=0;x<width;x++)mask[y*width+x]=grid[Math.floor(y/W)*gw+Math.floor(x/W)];
 return {mask,grid,regions,nearGrowthBoundaries};
}
export function noisesnifferDistribution(image,w,selected,low){
 const {width,height}=image,cols=width-w+1,out=image.data.slice(),stride=width+1;
 for(const [ids,color] of [[selected,[255,255,255]],[low,[255,0,0]]]){
  const delta=new Int32Array((height+1)*stride);
  for(const id of ids){const y=Math.floor(id/cols),x=id%cols;delta[y*stride+x]++;delta[(y+w)*stride+x]--;delta[y*stride+x+w]--;delta[(y+w)*stride+x+w]++;}
  for(let y=0;y<height;y++){let sum=0;for(let x=0;x<width;x++){const at=y*stride+x;if(y)delta[at]+=delta[at-stride];sum+=delta[at];if(sum>0)out.set(color,(y*width+x)*3);}}
 }
 return out;
}
export function noisesnifferView(image,result,view){
 const {width,height}=image;
 if(view==='distribution')return {width,height,format:'rgb8',data:result.distribution.slice()};
 const out=image.data.slice();
 for(let i=0;i<width*height;i++){
  if(view==='mask'){out[i*3]=out[i*3+1]=out[i*3+2]=result.mask[i];}
  else if(result.mask[i])for(let c=0;c<3;c++)out[i*3+c]=Math.trunc(Math.fround(image.data[i*3+c]*Math.fround(.55))+(c===0?255*.45:0));
 }
 return {width,height,format:'rgb8',data:out};
}
export async function analyzeNoisesniffer(image,params,stats,hooks={}){
 const {blockSize:w,cellSize:W,samplesPerBin:b,lowFrequencyFraction:n,lowNoiseFraction:m}=params;
 requireValue([3,5,7,8].includes(w)&&Math.min(image.width,image.height)>=w,'Invalid Noisesniffer block.');
 requireValue(Number.isInteger(W)&&W>=1&&Number.isInteger(b)&&b>=1&&n>0&&n<=1&&m>0&&m<1,'Invalid Noisesniffer parameters.');
 await checkpoint(hooks.signal);const selection=selectNoisesniffer(image,w,b,n,m,stats);hooks.onProgress?.(.65);
 const counts=noisesnifferCounts(image.width,image.height,w,W,selection.selected,selection.low_noise);
 const {mask,regions,nearGrowthBoundaries}=await noisesnifferRegions(image.width,image.height,w,W,m,counts,hooks);checkAbort(hooks.signal);
 return {width:image.width,height:image.height,...selection,...counts,mask,distribution:noisesnifferDistribution(image,w,selection.selected,selection.low_noise),numerics:{nearGrowthBoundaries,significanceGuard:1e-9},metadata:{method:'IPOL Noisesniffer',parameters:[w,W,b,n,m],valid_blocks:stats.valid.length,selected_blocks:selection.selected.length,low_noise_blocks:selection.low_noise.length,regions,inconclusive:selection.selected.length===0}};
}
export async function noisesnifferData(image,p,hooks={},context={}){
 const start=performance.now(),stats=await context.memo('statistics/'+p.blockSize,()=>context.noisesnifferPool?context.noisesnifferPool.run(image,p.blockSize,hooks):cvNoisesnifferStatistics(image,p.blockSize,{...hooks,fast:context.cpuKernel!=='reference'})),statisticsMs=performance.now()-start;
 const analyzed=performance.now(),data=await analyzeNoisesniffer(image,p,stats,hooks);hooks.onProgress?.(1);
 return {data,engineMetrics:{kernel:context.cpuKernel==='reference'?'cpu-pinned-noisesniffer-original':'cpu-pinned-noisesniffer-fma',workers:stats.runtime?.workers??1,...(stats.runtime?.scheduling?{scheduling:stats.runtime.scheduling}:{}),...(stats.runtime?.poolRejected?{poolRejected:stats.runtime.poolRejected}:{}),stages:{statisticsMs,selectionRegionsMs:performance.now()-analyzed}},semantics:'Corrected IPOL Noisesniffer local noise consistency evidence. Red marks statistically significant regions, not a manipulation probability or an authenticity verdict. Empty selections are explicitly inconclusive; near-boundary numerical cases are rejected.'};
}
export async function noisesnifferRender(result,p,hooks,{image}){await checkpoint(hooks.signal);result.pixels=noisesnifferView(image,result.data,p.view);result.layers=[{id:'noisesniffer-view',kind:'rgb',field:'pixels',coordinates:'source',origin:[0,0],range:[0,255]}];return result;}
