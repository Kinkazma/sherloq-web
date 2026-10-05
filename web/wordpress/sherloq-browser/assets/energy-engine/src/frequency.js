import "../../runtime-context.js?v=0.14.5";
import {parameters} from './pixel-utils.js';import {cvFrequencyBase,cvFrequencyMask,cvFrequencyView,cvPixels} from './opencv.js';
export const frequencyParams=(p={})=>parameters(p,{split:15,smooth:25,threshold:0,filter:0},{split:[0,100],smooth:[0,100],threshold:[0,100],filter:[0,15]});
export async function frequencyData(image,p,hooks,{memo,frequencyGpu,backend='cpu'}={}){
 const base=memo?await memo('dft',()=>cvFrequencyBase(image,hooks)):await cvFrequencyBase(image,hooks);
 const computeMask=async()=>{const start=performance.now();let r=frequencyGpu?await frequencyGpu.mask(base.width,base.height,p,{...hooks,required:backend==='webgpu'}):{mask:null,metrics:{backend:'cpu'}};if(!r.mask)r.mask=await cvFrequencyMask(base.width,base.height,p.split,p.smooth,2,hooks);return {...r,metrics:{...r.metrics,maskTotalMs:performance.now()-start}};};
 const mask=memo?await memo('mask/'+backend+'/'+p.split+'/'+p.smooth,computeMask):await computeMask(),t=performance.now(),r=await cvFrequencyView(base,image.width,image.height,[p.split,p.smooth,p.threshold,0],{...hooks,preparedMask:mask.mask}),names=['low','high','magnitude','phase'];
 const engineMetrics={...mask.metrics,reconstructionMs:performance.now()-t};
 for(let i=0;i<4;i++)r.frames[i].format='rgb8';return {engineMetrics,pixels:r.frames[0],data:{high:r.frames[1],magnitude:r.frames[2],phase:r.frames[3],frequencyDimensions:[base.width,base.height],zeroPercent:r.zeroPercent,mask:{...r.frames[4],format:'float32',range:[0,1],semantics:'Frequency-domain low-pass weights; not a manipulation-detection mask.'}},layers:names.map((id,i)=>({id,kind:'rgb',field:i===0?'pixels':'data.'+id,origin:[0,0],range:[0,255],coordinates:i<2?'source':'frequency'})),semantics:'Native padded float32 DFT; four derived views. Low frequency is cropped before normalization, high frequency after it. Magnitude and phase retain padded dimensions; original resolution is unchanged.'};
}
export async function frequencyView(result,p,hooks){if(p.filter)for(const name of ['magnitude','phase'])result.data[name]=await cvPixels(result.data[name],2,[1,p.filter,3,0,1,32],hooks);return result;}
