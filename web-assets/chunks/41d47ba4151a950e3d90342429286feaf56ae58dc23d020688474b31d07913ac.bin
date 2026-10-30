import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {displayGeometry,sampleSurface} from './display-sampling.js';
const f=Math.fround,unbudgeted={reserve:()=>()=>{}};
function settings(view,threshold,opacity){
 requireValue([0,1,2,'overlay','map','probability','mask'].includes(view)&&Number.isFinite(threshold)&&threshold>=0&&threshold<=1&&Number.isFinite(opacity)&&opacity>=0&&opacity<=1,'Invalid RITA display settings.');
 return {overlay:view===0||view==='overlay',mask:view===2||view==='mask'};
}
function color(output,at,value,{overlay,mask},threshold,opacity,source,sourceAt){
 requireValue(Number.isFinite(value)&&value>=0&&value<=1,'Invalid RITA visual score.');const selected=value>=threshold;
 if(overlay){for(let c=0;c<3;c++){const original=source[sourceAt+c];output[at+c]=selected?Math.round(original*(1-opacity)+(c===0?255:0)*opacity):original;}}
 else if(mask)output[at]=selected?255:0;
 else output[at]=selected?Math.round(f(value*255)):0;
}
/** A display-only threshold over retained native scores. Bounded callers use
 * this same renderer for image tiles, exact exports and tiny drag proxies. */
export async function renderRitaWindow(image,result,view=0,rect,{budget,signal,threshold=.5,opacity=.6}={}){
 const data=result.data??result,mode=settings(view,threshold,opacity);rect??={x:0,y:0,width:data.width,height:data.height};
 requireValue([rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x<=data.width-rect.width&&rect.y<=data.height-rect.height,'Invalid RITA display rectangle.');checkAbort(signal);
 const n=rect.width*rect.height,release=budget?.reserve(n*3+rect.width*4),cooperate=createCooperator(signal);let original;
 try{
  if(mode.overlay){requireValue(image?.surface?.readWindow,'RITA overlay requires its original RGB surface.');original=await image.surface.readWindow(rect,{signal});}
  const originalChannels=mode.overlay?original.pixels.data.length/n:3;requireValue(originalChannels===3||originalChannels===4,'Invalid RITA original RGB/RGBA window.');
  const output=new Uint8Array(n*3),row=new Float32Array(rect.width);for(let y=0;y<rect.height;y++){await cooperate();await data.map.readInto(row,(rect.y+y)*data.width+rect.x,{signal});checkAbort(signal);for(let x=0;x<rect.width;x++)color(output,(y*rect.width+x)*3,row[x],mode,threshold,opacity,original?.pixels.data,(y*rect.width+x)*originalChannels);}
  checkAbort(signal);return {width:rect.width,height:rect.height,format:'rgb8',origin:[rect.x,rect.y],data:output,release:release??(()=>{})};
 }catch(error){release?.();throw error;}finally{original?.release();}
}
/** Sample retained scores directly. Rendering one temporary RGB scanline per
 * display row would repeat renderer setup and source reads hundreds of times.
 * This path keeps one score row and the bounded final display frame only. */
export async function sampleRitaWindow(image,result,view=0,tile,{budget=unbudgeted,signal,threshold=.5,opacity=.6}={}){
 const data=result.data??result,mode=settings(view,threshold,opacity),g=displayGeometry(data,tile),release=budget.reserve(g.width*g.height*3+g.w*4),cooperate=createCooperator(signal);let original;
 try{
  checkAbort(signal);if(mode.overlay){requireValue(image?.surface?.readWindow,'RITA overlay requires its original RGB surface.');original=await sampleSurface(image.surface,tile,{budget,signal});}
  const count=g.width*g.height,originalChannels=mode.overlay?original.pixels.data.length/count:3;requireValue(originalChannels===3||originalChannels===4,'Invalid RITA original RGB/RGBA window.');
  const output=new Uint8Array(count*3),row=new Float32Array(g.w);
  for(let y=0;y<g.height;y++){await cooperate();await data.map.readInto(row,(g.y+y*g.step)*data.width+g.x,{signal});checkAbort(signal);for(let x=0;x<g.width;x++){const at=y*g.width+x;color(output,at*3,row[x*g.step],mode,threshold,opacity,original?.pixels.data,at*originalChannels);}}
  checkAbort(signal);return {pixels:{width:g.width,height:g.height,format:'rgb8',data:output},release,metrics:{sourceBytes:g.height*g.w*4+(original?.metrics?.sourceBytes??0)}};
 }catch(error){release();throw error;}finally{original?.release();}
}
