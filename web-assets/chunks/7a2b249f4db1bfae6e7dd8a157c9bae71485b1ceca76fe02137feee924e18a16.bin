import "../../runtime-context.js?v=0.14.5";
import {parameters,gray} from './pixel-utils.js';
import {EngineError,requireValue,checkpoint} from './errors.js';
import {cvComparison,cvComparisonRender,cvPixels} from './opencv.js';
export const comparisonParams=(input={})=>{
 const p=parameters(input,{referenceImageId:null,view:'normal',metrics:false,equalized:false,grayscale:false},{},{view:['normal','difference','ssim','butter']},['metrics','equalized','grayscale']);
 requireValue(p.referenceImageId===null||typeof p.referenceImageId==='string','referenceImageId must name a loaded image.');return p;
};
export function comparisonReferences(p){requireValue(typeof p.referenceImageId==='string'&&p.referenceImageId.length>0,'A loaded referenceImageId is required.');return [p.referenceImageId];}
export function comparisonAdmission(image,p){
 const n=image.width*image.height,working=p.metrics?n*384+256*1024**2:p.view==='butter'?n*384+32*1024**2:p.view==='ssim'?n*128+32*1024**2:p.view==='difference'?n*24:n*12;
 if(working>1900*1024**2)throw new EngineError('MEMORY_LIMIT','Comparison exceeds the conservative working limit of this 2 GiB WASM module.');
 return working-n*12;
}
export async function comparisonBasic(first,second,hooks={}){
 let sx=0,sy=0,xx=0,yy=0,xy=0,squared=0;const n=first.width*first.height;
 for(let i=0;i<n;i++){
  if(i%65536===0)await checkpoint(hooks.signal);const at=i*3,x=gray(first.data[at],first.data[at+1],first.data[at+2]),y=gray(second.data[at],second.data[at+1],second.data[at+2]);sx+=x;sy+=y;xx+=x*x;yy+=y*y;xy+=x*y;squared+=(x-y)*(x-y);
 }
 const mx=sx/n,my=sy/n,mse=squared/n,rmse=Math.sqrt(mse),normX=Math.sqrt(xx),normY=Math.sqrt(yy),raw={rmse,sam:Math.acos(Math.min(1,Math.max(-1,xy/(normX*normY)))),ergas:25*Math.sqrt(rmse*rmse/(mx*mx)),mb:(mx-my)/mx,pfe:Math.sqrt(squared)/normX*100,psnr:mse===0?Infinity:10*Math.log10(255**2/mse)},values={},errors={};
 for(const [name,value] of Object.entries(raw)){if(Number.isFinite(value))values[name]=value;else if(name==='psnr'&&value===Infinity)values[name]='+Infinity';else errors[name]='Metric is undefined for this image pair.';}
 return {values,errors};
}
export async function comparisonData(image,p,hooks,{references,memo,cpuKernel}){
 hooks={...hooks,original:cpuKernel==='reference'};
 const reference=references[0].pixels;requireValue(image.width===reference.width&&image.height===reference.height,'Evidence and reference must have the same size.');
 const timings={},cached=async(name,compute)=>{const start=performance.now();const result=await(memo?memo(name,compute):compute());timings[name]=performance.now()-start;return result;};let values={},errors={},pixels,histogramCorrelationFullBins,histogramCorrelationBinDivisor;
 hooks.onProgress?.(0);
 if(p.metrics){
  const basic=await cached('basic',()=>comparisonBasic(image,reference,hooks));Object.assign(values,basic.values);Object.assign(errors,basic.errors);
  hooks.onProgress?.(.1);
  const hist=await cached('histograms',()=>cvComparison(image,reference,2,hooks));for(const [i,name] of ['hist_0','hist_1','hist_4','hist_2','hist_3','hist_5'].entries())values[name]=hist.values[i];histogramCorrelationFullBins=hist.values[6];histogramCorrelationBinDivisor=hist.values[7];
  hooks.onProgress?.(.2);
  const sewar=await cached('sewar',()=>cvComparison(image,reference,3,hooks));
  for(const [i,name] of ['msssim','rase','scc','uqi','vifp'].entries()){const value=sewar.values[i];if(Number.isFinite(value))values[name]=value;else errors[name]='Metric is undefined for this image pair or its dimensions.';}
  hooks.onProgress?.(.7);
  const ssimul=await cached('ssimulacra',()=>cvComparison(image,reference,5,hooks));if(Number.isFinite(ssimul.values[0])&&ssimul.values[0]>=0)values.ssimul=ssimul.values[0];else errors.ssimul='SSIMULACRA requires at least 8 rows and 8 columns.';
 }
 if(p.metrics||p.view==='butter'){
  const butter=await cached('butteraugli',()=>cvComparison(image,reference,4,hooks));values.butter=butter.score;if(p.view==='butter')pixels={width:butter.width,height:butter.height,format:butter.format,data:butter.data};
 }
 if(p.metrics||p.view==='ssim'){
  const ssim=await cached('ssim',async()=>{const map=await cvComparison(image,reference,1,hooks);return {score:map.score,pixels:await cvComparisonRender(map,hooks)};});values.ssim=ssim.score;if(p.view==='ssim')pixels=ssim.pixels;
 }
 if(p.view==='normal')pixels=reference;
 if(p.view==='difference')pixels=await cached('difference',()=>cvComparison(image,reference,0,hooks));
 hooks.onProgress?.(1);return {pixels,data:{referenceImageId:p.referenceImageId,values,errors,metricsRequested:p.metrics,...(p.metrics?{histogramCorrelationFullBins,histogramCorrelationBinDivisor,warnings:histogramCorrelationBinDivisor===65536?{hist_0:"Historical native correlation uses 65,536 entries for a 16,777,216-bin histogram and may exceed [-1,1]. Use histogramCorrelationFullBins for ordinary correlation interpretation."}:{}}:{}),unavailableMetrics:[]},engineMetrics:{kernel:hooks.original?'cpu-pinned-comparison-reference':'cpu-pinned-comparison-simd',workers:1,stages:timings},semantics:'Native pairwise image comparison at equal dimensions. Grayscale scores and full-color histogram comparison are distinct. PSNR positive infinity is encoded as +Infinity; undefined metrics have explicit errors. Similarity is not an authenticity verdict.'};
}
export async function comparisonView(result,p,hooks){if(p.equalized||p.grayscale)result.pixels=await cvPixels(result.pixels,9,[Number(p.equalized),Number(p.grayscale)],hooks);return result;}
