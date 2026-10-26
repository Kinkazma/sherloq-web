import{requireValue,checkAbort}from'./errors.js';
import{truforStrictResultContext}from'./trufor-strict-result.js';
const alternative=[[7,15,39],[42,42,109],[207,66,59],[251,177,53],[255,248,201]];
async function alternativeWindow(part,rect,{budget,signal}){const lease=budget.reserve(rect.width*rect.height*3+rect.width*4);try{const data=new Uint8Array(rect.width*rect.height*3),row=new Float32Array(rect.width);for(let y=0;y<rect.height;y++){checkAbort(signal);await part.value.data.map.readInto(row,(rect.y+y)*part.fragment.rect.width+rect.x,{signal});for(let x=0;x<rect.width;x++){requireValue(Number.isFinite(row[x]),'Nonfinite native TruFor probability.');const value=Math.max(0,Math.min(1,row[x]))*4,a=Math.min(3,Math.floor(value)),f=value-a;for(let c=0;c<3;c++)data[(y*rect.width+x)*3+c]=alternative[a][c]+(alternative[a+1][c]-alternative[a][c])*f;}}return{data,release:lease};}catch(error){lease();throw error;}}
/** Original RGB is borrowed only for presentation. Every inference consumed
 * its independent exact native context; no hole enters its attention/score. */
export function renderTruforStrictWindow(image,result,mode,rect,options={}){const context=truforStrictResultContext(result);return context.withRead(()=>renderWindow(image,result,mode,rect,options));}
async function renderWindow(image,result,mode,rect,{budget,native,signal,onProgress}={}){
 const context=truforStrictResultContext(result),d=context.domain;image??=context.image;
 requireValue(image?.sha256===d.sourceSha256&&image.surface?.descriptor?.width===d.sourceWidth&&image.surface.descriptor.height===d.sourceHeight,'Strict TruFor display belongs to another Original owner.');
 requireValue(['map','map_alternative','confidence','noiseprint_pp'].includes(mode),'Unknown strict TruFor view.');
 const{x,y,width,height}=rect;requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x+width<=d.width&&y+height<=d.height,'Invalid strict TruFor display window.');
 const release=budget.reserve(width*height*3);let original,frame,primary;try{
  checkAbort(signal);const source=image.presentationSurface??image.surface,origin=context.domain.origin;
  requireValue(typeof source?.readWindow==='function','Original-only TruFor presentation surface is required.');original=await source.readWindow({x:x+origin[0],y:y+origin[1],width,height},{signal});checkAbort(signal);
  requireValue(original.pixels?.format==='rgb8'&&original.pixels.data instanceof Uint8Array&&original.pixels.width===width&&original.pixels.height===height&&original.pixels.data.length===width*height*3,'Strict TruFor presentation differs from its Original grid.');
  const data=original.pixels.data.slice();await original.release();original=null;
  for(const part of context.parts){checkAbort(signal);const r=part.fragment.rect,x0=Math.max(x,r.x),y0=Math.max(y,r.y),x1=Math.min(x+width,r.x+r.width),y1=Math.min(y+height,r.y+r.height);if(x1<=x0||y1<=y0)continue;const local={x:x0-r.x,y:y0-r.y,width:x1-x0,height:y1-y0};
   frame=mode==='map_alternative'?await alternativeWindow(part,local,{budget,signal}):await native.renderWindow(undefined,part.value,mode,local,{budget,signal,onProgress});checkAbort(signal);
   requireValue(frame.data instanceof Uint8Array&&frame.data.length===local.width*local.height*3,'Native TruFor view differs from its context.');for(let row=0;row<local.height;row++)data.set(frame.data.subarray(row*local.width*3,(row+1)*local.width*3),((y0-y+row)*width+x0-x)*3);await frame.release();frame=null;
  }
  checkAbort(signal);truforStrictResultContext(result);return{width,height,origin:[x,y],format:'rgb8',data,release};
 }catch(error){primary=error;release();throw error;}finally{const failures=[];for(const part of[original,frame])try{await part?.release?.();}catch(error){failures.push(error);}if(failures.length){release();if(primary&&Object.isExtensible(primary))primary.cleanupError=failures[0];else throw failures[0];}}
}
