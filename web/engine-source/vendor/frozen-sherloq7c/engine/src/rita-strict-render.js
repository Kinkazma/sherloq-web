import {requireValue,checkAbort} from './errors.js';
import {displayGeometry,sampleSurface} from './display-sampling.js';
import {ritaStrictResultContext} from './rita-strict-result.js';
import {readRitaStrictProjection} from './rita-strict-projection.js';

/** Same native RITA color/threshold convention, on its retained context
 * scores. Original RGB is borrowed separately for presentation only. */
export function sampleRitaStrictWindow(image,result,view=0,tile,options={}){const owner=ritaStrictResultContext(result);return owner.withRead(()=>sample(image??owner.image,result,owner,view,tile,options));}
async function sample(image,result,owner,view,tile,{budget,signal,threshold=.5,opacity=.6}={}){
 requireValue([0,1,2,'overlay','map','probability','mask'].includes(view)&&Number.isFinite(threshold)&&threshold>=0&&threshold<=1&&Number.isFinite(opacity)&&opacity>=0&&opacity<=1,'Invalid RITA display settings.');
 const d=owner.domain,g=displayGeometry({width:d.width,height:d.height},tile),overlay=view===0||view==='overlay',mask=view===2||view==='mask',release=budget.reserve(g.width*g.height*7+4*1024**2);let source,success=false,failed=false,primary;
 try{
  checkAbort(signal);const values=await readRitaStrictProjection({width:d.width,height:d.height,pixels:result.data.pixelCount,fragments:result.data.metadata.fragments,readArray:owner.readArray},tile,{signal});
  if(overlay){requireValue(image.sha256===d.sourceSha256&&image.surface.descriptor.width===d.sourceWidth&&image.surface.descriptor.height===d.sourceHeight,'RITA presentation source differs from its Original.');source=await sampleSurface(image.presentationSurface??image.surface,{...tile,x:g.x+d.origin[0],y:g.y+d.origin[1]},{budget,signal});}
  const data=new Uint8Array(g.width*g.height*3);for(let i=0;i<values.length;i++){const at=i*3,v=values[i],selected=Number.isFinite(v)&&v>=threshold;if(overlay)for(let c=0;c<3;c++){const original=source.pixels.data[at+c];data[at+c]=selected?Math.round(original*(1-opacity)+(c===0?255:0)*opacity):original;}else if(selected)data[at]=mask?255:Math.round(Math.fround(v*255));}
  checkAbort(signal);success=true;return{pixels:{width:g.width,height:g.height,format:'rgb8',data},release,metrics:{sourceBytes:values.byteLength+(source?.metrics?.sourceBytes??0),neuralExecutions:0}};
 }catch(error){failed=true;primary=error;throw error;}finally{
  try{await source?.release();}catch(cleanup){if(success)release();if(!failed)throw cleanup;if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{primary.cleanupError=cleanup;}catch{}}
  finally{if(!success)release();}
 }
}
export async function renderRitaStrictWindow(image,result,view,rect,{budget,...options}={}){const frame=await sampleRitaStrictWindow(image,result,view,{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1},{...options,budget});return{...frame.pixels,origin:[rect.x,rect.y],release:frame.release};}
