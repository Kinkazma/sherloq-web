import {createPlotRenderer} from '../src/plot-renderer.js';
import {Budget} from '../src/cache.js';
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
export async function plotRendererBrowserTest(){
 const budget=new Budget(24*1024**2),canvas=document.createElement('canvas');document.body.append(canvas);
 const renderer=createPlotRenderer(canvas,{budget,chunkPoints:16384});renderer.resize(640,480,1);
 const values=new Float32Array(100003*6);for(let i=0;i<values.length/6;i++){values.set([(i%317)/316,(Math.floor(i/317)%317)/316,(i%83)/82,(i%191)/190,(i%173)/172,(i%97)/96],i*6);}
 await renderer.setData(values);const initial=renderer.snapshot();assert(initial.points===100003,'Full cloud count');
 renderer.setStyle({colored:true,x:0,y:1});renderer.zoom2d(150);renderer.setCamera({limits:[0,1,0,1]});renderer.setStyle({kind:'3d'});renderer.setCamera({azimuth:70,elevation:35});
 const moved=renderer.snapshot();assert(moved.uploads===1&&moved.uploadedBytes===values.byteLength,'Camera/axes must not upload points');
 renderer.setStyle({kind:'2d',size:1,alpha:.8});let svg='';for await(const chunk of renderer.exportSvg())svg+=chunk;
 assert((svg.match(/<circle /g)??[]).length===100003,'Vector export loses points');const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');assert(!parsed.querySelector('parsererror'),'SVG invalid');
 const png=await renderer.exportPng();globalThis.plotPreview=png;assert(png.size>1000,'PNG empty');const bmp=await createImageBitmap(png),check=document.createElement('canvas');check.width=bmp.width;check.height=bmp.height;const cx=check.getContext('2d');cx.drawImage(bmp,0,0);const pixels=cx.getImageData(0,0,640,480).data;assert(pixels.some((v,i)=>i%4!==3&&v!==128),'GPU scatter missing');bmp.close();
 const before=budget.total(),cancel=new AbortController();let cancelled=false;
 try{await renderer.setData(values,{signal:cancel.signal,onProgress:()=>cancel.abort()});}catch(e){cancelled=e.code==='CANCELLED';}
 assert(cancelled&&budget.total()===before&&renderer.snapshot().points===100003,'Cancelled replacement changes current cloud or leaks');
 let stopped=false;const abort=new AbortController();try{for await(const chunk of renderer.exportSvg({signal:abort.signal})){abort.abort();}}catch(e){stopped=e.code==='CANCELLED';}assert(stopped,'SVG cancellation missing');
 const metrics=renderer.snapshot();renderer.dispose();assert(budget.total()===0,'Renderer disposal leaks');
 let refused=false;try{createPlotRenderer(document.createElement('canvas'),{budget:new Budget(10)});}catch(e){refused=e.code==='MEMORY_LIMIT';}assert(refused,'No memory admission');
 return {schema:1,status:'passed',pointCount:100003,svgPointCount:100003,pngBytes:png.size,metrics,peakAccountedBytes:budget.peak,remainingBytes:budget.total(),checks:['persistent native Nx6 buffer','2D/3D camera without upload','complete vector export','real GPU nonempty PNG','cancelled replacement preserves cloud','SVG cancellation','admission and disposal']};
}
