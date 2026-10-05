import "../../runtime-context.js?v=0.14.5";
import {parameters} from './pixel-utils.js';import {requireValue,checkpoint} from './errors.js';import {cvPlot} from './opencv.js';
export function plotsParams(p={}){const r=parameters(p,{scale:null,x:3,y:4,z:5,colored:false,alpha:1,kind:'2d',layout:'legacy'},{x:[0,5],y:[0,5],z:[0,5]},{kind:['2d','3d','classic'],layout:['legacy','values']},['colored']);requireValue(r.scale===null||(Number.isInteger(r.scale)&&r.scale>=0&&r.scale<=30),'Invalid sampling scale.');requireValue(Number.isFinite(r.alpha)&&r.alpha>=0&&r.alpha<=1,'Alpha must be between zero and one.');return r;}
export async function plotData(image,p,hooks={}){
 const maxScale=Math.floor(Math.log2(Math.min(image.width,image.height))),scale=p.scale??Math.min(1,maxScale);requireValue(scale<=maxScale,'Sampling scale exceeds the native image limit.');
 const values=await cvPlot(image,scale,hooks);return {data:{scale,count:values.length/6,columns:['Red','Green','Blue','Hue','Saturation','Value'],values},semantics:'Native pyrDown sampling and RGB/HSV float32 point data. Requested scale is explicit; null uses the native initial sampling level. All selected points are returned; UI rendering/export is separate.'};
}
export async function plotView(result,p,hooks={}){
 if(p.layout==='values')return result;
 const {values,count}=result.data,dimensions=p.kind==='classic'?2:3,positions=new Float32Array(count*dimensions),colors=p.colored?new Float32Array(count*4):(p.kind==='3d'?[.12,.47,.71,p.alpha]:[31/255,119/255,180/255,p.alpha]);
 for(let i=0;i<count;i++){if(i%65536===0)await checkpoint(hooks.signal);positions[i*dimensions]=values[i*6+p.x];positions[i*dimensions+1]=values[i*6+p.y];if(dimensions===3)positions[i*3+2]=p.kind==='3d'?values[i*6+p.z]:0;if(p.colored){colors.set(values.subarray(i*6,i*6+3),i*4);colors[i*4+3]=p.alpha;}}
 Object.assign(result.data,{positions,positionDimensions:dimensions,colors,colored:p.colored});return result;
}
export async function plots(image,p,hooks={}){return plotView(await plotData(image,p,hooks),p,hooks);}
