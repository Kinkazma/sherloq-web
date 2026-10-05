import {validateLoupeEffects,adjustmentParameters,sweepPixels} from './loupe-effects-settings.js';
// The same operators as the full tools, running on the three bounded image
// windows already sampled for the loupe. Analysis surfaces are never modified.
export function createLoupeEffectsKernel({adjust,enhance}){
 let sourceId=null,inputs=[],stages=[];
 const crop=frame=>{
  const {width,height,data}=frame;if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1024||height>1024||!(data instanceof Uint8ClampedArray)||data.length!==width*height*4)throw Error('Invalid loupe frame');
  let x0=width,y0=height,x1=0,y1=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}
  if(x1<=x0)return{frame,pixels:null};const pixels={width:x1-x0,height:y1-y0,format:'rgb8',data:new Uint8Array((x1-x0)*(y1-y0)*3)};
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const a=(y*width+x)*4,b=((y-y0)*pixels.width+x-x0)*3;pixels.data.set(data.subarray(a,a+3),b);}return{frame,pixels,x0,y0};
 };
 return async({id,frames,effects},hooks={})=>{
  const p=validateLoupeEffects(effects);if(frames){if(frames.length!==3)throw Error('Three loupe resolutions required');inputs=frames.map(crop);stages=[];sourceId=id;}if(sourceId!==id)throw Error('Loupe input expired');
  let pixels=inputs.map(v=>v.pixels);const metrics={sampledPixels:inputs.reduce((sum,v)=>sum+(v.pixels?v.pixels.width*v.pixels.height:0),0),computed:[],reused:[]};let parent=id;
  for(const name of ['adjust','enhance','sweep']){
   if(!p[name].enabled)continue;const key=parent+'|'+name+JSON.stringify(p[name]);let stage=stages.find(s=>s.key===key);
   if(stage){metrics.reused.push(name);pixels=stage.pixels;}else{const output=[];for(const image of pixels){if(!image){output.push(null);continue;}const next=name==='adjust'?await adjust(image,adjustmentParameters(p.adjust),hooks):name==='enhance'?await enhance(image,{mode:p.enhance.mode,percent:p.enhance.percent,channel:p.enhance.channel,bounds:null},hooks):sweepPixels(image,p.sweep);output.push(next);}pixels=output;stage={name,key,pixels};stages=stages.filter(s=>s.name!==name);stages.push(stage);metrics.computed.push(name);}parent=key;
  }
  stages=stages.filter(s=>p[s.name].enabled);
  return{frames:inputs.map(({frame,pixels:input,x0,y0},i)=>{const data=new Uint8ClampedArray(frame.data);if(input)for(let y=0;y<input.height;y++)for(let x=0;x<input.width;x++){const a=((y+y0)*frame.width+x+x0)*4,b=(y*input.width+x)*3;data.set(pixels[i].data.subarray(b,b+3),a);}return{width:frame.width,height:frame.height,data};}),metrics};
 };
}
