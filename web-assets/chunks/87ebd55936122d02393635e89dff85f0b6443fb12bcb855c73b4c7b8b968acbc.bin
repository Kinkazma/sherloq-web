import "../../runtime-context.js?v=0.25.0";
import {gray} from './pixel-utils.js';
import {checkAbort,controlCheckpoint,requireValue} from './errors.js';

/** Native comparisonBasic sufficient statistics over a single population.
 * Never average final RMSE/PSNR/angles from separately analysed fragments. */
export async function comparisonDomainBasic(pair,{signal,onProgress,blockPixels=65536}={}) {
 requireValue(Number.isSafeInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid admitted comparison band size.');
 const n=pair.certificate.observations;let sx=0,sy=0,xx=0,yy=0,xy=0,squared=0;
 for(let offset=0;offset<n;offset+=blockPixels) {
  checkAbort(signal);const length=Math.min(blockPixels,n-offset);let a,b;
  try{a=await pair.images[0].surface.readWindow({x:0,y:offset,width:1,height:length},{signal});b=await pair.images[1].surface.readWindow({x:0,y:offset,width:1,height:length},{signal});for(let i=0;i<length;i++){const at=i*3,x=gray(a.pixels.data[at],a.pixels.data[at+1],a.pixels.data[at+2]),y=gray(b.pixels.data[at],b.pixels.data[at+1],b.pixels.data[at+2]);sx+=x;sy+=y;xx+=x*x;yy+=y*y;xy+=x*y;squared+=(x-y)*(x-y);}}finally{a?.release();b?.release();}
  onProgress?.({phase:'comparison-admitted-basic',completed:offset+length,total:n});await controlCheckpoint(signal);
 }
 const mx=sx/n,my=sy/n,mse=squared/n,rmse=Math.sqrt(mse),normX=Math.sqrt(xx),normY=Math.sqrt(yy),raw={rmse,sam:Math.acos(Math.min(1,Math.max(-1,xy/(normX*normY)))),ergas:25*Math.sqrt(rmse*rmse/(mx*mx)),mb:(mx-my)/mx,pfe:Math.sqrt(squared)/normX*100,psnr:mse===0?Infinity:10*Math.log10(255**2/mse)},values={},errors={};
 for(const[name,value]of Object.entries(raw)){if(Number.isFinite(value))values[name]=value;else if(name==='psnr'&&value===Infinity)values[name]='+Infinity';else errors[name]='Metric is undefined for this image pair.';}
 checkAbort(signal);return{values,errors};
}
