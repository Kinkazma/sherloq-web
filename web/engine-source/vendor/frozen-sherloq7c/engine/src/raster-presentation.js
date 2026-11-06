import {requireValue} from './errors.js';
export function rasterPresentation(surface,render,{budget,overlay}={}){
 if(!render)return surface;
 const {palette,range=surface.descriptor.range??[0,1],opacity=.7}=render;
 requireValue(!palette||Array.isArray(palette)&&palette.length>0&&palette.length<=256&&palette.every(v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=255)),'Invalid export palette.');
 requireValue(Array.isArray(range)&&range.length===2&&range.every(Number.isFinite)&&range[1]>=range[0]&&Number.isFinite(opacity)&&opacity>=0&&opacity<=1,'Invalid export presentation.');
 if(overlay)requireValue(overlay.descriptor.width===surface.descriptor.width&&overlay.descriptor.height===surface.descriptor.height&&overlay.descriptor.format==='rgb8','Invalid overlay source.');
 return{descriptor:{...surface.descriptor,format:'rgb8'},async readWindow(rect,hooks){
  const release=budget.reserve(rect.width*rect.height*3);let part,base,published=false;
  try{part=await surface.readWindow(rect,hooks);if(overlay)base=await overlay.readWindow(rect,hooks);const input=part.pixels.data,out=base?base.pixels.data.slice():new Uint8Array(rect.width*rect.height*3),format=surface.descriptor.format;
   for(let i=0;i<rect.width*rect.height;i++){
    const value=input[i],v=Math.max(0,Math.min(255,Math.round((value-range[0])/(range[1]-range[0]||1)*255))),colour=palette?palette[Math.max(0,Math.min(palette.length-1,Math.round(value)))]:render.red?[v,0,0]:[v,v,v];
    for(let c=0;c<3;c++){const pixel=format==='rgb8'?input[i*3+c]:format==='rgb-flags8'?(input[i*3+c]?255:0):format==='mask8'?(value?255:0):colour[c];if(!base||value>0)out[i*3+c]=base?Math.round(out[i*3+c]*(1-opacity)+pixel*opacity):pixel;}
   }
   published=true;return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data:out},release};
  }finally{part?.release();base?.release();if(!published)release();}
 }};
}
