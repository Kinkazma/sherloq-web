import {parameters} from './pixel-utils.js';
import {cvStereoPrepare,cvStereoView} from './opencv.js';
export const stereoParams=(p={})=>parameters(p,{mode:0},{mode:[0,3]});
export async function stereoData(image,p,hooks,{memo,cpuKernel='auto'}={}){
 const timings={},stage=async(name,compute)=>{const start=performance.now(),value=memo?await memo(name,compute):await compute();timings[name+'Ms']=performance.now()-start;return value;};
 hooks.onProgress?.(0);const search=await stage('search',()=>cvStereoPrepare(image,0,-1,hooks));
 const data={detected:search.offset>=0,offset:search.offset>=0?search.offset:null,firstTestedOffset:10,differences:search.values,sourceDimensions:[image.width,image.height]},semantics='Native periodicity heuristic and relative horizontal Farneback disparity. No physical depth or image-authenticity verdict. Absence of a detected period returns no raster. Search uses the native half-height gray image; disparity retains the native full-size cropped pair.';
 if(!data.detected){hooks.onProgress?.(1);return {data,semantics,engineMetrics:{stages:timings}};}
 const prepared=await stage('pattern',()=>cvStereoPrepare(image,1,search.offset,hooks)),pattern={width:prepared.width,height:prepared.height,format:'rgb8',data:prepared.values};
 data.width=pattern.width;data.height=pattern.height;data.comparedBounds=[[search.offset,0,image.width,image.height],[0,0,image.width-search.offset,image.height]];
 if(p.mode>=2){hooks.onProgress?.(.5);const flow=await stage('flow',()=>cvStereoPrepare(image,cpuKernel==='reference'?7:2,search.offset,hooks));data.flow=flow.values;data.flowLayout='row,column';timings.flowBreakdown=Object.fromEntries(['gaussianMs','resizeMs','polynomialMs','initialMatricesMs','iterativeFlowMs'].map((name,i)=>[name,flow.timings[i]]));}
 hooks.onProgress?.(1);return {pattern,data,semantics,engineMetrics:{stages:timings,kernel:cpuKernel==='reference'?'cpu-pinned-fma-reference':'cpu-pinned-fma-fast'}};
}
export async function stereoView(result,p,hooks){
 if(result.data.detected)result.pixels=await cvStereoView(result.pattern,p.mode,result.data.flow,hooks);
 delete result.pattern;result.data.mode=p.mode;return result;
}
