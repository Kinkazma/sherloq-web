import "../../../runtime-context.js?v=0.31.0";
import {requireValue,EngineError} from '../errors.js';
import {requiredWindow,planRaw} from './features/cpu-features.mjs';
const MiB=1024**2;
export function scientificParameters(value={}){
 const allowed=['seed','replicates','maxIter','outliersNlogl','flagDropSaturated','saturationProb','stride','ksize'];
 requireValue(Object.keys(value).every(k=>allowed.includes(k)),'Unknown scientific Splicebuster parameter.');
 const p={seed:0,replicates:30,maxIter:100,outliersNlogl:42,flagDropSaturated:2,saturationProb:.85,...value};
 requireValue(Number.isInteger(p.seed)&&p.seed>=0&&p.seed<=0xffffffff,'Invalid RNG seed.');
 requireValue(Number.isInteger(p.replicates)&&p.replicates>=1&&p.replicates<=30&&Number.isInteger(p.maxIter)&&p.maxIter>=1&&p.maxIter<=100,'Invalid fit parameters.');
 requireValue([0,1,2].includes(p.flagDropSaturated)&&Number.isFinite(p.saturationProb)&&p.saturationProb>=0&&p.saturationProb<=1&&Number.isFinite(p.outliersNlogl),'Invalid saturation/mixture parameters.');
 if(p.stride!==undefined)requireValue([4,8].includes(p.stride),'Unsupported stride.');
 if(p.ksize!==undefined)requireValue([64,128].includes(p.ksize),'Unsupported pooling support.');
 return p;
}
export function geometry(source,p){
 const width=source.width??source.surface?.descriptor.width,height=source.height??source.surface?.descriptor.height;
 requireValue([width,height].every(n=>Number.isSafeInteger(n)&&n>0)&&Number.isSafeInteger(width*height*3),'Invalid native image dimensions.');
 const small=width*height<=20000,stride=p.stride??(small?4:8),ksize=p.ksize??(small?64:128),ky=ksize/stride;
 const rawRows=Math.floor((height-8)/stride),rawCols=Math.floor((width-8)/stride),rows=rawRows-ky+1,cols=rawCols-ky+1;
 if(rows<1||cols<1)throw new EngineError('INSUFFICIENT_DATA','Image is smaller than the native Splicebuster support.');
 const cells=rows*cols;requireValue(Number.isSafeInteger(cells*50*8),'Feature offsets exceed safe integer bounds.');
 return {width,height,stride,ksize,ky,kx:ky,rawRows,rawCols,rows,cols,cells,features:50,dimensions:25,small};
}
export function bandPlan(g,p,top,rows){
 const window=requiredWindow({imageHeight:g.height,rawRowStart:top,rawRowCount:rows+g.ky-1,stride:g.stride,dropSaturated:p.flagDropSaturated!==0});
 const raw=planRaw({width:g.width,height:window.height,imageWidth:g.width,imageHeight:g.height,originY:window.top,rawRowStart:top,rawRowCount:rows+g.ky-1,stride:g.stride,ksize:g.ksize,dropSaturated:p.flagDropSaturated!==0});
 const rgbBytes=3*g.width*window.height,poolBytes=rows*g.cols*(50*4+4+1)+8*(rows+g.cols);
 // A bounded source window, its worker clone, the exact frontend scratch,
 // retained raw output and a second task's normalization/pooling copies.
 const cpuWorkingBytes=2*rgbBytes+raw.peakAdditionalBytes+raw.outputBytes+3*poolBytes+4*MiB;
 return {top,rows,window,raw,rgbBytes,poolBytes,cpuWorkingBytes};
}
export function planFeatureBands(g,p,{availableBytes,maxWorkers,backend='cpu',targetRows}={}){
 const desired=Math.min(g.rows,targetRows??Math.max(16,Math.ceil(g.rows/Math.max(1,maxWorkers))));
 let rows=desired;
 while(rows>1&&bandPlan(g,p,0,rows).cpuWorkingBytes>Math.max(8*MiB,availableBytes/2))rows=Math.max(1,Math.floor(rows/2));
 const first=bandPlan(g,p,0,rows),middle=bandPlan(g,p,Math.max(0,Math.min(g.rows-rows,Math.floor(g.rows/2))),rows);
 const perBand=Math.max(first.cpuWorkingBytes,middle.cpuWorkingBytes),gpuAllowance=backend==='gpu'?Math.min(32*MiB,Math.floor(availableBytes/4)):0;
 const capacity=Math.min(backend==='gpu'?Math.max(2,maxWorkers):maxWorkers,Math.ceil(g.rows/rows),Math.floor((availableBytes-gpuAllowance)/perBand));
 if(capacity<1)throw new EngineError('MEMORY_LIMIT','One exact Splicebuster feature window cannot fit the available budget.',{details:{admissionScope:'fixed',requestedBytes:perBand+gpuAllowance,availableBytes}});
 return {rows,concurrency:capacity,maximumWorkingBytes:capacity*perBand+gpuAllowance,gpuAllowance,
  *bands(){for(let top=0;top<g.rows;top+=rows)yield bandPlan(g,p,top,Math.min(rows,g.rows-top));}};
}
